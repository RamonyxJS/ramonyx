//! Compatibility suite: SSR React di runtime Rust (interop CommonJS v1, ADR-0029).
//!
//! Fixture: `tests/compatibility/fixtures/react-ssr.mjs` — mengimpor `react` dan
//! `react-dom/server.browser` (keduanya CommonJS produksi) dan merender elemen.

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
fn ssr_react_berjalan_di_runtime() {
    let fixture = repo_root()
        .join("tests")
        .join("compatibility")
        .join("fixtures")
        .join("react-ssr.mjs");

    let mut engine = Engine::with_options(EngineOptions {
        permissions: Permissions::allow_all(),
    })
    .expect("engine");

    engine
        .execute_module(&fixture)
        .unwrap_or_else(|error| panic!("fixture SSR gagal: {error}"));

    engine
        .execute(
            "[verify]",
            r##"
const hasil = globalThis.__compat_ssr;
if (hasil?.ok !== true) {
  throw new Error("SSR tidak menulis hasil: " + JSON.stringify(hasil));
}
if (!hasil.html.includes("Halo dari runtime")) {
  throw new Error("HTML SSR salah: " + hasil.html);
}
"##,
        )
        .expect("verify SSR");
}
