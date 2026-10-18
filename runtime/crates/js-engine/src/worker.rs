//! Isolasi worker + kuota (ADR-0034).
//!
//! Satu worker = **isolate V8 + tokio runtime + thread OS sendiri**, dijalankan dari thread
//! terpisah dengan kuota sendiri (`maxHeapMb`/`timeoutMs` dari ADR-0033) dan **permission
//! iris** dengan induk (anti-eskalasi: worker tidak pernah lebih longgar dari induk).
//! Pesan antar sisi adalah **JSON** lewat channel async (bukan structured clone — dicatat).
//!
//! Kill switch: `worker.terminate()` men-`terminate_execution()` isolate worker (thread-safe),
//! membangunkan `receive()` yang pending, dan menutup kedua arah channel.

use std::cell::RefCell;
use std::collections::HashMap;
use std::path::PathBuf;
use std::rc::Rc;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};

use deno_core::{OpState, op2, v8};
use deno_error::JsErrorBox;
use runtime_core::{Permission, Permissions};
use serde::Deserialize;
use tokio::sync::mpsc::{UnboundedReceiver, UnboundedSender, unbounded_channel};
use tokio::sync::{Notify, oneshot};

use crate::{Engine, EngineOptions};

/// Batas ukuran satu pesan (JSON) antar worker ↔ induk.
const MAX_MESSAGE_BYTES: usize = 1024 * 1024;

/// Batas jumlah worker aktif per proses (jaga-jaga fork bomb).
const MAX_WORKERS: usize = 8;

/// Opsi supervisi restart plugin (`restart: true` atau `{ maxRestarts, delayMs }`) — ADR-0043.
#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(untagged)]
pub enum RestartSpec {
    Flag(bool),
    Tabel {
        #[serde(rename = "maxRestarts")]
        max_restarts: Option<u32>,
        #[serde(rename = "delayMs")]
        delay_ms: Option<u64>,
        #[serde(rename = "backoffMaxMs")]
        backoff_max_ms: Option<u64>,
        #[serde(rename = "stableAfterMs")]
        stable_after_ms: Option<u64>,
    },
}

/// Kebijakan supervisi hasil normalisasi `RestartSpec` (ADR-0043 + backoff eksponensial ADR-0050).
#[derive(Debug, Clone, Copy)]
pub(crate) struct RestartPolicy {
    pub(crate) max_restarts: u32,
    /// Delay dasar: restart ke-n menunggu `min(base · 2^n, max_delay)`.
    pub(crate) base_delay: std::time::Duration,
    pub(crate) max_delay: std::time::Duration,
    /// Generasi yang hidup ≥ durasi ini dianggap stabil → kuota restart di-reset.
    pub(crate) stable_after: std::time::Duration,
}

impl RestartSpec {
    /// `None` bila supervisi dimatikan.
    pub(crate) fn policy(&self) -> Option<RestartPolicy> {
        use std::time::Duration;
        match self {
            Self::Flag(false) => None,
            Self::Flag(true) => Some(RestartPolicy {
                max_restarts: 3,
                base_delay: Duration::from_millis(100),
                max_delay: Duration::from_secs(30),
                stable_after: Duration::from_secs(60),
            }),
            Self::Tabel {
                max_restarts,
                delay_ms,
                backoff_max_ms,
                stable_after_ms,
            } => Some(RestartPolicy {
                max_restarts: max_restarts.unwrap_or(3),
                base_delay: Duration::from_millis(delay_ms.unwrap_or(100)),
                max_delay: Duration::from_millis(backoff_max_ms.unwrap_or(30_000)),
                stable_after: Duration::from_millis(stable_after_ms.unwrap_or(60_000)),
            }),
        }
    }
}

/// Opsi `ramonyx.worker(entry, options)` / `ramonyx.spawn(entry, options)`.
#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct WorkerOptions {
    /// Permission yang diminta worker/plugin; **default deny-all**; selalu diiris dengan
    /// permission induk.
    pub(crate) allow: Option<WorkerAllow>,
    /// Kuota heap V8 (MiB); default mengikuti induk.
    pub(crate) max_heap_mb: Option<usize>,
    /// Batas waktu wall-clock (ms); default tanpa batas (worker) / diteruskan sebagai flag (plugin).
    pub(crate) timeout_ms: Option<u64>,
    /// Kuota CPU (ms); default mengikuti induk (plugin meneruskan sebagai flag).
    pub(crate) max_cpu_ms: Option<u64>,
    /// Kuota RSS (MiB); default mengikuti induk (plugin meneruskan sebagai flag).
    pub(crate) max_rss_mb: Option<usize>,
    /// Supervisi restart **plugin** (proses); diabaikan worker (thread) — ADR-0043.
    pub(crate) restart: Option<RestartSpec>,
    /// Health-check plugin (ADR-0044/0050): `true` (5 s) atau `{ deadlineMs }`. Deteksi senyap
    /// **otomatis** via watchdog latar (tidak perlu induk sedang menunggu `receive`); plugin
    /// terwell-behaved mengirim `ramonyx.heartbeat()` secara berkala.
    pub(crate) health_check: Option<HealthSpec>,
}

/// Opsi health-check (`healthCheck: true | { deadlineMs }`).
#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(untagged)]
pub enum HealthSpec {
    Flag(bool),
    Tabel {
        #[serde(rename = "deadlineMs")]
        deadline_ms: Option<u64>,
    },
}

impl HealthSpec {
    /// `None` bila dimatikan; selain itu deadline senyap.
    pub(crate) fn deadline(&self) -> Option<std::time::Duration> {
        match self {
            Self::Flag(false) => None,
            Self::Flag(true) => Some(std::time::Duration::from_secs(5)),
            Self::Tabel { deadline_ms } => Some(std::time::Duration::from_millis(
                deadline_ms.unwrap_or(5000),
            )),
        }
    }
}

#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub(crate) struct WorkerAllow {
    read: Option<PermissionSpec>,
    write: Option<PermissionSpec>,
    net: Option<PermissionSpec>,
    env: Option<PermissionSpec>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(untagged)]
enum PermissionSpec {
    Flag(bool),
    List(Vec<String>),
}

impl PermissionSpec {
    fn to_permission(&self) -> Permission {
        match self {
            Self::Flag(true) => Permission::AllowAll,
            Self::Flag(false) => Permission::Deny,
            Self::List(list) => Permission::Allow(list.clone()),
        }
    }
}

pub(crate) fn resolve_permissions(
    parent: &Permissions,
    allow: Option<&WorkerAllow>,
) -> Permissions {
    let requested = |spec: Option<&PermissionSpec>| {
        spec.map(PermissionSpec::to_permission)
            .unwrap_or(Permission::Deny)
    };
    Permissions {
        read: parent
            .read
            .intersect(&requested(allow.and_then(|value| value.read.as_ref()))),
        write: parent
            .write
            .intersect(&requested(allow.and_then(|value| value.write.as_ref()))),
        net: parent
            .net
            .intersect(&requested(allow.and_then(|value| value.net.as_ref()))),
        env: parent
            .env
            .intersect(&requested(allow.and_then(|value| value.env.as_ref()))),
    }
}

pub struct WorkerHandle {
    to_worker: UnboundedSender<String>,
    from_worker: Option<UnboundedReceiver<String>>,
    isolate: v8::IsolateHandle,
    closed: Arc<AtomicBool>,
    closed_notify: Arc<Notify>,
}

/// Registry worker milik engine induk.
#[derive(Default)]
pub struct WorkerRegistry {
    next_id: u64,
    workers: HashMap<u64, WorkerHandle>,
}

/// Kanal sisi-worker (ada di semua engine; `to_parent` hanya terisi di dalam worker).
#[derive(Default)]
pub struct WorkerSelfChannel {
    pub(crate) to_parent: Option<UnboundedSender<String>>,
    pub(crate) from_parent: Option<UnboundedReceiver<String>>,
}

/// Amplop pesan untuk return op2 (Option<String> tidak didukung langsung).
#[derive(serde::Serialize)]
struct WorkerMessage {
    text: Option<String>,
}

fn check_message_size(text: &str) -> Result<(), JsErrorBox> {
    if text.len() > MAX_MESSAGE_BYTES {
        return Err(JsErrorBox::generic(format!(
            "pesan melebihi batas {} KiB antar worker",
            MAX_MESSAGE_BYTES / 1024
        )));
    }
    Ok(())
}

/// Spawn worker: engine + isolate baru di thread terpisah.
#[op2(async(lazy))]
#[serde]
pub async fn op_worker_spawn(
    state: Rc<RefCell<OpState>>,
    #[string] entry: String,
    #[serde] options: WorkerOptions,
) -> Result<u64, JsErrorBox> {
    let (parent_permissions, parent_heap, parent_ca, parent_cpu, parent_rss, id) = {
        let mut state = state.borrow_mut();
        let permissions = state.borrow::<Permissions>().clone();
        let parent_limits = state.borrow::<crate::EngineLimits>();
        let parent_heap = parent_limits.max_heap_mb;
        let parent_ca = parent_limits.tls_ca_file.clone();
        let parent_cpu = parent_limits.max_cpu_ms;
        let parent_rss = parent_limits.max_rss_mb;
        let registry = state.borrow_mut::<WorkerRegistry>();
        if registry.workers.len() >= MAX_WORKERS {
            return Err(JsErrorBox::generic(format!(
                "batas jumlah worker aktif ({MAX_WORKERS}) tercapai"
            )));
        }
        registry.next_id += 1;
        (
            permissions,
            parent_heap,
            parent_ca,
            parent_cpu,
            parent_rss,
            registry.next_id,
        )
    };

    let child_options = EngineOptions {
        // Anti-eskalasi: permission worker = irisan permission induk dengan yang diminta.
        permissions: resolve_permissions(&parent_permissions, options.allow.as_ref()),
        max_heap_mb: options.max_heap_mb.or(parent_heap),
        timeout: options.timeout_ms.map(std::time::Duration::from_millis),
        // CA TLS diwarisi dari induk (bukan di-override per worker).
        tls_ca_file: parent_ca,
        // Metrik op cukup di induk; worker tidak perlu overhead.
        op_metrics: false,
        // Kuota CPU/RSS diwarisi dari induk (pelindung proses yang sama).
        max_cpu_ms: parent_cpu,
        max_rss_mb: parent_rss,
        ipc_stdio: false,
    };

    let (to_worker_tx, to_worker_rx) = unbounded_channel::<String>();
    let (from_worker_tx, from_worker_rx) = unbounded_channel::<String>();
    let (ready_tx, ready_rx) = oneshot::channel::<Result<v8::IsolateHandle, String>>();

    let entry_path = PathBuf::from(&entry);
    std::thread::spawn(move || {
        let mut engine = match Engine::with_options(child_options) {
            Ok(engine) => engine,
            Err(error) => {
                let _ = ready_tx.send(Err(format!("inisialisasi worker gagal: {error}")));
                return;
            }
        };
        let isolate = engine.worker_isolate_handle();
        if ready_tx.send(Ok(isolate)).is_err() {
            return; // induk sudah pergi sebelum worker siap
        }
        engine.put_worker_channel(WorkerSelfChannel {
            to_parent: Some(from_worker_tx),
            from_parent: Some(to_worker_rx),
        });
        if let Err(error) = engine.execute_module(&entry_path) {
            eprintln!(
                "worker {} selesai dengan error: {error}",
                entry_path.display()
            );
        }
    });

    let isolate = match ready_rx.await {
        Ok(Ok(isolate)) => isolate,
        Ok(Err(message)) => return Err(JsErrorBox::generic(message)),
        Err(_) => {
            return Err(JsErrorBox::generic(
                "worker gagal dimulai (thread berhenti)",
            ));
        }
    };

    let mut state = state.borrow_mut();
    let registry = state.borrow_mut::<WorkerRegistry>();
    registry.workers.insert(
        id,
        WorkerHandle {
            to_worker: to_worker_tx,
            from_worker: Some(from_worker_rx),
            isolate,
            closed: Arc::new(AtomicBool::new(false)),
            closed_notify: Arc::new(tokio::sync::Notify::new()),
        },
    );
    Ok(id)
}

/// Kirim pesan JSON ke worker.
#[op2(fast)]
pub fn op_worker_send(
    state: &mut OpState,
    #[smi] worker_id: u64,
    #[string] text: String,
) -> Result<(), JsErrorBox> {
    check_message_size(&text)?;
    let registry = state.borrow::<WorkerRegistry>();
    let Some(handle) = registry.workers.get(&worker_id) else {
        return Err(JsErrorBox::generic(format!(
            "worker {worker_id} tidak ada / sudah berhenti"
        )));
    };
    handle
        .to_worker
        .send(text)
        .map_err(|_| JsErrorBox::generic(format!("worker {worker_id} sudah berhenti")))
}

/// Terima pesan JSON dari worker; `text: null` bila worker sudah selesai/dihentikan.
#[op2(async(lazy), fast)]
#[serde]
pub async fn op_worker_receive(
    state: Rc<RefCell<OpState>>,
    #[smi] worker_id: u64,
) -> Result<WorkerMessage, JsErrorBox> {
    let (mut receiver, closed, closed_notify) = {
        let mut op_state = state.borrow_mut();
        let registry = op_state.borrow_mut::<WorkerRegistry>();
        let Some(handle) = registry.workers.get_mut(&worker_id) else {
            return Ok(WorkerMessage { text: None });
        };
        let Some(receiver) = handle.from_worker.take() else {
            return Err(JsErrorBox::generic(
                "receive sudah berjalan untuk worker ini",
            ));
        };
        (
            receiver,
            handle.closed.clone(),
            handle.closed_notify.clone(),
        )
    };

    let result = loop {
        // Daftarkan `notified` DULU, baru cek flag (menghindari race notify_waiters).
        let notified = closed_notify.notified();
        if closed.load(Ordering::SeqCst) {
            break None;
        }
        tokio::select! {
            message = receiver.recv() => break message,
            () = notified => {
                if closed.load(Ordering::SeqCst) {
                    break None;
                }
            }
        }
    };

    let mut op_state = state.borrow_mut();
    let registry = op_state.borrow_mut::<WorkerRegistry>();
    if let Some(handle) = registry.workers.get_mut(&worker_id) {
        handle.from_worker = Some(receiver);
    }
    Ok(WorkerMessage { text: result })
}

/// Hentikan worker: terminasi isolate (thread-safe) + tutup kedua arah channel. Idempoten.
#[op2(fast)]
pub fn op_worker_terminate(state: &mut OpState, #[smi] worker_id: u64) -> Result<(), JsErrorBox> {
    let registry = state.borrow_mut::<WorkerRegistry>();
    let Some(handle) = registry.workers.remove(&worker_id) else {
        return Ok(());
    };
    handle.closed.store(true, Ordering::SeqCst);
    handle.closed_notify.notify_waiters();
    handle.isolate.terminate_execution();
    // Menutup `to_worker`/`from_worker` → `receive()` di kedua sisi berakhir.
    drop(handle);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn permission_worker_diiris_dengan_induk() {
        let parent = Permissions::allow_all();
        let requested = WorkerAllow {
            read: Some(PermissionSpec::List(vec!["/tmp".to_string()])),
            ..Default::default()
        };
        let resolved = resolve_permissions(&parent, Some(&requested));
        assert_eq!(resolved.read, Permission::Allow(vec!["/tmp".to_string()]));
        assert_eq!(resolved.net, Permission::Deny, "default worker = deny-all");

        let parent = Permissions {
            read: Permission::Allow(vec!["/data".to_string()]),
            ..Default::default()
        };
        let resolved = resolve_permissions(&parent, Some(&requested));
        assert!(
            resolved.read == Permission::Deny,
            "permintaan di luar izin induk harus kosong: {resolved:?}"
        );

        let parent = Permissions::default();
        let resolved = resolve_permissions(&parent, Some(&requested));
        assert_eq!(resolved.read, Permission::Deny, "induk deny → worker deny");
    }
}
