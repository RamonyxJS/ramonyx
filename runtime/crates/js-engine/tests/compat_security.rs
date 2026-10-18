//! Compatibility suite: subset `@ramonyx/security` di runtime Rust (ADR-0031).
//!
//! Fixture: `tests/compatibility/fixtures/security-subset.mjs` — securityHeaders, cspNonce,
//! csrfProtection, rateLimit, dan guardedFetch (SSRF) berjalan di runtime.

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
fn subset_security_berjalan_di_runtime() {
    let fixture = repo_root()
        .join("tests")
        .join("compatibility")
        .join("fixtures")
        .join("security-subset.mjs");

    let mut engine = Engine::with_options(EngineOptions {
        permissions: Permissions::allow_all(),
        ..Default::default()
    })
    .expect("engine");

    engine
        .execute_module(&fixture)
        .unwrap_or_else(|error| panic!("fixture security gagal: {error}"));

    engine
        .execute(
            "[verify]",
            r##"
const hasil = globalThis.__compat_security;
if (hasil?.ok !== true) {
  throw new Error("security tidak menulis hasil: " + JSON.stringify(hasil));
}
if (hasil.statuses.csrfTanpaToken !== 403 || hasil.statuses.csrfDenganToken !== 200) {
  throw new Error("CSRF tidak sesuai: " + JSON.stringify(hasil.statuses));
}
if (hasil.statuses.rate429 !== 2 || hasil.statuses.cspNonce !== true) {
  throw new Error("rate limit/nonce tidak sesuai: " + JSON.stringify(hasil.statuses));
}
if (hasil.statuses.ssrf.loopback !== "ditolak" || hasil.statuses.ssrf.takAda !== "ditolak") {
  throw new Error("SSRF tidak menolak: " + JSON.stringify(hasil.statuses.ssrf));
}
"##,
        )
        .expect("verify security");
}
