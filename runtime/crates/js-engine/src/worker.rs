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

/// Opsi `ramonyx.worker(entry, options)`.
#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct WorkerOptions {
    /// Permission yang diminta worker; **default deny-all**; selalu diiris dengan permission induk.
    allow: Option<WorkerAllow>,
    /// Kuota heap V8 worker (MiB); default mengikuti induk.
    max_heap_mb: Option<usize>,
    /// Batas waktu wall-clock worker (ms); default tanpa batas.
    timeout_ms: Option<u64>,
}

#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
struct WorkerAllow {
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

fn resolve_permissions(parent: &Permissions, allow: Option<&WorkerAllow>) -> Permissions {
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
    to_parent: Option<UnboundedSender<String>>,
    from_parent: Option<UnboundedReceiver<String>>,
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
    let (parent_permissions, parent_heap, parent_ca, id) = {
        let mut state = state.borrow_mut();
        let permissions = state.borrow::<Permissions>().clone();
        let parent_limits = state.borrow::<crate::EngineLimits>();
        let parent_heap = parent_limits.max_heap_mb;
        let parent_ca = parent_limits.tls_ca_file.clone();
        let registry = state.borrow_mut::<WorkerRegistry>();
        if registry.workers.len() >= MAX_WORKERS {
            return Err(JsErrorBox::generic(format!(
                "batas jumlah worker aktif ({MAX_WORKERS}) tercapai"
            )));
        }
        registry.next_id += 1;
        (permissions, parent_heap, parent_ca, registry.next_id)
    };

    let child_options = EngineOptions {
        // Anti-eskalasi: permission worker = irisan permission induk dengan yang diminta.
        permissions: resolve_permissions(&parent_permissions, options.allow.as_ref()),
        max_heap_mb: options.max_heap_mb.or(parent_heap),
        timeout: options.timeout_ms.map(std::time::Duration::from_millis),
        // CA TLS diwarisi dari induk (bukan di-override per worker).
        tls_ca_file: parent_ca,
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

/// Kirim pesan ke induk (hanya dari dalam worker).
#[op2(fast)]
pub fn op_worker_self_send(state: &mut OpState, #[string] text: String) -> Result<(), JsErrorBox> {
    check_message_size(&text)?;
    let channel = state.borrow_mut::<WorkerSelfChannel>();
    let Some(sender) = channel.to_parent.as_ref() else {
        return Err(JsErrorBox::generic(
            "ramonyx.parent hanya tersedia di dalam worker",
        ));
    };
    sender
        .send(text)
        .map_err(|_| JsErrorBox::generic("induk sudah berhenti (pesan tidak terkirim)"))
}

/// Terima pesan dari induk (hanya di dalam worker); `text: null` bila induk menutup channel.
#[op2(async(lazy), fast)]
#[serde]
pub async fn op_worker_self_receive(
    state: Rc<RefCell<OpState>>,
) -> Result<WorkerMessage, JsErrorBox> {
    let mut receiver = {
        let mut op_state = state.borrow_mut();
        let channel = op_state.borrow_mut::<WorkerSelfChannel>();
        let Some(receiver) = channel.from_parent.take() else {
            return Err(JsErrorBox::generic(
                "ramonyx.parent hanya tersedia di dalam worker",
            ));
        };
        receiver
    };

    let result = receiver.recv().await;

    let mut op_state = state.borrow_mut();
    let channel = op_state.borrow_mut::<WorkerSelfChannel>();
    channel.from_parent = Some(receiver);
    Ok(WorkerMessage { text: result })
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
