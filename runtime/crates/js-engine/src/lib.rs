//! `js-engine` (R1/R2): eksekusi JavaScript/TypeScript lewat V8 (deno_core) + I/O runtime.
//!
//! - **Script mode**: `Engine::execute` (tanpa import).
//! - **Module mode**: `Engine::execute_module` — ESM dengan resolusi relatif, ekstensi
//!   (`.js/.mjs/.ts/.tsx`, fallback ekstensi & `index`), dan transpile TypeScript via `deno_ast`.
//! - **API runtime** (`ramonyx.*`): `sleep`, `readTextFile`/`writeTextFile`, `env.get`, dan
//!   `serve(port, handler)` (HTTP pull-model, body di-buffer; lihat `http.rs`).
//! - Bare specifier (paket npm) **belum didukung** — error jelas, bukan tebakan.

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

mod http;

const BOOTSTRAP: &str = r#"
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
        Deno.core.ops.op_http_respond(
          serverId,
          request.id,
          response?.status ?? 200,
          Object.entries(response?.headers ?? {}),
          String(response?.body ?? ""),
        );
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
async fn op_read_text_file(#[string] path: String) -> Result<String, JsErrorBox> {
    tokio::fs::read_to_string(&path)
        .await
        .map_err(|error| JsErrorBox::generic(format!("gagal membaca {path}: {error}")))
}

#[op2(async(lazy), fast)]
async fn op_write_text_file(
    #[string] path: String,
    #[string] text: String,
) -> Result<(), JsErrorBox> {
    tokio::fs::write(&path, text)
        .await
        .map_err(|error| JsErrorBox::generic(format!("gagal menulis {path}: {error}")))
}

#[op2]
#[string]
fn op_env_get(#[string] name: String) -> Option<String> {
    std::env::var(name).ok()
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
        http::op_http_close,
    ],
    state = |state: &mut OpState| {
        state.put(http::HttpState::default());
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
        let resolved =
            resolve_import(specifier, referrer).map_err(|error| {
                JsErrorBox::generic(format!(
                    "tidak bisa me-resolve \"{specifier}\": {error} (bare specifier/paket npm belum didukung)"
                ))
            })?;

        let path = resolved
            .to_file_path()
            .map_err(|_| JsErrorBox::generic(format!("hanya file:// yang didukung: {resolved}")))?;

        if path.is_file() {
            return Ok(resolved);
        }

        for candidate in extension_candidates(&path) {
            if candidate.is_file() {
                return ModuleSpecifier::from_file_path(&candidate).map_err(|_| {
                    JsErrorBox::generic(format!("path tidak valid: {}", candidate.display()))
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
            let path = module_specifier.to_file_path().map_err(|_| {
                JsErrorBox::generic(format!("hanya file:// yang didukung: {module_specifier}"))
            })?;

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

impl Engine {
    pub fn new() -> Result<Self, EngineError> {
        let tokio = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .map_err(|error| EngineError::new(format!("gagal membuat tokio runtime: {error}")))?;

        let mut runtime = JsRuntime::new(RuntimeOptions {
            module_loader: Some(Rc::new(FileModuleLoader::new())),
            extensions: vec![ramonyx_engine::init()],
            ..Default::default()
        });
        runtime
            .execute_script("[ramonyx:bootstrap]".to_string(), BOOTSTRAP.to_string())
            .map_err(|error| EngineError::new(format!("bootstrap gagal: {error}")))?;

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
    fn bare_specifier_ditolak_dengan_pesan_jelas() {
        let directory = temp_dir("bare");
        fs::write(directory.join("main.mjs"), "import x from 'paket-npm';\n").expect("write");

        let mut engine = Engine::new().expect("engine");
        let error = engine
            .execute_module(&directory.join("main.mjs"))
            .expect_err("harus error");
        assert!(
            error.to_string().contains("belum didukung"),
            "pesan jelas: {error}"
        );

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

        let mut engine = Engine::new().expect("engine");
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
            let mut engine = Engine::new().expect("engine");
            let result = engine.execute_module(&main);
            let _ = done_tx.send(result.map_err(|error| error.to_string()));
        });

        // Tunggu file port muncul.
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
}
