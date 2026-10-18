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
fn argumen_tidak_valid_menghasilkan_exit_2_dan_usage() {
    let output = Command::new(binary())
        .args(["run", "--flag-asing"])
        .output()
        .expect("spawn");

    assert_eq!(output.status.code(), Some(2));
    let stderr = String::from_utf8(output.stderr).expect("utf8");
    assert!(stderr.contains("USAGE"));
}
