//! Compatibility suite v1: menjalankan paket framework nyata di runtime Rust.
//!
//! Fixture: `tests/compatibility/fixtures/route-pipeline.mjs` (lihat ADR-0028).
//! Membutuhkan paket workspace ter-link di root `node_modules` (@ramonyx/*).

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
fn pipeline_framework_berjalan_di_runtime() {
    let fixture = repo_root()
        .join("tests")
        .join("compatibility")
        .join("fixtures")
        .join("route-pipeline.mjs");

    let mut engine = Engine::with_options(EngineOptions {
        permissions: Permissions::allow_all(),
    })
    .expect("engine");

    engine
        .execute_module(&fixture)
        .unwrap_or_else(|error| panic!("fixture compat gagal: {error}"));

    engine
        .execute(
            "[verify]",
            r##"
const hasil = globalThis.__compat;
if (hasil?.ok !== true) {
  throw new Error("compat tidak menulis hasil: " + JSON.stringify(hasil));
}
if (hasil.statuses.ok !== 200 || hasil.statuses.bad !== 400) {
  throw new Error("status pipeline tidak sesuai: " + JSON.stringify(hasil.statuses));
}
if (hasil.statuses.output !== 200 || hasil.statuses.boom !== 403 || hasil.statuses.notFound !== 404) {
  throw new Error("status tambahan tidak sesuai: " + JSON.stringify(hasil.statuses));
}
if (hasil.statuses.echo !== 200 || hasil.statuses.echoBad !== 400) {
  throw new Error("status POST body tidak sesuai: " + JSON.stringify(hasil.statuses));
}
"##,
        )
        .expect("verify compat");
}
