//! `js-engine` (R1/R2): eksekusi JavaScript/TypeScript lewat V8 (deno_core) + I/O runtime.
//!
//! - **Script mode**: `Engine::execute` (tanpa import).
//! - **Module mode**: `Engine::execute_module` — ESM dengan resolusi relatif, ekstensi
//!   (`.js/.mjs/.ts/.tsx`, fallback ekstensi & `index`), dan transpile TypeScript via `deno_ast`.
//! - **API runtime** (`ramonyx.*`): `sleep`, `readTextFile`/`writeTextFile`, `env.get`,
//!   `serve(port, handler)` (HTTP pull-model, payload mentah) dan `serveHandler(port, handler)`
//!   (jembatan `FetchHandler` Request/Response standar) — lihat `http.rs`.
//! - **Bare specifier**: resolusi `node_modules` ESM v1 (`exports`/`module`/`main`, ADR-0026).
//! - **CommonJS**: interop v1 via pemindaian graf `require` statis (ADR-0029).

use std::borrow::Cow;
use std::cell::RefCell;
use std::collections::HashMap;
use std::fmt;
use std::path::{Path, PathBuf};
use std::rc::Rc;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use deno_ast::{MediaType, ParseParams, SourceMapOption};
use deno_core::error::ModuleLoaderError;
use deno_core::{
    JsRuntime, ModuleLoadOptions, ModuleLoadReferrer, ModuleLoadResponse, ModuleLoader,
    ModuleSource, ModuleSourceCode, ModuleSpecifier, ModuleType, OpState, ResolutionKind,
    RuntimeOptions, extension, op2, resolve_import, resolve_path, v8,
};
use deno_error::JsErrorBox;
use runtime_core::Permissions;

mod builtins;
mod cjs;
mod http;
mod http_client;
mod metrics;
mod plugin;
mod resolve;
mod web_shim;
mod worker;

pub use metrics::{ExecutionTimings, InitTimings, OpMetricEntry};

use resolve::resolve_bare;
use web_shim::WEB_SHIM;

const BOOTSTRAP: &str = r#"
// Polyfill minimal AbortController/AbortSignal (deno_core tidak menyediakan DOM API).
// Cukup untuk kontrak `ramonyx.*`: aborted, reason, addEventListener("abort", fn, { once }).
class RamonyxAbortSignal {
  constructor() {
    this.aborted = false;
    this.reason = undefined;
    this._listeners = new Set();
  }
  addEventListener(type, listener, options) {
    if (type !== "abort" || typeof listener !== "function") {
      return;
    }
    const once = options === true || options?.once === true;
    if (once) {
      const wrapper = (event) => {
        this._listeners.delete(wrapper);
        listener.call(this, event);
      };
      this._listeners.add(wrapper);
      return;
    }
    this._listeners.add(listener);
  }
  removeEventListener(type, listener) {
    if (type === "abort") {
      this._listeners.delete(listener);
    }
  }
  _abort(reason) {
    if (this.aborted) {
      return;
    }
    this.aborted = true;
    this.reason = reason;
    const listeners = [...this._listeners];
    this._listeners.clear();
    for (const listener of listeners) {
      try {
        listener.call(this, { type: "abort", target: this });
      } catch {
        // listener yang error tidak boleh mematikan proses abort
      }
    }
  }
}

class RamonyxAbortController {
  constructor() {
    this.signal = new RamonyxAbortSignal();
  }
  abort(reason) {
    this.signal._abort(reason);
  }
}

globalThis.AbortController = RamonyxAbortController;
globalThis.AbortSignal = RamonyxAbortSignal;

// Konversi chunk body respons apa pun (string / byte stream) menjadi teks untuk op HTTP.
// Byte stream di-decode UTF-8 dengan mode stream agar urutan multibyte lintas chunk aman;
// sisa byte di-flush sebelum stream ditutup (loop serve memproses satu respons sekaligus,
// jadi satu decoder bersama cukup). Decoder dibuat lazy — web shim dimuat setelah bootstrap.
let __serveDecoder = null;
const __serveChunkToText = (chunk) => {
  if (typeof chunk === "string") {
    return chunk;
  }
  if (__serveDecoder === null) {
    __serveDecoder = new TextDecoder();
  }
  return __serveDecoder.decode(chunk, { stream: true });
};
const __serveFlushDecoder = () => {
  if (__serveDecoder === null) {
    return "";
  }
  return __serveDecoder.decode();
};

globalThis.ramonyx = {
  sleep: (ms) => Deno.core.ops.op_sleep(ms),
  readTextFile: (path) => Deno.core.ops.op_read_text_file(path),
  writeTextFile: (path, text) => Deno.core.ops.op_write_text_file(path, text),
  env: { get: (name) => Deno.core.ops.op_env_get(name) ?? undefined },
  permissions: {
    get: () => Deno.core.ops.op_permissions_get(),
    revoke: (kind) => Deno.core.ops.op_permissions_revoke(String(kind)),
  },
  // Worker: isolate V8 + thread terpisah, permission diiris dengan induk (ADR-0034).
  worker: async (entry, options) => {
    const id = await Deno.core.ops.op_worker_spawn(String(entry), options ?? {});
    return {
      id,
      send: async (value) => {
        await Deno.core.ops.op_worker_send(id, JSON.stringify(value));
      },
      receive: async () => {
        const hasil = await Deno.core.ops.op_worker_receive(id);
        return hasil.text === null ? null : JSON.parse(hasil.text);
      },
      terminate: async () => {
        await Deno.core.ops.op_worker_terminate(id);
      },
    };
  },
  // Sisi worker/plugin: bicara dengan induk (kanal worker atau stdio `--plugin`).
  parent: {
    send: async (value) => {
      await Deno.core.ops.op_parent_send(JSON.stringify(value));
    },
    receive: async () => {
      const hasil = await Deno.core.ops.op_parent_receive();
      return hasil.text === null ? null : JSON.parse(hasil.text);
    },
  },
  // Plugin: proses terpisah (isolasi level OS — crash plugin tidak menjatuhkan induk).
  spawn: async (entry, options) => {
    const id = await Deno.core.ops.op_plugin_spawn(String(entry), options ?? {});
    return {
      id,
      send: async (value) => {
        await Deno.core.ops.op_plugin_send(id, JSON.stringify(value));
      },
      receive: async () => {
        const hasil = await Deno.core.ops.op_plugin_receive(id);
        return hasil.text === null ? null : JSON.parse(hasil.text);
      },
      kill: async () => {
        const hasil = await Deno.core.ops.op_plugin_kill(id);
        return hasil.text === null ? null : Number(hasil.text);
      },
    };
  },
  // Keluar dari proses ini (dipakai plugin untuk menyelesaikan diri).
  exit: (code) => Deno.core.ops.op_process_exit(Math.max(0, Math.trunc(Number(code) || 0))),
  serve: (port, handler, options) => {
    // Batas body server (default 1 MiB, selaras ADR-0011): content-length lebih besar →
    // 413 dini; chunked yang melebihi batas → error saat dibaca (ADR-0035).
    const maxBodyBytes = Math.max(
      1,
      Math.trunc(Number(options?.maxBodyBytes ?? 1048576)) || 1048576,
    );
    const [serverId, actualPort] = Deno.core.ops.op_http_listen(
      "127.0.0.1",
      port,
      maxBodyBytes,
    );
    const server = {
      port: actualPort,
      close: () => Deno.core.ops.op_http_close(serverId),
    };
    const loop = (async () => {
      for (;;) {
        const request = await Deno.core.ops.op_http_accept(serverId);
        if (request === null) {
          return;
        }
        const controller = new AbortController();
        request.signal = controller.signal;
        // Body sebagai ReadableStream pull-model (`payload.body`).
        request.body = new ReadableStream({
          pull: async (streamController) => {
            try {
              const hasil = await Deno.core.ops.op_http_body_read(serverId, request.id);
              if (hasil.chunk === null) {
                streamController.close();
              } else {
                streamController.enqueue(new Uint8Array(hasil.chunk));
              }
            } catch (error) {
              streamController.error(error);
            }
          },
          cancel: () => Deno.core.ops.op_http_body_drop(serverId, request.id),
        });
        // Deteksi klien putus selama handler berjalan → abort signal (cancellation).
        Deno.core.ops
          .op_http_watch(serverId, request.id)
          .then((closed) => {
            if (closed) {
              controller.abort("client-disconnected");
            }
          })
          .catch(() => {});
        let response;
        try {
          response = await handler(request);
        } catch (error) {
          response = {
            status: 500,
            headers: { "content-type": "text/plain; charset=utf-8" },
            body: String(error),
          };
        }
        // Bila klien sudah pergi, respond menjadi no-op (server tetap hidup).
        const body = response?.body ?? "";
        if (body != null && typeof body[Symbol.asyncIterator] === "function") {
          // Streaming chunked (Transfer-Encoding dikelola server).
          Deno.core.ops.op_http_stream_start(
            serverId,
            request.id,
            response?.status ?? 200,
            Object.entries(response?.headers ?? {}),
          );
          try {
            for await (const chunk of body) {
              await Deno.core.ops.op_http_stream_chunk(
                serverId,
                request.id,
                __serveChunkToText(chunk),
              );
            }
            const sisa = __serveFlushDecoder();
            if (sisa.length > 0) {
              await Deno.core.ops.op_http_stream_chunk(serverId, request.id, sisa);
            }
            Deno.core.ops.op_http_stream_end(serverId, request.id);
          } catch (error) {
            Deno.core.ops.op_http_stream_end(serverId, request.id);
            Deno.core.ops.op_log_error("streaming dihentikan: " + error);
          }
        } else {
          Deno.core.ops.op_http_respond(
            serverId,
            request.id,
            response?.status ?? 200,
            Object.entries(response?.headers ?? {}),
            __serveChunkToText(body),
          );
        }
      }
    })();
    loop.catch((error) => {
      Deno.core.ops.op_log_error("server loop error: " + error);
    });
    return server;
  },
  // Jembatan standar: menjalankan `FetchHandler` (Request → Response) di atas `serve`
  // low-level. Payload server dipetakan ke `Request` (headers/body/signal ikut, sehingga
  // cancellation klien sampai ke pipeline), dan `Response` dikembalikan ke loop serve
  // (termasuk body streaming/ReadableStream).
  serveHandler: (port, handler, options) => {
    const server = globalThis.ramonyx.serve(
      port,
      async (payload) => {
        const init = {
          method: payload?.method ?? "GET",
          headers: payload?.headers ?? [],
          signal: payload?.signal,
        };
        if (payload?.body) {
          init.body = payload.body; // ReadableStream pull-model
        }
        const request = new Request(
          "http://127.0.0.1:" + server.port + (payload?.path ?? "/"),
          init,
        );
        const response = await handler(request);
        const headers = {};
        for (const [name, value] of response.headers.entries()) {
          headers[name] = value;
        }
        const body = response.body ?? (await response.text());
        return { status: response.status, headers, body };
      },
      options,
    );
    return server;
  },
};

globalThis.console = {
  log: (...args) => Deno.core.ops.op_log(args.map((value) => String(value)).join(" ")),
  info: (...args) => Deno.core.ops.op_log(args.map((value) => String(value)).join(" ")),
  warn: (...args) => Deno.core.ops.op_log_error(args.map((value) => String(value)).join(" ")),
  error: (...args) => Deno.core.ops.op_log_error(args.map((value) => String(value)).join(" ")),
};
"#;

#[op2(fast)]
fn op_log(#[string] text: String) {
    println!("{text}");
}

#[op2(fast)]
fn op_log_error(#[string] text: String) {
    eprintln!("{text}");
}

#[op2(async(lazy), fast)]
async fn op_sleep(#[smi] ms: u32) {
    tokio::time::sleep(Duration::from_millis(u64::from(ms))).await;
}

#[op2(async(lazy), fast)]
#[string]
async fn op_read_text_file(
    state: Rc<RefCell<OpState>>,
    #[string] path: String,
) -> Result<String, JsErrorBox> {
    let permissions = state.borrow().borrow::<Permissions>().clone();
    permissions
        .check_read(Path::new(&path))
        .map_err(JsErrorBox::generic)?;
    tokio::fs::read_to_string(&path)
        .await
        .map_err(|error| JsErrorBox::generic(format!("gagal membaca {path}: {error}")))
}

#[op2(async(lazy), fast)]
async fn op_write_text_file(
    state: Rc<RefCell<OpState>>,
    #[string] path: String,
    #[string] text: String,
) -> Result<(), JsErrorBox> {
    let permissions = state.borrow().borrow::<Permissions>().clone();
    permissions
        .check_write(Path::new(&path))
        .map_err(JsErrorBox::generic)?;
    tokio::fs::write(&path, text)
        .await
        .map_err(|error| JsErrorBox::generic(format!("gagal menulis {path}: {error}")))
}

#[op2]
#[string]
fn op_env_get(state: &mut OpState, #[string] name: String) -> Result<Option<String>, JsErrorBox> {
    state
        .borrow::<Permissions>()
        .check_env(&name)
        .map_err(JsErrorBox::generic)?;
    Ok(std::env::var(name).ok())
}

extension!(
    ramonyx_engine,
    ops = [
        op_log,
        op_log_error,
        op_sleep,
        op_read_text_file,
        op_write_text_file,
        op_env_get,
        http::op_http_listen,
        http::op_http_accept,
        http::op_http_body_read,
        http::op_http_body_drop,
        http::op_http_respond,
        http::op_http_stream_start,
        http::op_http_stream_chunk,
        http::op_http_stream_end,
        http::op_http_watch,
        http::op_http_close,
        http_client::op_fetch,
        builtins::op_random_bytes,
        builtins::op_dns_lookup,
        builtins::op_permissions_get,
        builtins::op_permissions_revoke,
        worker::op_worker_spawn,
        worker::op_worker_send,
        worker::op_worker_receive,
        worker::op_worker_terminate,
        plugin::op_plugin_spawn,
        plugin::op_plugin_send,
        plugin::op_plugin_receive,
        plugin::op_plugin_kill,
        plugin::op_process_exit,
        plugin::op_parent_send,
        plugin::op_parent_receive,
    ],
    state = |state: &mut OpState| {
        state.put(http::HttpState::default());
        state.put(worker::WorkerRegistry::default());
        state.put(worker::WorkerSelfChannel::default());
        state.put(plugin::PluginRegistry::default());
        state.put(plugin::ProcessBridge::default());
    },
);

#[derive(Debug)]
pub struct EngineError {
    message: String,
}

impl EngineError {
    fn new(message: impl Into<String>) -> Self {
        Self {
            message: message.into(),
        }
    }
}

impl fmt::Display for EngineError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(formatter, "{}", self.message)
    }
}

impl std::error::Error for EngineError {}

type SourceMapStore = Rc<RefCell<HashMap<String, Vec<u8>>>>;

/// File module loader: resolusi relatif (dengan fallback ekstensi/index) + transpile TS/TSX
/// lewat `deno_ast`. Bare specifier ditolak dengan pesan jelas sampai package resolution dibangun.
struct FileModuleLoader {
    source_maps: SourceMapStore,
}

impl FileModuleLoader {
    fn new() -> Self {
        Self {
            source_maps: Rc::new(RefCell::new(HashMap::new())),
        }
    }
}

/// Kandidat path untuk import tanpa ekstensi / direktori.
fn extension_candidates(path: &Path) -> Vec<PathBuf> {
    let mut candidates = Vec::new();
    if path.extension().is_none() {
        for extension in ["js", "mjs", "ts", "tsx"] {
            candidates.push(path.with_extension(extension));
        }
    }
    if path.is_dir() {
        for entry in ["index.js", "index.mjs", "index.ts", "index.tsx"] {
            candidates.push(path.join(entry));
        }
    }
    candidates
}

impl ModuleLoader for FileModuleLoader {
    fn resolve(
        &self,
        specifier: &str,
        referrer: &str,
        _kind: ResolutionKind,
    ) -> Result<ModuleSpecifier, ModuleLoaderError> {
        let is_relative = specifier.starts_with("./")
            || specifier.starts_with("../")
            || specifier.starts_with('/')
            || specifier.starts_with("file:");

        let resolved = if builtins::is_builtin_specifier(specifier) {
            // `node:*` versi subset (ADR-0031) → modul sintetis bawaan runtime.
            builtins::resolve_builtin(specifier)?
        } else if is_relative {
            resolve_import(specifier, referrer).map_err(|error| {
                JsErrorBox::generic(format!("tidak bisa me-resolve \"{specifier}\": {error}"))
            })?
        } else {
            // Bare specifier → resolusi node_modules (ADR-0026).
            resolve_bare(specifier, referrer)?
        };

        if resolved.scheme() == builtins::BUILTIN_SCHEME {
            return Ok(resolved);
        }

        let path = resolved
            .to_file_path()
            .map_err(|_| JsErrorBox::generic(format!("hanya file:// yang didukung: {resolved}")))?;

        // Canonicalize agar symlink workspace (pnpm/node_modules) ter-dedupe:
        // jalur berbeda menuju file yang sama harus menjadi modul yang sama.
        let canonical = |path: &Path| -> PathBuf {
            std::fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf())
        };

        if path.is_file() {
            return ModuleSpecifier::from_file_path(canonical(&path))
                .map_err(|_| JsErrorBox::generic(format!("path tidak valid: {}", path.display())));
        }

        for candidate in extension_candidates(&path) {
            if candidate.is_file() {
                let file = canonical(&candidate);
                return ModuleSpecifier::from_file_path(&file).map_err(|_| {
                    JsErrorBox::generic(format!("path tidak valid: {}", file.display()))
                });
            }
        }

        Ok(resolved)
    }

    fn load(
        &self,
        module_specifier: &ModuleSpecifier,
        _maybe_referrer: Option<&ModuleLoadReferrer>,
        _options: ModuleLoadOptions,
    ) -> ModuleLoadResponse {
        let source_maps = self.source_maps.clone();

        fn load(
            source_maps: SourceMapStore,
            module_specifier: &ModuleSpecifier,
        ) -> Result<ModuleSource, ModuleLoaderError> {
            // Modul bawaan sintetis (ADR-0031) — bukan file di disk.
            if module_specifier.scheme() == builtins::BUILTIN_SCHEME {
                let source = builtins::source_for(module_specifier).ok_or_else(|| {
                    JsErrorBox::generic(format!("modul bawaan tidak dikenal: {module_specifier}"))
                })?;
                return Ok(ModuleSource::new(
                    ModuleType::JavaScript,
                    ModuleSourceCode::String(deno_core::FastString::from_static(source)),
                    module_specifier,
                    None,
                ));
            }

            let path = module_specifier.to_file_path().map_err(|_| {
                JsErrorBox::generic(format!("hanya file:// yang didukung: {module_specifier}"))
            })?;

            // Modul CommonJS → interop v1 (ADR-0029): graf `require` statis di-embed
            // ke modul ESM sintetis; wrapper CJS dijalankan di dalam mesin.
            if cjs::is_cjs_file(&path) {
                let graph = cjs::build_graph(&path).map_err(JsErrorBox::generic)?;
                let cwd = std::env::current_dir()
                    .map(|directory| directory.display().to_string())
                    .unwrap_or_else(|_| "/".to_string());
                let code = cjs::generate_module(&graph, &cwd);
                return Ok(ModuleSource::new(
                    ModuleType::JavaScript,
                    ModuleSourceCode::String(code.into()),
                    module_specifier,
                    None,
                ));
            }

            let media_type = MediaType::from_path(&path);
            let (module_type, should_transpile) = match media_type {
                MediaType::JavaScript | MediaType::Mjs | MediaType::Cjs => {
                    (ModuleType::JavaScript, false)
                }
                MediaType::Jsx => (ModuleType::JavaScript, true),
                MediaType::TypeScript
                | MediaType::Mts
                | MediaType::Cts
                | MediaType::Dts
                | MediaType::Dmts
                | MediaType::Dcts
                | MediaType::Tsx => (ModuleType::JavaScript, true),
                _ => {
                    return Err(JsErrorBox::generic(format!(
                        "ekstensi belum didukung: {}",
                        path.display()
                    )));
                }
            };

            let code = std::fs::read_to_string(&path).map_err(|error| {
                JsErrorBox::generic(format!("tidak bisa membaca {}: {error}", path.display()))
            })?;

            let code = if should_transpile {
                let parsed = deno_ast::parse_module(ParseParams {
                    specifier: module_specifier.clone(),
                    text: code.into(),
                    media_type,
                    capture_tokens: false,
                    scope_analysis: false,
                    maybe_syntax: None,
                })
                .map_err(|error| {
                    JsErrorBox::generic(format!("gagal parse {}: {error}", path.display()))
                })?;

                let transpiled = parsed
                    .transpile(
                        &deno_ast::TranspileOptions {
                            imports_not_used_as_values: deno_ast::ImportsNotUsedAsValues::Remove,
                            decorators: deno_ast::DecoratorsTranspileOption::Ecma,
                            ..Default::default()
                        },
                        &deno_ast::TranspileModuleOptions { module_kind: None },
                        &deno_ast::EmitOptions {
                            source_map: SourceMapOption::Separate,
                            inline_sources: true,
                            ..Default::default()
                        },
                    )
                    .map_err(|error| {
                        JsErrorBox::generic(format!("gagal transpile {}: {error}", path.display()))
                    })?;

                let emitted = transpiled.into_source();
                if let Some(source_map) = emitted.source_map {
                    source_maps
                        .borrow_mut()
                        .insert(module_specifier.to_string(), source_map.into_bytes());
                }
                emitted.text
            } else {
                code
            };

            Ok(ModuleSource::new(
                module_type,
                ModuleSourceCode::String(code.into()),
                module_specifier,
                None,
            ))
        }

        ModuleLoadResponse::Sync(load(source_maps, module_specifier))
    }

    fn get_source_map(&self, specifier: &str) -> Option<Cow<'_, [u8]>> {
        self.source_maps
            .borrow()
            .get(specifier)
            .map(|bytes| Cow::Owned(bytes.clone()))
    }
}

/// Batas engine yang aktif (dibaca worker untuk default kuota anak).
#[derive(Debug, Clone, Default)]
pub struct EngineLimits {
    pub max_heap_mb: Option<usize>,
    pub tls_ca_file: Option<PathBuf>,
    pub max_cpu_ms: Option<u64>,
    pub max_rss_mb: Option<usize>,
}

/// Alasan penghentian paksa (kuota/timeout) — dibaca setelah eksekusi berakhir.
#[derive(Default)]
struct LimitState {
    reason: Mutex<Option<String>>,
}

impl LimitState {
    fn set_reason(&self, reason: String) {
        let mut slot = self
            .reason
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        if slot.is_none() {
            *slot = Some(reason);
        }
    }

    fn get_reason(&self) -> Option<String> {
        self.reason
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .clone()
    }
}

/// Waktu CPU (user+system) **thread** dari `/proc/self/task/<tid>/stat` (USER_HZ = 100); 0 bila
/// tak tersedia. Per-thread memisahkan pekerjaan engine dari thread GC V8 & proses lain.
#[cfg(target_os = "linux")]
fn thread_cpu_time(tid: u32) -> Duration {
    let Ok(stat) = std::fs::read_to_string(format!("/proc/self/task/{tid}/stat")) else {
        return Duration::ZERO;
    };
    // Field 2 (comm) bisa memuat spasi/kurung → potong pada ')' terakhir.
    let Some((_, rest)) = stat.rsplit_once(')') else {
        return Duration::ZERO;
    };
    let fields: Vec<&str> = rest.split_whitespace().collect();
    // Setelah comm: indeks 11 = utime, 12 = stime (field 14/15 di /proc/.../stat).
    let utime: u64 = fields
        .get(11)
        .and_then(|value| value.parse().ok())
        .unwrap_or(0);
    let stime: u64 = fields
        .get(12)
        .and_then(|value| value.parse().ok())
        .unwrap_or(0);
    Duration::from_millis((utime + stime) * 10)
}

/// TID thread saat ini (engine hanya bisa dipakai di thread pembuatnya — `JsRuntime` !Send).
#[cfg(target_os = "linux")]
fn current_thread_id() -> u32 {
    // SAFETY: `gettid` tidak memodifikasi memori dan selalu berhasil.
    unsafe { libc::gettid() as u32 }
}

/// RSS proses dari `/proc/self/statm` (halaman resident × 4096); 0 bila tak tersedia.
#[cfg(target_os = "linux")]
fn process_rss_bytes() -> u64 {
    let Ok(statm) = std::fs::read_to_string("/proc/self/statm") else {
        return 0;
    };
    let resident: u64 = statm
        .split_whitespace()
        .nth(1)
        .and_then(|value| value.parse().ok())
        .unwrap_or(0);
    resident.saturating_mul(4096)
}

#[cfg(not(target_os = "linux"))]
fn thread_cpu_time(_tid: u32) -> Duration {
    Duration::ZERO
}

#[cfg(not(target_os = "linux"))]
fn current_thread_id() -> u32 {
    0
}

#[cfg(not(target_os = "linux"))]
fn process_rss_bytes() -> u64 {
    0
}

/// Penjaga batas waktu: thread yang men-`terminate_execution()` V8 bila timeout terlampaui.
/// Dihentikan (dan di-join) saat `Drop` — jadi setiap eksekusi selalu membersihkan thread-nya.
struct Watchdog {
    cancel: Option<std::sync::mpsc::Sender<()>>,
    join: Option<std::thread::JoinHandle<()>>,
}

impl Drop for Watchdog {
    fn drop(&mut self) {
        if let Some(cancel) = self.cancel.take() {
            let _ = cancel.send(());
        }
        if let Some(join) = self.join.take() {
            let _ = join.join();
        }
    }
}

pub struct Engine {
    runtime: JsRuntime,
    tokio: tokio::runtime::Runtime,
    limit_state: Arc<LimitState>,
    timeout: Option<Duration>,
    metrics: Option<metrics::MetricsHandle>,
    last_timings: Option<ExecutionTimings>,
    init_timings: InitTimings,
    cpu_limit: Option<Duration>,
    rss_limit_bytes: Option<u64>,
    cpu_tid: u32,
}

/// Opsi engine; default **deny-all** (secure by default, ADR-0023).
#[derive(Debug, Clone, Default)]
pub struct EngineOptions {
    pub permissions: Permissions,
    /// Batas heap V8 dalam MiB (`None` = default V8). Pelanggaran → eksekusi dihentikan
    /// dengan error jelas, bukan abort proses (ADR-0033).
    pub max_heap_mb: Option<usize>,
    /// Batas waktu wall-clock per eksekusi (`None` = tanpa batas). Berlaku untuk
    /// `execute` dan `execute_module` (ADR-0033).
    pub timeout: Option<Duration>,
    /// File PEM berisi CA tambahan untuk `fetch` https (mis. CA privat/internal).
    /// Verifikasi sertifikat tetap aktif — ini menambah root, bukan mematikan (ADR-0036).
    pub tls_ca_file: Option<PathBuf>,
    /// Aktifkan metrik op (jumlah + waktu per op) untuk profiling; mati = tanpa biaya (ADR-0037).
    pub op_metrics: bool,
    /// Kuota CPU **proses** (ms, Linux): di atas batas → eksekusi dihentikan (ADR-0038).
    /// Berbeda dari `timeout` (wall-clock): menunggu I/O tidak memakan kuota.
    pub max_cpu_ms: Option<u64>,
    /// Kuota RSS **proses** (MiB, Linux): menutup gap memori eksternal V8 (ArrayBuffer)
    /// yang tidak dihitung kuota heap (ADR-0038).
    pub max_rss_mb: Option<usize>,
    /// Aktifkan jembatan stdio `ramonyx.parent` (mode `--plugin`; ADR-0040). Nonaktif =
    /// stdin host tidak pernah dibaca.
    pub ipc_stdio: bool,
}

impl Engine {
    pub fn new() -> Result<Self, EngineError> {
        Self::with_options(EngineOptions::default())
    }

    pub fn with_options(options: EngineOptions) -> Result<Self, EngineError> {
        let init_started = std::time::Instant::now();
        let tokio = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .map_err(|error| EngineError::new(format!("gagal membuat tokio runtime: {error}")))?;

        let max_heap_bytes = options.max_heap_mb.map(|mb| mb.saturating_mul(1024 * 1024));
        let create_params = max_heap_bytes.map(|max| {
            let initial = (max / 4).clamp(2 * 1024 * 1024, 16 * 1024 * 1024).min(max);
            v8::CreateParams::default().heap_limits(initial, max)
        });

        if (options.max_cpu_ms.is_some() || options.max_rss_mb.is_some())
            && !cfg!(target_os = "linux")
        {
            return Err(EngineError::new(
                "kuota CPU/RSS hanya didukung di Linux (membaca /proc)",
            ));
        }

        let limit_state = Arc::new(LimitState::default());
        let metrics = options
            .op_metrics
            .then(|| Rc::new(RefCell::new(metrics::OpMetricsState::default())));
        // Klien HTTP dibangun lebih dulu agar CA/TLS yang tidak valid gagal cepat.
        let fetch_state = http_client::FetchState::new(options.tls_ca_file.as_deref())
            .map_err(|error| EngineError::new(format!("inisialisasi klien HTTP gagal: {error}")))?;

        // Isolate HARUS dibuat di dalam konteks tokio: V8 dapat memposting delayed
        // task kapan saja (mis. GC memory reducer); deno_core men-abort proses bila
        // isolate terdaftar tanpa handle tokio untuk menghormati delay tersebut.
        let runtime_started = std::time::Instant::now();
        let mut runtime = {
            let _guard = tokio.enter();
            JsRuntime::new(RuntimeOptions {
                module_loader: Some(Rc::new(FileModuleLoader::new())),
                extensions: vec![ramonyx_engine::init()],
                create_params,
                op_metrics_factory_fn: metrics.clone().map(metrics::factory),
                ..Default::default()
            })
        };

        // Kuota heap: callback near-limit menghentikan eksekusi dengan alasan jelas
        // (tanpa ini V8 meng-abort proses — footgun yang tidak diinginkan). Limit
        // sementara dinaikkan agar V8 dapat meng-unwind ke interrupt check berikutnya;
        // terminasi V8 tidak bisa ditangkap kode JS, jadi ruang ini hanya untuk unwind.
        if let Some(max) = max_heap_bytes {
            let handle = runtime.v8_isolate().thread_safe_handle();
            let state = limit_state.clone();
            let max_mb = max / (1024 * 1024);
            runtime.add_near_heap_limit_callback(move |current_limit, _initial_limit| {
                state.set_reason(format!(
                    "batas heap V8 ({max_mb} MiB) terlampaui (limit saat ini {} MiB)",
                    current_limit / (1024 * 1024),
                ));
                handle.terminate_execution();
                current_limit + 16 * 1024 * 1024
            });
        }

        let runtime_time = runtime_started.elapsed();

        let bootstrap_started = std::time::Instant::now();
        runtime
            .execute_script("[ramonyx:bootstrap]".to_string(), BOOTSTRAP.to_string())
            .map_err(|error| EngineError::new(format!("bootstrap gagal: {error}")))?;
        let bootstrap_time = bootstrap_started.elapsed();

        let web_shim_started = std::time::Instant::now();
        runtime
            .execute_script("[ramonyx:web-shim]".to_string(), WEB_SHIM.to_string())
            .map_err(|error| EngineError::new(format!("web shim gagal: {error}")))?;
        let web_shim_time = web_shim_started.elapsed();

        let init_timings = InitTimings {
            runtime: runtime_time,
            bootstrap: bootstrap_time,
            web_shim: web_shim_time,
            total: init_started.elapsed(),
        };

        {
            let op_state_rc = runtime.op_state();
            let mut op_state = op_state_rc.borrow_mut();
            op_state.put(options.permissions);
            op_state.put(EngineLimits {
                max_heap_mb: options.max_heap_mb,
                tls_ca_file: options.tls_ca_file.clone(),
                max_cpu_ms: options.max_cpu_ms,
                max_rss_mb: options.max_rss_mb,
            });
            op_state.put(fetch_state);
            if options.ipc_stdio {
                op_state.put(plugin::ProcessBridge::enabled());
            }
        }

        Ok(Self {
            runtime,
            tokio,
            limit_state,
            timeout: options.timeout,
            metrics,
            last_timings: None,
            init_timings,
            cpu_limit: options.max_cpu_ms.map(Duration::from_millis),
            rss_limit_bytes: options.max_rss_mb.map(|mb| {
                u64::try_from(mb)
                    .unwrap_or(u64::MAX)
                    .saturating_mul(1024 * 1024)
            }),
            cpu_tid: current_thread_id(),
        })
    }

    /// Rincian waktu inisialisasi engine (R4).
    pub fn init_timings(&self) -> InitTimings {
        self.init_timings
    }

    /// Waktu eksekusi terakhir (bila ada).
    pub fn last_timings(&self) -> Option<ExecutionTimings> {
        self.last_timings
    }

    /// Metrik op terurut (kosong bila `op_metrics` tidak diaktifkan).
    pub fn op_metrics(&self) -> Vec<OpMetricEntry> {
        self.metrics
            .as_ref()
            .map(|handle| handle.borrow().entries())
            .unwrap_or_default()
    }

    /// Handle isolate thread-safe (dipakai watchdog timeout & kill switch worker).
    pub(crate) fn worker_isolate_handle(&mut self) -> v8::IsolateHandle {
        self.runtime.v8_isolate().thread_safe_handle()
    }

    /// Pasang kanal worker (dipanggil di thread worker sebelum eksekusi).
    pub(crate) fn put_worker_channel(&mut self, channel: worker::WorkerSelfChannel) {
        self.runtime.op_state().borrow_mut().put(channel);
    }

    /// Mulai semua penjaga (timeout wall-clock + kuota CPU/RSS). Dihentikan saat di-drop.
    fn start_guards(&mut self) -> Vec<Watchdog> {
        let mut guards = Vec::new();
        if let Some(watchdog) = self.start_watchdog() {
            guards.push(watchdog);
        }
        if let Some(guard) = self.start_resource_guard() {
            guards.push(guard);
        }
        guards
    }

    /// Guard kuota CPU/RSS (Linux): polling 25 ms, terminasi V8 bila terlampaui (ADR-0038).
    fn start_resource_guard(&mut self) -> Option<Watchdog> {
        if self.cpu_limit.is_none() && self.rss_limit_bytes.is_none() {
            return None;
        }
        let handle = self.runtime.v8_isolate().thread_safe_handle();
        let state = self.limit_state.clone();
        let cpu_limit = self.cpu_limit;
        let rss_limit = self.rss_limit_bytes;
        let cpu_tid = self.cpu_tid;
        let (cancel, wait) = std::sync::mpsc::channel::<()>();
        let join = std::thread::spawn(move || {
            loop {
                match wait.recv_timeout(Duration::from_millis(25)) {
                    Ok(()) | Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => return,
                    Err(std::sync::mpsc::RecvTimeoutError::Timeout) => {}
                }
                if let Some(limit) = cpu_limit {
                    let cpu = thread_cpu_time(cpu_tid);
                    if cpu > limit {
                        state.set_reason(format!(
                            "kuota CPU {} ms terlampaui (CPU thread engine {} ms)",
                            limit.as_millis(),
                            cpu.as_millis(),
                        ));
                        handle.terminate_execution();
                        return;
                    }
                }
                if let Some(limit) = rss_limit {
                    let rss = process_rss_bytes();
                    if rss > limit {
                        state.set_reason(format!(
                        "kuota RSS {} MiB terlampaui (RSS proses {} MiB; termasuk memori eksternal V8)",
                        limit / (1024 * 1024),
                        rss / (1024 * 1024),
                    ));
                        handle.terminate_execution();
                        return;
                    }
                }
            }
        });
        Some(Watchdog {
            cancel: Some(cancel),
            join: Some(join),
        })
    }

    /// Watchdog timeout wall-clock (bila dikonfigurasi).
    fn start_watchdog(&mut self) -> Option<Watchdog> {
        let limit = self.timeout?;
        let handle = self.runtime.v8_isolate().thread_safe_handle();
        let state = self.limit_state.clone();
        let (cancel, wait) = std::sync::mpsc::channel::<()>();
        let join = std::thread::spawn(move || {
            if wait.recv_timeout(limit).is_err() {
                state.set_reason(format!("timeout {} ms terlampaui", limit.as_millis()));
                handle.terminate_execution();
            }
        });
        Some(Watchdog {
            cancel: Some(cancel),
            join: Some(join),
        })
    }

    /// Hasil eksekusi + alasan penghentian paksa (bila ada) → error yang jelas.
    fn finish(&self, result: Result<(), String>) -> Result<(), EngineError> {
        match result {
            Ok(()) => Ok(()),
            Err(message) => match self.limit_state.get_reason() {
                Some(reason) => Err(EngineError::new(format!("program dihentikan: {reason}"))),
                None => Err(EngineError::new(message)),
            },
        }
    }

    /// Jalankan script JS (tanpa `import`); error dikembalikan sebagai `EngineError`.
    pub fn execute(&mut self, name: &str, source: &str) -> Result<(), EngineError> {
        let started = std::time::Instant::now();
        let guards = self.start_guards();
        let result = self
            .runtime
            .execute_script(name.to_string(), source.to_string())
            .map(|_| ())
            .map_err(|error| error.to_string());
        drop(guards);
        let elapsed = started.elapsed();
        self.last_timings = Some(ExecutionTimings {
            load: Duration::ZERO,
            evaluate: elapsed,
            total: elapsed,
        });
        self.finish(result)
    }

    /// Jalankan modul ESM dari file (relatif/absolut). Mendukung `.js/.mjs` dan
    /// `.ts/.tsx` (transpile via deno_ast).
    pub fn execute_module(&mut self, entry: &Path) -> Result<(), EngineError> {
        let current_dir = std::env::current_dir()
            .map_err(|error| EngineError::new(format!("tidak bisa membaca cwd: {error}")))?;
        let main_module = resolve_path(&entry.display().to_string(), &current_dir)
            .map_err(|error| EngineError::new(format!("entry tidak valid: {error}")))?;

        let started = std::time::Instant::now();
        let guards = self.start_guards();
        let (result, load, evaluate) = {
            let Engine { runtime, tokio, .. } = self;
            tokio.block_on(async move {
                let load_started = std::time::Instant::now();
                let loaded = runtime.load_main_es_module(&main_module).await;
                let load = load_started.elapsed();

                let evaluate_started = std::time::Instant::now();
                let result = match loaded {
                    Ok(module_id) => {
                        let evaluation = runtime.mod_evaluate(module_id);
                        match runtime.run_event_loop(Default::default()).await {
                            Ok(()) => evaluation.await.map_err(|error| error.to_string()),
                            Err(error) => Err(error.to_string()),
                        }
                    }
                    Err(error) => Err(error.to_string()),
                };
                (result, load, evaluate_started.elapsed())
            })
        };
        drop(guards);
        self.last_timings = Some(ExecutionTimings {
            load,
            evaluate,
            total: started.elapsed(),
        });
        self.finish(result)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn temp_dir(name: &str) -> PathBuf {
        let directory =
            std::env::temp_dir().join(format!("ramonyx-engine-{name}-{}", std::process::id()));
        fs::create_dir_all(&directory).expect("mkdir");
        directory
    }

    #[test]
    fn mengeksekusi_script_sederhana() {
        let mut engine = Engine::new().expect("engine");
        engine
            .execute("[test]", "globalThis.__ramonyx_test = 1 + 1;")
            .expect("eksekusi");
    }

    #[test]
    fn syntax_error_dilaporkan() {
        let mut engine = Engine::new().expect("engine");
        let error = engine
            .execute("[test]", "function ( {")
            .expect_err("harus error");
        assert!(!error.to_string().is_empty());
    }

    #[test]
    fn runtime_throw_dilaporkan() {
        let mut engine = Engine::new().expect("engine");
        let error = engine
            .execute("[test]", "throw new Error('boom');")
            .expect_err("harus error");
        assert!(error.to_string().contains("boom"));
    }

    #[test]
    fn modul_esm_dengan_import_relatif() {
        let directory = temp_dir("esm");
        fs::write(
            directory.join("lib.mjs"),
            "export const nilai = 21;\nexport default function gandakan(x) { return x * 2; }\n",
        )
        .expect("write lib");
        // Import tanpa ekstensi → fallback resolusi ekstensi.
        fs::write(
            directory.join("main.mjs"),
            "import gandakan, { nilai } from './lib';\nglobalThis.__hasil = gandakan(nilai);\n",
        )
        .expect("write main");

        let mut engine = Engine::new().expect("engine");
        engine
            .execute_module(&directory.join("main.mjs"))
            .expect("module");

        // Verifikasi hasil lewat script di runtime yang sama.
        engine
            .execute(
                "[verify]",
                "if (globalThis.__hasil !== 42) throw new Error('hasil salah');",
            )
            .expect("verify");

        fs::remove_dir_all(&directory).expect("cleanup");
    }

    #[test]
    fn typescript_ditranspile_dan_dijalankan() {
        let directory = temp_dir("ts");
        fs::write(
            directory.join("nilai.ts"),
            "export interface Titik { x: number }\nexport const titik: Titik = { x: 42 };\n",
        )
        .expect("write ts lib");
        fs::write(
            directory.join("main.ts"),
            "import { titik } from './nilai.ts';\nconst n: number = titik.x;\nglobalThis.__ts_hasil = n;\n",
        )
        .expect("write ts main");

        let mut engine = Engine::new().expect("engine");
        engine
            .execute_module(&directory.join("main.ts"))
            .expect("module ts");
        engine
            .execute(
                "[verify]",
                "if (globalThis.__ts_hasil !== 42) throw new Error('hasil ts salah');",
            )
            .expect("verify");

        fs::remove_dir_all(&directory).expect("cleanup");
    }

    #[test]
    fn bare_specifier_tanpa_paket_ditolak_dengan_pesan_jelas() {
        let directory = temp_dir("bare");
        fs::write(directory.join("main.mjs"), "import x from 'paket-npm';\n").expect("write");

        let mut engine = Engine::new().expect("engine");
        let error = engine
            .execute_module(&directory.join("main.mjs"))
            .expect_err("harus error");
        assert!(
            error.to_string().contains("tidak ditemukan"),
            "pesan jelas: {error}"
        );

        fs::remove_dir_all(&directory).expect("cleanup");
    }

    #[test]
    fn modul_mengimpor_paket_node_modules() {
        let directory = temp_dir("node-modules");
        let package_dir = directory.join("node_modules/demo-pkg");
        fs::create_dir_all(&package_dir).expect("mkdir");
        fs::write(
            package_dir.join("package.json"),
            r#"{ "name": "demo-pkg", "type": "module", "exports": { ".": { "import": "./esm/main.js" } } }"#,
        )
        .expect("manifest");
        fs::create_dir_all(package_dir.join("esm")).expect("mkdir esm");
        fs::write(
            package_dir.join("esm/main.js"),
            "export function halo() { return 'dari paket'; }\n",
        )
        .expect("kode paket");

        let main = directory.join("main.mjs");
        fs::write(
            &main,
            "import { halo } from 'demo-pkg';\nglobalThis.__pkg = halo();\n",
        )
        .expect("write");

        let mut engine = Engine::with_options(EngineOptions {
            permissions: Permissions::allow_all(),
            ..Default::default()
        })
        .expect("engine");
        engine.execute_module(&main).expect("import paket");
        engine
            .execute(
                "[verify]",
                "if (globalThis.__pkg !== 'dari paket') throw new Error('hasil paket salah');",
            )
            .expect("verify");

        fs::remove_dir_all(&directory).expect("cleanup");
    }

    #[test]
    fn ops_timer_dan_filesystem() {
        let directory = temp_dir("io");
        let out_path = directory.join("out.txt");
        let out_literal =
            serde_json::to_string(out_path.to_str().expect("path utf8")).expect("json");
        let main = directory.join("main.mjs");
        fs::write(
            &main,
            format!(
                r#"
await ramonyx.sleep(20);
await ramonyx.writeTextFile({out_literal}, "isi dari runtime");
const isi = await ramonyx.readTextFile({out_literal});
if (!isi.includes("runtime")) throw new Error("baca gagal: " + isi);
globalThis.__io_ok = true;
"#
            ),
        )
        .expect("write");

        let mut engine = Engine::with_options(EngineOptions {
            permissions: Permissions::allow_all(),
            ..Default::default()
        })
        .expect("engine");
        engine.execute_module(&main).expect("module io");
        engine
            .execute(
                "[verify]",
                "if (globalThis.__io_ok !== true) throw new Error('io gagal');",
            )
            .expect("verify");

        assert!(
            fs::read_to_string(&out_path)
                .expect("baca")
                .contains("runtime"),
            "file tertulis dari JS"
        );

        fs::remove_dir_all(&directory).expect("cleanup");
    }

    #[test]
    fn permission_denied_untuk_fs_env_dan_net() {
        let directory = temp_dir("deny");
        let file = directory.join("x.txt");
        fs::write(&file, "isi").expect("write");
        let file_literal = serde_json::to_string(file.to_str().expect("utf8")).expect("json");

        let cases: Vec<(&str, String, &str)> = vec![
            (
                "read.mjs",
                format!("await ramonyx.readTextFile({file_literal});"),
                "--allow-read",
            ),
            (
                "write.mjs",
                format!("await ramonyx.writeTextFile({file_literal}, 'x');"),
                "--allow-write",
            ),
            (
                "env.mjs",
                "ramonyx.env.get('HOME');".to_string(),
                "--allow-env",
            ),
            (
                "net.mjs",
                "ramonyx.serve(0, () => ({ status: 200, body: 'x' }));".to_string(),
                "--allow-net",
            ),
        ];

        for (name, source, expected_flag) in cases {
            let module = directory.join(name);
            fs::write(&module, source).expect("write");
            let error = Engine::new()
                .expect("engine")
                .execute_module(&module)
                .expect_err("harus ditolak");
            assert!(
                error.to_string().contains(expected_flag),
                "{name}: pesan memuat {expected_flag}: {error}"
            );
        }

        fs::remove_dir_all(&directory).expect("cleanup");
    }

    #[test]
    fn permission_daftar_eksplisit_mengizinkan_sebagian() {
        use runtime_core::Permission;

        let directory = temp_dir("allow-list");
        let allowed = directory.join("allowed");
        fs::create_dir_all(&allowed).expect("mkdir");
        let file = allowed.join("data.txt");
        fs::write(&file, "isi-boleh").expect("write");
        let file_literal = serde_json::to_string(file.to_str().expect("utf8")).expect("json");

        let module = directory.join("main.mjs");
        fs::write(
            &module,
            format!(
                "const isi = await ramonyx.readTextFile({file_literal});\nglobalThis.__isi = isi;"
            ),
        )
        .expect("write");

        let mut engine = Engine::with_options(EngineOptions {
            permissions: Permissions {
                read: Permission::Allow(vec![allowed.display().to_string()]),
                ..Default::default()
            },
            ..Default::default()
        })
        .expect("engine");
        engine.execute_module(&module).expect("diizinkan");
        engine
            .execute(
                "[verify]",
                "if (globalThis.__isi !== 'isi-boleh') throw new Error('isi salah');",
            )
            .expect("verify");

        fs::remove_dir_all(&directory).expect("cleanup");
    }

    #[test]
    fn http_server_merespons_permintaan_lalu_tutup() {
        use std::io::{Read as IoRead, Write as IoWrite};

        let directory = temp_dir("http");
        let port_path = directory.join("port.txt");
        let port_literal =
            serde_json::to_string(port_path.to_str().expect("path utf8")).expect("json");
        let main = directory.join("main.mjs");
        fs::write(
            &main,
            format!(
                r#"
const server = ramonyx.serve(0, async (request) => {{
  queueMicrotask(() => server.close());
  return {{
    status: 200,
    headers: {{ "content-type": "text/plain; charset=utf-8" }},
    body: "halo " + request.path,
  }};
}});
await ramonyx.writeTextFile({port_literal}, String(server.port));
"#
            ),
        )
        .expect("write");

        let (done_tx, done_rx) = std::sync::mpsc::channel();
        std::thread::spawn(move || {
            let mut engine = Engine::with_options(EngineOptions {
                permissions: Permissions::allow_all(),
                ..Default::default()
            })
            .expect("engine");
            let result = engine.execute_module(&main);
            let _ = done_tx.send(result.map_err(|error| error.to_string()));
        });

        let mut port: Option<u16> = None;
        for _ in 0..100 {
            if let Ok(contents) = fs::read_to_string(&port_path)
                && let Ok(value) = contents.trim().parse::<u16>()
            {
                port = Some(value);
                break;
            }
            std::thread::sleep(Duration::from_millis(50));
        }
        let port = port.expect("port file muncul");

        let mut stream = std::net::TcpStream::connect(("127.0.0.1", port)).expect("connect");
        stream
            .write_all(b"GET /halo HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n")
            .expect("kirim request");
        let mut response = String::new();
        stream.read_to_string(&mut response).expect("baca respons");

        assert!(response.contains("200 OK"), "status 200: {response}");
        assert!(
            response.contains("halo /halo"),
            "body dari handler: {response}"
        );

        let engine_result = done_rx
            .recv_timeout(Duration::from_secs(10))
            .expect("engine selesai setelah server ditutup");
        assert!(
            engine_result.is_ok(),
            "module selesai bersih: {engine_result:?}"
        );

        fs::remove_dir_all(&directory).expect("cleanup");
    }

    #[test]
    fn klien_putus_memicu_abort_dan_server_tetap_hidup() {
        use std::io::{Read as IoRead, Write as IoWrite};

        let directory = temp_dir("abort");
        let port_path = directory.join("port.txt");
        let marker = directory.join("aborted.txt");
        let port_literal = serde_json::to_string(port_path.to_str().expect("utf8")).expect("json");
        let marker_literal = serde_json::to_string(marker.to_str().expect("utf8")).expect("json");
        let main = directory.join("main.mjs");
        fs::write(
            &main,
            format!(
                r#"
const server = ramonyx.serve(0, async (request) => {{
  if (request.path.startsWith("/lambat")) {{
    await new Promise((resolve) => {{
      if (request.signal.aborted) {{ resolve(); return; }}
      request.signal.addEventListener("abort", () => resolve(), {{ once: true }});
    }});
    await ramonyx.writeTextFile({marker_literal}, "aborted");
    return {{ status: 200, body: "aborted" }};
  }}
  queueMicrotask(() => server.close());
  return {{ status: 200, body: "ok" }};
}});
await ramonyx.writeTextFile({port_literal}, String(server.port));
"#
            ),
        )
        .expect("write");

        let (done_tx, done_rx) = std::sync::mpsc::channel();
        std::thread::spawn(move || {
            let mut engine = Engine::with_options(EngineOptions {
                permissions: Permissions::allow_all(),
                ..Default::default()
            })
            .expect("engine");
            let result = engine.execute_module(&main);
            let _ = done_tx.send(result.map_err(|error| error.to_string()));
        });

        let port = wait_port(&port_path);

        // Kirim request lalu putuskan koneksi tanpa menunggu respons.
        {
            let mut stream = std::net::TcpStream::connect(("127.0.0.1", port)).expect("connect");
            stream
                .write_all(b"GET /lambat HTTP/1.1\r\nHost: localhost\r\n\r\n")
                .expect("kirim");
            // Beri waktu handler mulai sebelum memutuskan koneksi (klien yang menutup
            // terlalu cepat dibatalkan hyper sebelum handler berjalan — tidak perlu ditangani).
            std::thread::sleep(Duration::from_millis(200));
        }

        let mut aborted = false;
        for _ in 0..100 {
            if marker.exists() {
                aborted = true;
                break;
            }
            std::thread::sleep(Duration::from_millis(50));
        }
        assert!(aborted, "handler menerima abort saat klien putus");

        // Server tetap hidup → request kedua dilayani.
        let mut stream = std::net::TcpStream::connect(("127.0.0.1", port)).expect("connect 2");
        stream
            .write_all(b"GET /ok HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n")
            .expect("kirim 2");
        let mut response = String::new();
        stream.read_to_string(&mut response).expect("baca 2");
        assert!(
            response.contains("200 OK") && response.contains("ok"),
            "server tetap hidup: {response}"
        );

        let engine_result = done_rx
            .recv_timeout(Duration::from_secs(10))
            .expect("engine selesai");
        assert!(
            engine_result.is_ok(),
            "module selesai bersih: {engine_result:?}"
        );

        fs::remove_dir_all(&directory).expect("cleanup");
    }

    #[test]
    fn keep_alive_dua_request_satu_koneksi() {
        use std::io::{Read as IoRead, Write as IoWrite};

        let directory = temp_dir("keepalive");
        let port_path = directory.join("port.txt");
        let port_literal = serde_json::to_string(port_path.to_str().expect("utf8")).expect("json");
        let main = directory.join("main.mjs");
        fs::write(
            &main,
            format!(
                r#"
let served = 0;
const server = ramonyx.serve(0, async (request) => {{
  served += 1;
  if (served >= 2) {{
    queueMicrotask(() => server.close());
  }}
  return {{ status: 200, body: "req:" + request.path }};
}});
await ramonyx.writeTextFile({port_literal}, String(server.port));
"#
            ),
        )
        .expect("write");

        let (done_tx, done_rx) = std::sync::mpsc::channel();
        std::thread::spawn(move || {
            let mut engine = Engine::with_options(EngineOptions {
                permissions: Permissions::allow_all(),
                ..Default::default()
            })
            .expect("engine");
            let result = engine.execute_module(&main);
            let _ = done_tx.send(result.map_err(|error| error.to_string()));
        });

        let port = wait_port(&port_path);

        let mut stream = std::net::TcpStream::connect(("127.0.0.1", port)).expect("connect");
        stream
            .write_all(
                b"GET /a HTTP/1.1\r\nHost: localhost\r\n\r\nGET /b HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n",
            )
            .expect("kirim pipelined");
        let mut response = String::new();
        stream.read_to_string(&mut response).expect("baca");

        let status_count = response.matches("200 OK").count();
        assert_eq!(status_count, 2, "dua respons pada satu koneksi: {response}");
        assert!(response.contains("req:/a"), "body pertama");
        assert!(response.contains("req:/b"), "body kedua");

        let engine_result = done_rx
            .recv_timeout(Duration::from_secs(10))
            .expect("engine selesai");
        assert!(
            engine_result.is_ok(),
            "module selesai bersih: {engine_result:?}"
        );

        fs::remove_dir_all(&directory).expect("cleanup");
    }

    #[test]
    fn respons_streaming_chunked() {
        use std::io::{Read as IoRead, Write as IoWrite};

        let directory = temp_dir("stream");
        let port_path = directory.join("port.txt");
        let port_literal = serde_json::to_string(port_path.to_str().expect("utf8")).expect("json");
        let main = directory.join("main.mjs");
        fs::write(
            &main,
            format!(
                r#"
const server = ramonyx.serve(0, async (request) => {{
  async function* stream() {{
    for (let i = 1; i <= 3; i += 1) {{
      await ramonyx.sleep(10);
      yield "bagian-" + i + ";";
    }}
  }}
  return {{ status: 200, headers: {{ "content-type": "text/plain; charset=utf-8" }}, body: stream() }};
}});
await ramonyx.writeTextFile({port_literal}, String(server.port));
// Beri waktu stream selesai, lalu tutup server agar proses exit bersih.
(async () => {{
  await ramonyx.sleep(400);
server.close();
}})();
"#
            ),
        )
        .expect("write");

        let (done_tx, done_rx) = std::sync::mpsc::channel();
        std::thread::spawn(move || {
            let mut engine = Engine::with_options(EngineOptions {
                permissions: Permissions::allow_all(),
                ..Default::default()
            })
            .expect("engine");
            let result = engine.execute_module(&main);
            let _ = done_tx.send(result.map_err(|error| error.to_string()));
        });

        let port = wait_port(&port_path);

        let mut stream = std::net::TcpStream::connect(("127.0.0.1", port)).expect("connect");
        stream
            .write_all(b"GET /stream HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n")
            .expect("kirim");
        let mut response = String::new();
        stream.read_to_string(&mut response).expect("baca");

        let lower = response.to_lowercase();
        assert!(lower.contains("200 ok"), "status: {response}");
        assert!(
            lower.contains("transfer-encoding: chunked"),
            "chunked (tanpa content-length): {response}"
        );
        let first = response.find("bagian-1;").expect("chunk 1");
        let second = response.find("bagian-2;").expect("chunk 2");
        let third = response.find("bagian-3;").expect("chunk 3");
        assert!(first < second && second < third, "urutan chunk: {response}");

        let engine_result = done_rx
            .recv_timeout(Duration::from_secs(10))
            .expect("engine selesai");
        assert!(
            engine_result.is_ok(),
            "module selesai bersih: {engine_result:?}"
        );

        fs::remove_dir_all(&directory).expect("cleanup");
    }

    #[test]
    fn web_shim_dasar() {
        let directory = temp_dir("web-shim");
        let main = directory.join("main.mjs");
        fs::write(
            &main,
            r##"
// TextEncoder/Decoder: UTF-8 multibyte bolak-balik.
const teks = "halo é 中 🚀";
const bytes = new TextEncoder().encode(teks);
if (bytes.length !== 16) throw new Error("panjang byte salah: " + bytes.length);
const kembali = new TextDecoder().decode(bytes);
if (kembali !== teks) throw new Error("roundtrip gagal: " + kembali);

// URL + searchParams.
const url = new URL("http://contoh.id:8080/usr/rin?q=1&q=2&z=%20#halo");
if (url.hostname !== "contoh.id") throw new Error("hostname: " + url.hostname);
if (url.port !== "8080") throw new Error("port: " + url.port);
if (url.pathname !== "/usr/rin") throw new Error("pathname: " + url.pathname);
if (url.searchParams.getAll("q").join(",") !== "1,2") throw new Error("getAll");
if (url.searchParams.get("z") !== " ") throw new Error("decode spasi");
if (!url.hash.startsWith("#")) throw new Error("hash");

// Headers: case-insensitive + append.
const headers = new Headers({ "Content-Type": "text/plain" });
headers.append("X-A", "1");
headers.append("x-a", "2");
if (headers.get("content-type") !== "text/plain") throw new Error("get header");
if (headers.get("X-A") !== "1, 2") throw new Error("append header");

// Response: json + clone.
const response = Response.json({ a: 1 });
const cloned = response.clone();
if (cloned.headers.get("content-type") !== "application/json") throw new Error("ct json");
const parsed = await cloned.json();

// Request: method uppercase + body.
const request = new Request("http://x/", { method: "post", body: "isi" });

// setTimeout berjalan.
let fired = false;
setTimeout(() => { fired = true; }, 5);
await ramonyx.sleep(30);
if (!fired) throw new Error("setTimeout tidak jalan");

globalThis.__web_ok = {
  jsonNilai: parsed.a,
  requestMethod: request.method,
  requestBody: await request.text(),
};
"##,
        )
        .expect("write");

        let mut engine = Engine::new().expect("engine");
        engine.execute_module(&main).expect("web shim module");
        engine
            .execute(
                "[verify]",
                r##"
const hasil = globalThis.__web_ok;
if (hasil.jsonNilai !== 1) throw new Error("json clone salah");
if (hasil.requestMethod !== "POST") throw new Error("method: " + hasil.requestMethod);
if (hasil.requestBody !== "isi") throw new Error("body: " + hasil.requestBody);
"##,
            )
            .expect("verify");

        fs::remove_dir_all(&directory).expect("cleanup");
    }

    #[test]
    fn cjs_interop_dasar_dengan_reexport_dan_json() {
        let directory = temp_dir("cjs-dasar");
        let package_dir = directory.join("node_modules/paket-cjs");
        fs::create_dir_all(package_dir.join("lib")).expect("mkdir");
        fs::write(
            package_dir.join("package.json"),
            r#"{ "name": "paket-cjs", "version": "1.2.3", "main": "index.js" }"#,
        )
        .expect("manifest");
        fs::write(
            package_dir.join("index.js"),
            r#"#!/usr/bin/env node
'use strict';
const dalam = require('./lib/dalam.js');
// require di komentar tidak boleh ikut dipindai: require('./hilang.js')
module.exports = { halo: () => 'halo ' + dalam.nama, versi: dalam.versi };
"#,
        )
        .expect("index");
        fs::write(
            package_dir.join("lib/dalam.js"),
            "exports.nama = require('./nama.json');\nexports.versi = require('../package.json').version;\n",
        )
        .expect("dalam");
        fs::write(package_dir.join("lib/nama.json"), "\"cjs\"").expect("json");

        let main = directory.join("main.mjs");
        fs::write(
            &main,
            r#"
import { halo, versi } from 'paket-cjs';
import paket from 'paket-cjs';
if (halo() !== 'halo cjs') throw new Error('halo salah: ' + halo());
if (versi !== '1.2.3') throw new Error('versi salah: ' + versi);
if (paket.halo() !== 'halo cjs') throw new Error('default export salah');
globalThis.__cjs_dasar = true;
"#,
        )
        .expect("write");

        let mut engine = Engine::new().expect("engine");
        engine.execute_module(&main).expect("cjs interop");
        engine
            .execute(
                "[verify]",
                "if (globalThis.__cjs_dasar !== true) throw new Error('cjs gagal');",
            )
            .expect("verify");

        fs::remove_dir_all(&directory).expect("cleanup");
    }

    #[test]
    fn cjs_interop_reexport_branch_dan_process_env() {
        let directory = temp_dir("cjs-env");
        let package_dir = directory.join("node_modules/paket-env");
        fs::create_dir_all(&package_dir).expect("mkdir");
        fs::write(
            package_dir.join("package.json"),
            r#"{ "name": "paket-env", "main": "index.js" }"#,
        )
        .expect("manifest");
        fs::write(
            package_dir.join("index.js"),
            r#"'use strict';
if (process.env.NODE_ENV === 'production') {
  module.exports = require('./prod.js');
} else {
  module.exports = require('./dev.js');
}
"#,
        )
        .expect("index");
        fs::write(
            package_dir.join("prod.js"),
            "exports.mode = 'production';\nexports.jumlah = 42;\n",
        )
        .expect("prod");
        fs::write(package_dir.join("dev.js"), "exports.mode = 'dev';\n").expect("dev");

        let main = directory.join("main.mjs");
        fs::write(
            &main,
            r#"
import { mode, jumlah } from 'paket-env';
if (mode !== 'production') throw new Error('mode: ' + mode);
if (jumlah !== 42) throw new Error('jumlah: ' + jumlah);
globalThis.__cjs_env = mode;
"#,
        )
        .expect("write");

        let mut engine = Engine::new().expect("engine");
        engine.execute_module(&main).expect("cjs env");
        engine
            .execute(
                "[verify]",
                "if (globalThis.__cjs_env !== 'production') throw new Error('env salah');",
            )
            .expect("verify");

        fs::remove_dir_all(&directory).expect("cleanup");
    }

    #[test]
    fn cjs_builtin_dan_require_dinamis_ditolak_dengan_pesan_jelas() {
        let directory = temp_dir("cjs-error");

        let builtin_dir = directory.join("node_modules/paket-fs");
        fs::create_dir_all(&builtin_dir).expect("mkdir");
        fs::write(
            builtin_dir.join("package.json"),
            r#"{ "name": "paket-fs", "main": "index.js" }"#,
        )
        .expect("manifest");
        fs::write(
            builtin_dir.join("index.js"),
            "module.exports = require('fs');\n",
        )
        .expect("fs");

        let dynamic_dir = directory.join("node_modules/paket-dinamis");
        fs::create_dir_all(&dynamic_dir).expect("mkdir");
        fs::write(
            dynamic_dir.join("package.json"),
            r#"{ "name": "paket-dinamis", "main": "index.js" }"#,
        )
        .expect("manifest");
        fs::write(
            dynamic_dir.join("index.js"),
            "const nama = './x.js';\nmodule.exports = require(nama);\n",
        )
        .expect("dinamis");

        let builtin_main = directory.join("fs.mjs");
        fs::write(&builtin_main, "import 'paket-fs';\n").expect("write");
        let error = Engine::new()
            .expect("engine")
            .execute_module(&builtin_main)
            .expect_err("builtin harus ditolak");
        assert!(
            error.to_string().contains("bawaan Node"),
            "pesan builtin: {error}"
        );

        let dynamic_main = directory.join("dinamis.mjs");
        fs::write(&dynamic_main, "import 'paket-dinamis';\n").expect("write");
        let error = Engine::new()
            .expect("engine")
            .execute_module(&dynamic_main)
            .expect_err("require dinamis harus ditolak");
        let message = error.to_string();
        assert!(
            message.contains("dinamis") && message.contains("paket-dinamis"),
            "pesan dinamis: {message}"
        );

        fs::remove_dir_all(&directory).expect("cleanup");
    }

    #[test]
    fn readable_stream_dan_body_request_response() {
        let directory = temp_dir("stream-shim");
        let main = directory.join("main.mjs");
        fs::write(
            &main,
            r##"
// ReadableStream: start + enqueue + close + for await.
const stream = new ReadableStream({
  start(controller) {
    controller.enqueue(new TextEncoder().encode("ha"));
    controller.enqueue(new TextEncoder().encode("lo"));
    controller.close();
  },
});
const bagian = [];
for await (const chunk of stream) {
  bagian.push(new TextDecoder().decode(chunk));
}
if (bagian.join("") !== "halo") throw new Error("isi stream salah: " + bagian.join(""));

// Stream pull-based dengan highWaterMark 0 (pola scheduler React server).
let tarikan = 0;
const kedua = new ReadableStream(
  {
    type: "bytes",
    pull(controller) {
      tarikan += 1;
      if (tarikan <= 2) {
        controller.enqueue(new TextEncoder().encode("b" + tarikan));
      } else {
        controller.close();
      }
    },
  },
  { highWaterMark: 0 },
);
const reader = kedua.getReader();
const hasil = [];
for (;;) {
  const { done, value } = await reader.read();
  if (done) break;
  hasil.push(new TextDecoder().decode(value));
}
if (hasil.join(",") !== "b1,b2") throw new Error("pull stream salah: " + hasil.join(","));

// TextDecoder mode stream: urutan multibyte terpotong antar-chunk.
const penuh = new TextEncoder().encode("é中");
const potong = new TextDecoder();
const kiri = potong.decode(penuh.slice(0, 1), { stream: true });
const kanan = potong.decode(penuh.slice(1), { stream: true });
if (kiri + kanan !== "é中") throw new Error("decoder streaming salah: " + JSON.stringify(kiri + kanan));

// Request body → ReadableStream; text() tetap benar.
const request = new Request("http://x/", { method: "POST", body: JSON.stringify({ a: 1 }) });
if (request.body === null) throw new Error("request.body null");
if (JSON.parse(await request.text()).a !== 1) throw new Error("request text salah");

// Response body → ReadableStream; bisa dibaca ulang lewat reader.
const response = Response.json({ b: 2 });
let isi = "";
const pembaca = response.body.getReader();
for (;;) {
  const { done, value } = await pembaca.read();
  if (done) break;
  isi += new TextDecoder().decode(value);
}
if (JSON.parse(isi).b !== 2) throw new Error("response body stream salah");

// Response dibangun dari stream (pola middleware security headers).
const dilewat = new Response(Response.json({ c: 3 }).body, { status: 201 });
const teks = await dilewat.text();
if (dilewat.status !== 201 || !teks.includes('"c"')) {
  throw new Error("response dari stream salah: " + teks);
}

globalThis.__stream_ok = { tarikan };
"##,
        )
        .expect("write");

        let mut engine = Engine::new().expect("engine");
        engine.execute_module(&main).expect("stream module");
        engine
            .execute(
                "[verify]",
                "if (globalThis.__stream_ok.tarikan < 2) throw new Error('pull tidak terpanggil');",
            )
            .expect("verify");

        fs::remove_dir_all(&directory).expect("cleanup");
    }

    #[test]
    fn fetch_ke_server_lokal_di_runtime() {
        let directory = temp_dir("fetch");
        let main = directory.join("main.mjs");
        fs::write(
            &main,
            r##"
const server = ramonyx.serve(0, async (request) => {
  if (request.path === "/json") {
    return {
      status: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ balas: "ok", metode: request.method }),
    };
  }
  return { status: 404, body: "tidak ada" };
});
const dasar = "http://127.0.0.1:" + server.port;

const response = await fetch(dasar + "/json");
if (response.status !== 200 || !response.ok) throw new Error("status salah: " + response.status);
if (response.headers.get("content-type") !== "application/json") {
  throw new Error("headers salah: " + response.headers.get("content-type"));
}
const data = await response.json();
if (data.balas !== "ok" || data.metode !== "GET") {
  throw new Error("json salah: " + JSON.stringify(data));
}

// Body respons sebagai ReadableStream.
const kedua = await fetch(dasar + "/json");
let teks = "";
for await (const chunk of kedua.body) {
  teks += new TextDecoder().decode(chunk, { stream: true });
}
if (!teks.includes("ok")) throw new Error("stream body salah: " + teks);

// 404 tidak melempar (fetch hanya melempar untuk kegagalan transport).
const hilang = await fetch(dasar + "/tidak-ada");
if (hilang.status !== 404 || hilang.ok) throw new Error("404 salah: " + hilang.status);

server.close();
globalThis.__fetch_ok = true;
"##,
        )
        .expect("write");

        let mut engine = Engine::with_options(EngineOptions {
            permissions: Permissions::allow_all(),
            ..Default::default()
        })
        .expect("engine");
        engine.execute_module(&main).expect("fetch module");
        engine
            .execute(
                "[verify]",
                "if (globalThis.__fetch_ok !== true) throw new Error('fetch gagal');",
            )
            .expect("verify");

        fs::remove_dir_all(&directory).expect("cleanup");
    }

    #[test]
    fn fetch_tanpa_allow_net_ditolak_dengan_pesan_jelas() {
        let directory = temp_dir("fetch-deny");
        let main = directory.join("main.mjs");
        fs::write(&main, "await fetch('http://127.0.0.1:9/');\n").expect("write");

        let error = Engine::new()
            .expect("engine")
            .execute_module(&main)
            .expect_err("harus ditolak");
        assert!(error.to_string().contains("--allow-net"), "{error}");

        fs::remove_dir_all(&directory).expect("cleanup");
    }

    #[test]
    fn modul_bawaan_net_dns_dan_crypto() {
        let directory = temp_dir("builtins");
        let main = directory.join("main.mjs");
        fs::write(
            &main,
            r##"
import { isIP } from "node:net";
import { lookup } from "node:dns/promises";

if (isIP("127.0.0.1") !== 4) throw new Error("isIP v4: " + isIP("127.0.0.1"));
if (isIP("::1") !== 6) throw new Error("isIP v6: " + isIP("::1"));
if (isIP("2001:db8::1") !== 6) throw new Error("isIP v6 dua");
if (isIP("256.1.1.1") !== 0) throw new Error("isIP rentang");
if (isIP("01.2.3.4") !== 0) throw new Error("isIP leading zero");
if (isIP("contoh") !== 0) throw new Error("isIP nama");
if (isIP("1:2:3:4:5:6:7:8:9") !== 0) throw new Error("isIP v6 panjang");
if (isIP("::ffff:127.0.0.1") !== 6) throw new Error("isIP mapped");

const entries = await lookup("127.0.0.1", { all: true, verbatim: true });
if (!Array.isArray(entries) || entries.length === 0) throw new Error("lookup kosong");
if (entries[0].address !== "127.0.0.1" || entries[0].family !== 4) {
  throw new Error("lookup isi: " + JSON.stringify(entries));
}
const satu = await lookup("127.0.0.1");
if (satu.address !== "127.0.0.1") throw new Error("lookup tanpa all");

const a = new Uint8Array(16);
const b = new Uint8Array(16);
crypto.getRandomValues(a);
crypto.getRandomValues(b);
let sama = true;
for (let i = 0; i < 16; i += 1) {
  if (a[i] !== b[i]) {
    sama = false;
    break;
  }
}
if (sama) throw new Error("dua undian identik (praktis mustahil)");
const uuid = crypto.randomUUID();
if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(uuid)) {
  throw new Error("uuid tidak valid: " + uuid);
}
globalThis.__builtin_ok = true;
"##,
        )
        .expect("write");

        let mut engine = Engine::with_options(EngineOptions {
            permissions: Permissions::allow_all(),
            ..Default::default()
        })
        .expect("engine");
        engine.execute_module(&main).expect("builtin module");
        engine
            .execute(
                "[verify]",
                "if (globalThis.__builtin_ok !== true) throw new Error('builtin gagal');",
            )
            .expect("verify");

        fs::remove_dir_all(&directory).expect("cleanup");
    }

    #[test]
    fn modul_bawaan_tak_didukung_dan_dns_permission() {
        let directory = temp_dir("builtin-error");

        let fs_main = directory.join("fs.mjs");
        fs::write(&fs_main, "import 'node:fs';\n").expect("write");
        let error = Engine::new()
            .expect("engine")
            .execute_module(&fs_main)
            .expect_err("node:fs ditolak");
        let message = error.to_string();
        assert!(message.contains("belum didukung"), "{message}");
        assert!(message.contains("node:net"), "{message}");

        let dns_main = directory.join("dns.mjs");
        fs::write(
            &dns_main,
            "import { lookup } from 'node:dns/promises';\nawait lookup('127.0.0.1');\n",
        )
        .expect("write");
        let error = Engine::new()
            .expect("engine")
            .execute_module(&dns_main)
            .expect_err("dns tanpa permission");
        assert!(error.to_string().contains("--allow-net"), "{error}");

        // getRandomValues tidak butuh permission apa pun.
        let random_main = directory.join("random.mjs");
        fs::write(
            &random_main,
            "crypto.getRandomValues(new Uint8Array(4));\nglobalThis.__r = true;\n",
        )
        .expect("write");
        let mut engine = Engine::new().expect("engine");
        engine.execute_module(&random_main).expect("random");
        engine
            .execute(
                "[verify]",
                "if (globalThis.__r !== true) throw new Error('random gagal');",
            )
            .expect("verify");

        fs::remove_dir_all(&directory).expect("cleanup");
    }

    #[test]
    fn serve_handler_bridge_request_dan_response() {
        let directory = temp_dir("serve-bridge");
        let main = directory.join("main.mjs");
        fs::write(
            &main,
            r##"
const server = ramonyx.serveHandler(0, async (request) => {
  const url = new URL(request.url);
  if (request.method === "POST") {
    const body = await request.text();
    return Response.json({ echo: body, dari: "bridge" });
  }
  if (!request.signal) {
    throw new Error("signal request hilang");
  }
  if (url.pathname === "/stream") {
    return new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode("bagian-1;"));
          controller.enqueue(new TextEncoder().encode("bagian-2;"));
          controller.close();
        },
      }),
      { headers: { "content-type": "text/plain; charset=utf-8", "x-bridge": "ya" } },
    );
  }
  return new Response("halo " + url.pathname);
});
const dasar = "http://127.0.0.1:" + server.port;

const halo = await fetch(dasar + "/dunia");
if (halo.status !== 200 || (await halo.text()) !== "halo /dunia") {
  throw new Error("GET bridge gagal: " + halo.status);
}

const streaming = await fetch(dasar + "/stream");
if (streaming.headers.get("x-bridge") !== "ya") throw new Error("header bridge hilang");
let isi = "";
for await (const chunk of streaming.body) {
  isi += new TextDecoder().decode(chunk);
}
if (isi !== "bagian-1;bagian-2;") throw new Error("stream bridge salah: " + isi);

const kirim = await fetch(dasar + "/echo", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ a: 1 }),
});
const balasan = await kirim.json();
if (balasan.echo !== '{"a":1}' || balasan.dari !== "bridge") {
  throw new Error("POST bridge salah: " + JSON.stringify(balasan));
}

server.close();
globalThis.__bridge_ok = true;
"##,
        )
        .expect("write");

        let mut engine = Engine::with_options(EngineOptions {
            permissions: Permissions::allow_all(),
            ..Default::default()
        })
        .expect("engine");
        engine.execute_module(&main).expect("serve bridge module");
        engine
            .execute(
                "[verify]",
                "if (globalThis.__bridge_ok !== true) throw new Error('serveHandler gagal');",
            )
            .expect("verify");

        fs::remove_dir_all(&directory).expect("cleanup");
    }

    #[test]
    fn timeout_menghentikan_loop_tak_berujung() {
        let directory = temp_dir("timeout");
        let main = directory.join("main.mjs");
        fs::write(&main, "while (true) {}\n").expect("write");

        let mut engine = Engine::with_options(EngineOptions {
            timeout: Some(Duration::from_millis(300)),
            ..Default::default()
        })
        .expect("engine");

        let start = std::time::Instant::now();
        let error = engine.execute_module(&main).expect_err("harus timeout");
        let elapsed = start.elapsed();
        let message = error.to_string();
        assert!(message.contains("timeout"), "pesan timeout: {message}");
        assert!(
            elapsed < Duration::from_secs(5),
            "watchdog terlalu lambat: {elapsed:?}"
        );

        fs::remove_dir_all(&directory).expect("cleanup");
    }

    #[test]
    fn batas_heap_menghasilkan_error_jelas_tanpa_abort() {
        let directory = temp_dir("heap-limit");
        let main = directory.join("main.mjs");
        // Alokasi heap bertahap (objek + string kecil) — bukan satu alokasi raksasa:
        // alokasi raksasa tunggal bisa menabrak jalur OOM fatal V8 sebelum terminasi
        // sempat diproses (batasan yang dicatat di ADR-0033).
        fs::write(
            &main,
            r#"
const arr = [];
for (;;) {
  const bagian = [];
  for (let i = 0; i < 1000; i += 1) {
    bagian.push({ i, s: "x".repeat(50) });
  }
  arr.push(bagian);
}
"#,
        )
        .expect("write");

        let mut engine = Engine::with_options(EngineOptions {
            max_heap_mb: Some(16),
            ..Default::default()
        })
        .expect("engine");

        let error = engine
            .execute_module(&main)
            .expect_err("harus kena batas heap");
        let message = error.to_string();
        assert!(message.contains("batas heap V8"), "pesan heap: {message}");

        fs::remove_dir_all(&directory).expect("cleanup");
    }

    #[test]
    fn permissions_get_dan_revoke() {
        let directory = temp_dir("permissions-revoke");
        let main = directory.join("main.mjs");
        fs::write(
            &main,
            r##"
const awal = ramonyx.permissions.get();
if (awal.net !== "allow-all" || awal.read !== "allow-all") {
  throw new Error("snapshot awal salah: " + JSON.stringify(awal));
}
ramonyx.permissions.revoke("net");
const setelah = ramonyx.permissions.get();
if (setelah.net !== "deny") {
  throw new Error("revoke net tidak berlaku: " + JSON.stringify(setelah));
}

let ditolak = false;
try {
  await fetch("http://127.0.0.1:9/");
} catch (error) {
  ditolak = String(error).includes("--allow-net");
}
if (!ditolak) throw new Error("fetch seharusnya ditolak setelah revoke");

ramonyx.permissions.revoke("read");
let bacaDitolak = false;
try {
  await ramonyx.readTextFile("/etc/hostname");
} catch (error) {
  bacaDitolak = String(error).includes("--allow-read");
}
if (!bacaDitolak) throw new Error("read seharusnya ditolak setelah revoke");

let jenisSalah = false;
try {
  ramonyx.permissions.revoke("dns");
} catch (error) {
  jenisSalah = String(error).includes("tidak dikenal");
}
if (!jenisSalah) throw new Error("revoke jenis salah seharusnya error");

globalThis.__perm_ok = true;
"##,
        )
        .expect("write");

        let mut engine = Engine::with_options(EngineOptions {
            permissions: Permissions::allow_all(),
            ..Default::default()
        })
        .expect("engine");
        engine.execute_module(&main).expect("permissions module");
        engine
            .execute(
                "[verify]",
                "if (globalThis.__perm_ok !== true) throw new Error('permission gagal');",
            )
            .expect("verify");

        fs::remove_dir_all(&directory).expect("cleanup");
    }

    fn json_literal(value: &Path) -> String {
        serde_json::to_string(value.to_str().expect("path utf8")).expect("json")
    }

    #[test]
    fn worker_pesan_dan_selesai() {
        let directory = temp_dir("worker-pesan");
        let pekerja = directory.join("pekerja.mjs");
        fs::write(
            &pekerja,
            r#"
const pesan = await ramonyx.parent.receive();
await ramonyx.parent.send({ hasil: pesan.a * 2, dari: "worker" });
"#,
        )
        .expect("write");

        let main = directory.join("main.mjs");
        fs::write(
            &main,
            format!(
                r#"
const worker = await ramonyx.worker({pekerja}, {{}});
await worker.send({{ a: 21 }});
const balasan = await worker.receive();
if (balasan?.hasil !== 42 || balasan.dari !== "worker") {{
  throw new Error("balasan salah: " + JSON.stringify(balasan));
}}
const berakhir = await worker.receive();
if (berakhir !== null) throw new Error("worker seharusnya selesai: " + JSON.stringify(berakhir));
globalThis.__worker_ok = true;
"#,
                pekerja = json_literal(&pekerja),
            ),
        )
        .expect("write");

        // Tanpa permission apa pun: ping-pong worker tidak butuh kapabilitas.
        let mut engine = Engine::new().expect("engine");
        engine.execute_module(&main).expect("worker ping-pong");
        engine
            .execute(
                "[verify]",
                "if (globalThis.__worker_ok !== true) throw new Error('worker gagal');",
            )
            .expect("verify");

        fs::remove_dir_all(&directory).expect("cleanup");
    }

    #[test]
    fn worker_permission_default_deny_dan_intersection() {
        let directory = temp_dir("worker-perm");
        let file = directory.join("data.txt");
        fs::write(&file, "rahasia").expect("write");

        let pekerja = directory.join("pekerja-baca.mjs");
        fs::write(
            &pekerja,
            format!(
                r#"
const hasil = {{}};
try {{
  const isi = await ramonyx.readTextFile({file});
  hasil.baca = "lolos:" + isi;
}} catch (error) {{
  hasil.baca = String(error).includes("--allow-read") ? "ditolak" : "error-lain:" + String(error);
}}
await ramonyx.parent.send(hasil);
"#,
                file = json_literal(&file),
            ),
        )
        .expect("write");
        let pekerja_literal = json_literal(&pekerja);
        let directory_literal = json_literal(&directory);

        let main_deny = directory.join("main-deny.mjs");
        fs::write(
            &main_deny,
            format!(
                r#"
const worker = await ramonyx.worker({pekerja}, {{}});
await worker.send({{}});
const hasil = await worker.receive();
if (hasil?.baca !== "ditolak") throw new Error("worker default harus deny: " + JSON.stringify(hasil));
globalThis.__deny_ok = true;
"#,
                pekerja = pekerja_literal,
            ),
        )
        .expect("write");

        let main_allow = directory.join("main-allow.mjs");
        fs::write(
            &main_allow,
            format!(
                r#"
const worker = await ramonyx.worker({pekerja}, {{ allow: {{ read: [{directory}] }} }});
await worker.send({{}});
const hasil = await worker.receive();
if (hasil?.baca !== "lolos:rahasia") throw new Error("worker read harus lolos: " + JSON.stringify(hasil));
globalThis.__allow_ok = true;
"#,
                pekerja = pekerja_literal,
                directory = directory_literal,
            ),
        )
        .expect("write");

        // deno_core mengizinkan satu modul "main" per runtime → engine terpisah per skenario.
        let mut engine_deny = Engine::with_options(EngineOptions {
            permissions: Permissions::allow_all(),
            ..Default::default()
        })
        .expect("engine");
        engine_deny.execute_module(&main_deny).expect("deny");
        engine_deny
            .execute(
                "[verify]",
                "if (globalThis.__deny_ok !== true) throw new Error('deny gagal');",
            )
            .expect("verify");

        let mut engine_allow = Engine::with_options(EngineOptions {
            permissions: Permissions::allow_all(),
            ..Default::default()
        })
        .expect("engine");
        engine_allow.execute_module(&main_allow).expect("allow");
        engine_allow
            .execute(
                "[verify]",
                "if (globalThis.__allow_ok !== true) throw new Error('allow gagal');",
            )
            .expect("verify");

        fs::remove_dir_all(&directory).expect("cleanup");
    }

    #[test]
    fn worker_tidak_bisa_eskalasi_permission_induk() {
        let directory = temp_dir("worker-eskalasi");
        let file = directory.join("data.txt");
        fs::write(&file, "rahasia").expect("write");

        let pekerja = directory.join("pekerja-baca.mjs");
        fs::write(
            &pekerja,
            format!(
                r#"
const hasil = {{}};
try {{
  const isi = await ramonyx.readTextFile({file});
  hasil.baca = "lolos:" + isi;
}} catch (error) {{
  hasil.baca = String(error).includes("--allow-read") ? "ditolak" : "error-lain:" + String(error);
}}
await ramonyx.parent.send(hasil);
"#,
                file = json_literal(&file),
            ),
        )
        .expect("write");

        let main = directory.join("main.mjs");
        fs::write(
            &main,
            format!(
                r#"
// Induk default deny-all: worker yang meminta read tetap tidak mendapatkannya.
const worker = await ramonyx.worker({pekerja}, {{ allow: {{ read: true }} }});
await worker.send({{}});
const hasil = await worker.receive();
if (hasil?.baca !== "ditolak") throw new Error("eskalasi harus ditolak: " + JSON.stringify(hasil));
globalThis.__eskalasi_ok = true;
"#,
                pekerja = json_literal(&pekerja),
            ),
        )
        .expect("write");

        let mut engine = Engine::new().expect("engine");
        engine.execute_module(&main).expect("eskalasi");
        engine
            .execute(
                "[verify]",
                "if (globalThis.__eskalasi_ok !== true) throw new Error('eskalasi gagal');",
            )
            .expect("verify");

        fs::remove_dir_all(&directory).expect("cleanup");
    }

    #[test]
    fn worker_terminate_dan_timeout_menghentikan() {
        let directory = temp_dir("worker-kill");
        let lama = directory.join("pekerja-lama.mjs");
        fs::write(&lama, "for (;;) {}\n").expect("write");
        let lama_literal = json_literal(&lama);

        let main_kill = directory.join("main-kill.mjs");
        fs::write(
            &main_kill,
            format!(
                r#"
const worker = await ramonyx.worker({lama}, {{}});
await ramonyx.sleep(50);
const mulai = Date.now();
await worker.terminate();
const berakhir = await worker.receive();
if (berakhir !== null) throw new Error("receive setelah terminate harus null");
if (Date.now() - mulai > 3000) throw new Error("terminate terlalu lambat");
let pesanError = null;
try {{
  await worker.send({{ x: 1 }});
}} catch (error) {{
  pesanError = String(error);
}}
if (pesanError === null || !pesanError.includes("sudah berhenti")) {{
  throw new Error("send setelah terminate harus error: " + pesanError);
}}
globalThis.__kill_ok = true;
"#,
                lama = lama_literal,
            ),
        )
        .expect("write");

        let main_timeout = directory.join("main-timeout.mjs");
        fs::write(
            &main_timeout,
            format!(
                r#"
const worker = await ramonyx.worker({lama}, {{ timeoutMs: 300 }});
const mulai = Date.now();
const berakhir = await worker.receive();
if (berakhir !== null) throw new Error("worker timeout harus berakhir null");
const durasi = Date.now() - mulai;
if (durasi > 5000) throw new Error("timeout worker terlalu lambat: " + durasi);
globalThis.__timeout_ok = true;
"#,
                lama = lama_literal,
            ),
        )
        .expect("write");

        // deno_core mengizinkan satu modul "main" per runtime → engine terpisah per skenario.
        let mut engine_kill = Engine::new().expect("engine");
        engine_kill.execute_module(&main_kill).expect("kill");
        engine_kill
            .execute(
                "[verify]",
                "if (globalThis.__kill_ok !== true) throw new Error('kill gagal');",
            )
            .expect("verify");

        let mut engine_timeout = Engine::new().expect("engine");
        engine_timeout
            .execute_module(&main_timeout)
            .expect("timeout");
        engine_timeout
            .execute(
                "[verify]",
                "if (globalThis.__timeout_ok !== true) throw new Error('timeout gagal');",
            )
            .expect("verify");

        fs::remove_dir_all(&directory).expect("cleanup");
    }

    #[test]
    fn body_limit_413_dini_tanpa_handler() {
        let directory = temp_dir("body-limit");
        let main = directory.join("main.mjs");
        fs::write(
            &main,
            r##"
const server = ramonyx.serveHandler(
  0,
  async (_request) => {
    globalThis.__dipanggil = true;
    return new Response("ok");
  },
  { maxBodyBytes: 1024 },
);
const dasar = "http://127.0.0.1:" + server.port;

// content-length melebihi batas → 413 dini dari Rust (handler tidak dipanggil).
const besar = await fetch(dasar + "/kirim", { method: "POST", body: "x".repeat(4096) });
await besar.text();
if (besar.status !== 413) throw new Error("harus 413: " + besar.status);
if (globalThis.__dipanggil === true) {
  throw new Error("handler tidak boleh dipanggil untuk 413 dini");
}

// Body kecil tetap lolos ke handler.
const kecil = await fetch(dasar + "/kecil", { method: "POST", body: "halo" });
await kecil.text();
if (kecil.status !== 200 || globalThis.__dipanggil !== true) {
  throw new Error("body kecil harus lolos: " + kecil.status);
}

server.close();
globalThis.__limit_ok = true;
"##,
        )
        .expect("write");

        let mut engine = Engine::with_options(EngineOptions {
            permissions: Permissions::allow_all(),
            ..Default::default()
        })
        .expect("engine");
        engine.execute_module(&main).expect("body limit module");
        engine
            .execute(
                "[verify]",
                "if (globalThis.__limit_ok !== true) throw new Error('limit gagal');",
            )
            .expect("verify");

        fs::remove_dir_all(&directory).expect("cleanup");
    }

    #[test]
    fn streaming_request_bertahap_ke_handler() {
        use std::io::{Read as IoRead, Write as IoWrite};

        let directory = temp_dir("stream-request");
        let port_path = directory.join("port.txt");
        let marker = directory.join("chunk-pertama.txt");
        let port_literal = json_literal(&port_path);
        let marker_literal = json_literal(&marker);
        let main = directory.join("main.mjs");
        fs::write(
            &main,
            format!(
                r#"
const server = ramonyx.serveHandler(
  0,
  async (request) => {{
    const reader = request.body.getReader();
    const pertama = await reader.read();
    const ukuranPertama = pertama.done ? 0 : pertama.value.byteLength;
    // Marker ditulis SETELAH chunk pertama diterima — bukti pembacaan bertahap.
    await ramonyx.writeTextFile({marker}, String(ukuranPertama));
    let total = ukuranPertama;
    for (;;) {{
      const {{ done, value }} = await reader.read();
      if (done) break;
      total += value.byteLength;
    }}
    queueMicrotask(() => server.close());
    return new Response("total:" + total);
  }},
  {{ maxBodyBytes: 1048576 }},
);
await ramonyx.writeTextFile({port}, String(server.port));
"#,
                marker = marker_literal,
                port = port_literal,
            ),
        )
        .expect("write");

        let (done_tx, done_rx) = std::sync::mpsc::channel();
        std::thread::spawn(move || {
            let mut engine = Engine::with_options(EngineOptions {
                permissions: Permissions::allow_all(),
                ..Default::default()
            })
            .expect("engine");
            let result = engine.execute_module(&main);
            let _ = done_tx.send(result.map_err(|error| error.to_string()));
        });

        let port = wait_port(&port_path);

        // Kirim chunk pertama, JANGAN selesaikan request: handler harus sudah menerima chunk itu.
        let mut stream = std::net::TcpStream::connect(("127.0.0.1", port)).expect("connect");
        stream
            .write_all(
                b"POST /unggah HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\nTransfer-Encoding: chunked\r\n\r\n4\r\nAAAA\r\n",
            )
            .expect("kirim chunk 1");

        let mut ukuran_marker = None;
        for _ in 0..100 {
            if let Ok(contents) = fs::read_to_string(&marker) {
                ukuran_marker = contents.trim().parse::<usize>().ok();
                break;
            }
            std::thread::sleep(Duration::from_millis(50));
        }
        assert_eq!(
            ukuran_marker,
            Some(4),
            "chunk pertama harus sampai ke handler sebelum body selesai"
        );

        // Selesaikan request dengan chunk kedua + terminator.
        stream
            .write_all(b"5\r\nBBBBB\r\n0\r\n\r\n")
            .expect("kirim chunk 2");
        let mut response = String::new();
        stream.read_to_string(&mut response).expect("baca respons");

        assert!(response.contains("200 OK"), "status: {response}");
        assert!(response.contains("total:9"), "total byte: {response}");

        let engine_result = done_rx
            .recv_timeout(Duration::from_secs(10))
            .expect("engine selesai");
        assert!(
            engine_result.is_ok(),
            "module selesai bersih: {engine_result:?}"
        );

        fs::remove_dir_all(&directory).expect("cleanup");
    }

    #[test]
    fn streaming_request_melebihi_batas_saat_dibaca() {
        use std::io::{Read as IoRead, Write as IoWrite};

        let directory = temp_dir("stream-limit");
        let port_path = directory.join("port.txt");
        let port_literal = json_literal(&port_path);
        let main = directory.join("main.mjs");
        fs::write(
            &main,
            format!(
                r#"
const server = ramonyx.serveHandler(
  0,
  async (request) => {{
    try {{
      const teks = await request.text();
      queueMicrotask(() => server.close());
      return new Response("lolos:" + teks.length);
    }} catch (error) {{
      queueMicrotask(() => server.close());
      return new Response("ditolak:" + String(error), {{ status: 413 }});
    }}
  }},
  {{ maxBodyBytes: 1024 }},
);
await ramonyx.writeTextFile({port}, String(server.port));
"#,
                port = port_literal,
            ),
        )
        .expect("write");

        let (done_tx, done_rx) = std::sync::mpsc::channel();
        std::thread::spawn(move || {
            let mut engine = Engine::with_options(EngineOptions {
                permissions: Permissions::allow_all(),
                ..Default::default()
            })
            .expect("engine");
            let result = engine.execute_module(&main);
            let _ = done_tx.send(result.map_err(|error| error.to_string()));
        });

        let port = wait_port(&port_path);

        // Tanpa content-length (chunked), 4 KiB > batas 1 KiB → error saat dibaca handler.
        let mut request = String::from(
            "POST /unggah HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\nTransfer-Encoding: chunked\r\n\r\n",
        );
        let potongan = "x".repeat(512);
        for _ in 0..8 {
            request.push_str("200\r\n");
            request.push_str(&potongan);
            request.push_str("\r\n");
        }
        request.push_str("0\r\n\r\n");

        let mut stream = std::net::TcpStream::connect(("127.0.0.1", port)).expect("connect");
        stream
            .write_all(request.as_bytes())
            .expect("kirim bertahap");
        let mut response = String::new();
        stream.read_to_string(&mut response).expect("baca respons");

        assert!(response.contains("413"), "status 413: {response}");
        assert!(
            response.contains("melebihi batas"),
            "pesan batas body: {response}"
        );

        let engine_result = done_rx
            .recv_timeout(Duration::from_secs(10))
            .expect("engine selesai");
        assert!(
            engine_result.is_ok(),
            "module selesai bersih: {engine_result:?}"
        );

        fs::remove_dir_all(&directory).expect("cleanup");
    }

    #[test]
    fn fetch_mengikuti_redirect_dan_mode_manual_error() {
        let directory = temp_dir("redirect");
        let main = directory.join("main.mjs");
        fs::write(
            &main,
            r##"
const a = ramonyx.serve(0, async (request) => {
  if (request.path === "/mulai") {
    return { status: 302, headers: { location: "/tujuan" }, body: "" };
  }
  return { status: 200, headers: { "content-type": "text/plain" }, body: "sampai:" + request.path };
});
const dasar = "http://127.0.0.1:" + a.port;

// follow (default): 302 diikuti sampai final.
const response = await fetch(dasar + "/mulai");
const teks = await response.text();
if (response.status !== 200 || teks !== "sampai:/tujuan") {
  throw new Error("follow gagal: " + response.status + " " + teks);
}
if (response.redirected !== true) throw new Error("redirected harus true");
if (!response.url.endsWith("/tujuan")) throw new Error("url final: " + response.url);

// manual: 302 dikembalikan apa adanya (dipakai guardedFetch).
const manual = await fetch(dasar + "/mulai", { redirect: "manual" });
await manual.text();
if (manual.status !== 302 || manual.headers.get("location") !== "/tujuan") {
  throw new Error("manual gagal: " + manual.status);
}
if (manual.redirected !== false) throw new Error("manual tidak boleh redirected");

// error: melempar.
let pesan = null;
try {
  await fetch(dasar + "/mulai", { redirect: "error" });
} catch (error) {
  pesan = String(error);
}
if (pesan === null || !pesan.includes("redirect")) throw new Error("mode error: " + pesan);

a.close();
globalThis.__redirect_ok = true;
"##,
        )
        .expect("write");

        let mut engine = Engine::with_options(EngineOptions {
            permissions: Permissions::allow_all(),
            ..Default::default()
        })
        .expect("engine");
        engine.execute_module(&main).expect("redirect module");
        engine
            .execute(
                "[verify]",
                "if (globalThis.__redirect_ok !== true) throw new Error('redirect gagal');",
            )
            .expect("verify");

        fs::remove_dir_all(&directory).expect("cleanup");
    }

    #[test]
    fn fetch_redirect_method_body_dan_header_sensitif() {
        let directory = temp_dir("redirect-method");
        let main = directory.join("main.mjs");
        fs::write(
            &main,
            r##"
async function bacaBody(request) {
  let isi = "";
  for await (const chunk of request.body) {
    isi += new TextDecoder().decode(chunk, { stream: true });
  }
  isi += new TextDecoder().decode();
  return isi;
}
const echo = async (request) => {
  const kepala = Object.fromEntries(request.headers);
  return {
    status: 200,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ method: request.method, body: await bacaBody(request), auth: kepala.authorization ?? null }),
  };
};

const b = ramonyx.serve(0, async (request) => echo(request));
const a = ramonyx.serve(0, async (request) => {
  if (request.path === "/echo") return echo(request);
  if (request.path === "/jaga") {
    return { status: 307, headers: { location: "http://127.0.0.1:" + b.port + "/echo" }, body: "" };
  }
  if (request.path === "/ubah") {
    return { status: 303, headers: { location: "http://127.0.0.1:" + b.port + "/echo" }, body: "" };
  }
  if (request.path === "/lokal") {
    return { status: 307, headers: { location: "/echo" }, body: "" };
  }
  return { status: 200, body: "a" };
});

// 307 lintas origin: method+body dipertahankan; authorization DIBUANG.
const jaga = await fetch("http://127.0.0.1:" + a.port + "/jaga", {
  method: "POST",
  headers: { authorization: "Bearer rahasia", "content-type": "text/plain" },
  body: "isi-307",
});
const hasilJaga = await jaga.json();
if (hasilJaga.method !== "POST" || hasilJaga.body !== "isi-307") {
  throw new Error("307 harus mempertahankan method+body: " + JSON.stringify(hasilJaga));
}
if (hasilJaga.auth !== null) {
  throw new Error("authorization harus dibuang lintas origin: " + hasilJaga.auth);
}

// 303 lintas origin: jadi GET tanpa body.
const ubah = await fetch("http://127.0.0.1:" + a.port + "/ubah", {
  method: "POST",
  headers: { "content-type": "text/plain" },
  body: "isi-303",
});
const hasilUbah = await ubah.json();
if (hasilUbah.method !== "GET" || hasilUbah.body !== "") {
  throw new Error("303 harus jadi GET tanpa body: " + JSON.stringify(hasilUbah));
}

// 307 same-origin: authorization dipertahankan.
const lokal = await fetch("http://127.0.0.1:" + a.port + "/lokal", {
  method: "POST",
  headers: { authorization: "Bearer sama", "content-type": "text/plain" },
  body: "isi-lokal",
});
const hasilLokal = await lokal.json();
if (hasilLokal.auth !== "Bearer sama" || hasilLokal.body !== "isi-lokal") {
  throw new Error("same-origin harus mempertahankan header: " + JSON.stringify(hasilLokal));
}

a.close();
b.close();
globalThis.__redirect2_ok = true;
"##,
        )
        .expect("write");

        let mut engine = Engine::with_options(EngineOptions {
            permissions: Permissions::allow_all(),
            ..Default::default()
        })
        .expect("engine");
        engine
            .execute_module(&main)
            .expect("redirect method module");
        engine
            .execute(
                "[verify]",
                "if (globalThis.__redirect2_ok !== true) throw new Error('redirect2 gagal');",
            )
            .expect("verify");

        fs::remove_dir_all(&directory).expect("cleanup");
    }

    #[test]
    fn timings_dan_op_metrics_tercatat() {
        let directory = temp_dir("metrics");
        let main = directory.join("main.mjs");
        fs::write(
            &main,
            r##"
await ramonyx.sleep(5);
crypto.getRandomValues(new Uint8Array(2));
globalThis.__metrics_ok = true;
"##,
        )
        .expect("write");

        let mut engine = Engine::with_options(EngineOptions {
            op_metrics: true,
            ..Default::default()
        })
        .expect("engine");
        engine.execute_module(&main).expect("metrics module");
        engine
            .execute(
                "[verify]",
                "if (globalThis.__metrics_ok !== true) throw new Error('metrics gagal');",
            )
            .expect("verify");

        let timings = engine.last_timings().expect("timings tercatat");
        assert!(timings.total >= timings.load, "total >= load");
        assert!(timings.evaluate > Duration::ZERO, "evaluasi terukur");

        let entries = engine.op_metrics();
        let nama: Vec<&str> = entries.iter().map(|entry| entry.op).collect();
        let sleep = entries
            .iter()
            .find(|entry| entry.op == "op_sleep")
            .unwrap_or_else(|| panic!("op_sleep tidak tercatat: {nama:?}"));
        assert!(sleep.dispatched >= 1, "sleep dipanggil minimal sekali");
        assert!(
            entries.iter().any(|entry| entry.op == "op_random_bytes"),
            "op_random_bytes tidak tercatat: {nama:?}"
        );

        // Tanpa flag: metrik kosong (tanpa biaya), timings tetap ada.
        let mut engine_polos = Engine::new().expect("engine");
        engine_polos.execute("[test]", "1 + 1;").expect("script");
        assert!(engine_polos.op_metrics().is_empty());
        assert!(engine_polos.last_timings().is_some());

        fs::remove_dir_all(&directory).expect("cleanup");
    }

    #[test]
    fn kuota_cpu_menghentikan_loop_tak_berujung() {
        let directory = temp_dir("cpu-limit");
        let main = directory.join("main.mjs");
        fs::write(&main, "for (;;) {}\n").expect("write");

        let mut engine = Engine::with_options(EngineOptions {
            max_cpu_ms: Some(300),
            ..Default::default()
        })
        .expect("engine");

        let started = std::time::Instant::now();
        let error = engine
            .execute_module(&main)
            .expect_err("harus kena kuota CPU");
        let message = error.to_string();
        assert!(message.contains("kuota CPU"), "pesan CPU: {message}");
        assert!(
            started.elapsed() < Duration::from_secs(5),
            "guard CPU terlalu lambat: {:?}",
            started.elapsed()
        );

        fs::remove_dir_all(&directory).expect("cleanup");
    }

    #[test]
    fn kuota_cpu_bukan_wall_clock() {
        let directory = temp_dir("cpu-sleep");
        let main = directory.join("main.mjs");
        // Menunggu I/O tidak memakan kuota CPU: sleep 1.2 s < kuota 300 ms CPU.
        fs::write(
            &main,
            "await ramonyx.sleep(1200);\nglobalThis.__tidur_ok = true;\n",
        )
        .expect("write");

        let mut engine = Engine::with_options(EngineOptions {
            max_cpu_ms: Some(300),
            ..Default::default()
        })
        .expect("engine");
        engine
            .execute_module(&main)
            .expect("sleep tidak boleh kena kuota CPU");
        engine
            .execute(
                "[verify]",
                "if (globalThis.__tidur_ok !== true) throw new Error('sleep gagal');",
            )
            .expect("verify");

        fs::remove_dir_all(&directory).expect("cleanup");
    }

    #[test]
    fn kuota_rss_menangkap_memori_eksternal() {
        let directory = temp_dir("rss-limit");
        let main = directory.join("main.mjs");
        // Alokasi ArrayBuffer 1 MiB berulang: memori eksternal V8 (tidak dihitung
        // kuota heap) — harus ditangkap kuota RSS proses.
        fs::write(
            &main,
            r##"
const arr = [];
for (let i = 0; i < 512; i += 1) {
  const buf = new Uint8Array(1 << 20);
  buf.fill(7); // sentuh halaman: RSS hanya menghitung halaman resident
  arr.push(buf);
  await ramonyx.sleep(1);
}
throw new Error("selesai tanpa guard RSS");
"##,
        )
        .expect("write");

        let baseline_mb = (super::process_rss_bytes() / (1024 * 1024)) as usize;
        let mut engine = Engine::with_options(EngineOptions {
            max_rss_mb: Some(baseline_mb + 256),
            ..Default::default()
        })
        .expect("engine");

        let error = engine
            .execute_module(&main)
            .expect_err("harus kena kuota RSS");
        let message = error.to_string();
        assert!(message.contains("kuota RSS"), "pesan RSS: {message}");
        assert!(
            !message.contains("selesai tanpa guard"),
            "guard RSS tidak memicu: {message}"
        );

        fs::remove_dir_all(&directory).expect("cleanup");
    }

    /// Tunggu file port muncul (server siap) — dipakai test HTTP.
    fn wait_port(port_path: &Path) -> u16 {
        for _ in 0..100 {
            if let Ok(contents) = fs::read_to_string(port_path)
                && let Ok(value) = contents.trim().parse::<u16>()
            {
                return value;
            }
            std::thread::sleep(Duration::from_millis(50));
        }
        panic!("port file tidak muncul");
    }
}
