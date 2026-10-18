//! Compatibility suite: SSR **streaming** React di runtime Rust (ADR-0030).
//!
//! Fixture: `tests/compatibility/fixtures/react-stream-ssr.mjs` — `renderToReadableStream`
//! (react-dom server, byte stream pull-based) dibaca lewat `for await`.

use std::path::PathBuf;

use js_engine::{Engine, EngineOptions};
use runtime_core::Permissions;

fn repo_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("..")
        .join("..")
        .canonicalize()
        .expect("repo root")
}

#[test]
fn ssr_streaming_react_berjalan_di_runtime() {
    let fixture = repo_root()
        .join("tests")
        .join("compatibility")
        .join("fixtures")
        .join("react-stream-ssr.mjs");

    let mut engine = Engine::with_options(EngineOptions {
        permissions: Permissions::allow_all(),
    })
    .expect("engine");

    engine
        .execute_module(&fixture)
        .unwrap_or_else(|error| panic!("fixture SSR streaming gagal: {error}"));

    engine
        .execute(
            "[verify]",
            r##"
const hasil = globalThis.__compat_stream;
if (hasil?.ok !== true) {
  throw new Error("SSR streaming tidak menulis hasil: " + JSON.stringify(hasil));
}
if (!hasil.html.includes("Halo streaming") || !hasil.html.includes("SSR streaming di V8")) {
  throw new Error("HTML streaming salah: " + hasil.html.slice(0, 200));
}
"##,
        )
        .expect("verify SSR streaming");
}
