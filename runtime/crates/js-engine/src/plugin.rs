//! Isolasi level proses + supervisi restart untuk plugin (ADR-0040/0043).
//!
//! Parent menjalankan **proses terpisah** (`ramonyx-runtime run --plugin`) sehingga crash/abort
//! V8 di plugin tidak menjatuhkan induk (beda dari worker yang berupa thread, ADR-0034).
//! Protokol: **JSON per baris** di stdin/stdout anak; log anak ke stderr. Permission plugin =
//! irisan permission induk (anti-eskalasi, sama seperti worker); kuota diteruskan sebagai flag.
//!
//! **Supervisi** (opsi `restart`): saat diaktifkan, task latar mengawasi proses anak —
//! keluar **non-zero**/sinyal → dijalankan ulang otomatis dengan **backoff eksponensial**
//! (`delayMs · 2^n`, dibatasi `backoffMaxMs`; kuota `maxRestarts` di-reset setelah generasi
//! bertahan `stableAfterMs` — ADR-0043/0050); keluar `0` = selesai normal. `plugin.kill()`
//! menghentikan supervisi.
//!
//! **Health-check otomatis** (ADR-0044/0050): stdout dibaca **task latar**, bukan `receive` —
//! watchdog membunuh plugin yang senyap melewati `deadlineMs` walau induk tidak sedang membaca;
//! pesan aplikasi diantrekan (batas `MAX_QUEUED_MESSAGES`, kelebihan → buang tertua + hitung).
//!
//! Binari runtime dicari: `RAMONYX_RUNTIME_BIN` → `current_exe` (bila itu ramonyx-runtime) →
//! sibling `target/<profil>/ramonyx-runtime` (dipakai test). Embedder yang menyematkan engine
//! harus mengatur `RAMONYX_RUNTIME_BIN`.

use std::cell::RefCell;
use std::collections::{HashMap, VecDeque};
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::rc::Rc;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use deno_core::{OpState, op2};
use deno_error::JsErrorBox;
use runtime_core::{Permission, Permissions};
use serde::Serialize;
use tokio::io::{AsyncBufRead, AsyncBufReadExt, AsyncWriteExt, BufReader, Lines};
use tokio::process::{Child, ChildStdin, ChildStdout};
use tokio::sync::Notify;

use crate::sandbox::SandboxSpec;
use crate::worker::{HealthSpec, RestartSpec, SandboxOption, WorkerOptions, resolve_permissions};

/// Batas ukuran satu pesan (JSON) induk ↔ plugin.
const MAX_MESSAGE_BYTES: usize = 1024 * 1024;

/// Batas jumlah plugin aktif per proses (guard fork bomb).
const MAX_PLUGINS: usize = 8;

/// Baris protokol khusus heartbeat (difilter dari `receive`, dipakai health-check ADR-0044).
const HEARTBEAT_LINE: &str = "{\"__ramonyx\":\"heartbeat\"}";

/// Batas antrean pesan masuk yang belum dibaca induk (task pembaca latar, ADR-0050).
const MAX_QUEUED_MESSAGES: usize = 4096;

/// Batas panjang satu baris protokol dari plugin (simetris dengan `MAX_MESSAGE_BYTES`).
const MAX_LINE_BYTES: usize = 1024 * 1024;

/// Perintah spawn yang dapat diulang (dipakai supervisor).
#[derive(Clone)]
struct SpawnSpec {
    binary: PathBuf,
    args: Vec<String>,
}

fn spawn_child(spec: &SpawnSpec) -> Result<(Child, ChildStdin, ChildStdout), String> {
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
        .ok_or_else(|| "stdout plugin tidak tersedia".to_string())?;
    Ok((child, stdin, stdout))
}

/// State satu plugin (dibagi dengan task supervisor + task pembaca + watchdog).
pub struct PluginState {
    spec: SpawnSpec,
    child: Option<Child>,
    pid: Option<u32>,
    stdin: Option<ChildStdin>,
    /// Pesan aplikasi yang sudah dibaca task latar, menunggu `receive` (ADR-0050).
    messages: VecDeque<String>,
    /// Pesan yang dibuang karena antrean penuh (observability).
    dropped_messages: u64,
    /// Nomor generasi proses (naik di setiap (re)spawn).
    generation: u64,
    generation_started: Instant,
    /// Generasi saat ini sudah EOF (task pembaca selesai).
    generation_ended: bool,
    /// Error baca generasi saat ini (disurfaced sekali oleh `receive`).
    read_error: Option<String>,
    /// Generasi ini sudah dibunuh karena melewati deadline health-check.
    hung_killed: bool,
    /// Supervisor sudah menyerah (kuota restart habis) — penanda terminal eksplisit,
    /// karena kuota kini bisa di-reset oleh generasi stabil (ADR-0050).
    supervisor_gave_up: bool,
    supervised: bool,
    stopped: bool,
    restarts: u32,
    max_restarts: u32,
    base_delay: Duration,
    max_delay: Duration,
    stable_after: Duration,
    last_exit: Option<i32>,
    hang_deadline: Option<Duration>,
    hangs: u32,
    last_activity: Instant,
    wake: Arc<Notify>,
}

impl PluginState {
    /// Tidak akan ada pesan lagi dari plugin ini.
    fn terminal(&self) -> bool {
        if self.stopped {
            return true;
        }
        if !self.supervised {
            // Tanpa supervisi: proses pernah keluar (hang-kill) = selesai; EOF jalur `receive`.
            return self.last_exit.is_some();
        }
        match self.last_exit {
            Some(0) => true, // keluar normal = selesai
            Some(_) => self.supervisor_gave_up,
            None => false,
        }
    }
}

/// Backoff eksponensial: `base · 2^attempt`, dibatasi `max` (ADR-0050).
pub(crate) fn next_backoff(attempt: u32, base: Duration, max: Duration) -> Duration {
    if base >= max {
        return max;
    }
    let factor = 1u32.checked_shl(attempt).unwrap_or(u32::MAX);
    base.saturating_mul(factor).min(max)
}

/// Baca satu baris (≤ `max` byte) dari reader; `Ok(0)` = EOF.
async fn read_line_limited<R: AsyncBufRead + Unpin>(
    reader: &mut R,
    out: &mut Vec<u8>,
    max: usize,
) -> std::io::Result<usize> {
    loop {
        let (chunk, consumed, selesai) = {
            let available = reader.fill_buf().await?;
            if available.is_empty() {
                return Ok(out.len());
            }
            match available.iter().position(|&byte| byte == b'\n') {
                Some(position) => (available[..=position].to_vec(), position + 1, true),
                None => (available.to_vec(), available.len(), false),
            }
        };
        if out.len() + chunk.len() > max {
            return Err(std::io::Error::new(
                std::io::ErrorKind::InvalidData,
                "baris dari plugin melebihi batas 1 MiB",
            ));
        }
        out.extend_from_slice(&chunk);
        reader.consume(consumed);
        if selesai {
            return Ok(out.len());
        }
    }
}

/// Pasang generasi proses baru: perbarui state + jalankan task pembaca stdout (ADR-0050).
fn wire_generation(
    state: &Arc<Mutex<PluginState>>,
    child: Child,
    stdin: Option<ChildStdin>,
    stdout: Option<ChildStdout>,
) {
    let generation = {
        let mut plugin = state
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        plugin.generation += 1;
        plugin.generation_started = Instant::now();
        plugin.generation_ended = false;
        plugin.read_error = None;
        plugin.hung_killed = false;
        plugin.supervisor_gave_up = false;
        plugin.last_activity = Instant::now();
        plugin.pid = child.id();
        plugin.child = Some(child);
        plugin.stdin = stdin;
        plugin.generation
    };

    match stdout {
        Some(stdout) => {
            let state_for_reader = Arc::clone(state);
            tokio::spawn(read_generation(
                state_for_reader,
                generation,
                BufReader::new(stdout),
            ));
        }
        None => {
            let mut plugin = state
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            plugin.generation_ended = true;
            plugin.wake.notify_waiters();
        }
    }
}

/// Task pembaca latar: stdout plugin → antrean pesan; heartbeat memperbarui stempel aktivitas.
/// Berjalan independen dari `receive` — inilah dasar health-check otomatis (ADR-0050).
async fn read_generation(
    state: Arc<Mutex<PluginState>>,
    generation: u64,
    mut reader: BufReader<ChildStdout>,
) {
    loop {
        let mut buf = Vec::new();
        match read_line_limited(&mut reader, &mut buf, MAX_LINE_BYTES).await {
            Ok(0) => break,
            Ok(_) => {
                let line = String::from_utf8_lossy(&buf)
                    .trim_end_matches(['\n', '\r'])
                    .to_string();
                let mut plugin = state
                    .lock()
                    .unwrap_or_else(|poisoned| poisoned.into_inner());
                if plugin.generation != generation {
                    return;
                }
                plugin.last_activity = Instant::now();
                if line == HEARTBEAT_LINE {
                    continue;
                }
                if plugin.messages.len() >= MAX_QUEUED_MESSAGES {
                    plugin.messages.pop_front();
                    plugin.dropped_messages += 1;
                }
                plugin.messages.push_back(line);
                plugin.wake.notify_waiters();
            }
            Err(error) => {
                let mut plugin = state
                    .lock()
                    .unwrap_or_else(|poisoned| poisoned.into_inner());
                if plugin.generation == generation {
                    plugin.read_error = Some(format!("gagal membaca dari plugin: {error}"));
                }
                break;
            }
        }
    }

    let mut plugin = state
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    if plugin.generation == generation {
        plugin.generation_ended = true;
        plugin.wake.notify_waiters();
    }
}

/// Terapkan deadline health-check bila terlampaui (idempoten per generasi).
/// Dipakai jalur `receive` **dan** watchdog latar — deteksi otomatis ADR-0050.
async fn enforce_hang_deadline(state: &Arc<Mutex<PluginState>>) -> bool {
    let (supervised, pid) = {
        let mut plugin = state
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let Some(deadline) = plugin.hang_deadline else {
            return false;
        };
        // Catatan: pada plugin tersupervisi, handle `child` dipegang task supervisor —
        // indikator "masih hidup" yang benar adalah `pid`/`generation_ended`, bukan `child` (ADR-0050).
        if plugin.hung_killed || plugin.stopped || plugin.generation_ended {
            return false;
        }
        let running = if plugin.supervised {
            plugin.pid.is_some()
        } else {
            plugin.child.is_some()
        };
        if !running {
            return false;
        }
        if plugin.last_activity.elapsed() <= deadline {
            return false;
        }
        plugin.hung_killed = true;
        plugin.hangs += 1;
        (plugin.supervised, plugin.pid)
    };

    if supervised {
        if let Some(pid) = pid {
            // SAFETY: `kill` hanya mengirim sinyal; kegagalan diabaikan.
            unsafe {
                libc::kill(pid as i32, libc::SIGKILL);
            }
        }
        let plugin = state
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        plugin.wake.notify_waiters();
    } else {
        let child = {
            let mut plugin = state
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            plugin.child.take()
        };
        if let Some(mut child) = child {
            let _ = child.start_kill();
            let status = child.wait().await.ok();
            let mut plugin = state
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            plugin.last_exit = status.and_then(|status| status.code());
            plugin.pid = None;
            plugin.stopped = true;
            plugin.wake.notify_waiters();
        }
    }
    true
}

/// Watchdog health-check: evaluasi deadline berkala **tanpa** menunggu `receive` (ADR-0050).
async fn watchdog(state: Arc<Mutex<PluginState>>) {
    loop {
        let (tick, done) = {
            let plugin = state
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            let Some(deadline) = plugin.hang_deadline else {
                return;
            };
            (
                (deadline / 4).max(Duration::from_millis(25)),
                plugin.terminal(),
            )
        };
        if done {
            return;
        }
        enforce_hang_deadline(&state).await;
        tokio::time::sleep(tick).await;
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
    /// Delay restart berikutnya (backoff eksponensial) — observability ADR-0050.
    next_backoff_ms: u64,
    /// Pesan masuk yang dibuang karena antrean penuh.
    dropped_messages: u64,
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

/// Task supervisor: tunggu proses anak; restart dengan backoff eksponensial bila keluar
/// non-zero. Kuota restart di-reset setelah generasi bertahan `stableAfterMs` (ADR-0050).
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
            // Generasi yang hidup ≥ stableAfter dianggap stabil → kuota restart pulih.
            if plugin.generation_started.elapsed() >= plugin.stable_after {
                plugin.restarts = 0;
            }
            plugin.wake.notify_waiters();
            let restart =
                !plugin.stopped && code != Some(0) && plugin.restarts < plugin.max_restarts;
            let delay = next_backoff(plugin.restarts, plugin.base_delay, plugin.max_delay);
            (restart, delay, plugin.spec.clone())
        };

        if !should_restart {
            let mut plugin = state
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            plugin.supervisor_gave_up = true;
            plugin.wake.notify_waiters();
            return;
        }

        tokio::time::sleep(delay).await;

        let should_spawn = {
            let plugin = state
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            !plugin.stopped
        };
        if !should_spawn {
            return;
        }
        match spawn_child(&spec) {
            Ok((child, stdin, stdout)) => {
                wire_generation(&state, child, Some(stdin), Some(stdout));
                let mut plugin = state
                    .lock()
                    .unwrap_or_else(|poisoned| poisoned.into_inner());
                plugin.restarts += 1;
                plugin.wake.notify_waiters();
            }
            Err(_) => {
                let plugin = state
                    .lock()
                    .unwrap_or_else(|poisoned| poisoned.into_inner());
                plugin.wake.notify_waiters();
                return;
            }
        }
    }
}

/// Apakah `candidate` berada di dalam salah satu direktori (perbandingan hasil canonicalize).
fn path_di_dalam(direktori: &[PathBuf], candidate: &str) -> bool {
    let Ok(canonical) = std::fs::canonicalize(candidate) else {
        return false;
    };
    direktori
        .iter()
        .any(|dir| canonical == *dir || canonical.starts_with(dir))
}

/// Gabungkan opsi `sandbox` dengan permission efektif plugin (irisan; anti-eskalasi) — ADR-0051.
///
/// Semantik:
/// - `sandbox: false`/absen → `None`.
/// - Permission **Deny** → kelas itu ditangani kernel tanpa rule (tolak semua).
/// - Permission **AllowAll** + daftar eksplisit → kernel dibatasi ke daftar itu.
/// - Permission **Allow(paths)** → daftar (eksplisit atau cermin) diiris ke `paths`.
/// - Kelas tanpa daftar yang bisa dipersempit (AllowAll murni) dibiarkan ke lapisan JS.
pub(crate) fn resolve_sandbox(
    option: Option<&SandboxOption>,
    effective: &Permissions,
    entry: &Path,
    limits: &crate::EngineLimits,
    cpu_ms: Option<u64>,
    rss_mb: Option<usize>,
) -> Option<SandboxSpec> {
    let option = option?;
    let (explicit_read, explicit_write, net) = match option {
        SandboxOption::Flag(false) => return None,
        SandboxOption::Flag(true) => (None, None, None),
        SandboxOption::Tabel { read, write, net } => (read.as_deref(), write.as_deref(), *net),
    };

    let mut spec = SandboxSpec::default();

    let kelas = |permission: &Permission, explicit: Option<&[String]>| -> (bool, Vec<PathBuf>) {
        match permission {
            Permission::Deny => (true, Vec::new()),
            Permission::AllowAll => match explicit {
                Some(paths) => (false, paths.iter().map(PathBuf::from).collect()),
                None => (false, Vec::new()),
            },
            Permission::Allow(allowed) => {
                let canonical: Vec<PathBuf> = allowed
                    .iter()
                    .filter_map(|path| std::fs::canonicalize(path).ok())
                    .collect();
                let candidates: Vec<String> = match explicit {
                    Some(paths) => paths.to_vec(),
                    None => allowed.clone(),
                };
                let kept: Vec<PathBuf> = candidates
                    .iter()
                    .filter(|candidate| path_di_dalam(&canonical, candidate))
                    .map(PathBuf::from)
                    .collect();
                // Eksplisit meminta sandbox kelas ini: walau irisan kosong → tolak semua.
                let handle = explicit.is_some();
                (handle, kept)
            }
        }
    };

    let (handle_read, allow_read) = kelas(&effective.read, explicit_read);
    let (handle_write, allow_write) = kelas(&effective.write, explicit_write);
    spec.handle_read = handle_read;
    spec.allow_read = allow_read;
    spec.handle_write = handle_write;
    spec.allow_write = allow_write;
    spec.deny_net = match net {
        Some(value) => !value,
        None => matches!(effective.net, Permission::Deny),
    };

    // Auto-izin saat kelas baca ditangani: modul plugin (direktori entry), CA TLS (dibaca
    // saat fetch https), dan berkas /proc/self untuk sampler kuota CPU/RSS (ADR-0038/0051).
    if spec.handle_read || !spec.allow_read.is_empty() {
        if let Some(dir) = entry.parent() {
            spec.allow_read.push(dir.to_path_buf());
        }
        if let Some(ca) = &limits.tls_ca_file {
            spec.allow_read.push(ca.clone());
        }
        if cpu_ms.is_some() || rss_mb.is_some() {
            for path in ["/proc/self/task", "/proc/self/statm"] {
                let candidate = PathBuf::from(path);
                if candidate.exists() {
                    spec.allow_read.push(candidate);
                }
            }
        }
        spec.allow_read.sort();
        spec.allow_read.dedup();
    }

    if spec.is_noop() { None } else { Some(spec) }
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
    let forward_cpu = options.max_cpu_ms.or(limits.max_cpu_ms);
    if let Some(cpu) = forward_cpu {
        command.args(["--max-cpu-ms", &cpu.to_string()]);
    }
    let forward_rss = options.max_rss_mb.or(limits.max_rss_mb);
    if let Some(rss) = forward_rss {
        command.args(["--max-rss-mb", &rss.to_string()]);
    }

    // Sandbox OS opsional (ADR-0051): diteruskan sebagai flag kelas-eksplisit ke proses plugin.
    let entry_path = PathBuf::from(&entry);
    let sandbox_spec = resolve_sandbox(
        options.sandbox.as_ref(),
        &effective,
        &entry_path,
        &limits,
        forward_cpu,
        forward_rss,
    );
    if let Some(spec) = &sandbox_spec {
        let handle_read = spec.handle_read || !spec.allow_read.is_empty();
        let handle_write = spec.handle_write || !spec.allow_write.is_empty();
        if handle_read && spec.allow_read.is_empty() {
            command.arg("--sandbox-deny-read");
        }
        for path in &spec.allow_read {
            command.arg(format!("--sandbox-allow-read={}", path.display()));
        }
        if handle_write && spec.allow_write.is_empty() {
            command.arg("--sandbox-deny-write");
        }
        for path in &spec.allow_write {
            command.arg(format!("--sandbox-allow-write={}", path.display()));
        }
        if spec.deny_net {
            command.arg("--sandbox-deny-net");
        }
    }
    if let Some(ca) = &limits.tls_ca_file {
        command.arg("--tls-ca").arg(ca);
    }

    let policy = options.restart.as_ref().and_then(RestartSpec::policy);

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
    let stdin = child.stdin.take();
    let stdout = child.stdout.take();

    let supervised = policy.is_some();
    let hang_deadline = options.health_check.as_ref().and_then(HealthSpec::deadline);
    let plugin_state = Arc::new(Mutex::new(PluginState {
        spec,
        child: None,
        pid: None,
        stdin: None,
        messages: VecDeque::new(),
        dropped_messages: 0,
        generation: 0,
        generation_started: Instant::now(),
        generation_ended: false,
        read_error: None,
        hung_killed: false,
        supervisor_gave_up: false,
        supervised,
        stopped: false,
        restarts: 0,
        max_restarts: policy.map(|policy| policy.max_restarts).unwrap_or(0),
        base_delay: policy.map(|policy| policy.base_delay).unwrap_or_default(),
        max_delay: policy.map(|policy| policy.max_delay).unwrap_or_default(),
        stable_after: policy.map(|policy| policy.stable_after).unwrap_or_default(),
        last_exit: None,
        hang_deadline,
        hangs: 0,
        last_activity: Instant::now(),
        wake: Arc::new(Notify::new()),
    }));

    wire_generation(&plugin_state, child, stdin, stdout);

    if supervised {
        let state_for_supervisor = Arc::clone(&plugin_state);
        tokio::spawn(supervise(state_for_supervisor));
    }
    if hang_deadline.is_some() {
        let state_for_watchdog = Arc::clone(&plugin_state);
        tokio::spawn(watchdog(state_for_watchdog));
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
        {
            let mut plugin = plugin_state
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            if let Some(text) = plugin.messages.pop_front() {
                return Ok(MessageEnvelope { text: Some(text) });
            }
            if let Some(error) = plugin.read_error.take() {
                return Err(JsErrorBox::generic(error));
            }
        }

        // Deadline health-check — jalur sama dengan watchdog (idempoten per generasi).
        if enforce_hang_deadline(&plugin_state).await {
            continue;
        }

        let (terminal, ended, supervised, wake) = {
            let plugin = plugin_state
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            (
                plugin.terminal(),
                plugin.generation_ended,
                plugin.supervised,
                plugin.wake.clone(),
            )
        };
        if terminal {
            return Ok(MessageEnvelope { text: None });
        }
        if ended && !supervised {
            // Tanpa supervisi, EOF = selesai (perilaku lama, ADR-0043).
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
            next_backoff_ms: 0,
            dropped_messages: 0,
        });
    };
    let plugin = plugin
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    let next_backoff_ms = next_backoff(plugin.restarts, plugin.base_delay, plugin.max_delay)
        .as_millis()
        .min(u128::from(u64::MAX)) as u64;
    // Pada plugin tersupervisi handle `child` dipegang supervisor → indikator yang benar `pid`.
    let running = plugin.pid.is_some() && !plugin.generation_ended && !plugin.stopped;
    Ok(StatsEnvelope {
        restarts: plugin.restarts,
        running,
        stopped: plugin.stopped || plugin.terminal(),
        last_exit: plugin.last_exit,
        hangs: plugin.hangs,
        next_backoff_ms,
        dropped_messages: plugin.dropped_messages,
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
