//! `js-engine` (R1/R2): eksekusi JavaScript/TypeScript lewat V8 (deno_core) + I/O runtime.
//!
//! - **Script mode**: `Engine::execute` (tanpa import).
//! - **Module mode**: `Engine::execute_module` — ESM dengan resolusi relatif, ekstensi
//!   (`.js/.mjs/.ts/.tsx`, fallback ekstensi & `index`), dan transpile TypeScript via `deno_ast`.
//! - **API runtime** (`ramonyx.*`): `sleep`, `readTextFile`/`writeTextFile`, `env.get`, dan
//!   `serve(port, handler)` (HTTP pull-model, body di-buffer; lihat `http.rs`).
//! - **Bare specifier**: resolusi `node_modules` ESM v1 (`exports`/`module`/`main`, ADR-0026).
//! - **CommonJS**: interop v1 via pemindaian graf `require` statis (ADR-0029).

use std::borrow::Cow;
use std::cell::RefCell;
use std::collections::HashMap;
use std::fmt;
use std::path::{Path, PathBuf};
use std::rc::Rc;
use std::time::Duration;

use deno_ast::{MediaType, ParseParams, SourceMapOption};
use deno_core::error::ModuleLoaderError;
use deno_core::{
    JsRuntime, ModuleLoadOptions, ModuleLoadReferrer, ModuleLoadResponse, ModuleLoader,
    ModuleSource, ModuleSourceCode, ModuleSpecifier, ModuleType, OpState, ResolutionKind,
    RuntimeOptions, extension, op2, resolve_import, resolve_path,
};
use deno_error::JsErrorBox;
use runtime_core::Permissions;

mod builtins;
mod cjs;
mod http;
mod http_client;
mod resolve;
mod web_shim;

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

globalThis.ramonyx = {
  sleep: (ms) => Deno.core.ops.op_sleep(ms),
  readTextFile: (path) => Deno.core.ops.op_read_text_file(path),
  writeTextFile: (path, text) => Deno.core.ops.op_write_text_file(path, text),
  env: { get: (name) => Deno.core.ops.op_env_get(name) ?? undefined },
  serve: (port, handler) => {
    const [serverId, actualPort] = Deno.core.ops.op_http_listen("127.0.0.1", port);
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
              await Deno.core.ops.op_http_stream_chunk(serverId, request.id, String(chunk));
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
            String(body),
          );
        }
      }
    })();
    loop.catch((error) => {
      Deno.core.ops.op_log_error("server loop error: " + error);
    });
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
        http::op_http_respond,
        http::op_http_stream_start,
        http::op_http_stream_chunk,
        http::op_http_stream_end,
        http::op_http_watch,
        http::op_http_close,
        http_client::op_fetch,
        builtins::op_random_bytes,
        builtins::op_dns_lookup,
    ],
    state = |state: &mut OpState| {
        state.put(http::HttpState::default());
        state.put(http_client::FetchState::new());
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

pub struct Engine {
    runtime: JsRuntime,
    tokio: tokio::runtime::Runtime,
}

/// Opsi engine; default **deny-all** (secure by default, ADR-0023).
#[derive(Debug, Clone, Default)]
pub struct EngineOptions {
    pub permissions: Permissions,
}

impl Engine {
    pub fn new() -> Result<Self, EngineError> {
        Self::with_options(EngineOptions::default())
    }

    pub fn with_options(options: EngineOptions) -> Result<Self, EngineError> {
        let tokio = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .map_err(|error| EngineError::new(format!("gagal membuat tokio runtime: {error}")))?;

        // Isolate HARUS dibuat di dalam konteks tokio: V8 dapat memposting delayed
        // task kapan saja (mis. GC memory reducer); deno_core men-abort proses bila
        // isolate terdaftar tanpa handle tokio untuk menghormati delay tersebut.
        let mut runtime = {
            let _guard = tokio.enter();
            JsRuntime::new(RuntimeOptions {
                module_loader: Some(Rc::new(FileModuleLoader::new())),
                extensions: vec![ramonyx_engine::init()],
                ..Default::default()
            })
        };
        runtime
            .execute_script("[ramonyx:bootstrap]".to_string(), BOOTSTRAP.to_string())
            .map_err(|error| EngineError::new(format!("bootstrap gagal: {error}")))?;
        runtime
            .execute_script("[ramonyx:web-shim]".to_string(), WEB_SHIM.to_string())
            .map_err(|error| EngineError::new(format!("web shim gagal: {error}")))?;

        runtime.op_state().borrow_mut().put(options.permissions);

        Ok(Self { runtime, tokio })
    }

    /// Jalankan script JS (tanpa `import`); error dikembalikan sebagai `EngineError`.
    pub fn execute(&mut self, name: &str, source: &str) -> Result<(), EngineError> {
        self.runtime
            .execute_script(name.to_string(), source.to_string())
            .map(|_| ())
            .map_err(|error| EngineError::new(error.to_string()))
    }

    /// Jalankan modul ESM dari file (relatif/absolut). Mendukung `.js/.mjs` dan
    /// `.ts/.tsx` (transpile via deno_ast).
    pub fn execute_module(&mut self, entry: &Path) -> Result<(), EngineError> {
        let current_dir = std::env::current_dir()
            .map_err(|error| EngineError::new(format!("tidak bisa membaca cwd: {error}")))?;
        let main_module = resolve_path(&entry.display().to_string(), &current_dir)
            .map_err(|error| EngineError::new(format!("entry tidak valid: {error}")))?;

        let Engine { runtime, tokio } = self;
        tokio.block_on(async move {
            let module_id = runtime
                .load_main_es_module(&main_module)
                .await
                .map_err(|error| EngineError::new(error.to_string()))?;

            let evaluation = runtime.mod_evaluate(module_id);
            runtime
                .run_event_loop(Default::default())
                .await
                .map_err(|error| EngineError::new(error.to_string()))?;
            evaluation
                .await
                .map_err(|error| EngineError::new(error.to_string()))
        })
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
