//! Isolasi level proses + supervisi restart untuk plugin (ADR-0040/0043).
//!
//! Parent menjalankan **proses terpisah** (`ramonyx-runtime run --plugin`) sehingga crash/abort
//! V8 di plugin tidak menjatuhkan induk (beda dari worker yang berupa thread, ADR-0034).
//! Protokol: **JSON per baris** di stdin/stdout anak; log anak ke stderr. Permission plugin =
//! irisan permission induk (anti-eskalasi, sama seperti worker); kuota diteruskan sebagai flag.
//!
//! **Supervisi** (opsi `restart`): saat diaktifkan, task latar mengawasi proses anak —
//! keluar **non-zero**/sinyal → dijalankan ulang otomatis (backoff + batas `maxRestarts`,
//! default 3×100 ms); keluar `0` = selesai normal. `plugin.kill()` menghentikan supervisi.
//!
//! Binari runtime dicari: `RAMONYX_RUNTIME_BIN` → `current_exe` (bila itu ramonyx-runtime) →
//! sibling `target/<profil>/ramonyx-runtime` (dipakai test). Embedder yang menyematkan engine
//! harus mengatur `RAMONYX_RUNTIME_BIN`.

use std::cell::RefCell;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::rc::Rc;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use deno_core::{OpState, op2};
use deno_error::JsErrorBox;
use runtime_core::Permission;
use serde::Serialize;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader, Lines};
use tokio::process::{Child, ChildStdin, ChildStdout};
use tokio::sync::Notify;

use crate::worker::{HealthSpec, RestartSpec, WorkerOptions, resolve_permissions};

/// Batas ukuran satu pesan (JSON) induk ↔ plugin.
const MAX_MESSAGE_BYTES: usize = 1024 * 1024;

/// Batas jumlah plugin aktif per proses (guard fork bomb).
const MAX_PLUGINS: usize = 8;

/// Baris protokol khusus heartbeat (difilter dari `receive`, dipakai health-check ADR-0044).
const HEARTBEAT_LINE: &str = "{\"__ramonyx\":\"heartbeat\"}";

/// Perintah spawn yang dapat diulang (dipakai supervisor).
#[derive(Clone)]
struct SpawnSpec {
    binary: PathBuf,
    args: Vec<String>,
}

fn spawn_child(
    spec: &SpawnSpec,
) -> Result<(Child, ChildStdin, Lines<BufReader<ChildStdout>>), String> {
    let mut command = tokio::process::Command::new(&spec.binary);
    command.args(&spec.args);
    command
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::inherit())
        .kill_on_drop(true);

    let mut child = command.spawn().map_err(|error| {
        format!(
            "gagal menjalankan plugin {}: {error}",
            spec.binary.display()
        )
    })?;
    let stdin = child
        .stdin
        .take()
        .ok_or_else(|| "stdin plugin tidak tersedia".to_string())?;
    let stdout = child
        .stdout
        .take()
        .map(|out| BufReader::new(out).lines())
        .ok_or_else(|| "stdout plugin tidak tersedia".to_string())?;
    Ok((child, stdin, stdout))
}

/// State satu plugin (dibagi dengan task supervisor).
pub struct PluginState {
    spec: SpawnSpec,
    child: Option<Child>,
    pid: Option<u32>,
    stdin: Option<ChildStdin>,
    stdout: Option<Lines<BufReader<ChildStdout>>>,
    supervised: bool,
    stopped: bool,
    restarts: u32,
    max_restarts: u32,
    restart_delay: Duration,
    last_exit: Option<i32>,
    hang_deadline: Option<Duration>,
    hangs: u32,
    last_activity: std::time::Instant,
    wake: Arc<Notify>,
}

impl PluginState {
    /// Tidak akan ada pesan lagi dari plugin ini.
    fn terminal(&self) -> bool {
        if self.stopped {
            return true;
        }
        if let Some(code) = self.last_exit {
            // Keluar normal = selesai; non-zero = restart habis (supervisor berhenti).
            return code == 0 || !self.supervised || self.restarts >= self.max_restarts;
        }
        false
    }
}

#[derive(Default)]
pub struct PluginRegistry {
    next_id: u64,
    plugins: HashMap<u64, Arc<Mutex<PluginState>>>,
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

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StatsEnvelope {
    restarts: u32,
    running: bool,
    stopped: bool,
    last_exit: Option<i32>,
    hangs: u32,
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

/// Task supervisor: tunggu proses anak; restart (backoff) bila keluar non-zero/normal != 0.
async fn supervise(state: Arc<Mutex<PluginState>>) {
    loop {
        let child = {
            let mut plugin = state
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            plugin.child.take()
        };
        let Some(mut child) = child else {
            // Tidak ada child (dipakai `kill`/sedang transition) — berhenti bila terminal.
            let terminal = {
                let plugin = state
                    .lock()
                    .unwrap_or_else(|poisoned| poisoned.into_inner());
                plugin.stopped
            };
            if terminal {
                return;
            }
            tokio::time::sleep(Duration::from_millis(10)).await;
            continue;
        };

        let status = child.wait().await.ok();
        let code = status.and_then(|status| status.code());

        let (should_restart, delay, spec) = {
            let mut plugin = state
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            plugin.last_exit = code;
            plugin.pid = None;
            plugin.wake.notify_waiters();
            let restart =
                !plugin.stopped && code != Some(0) && plugin.restarts < plugin.max_restarts;
            (restart, plugin.restart_delay, plugin.spec.clone())
        };

        if !should_restart {
            return;
        }

        tokio::time::sleep(delay).await;

        let mut plugin = state
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        if plugin.stopped {
            return;
        }
        match spawn_child(&spec) {
            Ok((child, stdin, stdout)) => {
                plugin.pid = child.id();
                plugin.child = Some(child);
                plugin.stdin = Some(stdin);
                plugin.stdout = Some(stdout);
                plugin.restarts += 1;
                plugin.wake.notify_waiters();
            }
            Err(_) => {
                plugin.wake.notify_waiters();
                return;
            }
        }
        drop(plugin);
    }
}

/// Jalankan plugin sebagai proses terpisah (opsi `restart` mengaktifkan supervisi).
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

    let (policy_max, policy_delay) = options
        .restart
        .as_ref()
        .and_then(RestartSpec::policy)
        .map(|(max, delay)| (Some(max), Some(delay)))
        .unwrap_or((None, None));

    let spec = SpawnSpec {
        binary: binary.clone(),
        args: command
            .as_std()
            .get_args()
            .map(|arg| arg.to_string_lossy().into_owned())
            .collect(),
    };

    let mut child = command
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::inherit())
        .kill_on_drop(true)
        .spawn()
        .map_err(|error| {
            JsErrorBox::generic(format!(
                "gagal menjalankan plugin {}: {error}",
                binary.display()
            ))
        })?;
    let pid = child.id();
    let stdin = child.stdin.take();
    let stdout = child.stdout.take().map(|out| BufReader::new(out).lines());

    let supervised = policy_max.is_some();
    let hang_deadline = options.health_check.as_ref().and_then(HealthSpec::deadline);
    let plugin_state = Arc::new(Mutex::new(PluginState {
        spec,
        child: Some(child),
        pid,
        stdin,
        stdout,
        supervised,
        stopped: false,
        restarts: 0,
        max_restarts: policy_max.unwrap_or(0),
        restart_delay: policy_delay.unwrap_or_default(),
        last_exit: None,
        hang_deadline,
        hangs: 0,
        last_activity: std::time::Instant::now(),
        wake: Arc::new(Notify::new()),
    }));

    if supervised {
        let state_for_supervisor = Arc::clone(&plugin_state);
        tokio::spawn(supervise(state_for_supervisor));
    }

    let mut state = state.borrow_mut();
    let registry = state.borrow_mut::<PluginRegistry>();
    registry.plugins.insert(id, plugin_state);
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

    let plugin_state = {
        let op_state = state.borrow();
        let registry = op_state.borrow::<PluginRegistry>();
        let Some(plugin) = registry.plugins.get(&plugin_id) else {
            return Err(JsErrorBox::generic(format!(
                "plugin {plugin_id} tidak ada / sudah berhenti"
            )));
        };
        Arc::clone(plugin)
    };

    let mut payload = text;
    payload.push('\n');

    // Tunggu singkat bila sedang antar-generasi (supervisi restart).
    for _ in 0..40 {
        let stdin = {
            let mut plugin = plugin_state
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            if plugin.terminal() && plugin.stdin.is_none() {
                return Err(JsErrorBox::generic(format!(
                    "plugin {plugin_id} sudah berhenti"
                )));
            }
            plugin.stdin.take()
        };
        let Some(mut stdin) = stdin else {
            let wake = {
                let plugin = plugin_state
                    .lock()
                    .unwrap_or_else(|poisoned| poisoned.into_inner());
                plugin.wake.clone()
            };
            let _ = tokio::time::timeout(Duration::from_millis(50), wake.notified()).await;
            continue;
        };

        let result = async {
            stdin.write_all(payload.as_bytes()).await?;
            stdin.flush().await
        }
        .await
        .map_err(|error| JsErrorBox::generic(format!("gagal mengirim ke plugin: {error}")));

        let mut plugin = plugin_state
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        plugin.stdin = Some(stdin);
        return result;
    }

    Err(JsErrorBox::generic(format!(
        "plugin {plugin_id} sedang restart; coba lagi"
    )))
}

/// Terima pesan JSON dari plugin; `text: null` bila plugin selesai/dihentikan.
#[op2(async(lazy), fast)]
#[serde]
pub async fn op_plugin_receive(
    state: Rc<RefCell<OpState>>,
    #[smi] plugin_id: u64,
) -> Result<MessageEnvelope, JsErrorBox> {
    let plugin_state = {
        let op_state = state.borrow();
        let registry = op_state.borrow::<PluginRegistry>();
        let Some(plugin) = registry.plugins.get(&plugin_id) else {
            return Ok(MessageEnvelope { text: None });
        };
        Arc::clone(plugin)
    };

    loop {
        let mut lines = {
            let mut plugin = plugin_state
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            plugin.stdout.take()
        };

        if let Some(mut lines) = lines.take() {
            let deadline = {
                let plugin = plugin_state
                    .lock()
                    .unwrap_or_else(|poisoned| poisoned.into_inner());
                plugin.hang_deadline
            };

            let read = match deadline {
                Some(deadline) => match tokio::time::timeout(deadline, lines.next_line()).await {
                    Ok(result) => result,
                    Err(_) => {
                        // Senyap melebihi deadline: anggap hang → SIGKILL proses saat ini.
                        // Dengan supervisi: supervisor mereap lalu restart generasi baru.
                        // Tanpa supervisi: reap sendiri + tandai stopped (terminal).
                        let (supervised, child) = {
                            let mut plugin = plugin_state
                                .lock()
                                .unwrap_or_else(|poisoned| poisoned.into_inner());
                            plugin.hangs += 1;
                            (plugin.supervised, plugin.child.take())
                        };

                        if supervised {
                            let plugin = plugin_state
                                .lock()
                                .unwrap_or_else(|poisoned| poisoned.into_inner());
                            if let Some(pid) = plugin.pid {
                                // SAFETY: `kill` hanya mengirim sinyal; kegagalan diabaikan.
                                unsafe {
                                    libc::kill(pid as i32, libc::SIGKILL);
                                }
                            }
                            plugin.wake.notify_waiters();
                            drop(plugin);
                        } else if let Some(mut child) = child {
                            let _ = child.start_kill();
                            let status = child.wait().await.ok();
                            let mut plugin = plugin_state
                                .lock()
                                .unwrap_or_else(|poisoned| poisoned.into_inner());
                            plugin.last_exit = status.and_then(|status| status.code());
                            plugin.pid = None;
                            plugin.stopped = true;
                            plugin.wake.notify_waiters();
                            drop(plugin);
                        }
                        continue;
                    }
                },
                None => lines.next_line().await,
            };

            let read = read.map_err(|error| {
                JsErrorBox::generic(format!("gagal membaca dari plugin: {error}"))
            });
            match read {
                Ok(Some(line)) => {
                    let mut plugin = plugin_state
                        .lock()
                        .unwrap_or_else(|poisoned| poisoned.into_inner());
                    plugin.last_activity = std::time::Instant::now();
                    // Baris heartbeat bukan pesan aplikasi — jangan diteruskan ke `receive`.
                    if line == HEARTBEAT_LINE {
                        plugin.stdout = Some(lines);
                        drop(plugin);
                        continue;
                    }
                    plugin.stdout = Some(lines);
                    return Ok(MessageEnvelope { text: Some(line) });
                }
                Ok(None) => {
                    // EOF generasi ini. Tanpa supervisi: selesai (perilaku lama).
                    // Dengan supervisi: supervisor mungkin sedang restart → tunggu generasi baru.
                    let supervised = {
                        let plugin = plugin_state
                            .lock()
                            .unwrap_or_else(|poisoned| poisoned.into_inner());
                        plugin.supervised
                    };
                    if !supervised {
                        return Ok(MessageEnvelope { text: None });
                    }
                }
                Err(error) => return Err(error),
            }
        }

        let (terminal, wake) = {
            let plugin = plugin_state
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            (plugin.terminal(), plugin.wake.clone())
        };
        if terminal {
            return Ok(MessageEnvelope { text: None });
        }
        let _ = tokio::time::timeout(Duration::from_millis(250), wake.notified()).await;
    }
}

/// Statistik plugin (restart, status) — untuk observability supervisi.
#[op2]
#[serde]
pub fn op_plugin_stats(
    state: &mut OpState,
    #[smi] plugin_id: u64,
) -> Result<StatsEnvelope, JsErrorBox> {
    let registry = state.borrow::<PluginRegistry>();
    let Some(plugin) = registry.plugins.get(&plugin_id) else {
        return Ok(StatsEnvelope {
            restarts: 0,
            running: false,
            stopped: true,
            last_exit: None,
            hangs: 0,
        });
    };
    let plugin = plugin
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    Ok(StatsEnvelope {
        restarts: plugin.restarts,
        running: plugin.child.is_some(),
        stopped: plugin.stopped || plugin.terminal(),
        last_exit: plugin.last_exit,
        hangs: plugin.hangs,
    })
}

/// Hentikan plugin (SIGKILL + hentikan supervisi); `text` = exit code (null bila sinyal).
#[op2(async(lazy), fast)]
#[serde]
pub async fn op_plugin_kill(
    state: Rc<RefCell<OpState>>,
    #[smi] plugin_id: u64,
) -> Result<MessageEnvelope, JsErrorBox> {
    let plugin_state = {
        let op_state = state.borrow();
        let registry = op_state.borrow::<PluginRegistry>();
        let Some(plugin) = registry.plugins.get(&plugin_id) else {
            return Ok(MessageEnvelope { text: None });
        };
        Arc::clone(plugin)
    };

    let (child, pid, supervised) = {
        let mut plugin = plugin_state
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        plugin.stopped = true;
        plugin.wake.notify_waiters();
        (plugin.child.take(), plugin.pid, plugin.supervised)
    };

    if let Some(mut child) = child {
        let _ = child.start_kill();
        let status = child.wait().await.ok();
        let code = status.and_then(|status| status.code());
        let mut plugin = plugin_state
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        plugin.last_exit = code;
        plugin.pid = None;
        plugin.wake.notify_waiters();
        return Ok(MessageEnvelope {
            text: code.map(|code| code.to_string()),
        });
    }

    // Child sedang dipegang supervisor: kirim sinyal lewat pid, tunggu reap.
    if let Some(pid) = pid {
        // SAFETY: `kill` hanya mengirim sinyal; kegagalan diabaikan (proses mungkin sudah mati).
        unsafe {
            libc::kill(pid as i32, libc::SIGKILL);
        }
    }

    if supervised {
        let wake = {
            let plugin = plugin_state
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            plugin.wake.clone()
        };
        for _ in 0..40 {
            let code = {
                let plugin = plugin_state
                    .lock()
                    .unwrap_or_else(|poisoned| poisoned.into_inner());
                if plugin.child.is_none() && plugin.pid.is_none() && plugin.last_exit.is_some() {
                    Some(plugin.last_exit)
                } else if plugin.child.is_none() && plugin.pid.is_none() && plugin.stopped {
                    Some(None)
                } else {
                    None
                }
            };
            if let Some(code) = code {
                return Ok(MessageEnvelope {
                    text: code.map(|value| value.to_string()),
                });
            }
            let _ = tokio::time::timeout(Duration::from_millis(50), wake.notified()).await;
        }
    }

    Ok(MessageEnvelope { text: None })
}

/// Kirim heartbeat ke induk (hanya plugin): baris protokol khusus yang difilter `receive`.
#[op2(async(lazy), fast)]
pub async fn op_parent_heartbeat(state: Rc<RefCell<OpState>>) -> Result<(), JsErrorBox> {
    {
        let op_state = state.borrow();
        let channel = op_state.borrow::<crate::worker::WorkerSelfChannel>();
        if channel.to_parent.is_some() {
            return Err(JsErrorBox::generic(
                "ramonyx.heartbeat hanya untuk plugin (proses)",
            ));
        }
        let bridge = op_state.borrow::<ProcessBridge>();
        if bridge.stdin.is_none() {
            return Err(JsErrorBox::generic(
                "ramonyx.heartbeat hanya tersedia di dalam plugin",
            ));
        }
    }

    let mut stdout = tokio::io::stdout();
    stdout
        .write_all(format!("{HEARTBEAT_LINE}\n").as_bytes())
        .await
        .map_err(|error| JsErrorBox::generic(format!("gagal menulis heartbeat: {error}")))?;
    stdout
        .flush()
        .await
        .map_err(|error| JsErrorBox::generic(format!("gagal flush heartbeat: {error}")))
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
