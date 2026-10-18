//! Integration test CLI (menjalankan binary sungguhan).

use std::fs;
use std::path::PathBuf;
use std::process::Command;

fn binary() -> PathBuf {
    PathBuf::from(env!("CARGO_BIN_EXE_ramonyx-runtime"))
}

fn temp_dir(name: &str) -> PathBuf {
    let directory = std::env::temp_dir().join(format!("ramonyx-cli-{name}-{}", std::process::id()));
    fs::create_dir_all(&directory).expect("mkdir");
    directory
}

fn has_log_line(stdout: &str, message: &str) -> bool {
    stdout.lines().any(|line| {
        serde_json::from_str::<serde_json::Value>(line)
            .map(|record| record["message"] == message)
            .unwrap_or(false)
    })
}

#[test]
fn version_mencetak_versi() {
    let output = Command::new(binary())
        .arg("version")
        .output()
        .expect("spawn");
    assert!(output.status.success());
    let stdout = String::from_utf8(output.stdout).expect("utf8");
    assert!(stdout.contains("ramonyx-runtime"));
}

#[test]
fn run_script_ts_dieksekusi_dengan_transpile() {
    let directory = temp_dir("run-ts");
    let entry = directory.join("main.ts");
    fs::write(
        &entry,
        "interface Titik { x: number }\nconst titik: Titik = { x: 21 };\nconsole.log('ts jalan', titik.x * 2);\n",
    )
    .expect("write");

    let output = Command::new(binary())
        .args(["run"])
        .arg(&entry)
        .output()
        .expect("spawn");

    assert!(output.status.success(), "exit sukses: {output:?}");
    let stdout = String::from_utf8(output.stdout).expect("utf8");
    assert!(
        stdout.contains("ts jalan 42"),
        "TypeScript ditranspile dan dieksekusi: {stdout}"
    );
    assert!(has_log_line(&stdout, "engine.executed"));

    fs::remove_dir_all(&directory).expect("cleanup");
}

#[test]
fn run_mjs_dengan_import_relatif() {
    let directory = temp_dir("run-mjs");
    fs::write(
        directory.join("util.mjs"),
        "export function dua(x) { return x * 2; }\n",
    )
    .expect("write util");
    let entry = directory.join("main.mjs");
    fs::write(
        &entry,
        "import { dua } from './util.mjs';\nconsole.log('mjs', dua(21));\n",
    )
    .expect("write main");

    let output = Command::new(binary())
        .args(["run"])
        .arg(&entry)
        .output()
        .expect("spawn");

    assert!(output.status.success(), "exit sukses");
    let stdout = String::from_utf8(output.stdout).expect("utf8");
    assert!(
        stdout.contains("mjs 42"),
        "import relatif berjalan: {stdout}"
    );

    fs::remove_dir_all(&directory).expect("cleanup");
}

#[test]
fn run_script_js_dieksekusi_lewat_v8() {
    let directory = temp_dir("run-js");
    let entry = directory.join("hello.js");
    fs::write(&entry, "console.log('halo dari v8', 1 + 1);\n").expect("write");

    let output = Command::new(binary())
        .args(["run"])
        .arg(&entry)
        .output()
        .expect("spawn");

    assert!(output.status.success(), "exit sukses");
    let stdout = String::from_utf8(output.stdout).expect("utf8");
    assert!(
        stdout.contains("halo dari v8 2"),
        "output console.log dari V8 ada: {stdout}"
    );
    assert!(
        has_log_line(&stdout, "engine.executed"),
        "log engine.executed ada"
    );

    fs::remove_dir_all(&directory).expect("cleanup");
}

#[test]
fn run_script_error_v8_menghasilkan_exit_1_dan_log_error() {
    let directory = temp_dir("run-error");
    let entry = directory.join("boom.js");
    fs::write(&entry, "throw new Error('meledak');\n").expect("write");

    let output = Command::new(binary())
        .args(["run"])
        .arg(&entry)
        .output()
        .expect("spawn");

    assert_eq!(output.status.code(), Some(1));
    let stdout = String::from_utf8(output.stdout).expect("utf8");
    assert!(
        has_log_line(&stdout, "engine.error"),
        "log engine.error ada"
    );
    let stderr = String::from_utf8(output.stderr).expect("utf8");
    assert!(stderr.contains("meledak"));

    fs::remove_dir_all(&directory).expect("cleanup");
}

#[test]
fn run_entry_hilang_gagal_dengan_exit_1() {
    let output = Command::new(binary())
        .args(["run", "/tmp/ramonyx-tidak-ada-xyz.ts"])
        .output()
        .expect("spawn");

    assert_eq!(output.status.code(), Some(1));
    let stderr = String::from_utf8(output.stderr).expect("utf8");
    assert!(stderr.contains("tidak ditemukan"));
}

#[test]
fn config_mencetak_json_hasil_resolusi() {
    let directory = temp_dir("config");
    let config_path = directory.join("ramonyx.runtime.json");
    fs::write(
        &config_path,
        r#"{ "entry": "src/main.ts", "logLevel": "debug" }"#,
    )
    .expect("write");

    let output = Command::new(binary())
        .args(["config", "--config"])
        .arg(&config_path)
        .output()
        .expect("spawn");

    assert!(output.status.success());
    let parsed: serde_json::Value =
        serde_json::from_slice(&output.stdout).expect("stdout JSON valid");
    assert_eq!(parsed["entry"], "src/main.ts");
    assert_eq!(parsed["logLevel"], "debug");

    fs::remove_dir_all(&directory).expect("cleanup");
}

#[test]
fn run_http_server_minimal_lewat_cli() {
    use std::io::{Read as IoRead, Write as IoWrite};

    let directory = temp_dir("cli-http");
    let port_path = directory.join("port.txt");
    let port_literal = serde_json::to_string(port_path.to_str().expect("path utf8")).expect("json");
    let entry = directory.join("server.mjs");
    fs::write(
        &entry,
        format!(
            r#"
const server = ramonyx.serve(0, async (request) => {{
  queueMicrotask(() => server.close());
  return {{ status: 200, headers: {{ "content-type": "text/plain; charset=utf-8" }}, body: "cli " + request.path }};
}});
await ramonyx.writeTextFile({port_literal}, String(server.port));
"#
        ),
    )
    .expect("write");

    let mut child = Command::new(binary())
        .args(["run"])
        .arg(&entry)
        .stdout(std::process::Stdio::piped())
        .spawn()
        .expect("spawn");

    let mut port: Option<u16> = None;
    for _ in 0..100 {
        if let Ok(contents) = fs::read_to_string(&port_path)
            && let Ok(value) = contents.trim().parse::<u16>()
        {
            port = Some(value);
            break;
        }
        std::thread::sleep(std::time::Duration::from_millis(50));
    }
    let port = port.expect("port file muncul");

    let mut stream = std::net::TcpStream::connect(("127.0.0.1", port)).expect("connect");
    stream
        .write_all(b"GET /halo HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n")
        .expect("kirim");
    let mut response = String::new();
    stream.read_to_string(&mut response).expect("baca");
    assert!(response.contains("200 OK"), "status: {response}");
    assert!(response.contains("cli /halo"), "body: {response}");

    let status = child.wait().expect("wait");
    assert!(status.success(), "proses keluar 0");

    fs::remove_dir_all(&directory).expect("cleanup");
}

#[test]
fn run_module_io_timer_dan_env_lewat_cli() {
    let directory = temp_dir("cli-io");
    let out_path = directory.join("out.txt");
    let out_literal = serde_json::to_string(out_path.to_str().expect("path utf8")).expect("json");
    let entry = directory.join("io.mjs");
    fs::write(
        &entry,
        format!(
            r#"
await ramonyx.sleep(10);
await ramonyx.writeTextFile({out_literal}, "isi");
const isi = await ramonyx.readTextFile({out_literal});
console.log("io", isi, "env", ramonyx.env.get("RAMONYX_IO_TEST"));
"#
        ),
    )
    .expect("write");

    let output = Command::new(binary())
        .args(["run"])
        .arg(&entry)
        .env("RAMONYX_IO_TEST", "42")
        .output()
        .expect("spawn");

    assert!(output.status.success());
    let stdout = String::from_utf8(output.stdout).expect("utf8");
    assert!(stdout.contains("io isi env 42"), "stdout: {stdout}");

    fs::remove_dir_all(&directory).expect("cleanup");
}

#[test]
fn argumen_tidak_valid_menghasilkan_exit_2_dan_usage() {
    let output = Command::new(binary())
        .args(["run", "--flag-asing"])
        .output()
        .expect("spawn");

    assert_eq!(output.status.code(), Some(2));
    let stderr = String::from_utf8(output.stderr).expect("utf8");
    assert!(stderr.contains("USAGE"));
}
