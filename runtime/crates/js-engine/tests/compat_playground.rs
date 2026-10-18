//! Compatibility suite: aplikasi playground subset di runtime Rust (ADR-0032).
//!
//! Fixture: `tests/compatibility/fixtures/playground-subset.mjs` — halaman SSR React
//! (`@ramonyx/ssr` + `@ramonyx/react`), API + POST tervalidasi, middleware `@ramonyx/security`,
//! disajikan lewat `ramonyx.serveHandler` dan diuji end-to-end dengan `fetch`.

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
fn playground_subset_berjalan_di_runtime() {
    let fixture = repo_root()
        .join("tests")
        .join("compatibility")
        .join("fixtures")
        .join("playground-subset.mjs");

    let mut engine = Engine::with_options(EngineOptions {
        permissions: Permissions::allow_all(),
    })
    .expect("engine");

    engine
        .execute_module(&fixture)
        .unwrap_or_else(|error| panic!("fixture playground gagal: {error}"));

    engine
        .execute(
            "[verify]",
            r##"
const hasil = globalThis.__compat_playground;
if (hasil?.ok !== true) {
  throw new Error("playground tidak menulis hasil: " + JSON.stringify(hasil));
}
if (hasil.statuses.beranda !== 200 || hasil.statuses.halo !== 200) {
  throw new Error("halaman gagal: " + JSON.stringify(hasil.statuses));
}
if (hasil.statuses.gagal !== 418 || hasil.statuses.hilang !== 404) {
  throw new Error("status halaman tidak sesuai: " + JSON.stringify(hasil.statuses));
}
if (hasil.statuses.echo !== 200 || hasil.statuses.echoBad !== 400) {
  throw new Error("API tidak sesuai: " + JSON.stringify(hasil.statuses));
}
"##,
        )
        .expect("verify playground");
}
