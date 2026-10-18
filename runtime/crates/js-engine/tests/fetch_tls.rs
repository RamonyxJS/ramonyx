//! Uji `fetch` https: TLS **diverifikasi** (tidak pernah dimatikan) + CA kustom (ADR-0036).
//!
//! Server TLS hermetik: sertifikat self-signed dibuat saat test (`rcgen`), disajikan lewat
//! `rustls` blocking di thread test — tanpa jaringan eksternal.

use std::io::{Read as IoRead, Write as IoWrite};
use std::net::TcpListener;
use std::path::PathBuf;
use std::sync::Arc;
use std::thread;

use js_engine::{Engine, EngineOptions};
use runtime_core::Permissions;

fn temp_dir(name: &str) -> PathBuf {
    let directory = std::env::temp_dir().join(format!("ramonyx-{name}-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&directory);
    std::fs::create_dir_all(&directory).expect("mkdir");
    directory
}

/// Server TLS sederhana: balas "halo-tls" untuk beberapa koneksi pertama.
fn start_tls_server() -> (u16, String, thread::JoinHandle<()>) {
    let certified =
        rcgen::generate_simple_self_signed(vec!["localhost".to_string(), "127.0.0.1".to_string()])
            .expect("sertifikat");
    let cert_der = certified.cert.der().clone();
    let key_der =
        rustls::pki_types::PrivateKeyDer::Pkcs8(certified.signing_key.serialize_der().into());

    let provider = Arc::new(rustls::crypto::ring::default_provider());
    let config = rustls::ServerConfig::builder_with_provider(provider)
        .with_safe_default_protocol_versions()
        .expect("versi protokol")
        .with_no_client_auth()
        .with_single_cert(vec![cert_der], key_der)
        .expect("config server");
    let config = Arc::new(config);

    let listener = TcpListener::bind("127.0.0.1:0").expect("bind");
    let port = listener.local_addr().expect("addr").port();
    let pem = certified.cert.pem();

    let handle = thread::spawn(move || {
        for stream in listener.incoming().flatten().take(2) {
            let Ok(connection) = rustls::ServerConnection::new(config.clone()) else {
                continue;
            };
            let mut tls = rustls::StreamOwned::new(connection, stream);
            let mut buffer = [0u8; 4096];
            let _ = tls.read(&mut buffer);
            let _ = tls.write_all(
                b"HTTP/1.1 200 OK\r\ncontent-length: 8\r\nconnection: close\r\n\r\nhalo-tls",
            );
            let _ = tls.flush();
        }
    });

    (port, pem, handle)
}

#[test]
fn fetch_https_diverifikasi_dengan_ca_kustom() {
    let (port, pem, server) = start_tls_server();
    let directory = temp_dir("tls");
    let ca_path = directory.join("ca.pem");
    std::fs::write(&ca_path, pem).expect("tulis ca");

    let main = directory.join("main.mjs");
    std::fs::write(
        &main,
        format!(
            r#"
const response = await fetch("https://127.0.0.1:{port}/");
const teks = await response.text();
if (response.status !== 200 || teks !== "halo-tls") {{
  throw new Error("https gagal: " + response.status + " " + teks);
}}
globalThis.__tls_ok = true;
"#
        ),
    )
    .expect("write");

    // 1) Tanpa CA kustom: verifikasi sertifikat HARUS gagal (bukan dimatikan).
    let mut engine_tanpa_ca = Engine::with_options(EngineOptions {
        permissions: Permissions::allow_all(),
        ..Default::default()
    })
    .expect("engine");
    let error = engine_tanpa_ca
        .execute_module(&main)
        .expect_err("harus gagal verifikasi sertifikat");
    let message = error.to_string().to_lowercase();
    assert!(
        message.contains("certificate") || message.contains("unknownissuer"),
        "pesan verifikasi TLS: {error}"
    );

    // 2) Dengan CA kustom (PEM dari server): https berhasil.
    let mut engine_ca = Engine::with_options(EngineOptions {
        permissions: Permissions::allow_all(),
        tls_ca_file: Some(ca_path.clone()),
        ..Default::default()
    })
    .expect("engine");
    engine_ca
        .execute_module(&main)
        .unwrap_or_else(|error| panic!("https dengan CA kustom gagal: {error}"));
    engine_ca
        .execute(
            "[verify]",
            "if (globalThis.__tls_ok !== true) throw new Error('tls gagal');",
        )
        .expect("verify");

    server.join().expect("server tls selesai");
    let _ = std::fs::remove_dir_all(&directory);
}

#[test]
fn ca_tidak_valid_gagal_cepat_dengan_pesan_jelas() {
    let directory = temp_dir("tls-bad");
    let ca_path = directory.join("bukan-ca.pem");
    std::fs::write(&ca_path, "ini bukan PEM").expect("write");

    let error = match Engine::with_options(EngineOptions {
        tls_ca_file: Some(ca_path.clone()),
        ..Default::default()
    }) {
        Ok(_) => panic!("CA tidak valid harus ditolak saat init"),
        Err(error) => error,
    };
    let message = error.to_string();
    assert!(message.contains("CA"), "pesan CA: {message}");

    let _ = std::fs::remove_dir_all(&directory);
}

#[test]
fn redirect_terlalu_banyak_menghasilkan_error_jelas() {
    let directory = temp_dir("redirect-limit");
    let main = directory.join("main.mjs");
    std::fs::write(
        &main,
        r##"
// Rantai redirect tak berujung: /n selalu mengarah ke /n+1 (heliks via counter).
let n = 0;
const server = ramonyx.serve(0, async () => {
  n += 1;
  return { status: 302, headers: { location: "/r" + n }, body: "" };
});
let pesan = null;
try {
  await fetch("http://127.0.0.1:" + server.port + "/r0");
} catch (error) {
  pesan = String(error);
}
if (pesan === null || !pesan.includes("redirect")) {
  throw new Error("batas redirect harus error jelas: " + pesan);
}
server.close();
globalThis.__batas_ok = true;
"##,
    )
    .expect("write");

    let mut engine = Engine::with_options(EngineOptions {
        permissions: Permissions::allow_all(),
        ..Default::default()
    })
    .expect("engine");
    engine.execute_module(&main).expect("redirect limit");
    engine
        .execute(
            "[verify]",
            "if (globalThis.__batas_ok !== true) throw new Error('batas redirect gagal');",
        )
        .expect("verify");

    let _ = std::fs::remove_dir_all(&directory);
}

#[test]
fn ca_path_tidak_ada_error_jelas() {
    let directory = temp_dir("tls-missing");
    let error = match Engine::with_options(EngineOptions {
        tls_ca_file: Some(directory.join("tidak-ada.pem")),
        ..Default::default()
    }) {
        Ok(_) => panic!("CA hilang harus error"),
        Err(error) => error,
    };
    assert!(error.to_string().contains("gagal membaca CA"), "{error}");
    let _ = std::fs::remove_dir_all(&directory);
}
