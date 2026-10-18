//! Isolasi level proses untuk plugin (ADR-0040).
//!
//! Parent menjalankan **proses terpisah** (`ramonyx-runtime run --plugin`) sehingga crash/abort
//! V8 di plugin tidak menjatuhkan induk (beda dari worker yang berupa thread, ADR-0034).
//! Protokol: **JSON per baris** di stdin/stdout anak; log anak ke stderr. Permission plugin =
//! irisan permission induk (anti-eskalasi, sama seperti worker); kuota diteruskan sebagai flag.
//!
//! Binari runtime dicari: `RAMONYX_RUNTIME_BIN` → `current_exe` (bila itu ramonyx-runtime) →
//! sibling `target/<profil>/ramonyx-runtime` (dipakai test). Embedder yang menyematkan engine
//! harus mengatur `RAMONYX_RUNTIME_BIN`.

use std::cell::RefCell;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::rc::Rc;

use deno_core::{OpState, op2};
use deno_error::JsErrorBox;
use runtime_core::Permission;
use serde::Serialize;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader, Lines};
use tokio::process::{Child, ChildStdin, ChildStdout};

use crate::worker::{WorkerOptions, resolve_permissions};

/// Batas ukuran satu pesan (JSON) induk ↔ plugin.
const MAX_MESSAGE_BYTES: usize = 1024 * 1024;

/// Batas jumlah plugin aktif per proses (guard fork bomb).
const MAX_PLUGINS: usize = 8;

pub struct PluginHandle {
    child: Option<Child>,
    stdin: Option<ChildStdin>,
    stdout: Option<Lines<BufReader<ChildStdout>>>,
}

#[derive(Default)]
pub struct PluginRegistry {
    next_id: u64,
    plugins: HashMap<u64, PluginHandle>,
}

/// Jembatan stdio sisi-anak. `stdin` hanya terisi bila engine dijalankan dengan `--plugin`
/// (mencegah program biasa membaca stdin host tanpa sengaja).
pub struct ProcessBridge {
    stdin: Option<Lines<BufReader<tokio::io::Stdin>>>,
}

impl ProcessBridge {
    /// Bridge aktif (mode `--plugin`).
    pub fn enabled() -> Self {
        Self {
            stdin: Some(BufReader::new(tokio::io::stdin()).lines()),
        }
    }

    /// Bridge mati (mode normal).
    pub fn disabled() -> Self {
        Self { stdin: None }
    }
}

impl Default for ProcessBridge {
    fn default() -> Self {
        Self::disabled()
    }
}

#[derive(Serialize)]
pub struct MessageEnvelope {
    text: Option<String>,
}

fn check_message_size(text: &str) -> Result<(), JsErrorBox> {
    if text.len() > MAX_MESSAGE_BYTES {
        return Err(JsErrorBox::generic(format!(
            "pesan melebihi batas {} KiB antar proses",
            MAX_MESSAGE_BYTES / 1024
        )));
    }
    Ok(())
}

/// Cari binari `ramonyx-runtime` untuk menjalankan plugin.
fn runtime_binary() -> Result<PathBuf, JsErrorBox> {
    if let Ok(explicit) = std::env::var("RAMONYX_RUNTIME_BIN") {
        let path = PathBuf::from(explicit);
        if path.is_file() {
            return Ok(path);
        }
        return Err(JsErrorBox::generic(format!(
            "RAMONYX_RUNTIME_BIN tidak menunjuk berkas: {}",
            path.display()
        )));
    }

    let current = std::env::current_exe()
        .map_err(|error| JsErrorBox::generic(format!("tidak bisa membaca current_exe: {error}")))?;
    if current
        .file_name()
        .is_some_and(|name| name.to_string_lossy().starts_with("ramonyx-runtime"))
    {
        return Ok(current);
    }
    // Binari test hidup di target/<profil>/deps/*; sibling-nya binari CLI.
    if let Some(sibling) = current
        .parent()
        .and_then(Path::parent)
        .map(|dir| dir.join("ramonyx-runtime"))
        && sibling.is_file()
    {
        return Ok(sibling);
    }

    Err(JsErrorBox::generic(
        "binari ramonyx-runtime tidak ditemukan — set RAMONYX_RUNTIME_BIN (embedder wajib)",
    ))
}

fn append_permission_flag(
    command: &mut tokio::process::Command,
    name: &str,
    permission: &Permission,
) {
    match permission {
        Permission::Deny => {}
        Permission::AllowAll => {
            command.arg(format!("--allow-{name}"));
        }
        Permission::Allow(list) => {
            command.arg(format!("--allow-{name}={}", list.join(",")));
        }
    }
}

/// Jalankan plugin sebagai proses terpisah.
#[op2(async(lazy))]
#[serde]
pub async fn op_plugin_spawn(
    state: Rc<RefCell<OpState>>,
    #[string] entry: String,
    #[serde] options: WorkerOptions,
) -> Result<u64, JsErrorBox> {
    let (parent_permissions, limits, id) = {
        let mut state = state.borrow_mut();
        let permissions = state.borrow::<runtime_core::Permissions>().clone();
        let limits = state.borrow::<crate::EngineLimits>().clone();
        let registry = state.borrow_mut::<PluginRegistry>();
        if registry.plugins.len() >= MAX_PLUGINS {
            return Err(JsErrorBox::generic(format!(
                "batas jumlah plugin aktif ({MAX_PLUGINS}) tercapai"
            )));
        }
        registry.next_id += 1;
        (permissions, limits, registry.next_id)
    };

    let binary = runtime_binary()?;
    let mut command = tokio::process::Command::new(&binary);
    command.arg("run").arg(&entry).arg("--plugin");

    // Anti-eskalasi: permission plugin = irisan dengan induk.
    let effective = resolve_permissions(&parent_permissions, options.allow.as_ref());
    append_permission_flag(&mut command, "read", &effective.read);
    append_permission_flag(&mut command, "write", &effective.write);
    append_permission_flag(&mut command, "net", &effective.net);
    append_permission_flag(&mut command, "env", &effective.env);

    if let Some(heap) = options.max_heap_mb.or(limits.max_heap_mb) {
        command.args(["--max-heap-mb", &heap.to_string()]);
    }
    if let Some(timeout) = options.timeout_ms {
        command.args(["--timeout-ms", &timeout.to_string()]);
    }
    if let Some(cpu) = options.max_cpu_ms.or(limits.max_cpu_ms) {
        command.args(["--max-cpu-ms", &cpu.to_string()]);
    }
    if let Some(rss) = options.max_rss_mb.or(limits.max_rss_mb) {
        command.args(["--max-rss-mb", &rss.to_string()]);
    }
    if let Some(ca) = &limits.tls_ca_file {
        command.arg("--tls-ca").arg(ca);
    }

    command
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::inherit())
        .kill_on_drop(true);

    let mut child = command.spawn().map_err(|error| {
        JsErrorBox::generic(format!(
            "gagal menjalankan plugin {}: {error}",
            binary.display()
        ))
    })?;
    let stdin = child.stdin.take();
    let stdout = child.stdout.take().map(|out| BufReader::new(out).lines());

    let mut state = state.borrow_mut();
    let registry = state.borrow_mut::<PluginRegistry>();
    registry.plugins.insert(
        id,
        PluginHandle {
            child: Some(child),
            stdin,
            stdout,
        },
    );
    Ok(id)
}

/// Kirim pesan JSON ke plugin (satu JSON per baris).
#[op2(async(lazy), fast)]
pub async fn op_plugin_send(
    state: Rc<RefCell<OpState>>,
    #[smi] plugin_id: u64,
    #[string] text: String,
) -> Result<(), JsErrorBox> {
    check_message_size(&text)?;
    let mut stdin = {
        let mut op_state = state.borrow_mut();
        let registry = op_state.borrow_mut::<PluginRegistry>();
        let Some(handle) = registry.plugins.get_mut(&plugin_id) else {
            return Err(JsErrorBox::generic(format!(
                "plugin {plugin_id} tidak ada / sudah berhenti"
            )));
        };
        handle
            .stdin
            .take()
            .ok_or_else(|| JsErrorBox::generic("send sudah berjalan untuk plugin ini"))?
    };

    let mut payload = text;
    payload.push('\n');
    let result = async {
        stdin.write_all(payload.as_bytes()).await?;
        stdin.flush().await
    }
    .await
    .map_err(|error| JsErrorBox::generic(format!("gagal mengirim ke plugin: {error}")));

    let mut op_state = state.borrow_mut();
    let registry = op_state.borrow_mut::<PluginRegistry>();
    if let Some(handle) = registry.plugins.get_mut(&plugin_id) {
        handle.stdin = Some(stdin);
    }
    result
}

/// Terima pesan JSON dari plugin; `text: null` bila plugin selesai/dihentikan.
#[op2(async(lazy), fast)]
#[serde]
pub async fn op_plugin_receive(
    state: Rc<RefCell<OpState>>,
    #[smi] plugin_id: u64,
) -> Result<MessageEnvelope, JsErrorBox> {
    let mut lines = {
        let mut op_state = state.borrow_mut();
        let registry = op_state.borrow_mut::<PluginRegistry>();
        let Some(handle) = registry.plugins.get_mut(&plugin_id) else {
            return Ok(MessageEnvelope { text: None });
        };
        handle
            .stdout
            .take()
            .ok_or_else(|| JsErrorBox::generic("receive sudah berjalan untuk plugin ini"))?
    };

    let result = lines
        .next_line()
        .await
        .map_err(|error| JsErrorBox::generic(format!("gagal membaca dari plugin: {error}")));

    let mut op_state = state.borrow_mut();
    let registry = op_state.borrow_mut::<PluginRegistry>();
    if let Some(handle) = registry.plugins.get_mut(&plugin_id) {
        handle.stdout = Some(lines);
    }

    match result? {
        Some(line) => Ok(MessageEnvelope { text: Some(line) }),
        None => Ok(MessageEnvelope { text: None }),
    }
}

/// Hentikan plugin (SIGKILL) dan tunggu; `text` = exit code (null bila tak diketahui).
#[op2(async(lazy), fast)]
#[serde]
pub async fn op_plugin_kill(
    state: Rc<RefCell<OpState>>,
    #[smi] plugin_id: u64,
) -> Result<MessageEnvelope, JsErrorBox> {
    let mut child = {
        let mut op_state = state.borrow_mut();
        let registry = op_state.borrow_mut::<PluginRegistry>();
        let Some(handle) = registry.plugins.get_mut(&plugin_id) else {
            return Ok(MessageEnvelope { text: None });
        };
        let Some(child) = handle.child.take() else {
            return Ok(MessageEnvelope { text: None });
        };
        child
    };

    let _ = child.start_kill();
    let status = child.wait().await.ok();
    let code = status.and_then(|status| status.code());

    let mut op_state = state.borrow_mut();
    let registry = op_state.borrow_mut::<PluginRegistry>();
    if let Some(handle) = registry.plugins.get_mut(&plugin_id) {
        handle.child = Some(child);
    }

    Ok(MessageEnvelope {
        text: code.map(|code| code.to_string()),
    })
}

/// Keluar dari proses ini dengan kode tertentu (dipakai plugin untuk selesai).
#[op2(fast)]
pub fn op_process_exit(#[smi] code: u16) -> Result<(), JsErrorBox> {
    std::process::exit(i32::from(code));
}

/// Kirim pesan ke induk — worker (thread) atau plugin (proses), API `ramonyx.parent` yang sama.
#[op2(async(lazy), fast)]
pub async fn op_parent_send(
    state: Rc<RefCell<OpState>>,
    #[string] text: String,
) -> Result<(), JsErrorBox> {
    check_message_size(&text)?;

    // Worker: kanal tokio.
    {
        let op_state = state.borrow();
        let channel = op_state.borrow::<crate::worker::WorkerSelfChannel>();
        if let Some(sender) = channel.to_parent.as_ref() {
            return sender
                .send(text)
                .map_err(|_| JsErrorBox::generic("induk sudah berhenti (pesan tidak terkirim)"));
        }
    }

    // Plugin: satu JSON per baris ke stdout.
    let mut payload = text;
    payload.push('\n');
    let mut stdout = tokio::io::stdout();
    stdout
        .write_all(payload.as_bytes())
        .await
        .map_err(|error| JsErrorBox::generic(format!("gagal menulis stdout: {error}")))?;
    stdout
        .flush()
        .await
        .map_err(|error| JsErrorBox::generic(format!("gagal flush stdout: {error}")))
}

/// Terima pesan dari induk (worker atau plugin).
#[op2(async(lazy), fast)]
#[serde]
pub async fn op_parent_receive(state: Rc<RefCell<OpState>>) -> Result<MessageEnvelope, JsErrorBox> {
    // Worker (thread): kanal tokio.
    let worker_receiver = {
        let mut op_state = state.borrow_mut();
        let channel = op_state.borrow_mut::<crate::worker::WorkerSelfChannel>();
        channel.from_parent.take()
    };
    if let Some(mut receiver) = worker_receiver {
        let result = receiver.recv().await;
        let mut op_state = state.borrow_mut();
        let channel = op_state.borrow_mut::<crate::worker::WorkerSelfChannel>();
        channel.from_parent = Some(receiver);
        return Ok(MessageEnvelope { text: result });
    }

    // Plugin (proses): stdin JSON per baris (hanya aktif dengan `--plugin`).
    let mut lines = {
        let mut op_state = state.borrow_mut();
        let bridge = op_state.borrow_mut::<ProcessBridge>();
        bridge.stdin.take().ok_or_else(|| {
            JsErrorBox::generic("ramonyx.parent hanya tersedia di dalam worker/plugin")
        })?
    };
    let result = lines
        .next_line()
        .await
        .map_err(|error| JsErrorBox::generic(format!("gagal membaca stdin: {error}")));
    let mut op_state = state.borrow_mut();
    let bridge = op_state.borrow_mut::<ProcessBridge>();
    bridge.stdin = Some(lines);
    Ok(MessageEnvelope { text: result? })
}
