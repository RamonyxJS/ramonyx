//! Metrik op untuk profiling (R4/ADR-0037).
//!
//! Aktif **hanya** bila `EngineOptions.op_metrics = true` (tanpa biaya saat mati).
//! Mencatat jumlah dispatch/error dan waktu wall-clock per op. Waktu adalah waktu
//! "in-flight" op (termasuk op lain yang dipanggil di dalamnya secara sinkron) —
//! berguna untuk mencari hotspot, bukan untuk profiler presisi.

use std::cell::RefCell;
use std::collections::HashMap;
use std::rc::Rc;
use std::time::{Duration, Instant};

use deno_core::{OpMetricsEvent, OpMetricsFactoryFn, OpMetricsFn};

#[derive(Default)]
struct OpStat {
    dispatched: u64,
    completed: u64,
    errors: u64,
    total: Duration,
    in_flight: u64,
    started: Option<Instant>,
}

/// Satu baris laporan metrik.
#[derive(Debug, Clone)]
pub struct OpMetricEntry {
    pub op: &'static str,
    pub dispatched: u64,
    pub errors: u64,
    pub total: Duration,
}

/// State metrik (per engine; dibagikan ke callback deno_core).
#[derive(Default)]
pub struct OpMetricsState {
    ops: HashMap<&'static str, OpStat>,
}

impl OpMetricsState {
    /// Entri terurut dari waktu terbesar ke terkecil.
    pub fn entries(&self) -> Vec<OpMetricEntry> {
        let mut entries: Vec<OpMetricEntry> = self
            .ops
            .iter()
            .map(|(op, stat)| OpMetricEntry {
                op,
                dispatched: stat.dispatched,
                errors: stat.errors,
                total: stat.total,
            })
            .collect();
        entries.sort_by(|a, b| b.total.cmp(&a.total).then(a.op.cmp(b.op)));
        entries
    }
}

/// Handle metrik yang dipegang engine (dibaca setelah eksekusi).
pub type MetricsHandle = Rc<RefCell<OpMetricsState>>;

/// Factory callback deno_core: satu closure metrik per op.
pub fn factory(state: MetricsHandle) -> OpMetricsFactoryFn {
    Box::new(move |_op_id, _count, decl| {
        let name = decl.name;
        let state = state.clone();
        let callback: OpMetricsFn = Rc::new(move |_ctx, event, _source| {
            let mut metrics = state.borrow_mut();
            let stat = metrics.ops.entry(name).or_default();
            match event {
                OpMetricsEvent::Dispatched => {
                    stat.dispatched += 1;
                    if stat.in_flight == 0 {
                        stat.started = Some(Instant::now());
                    }
                    stat.in_flight += 1;
                }
                OpMetricsEvent::Completed | OpMetricsEvent::CompletedAsync => {
                    stat.completed += 1;
                    stat.in_flight = stat.in_flight.saturating_sub(1);
                    if stat.in_flight == 0
                        && let Some(started) = stat.started.take()
                    {
                        stat.total += started.elapsed();
                    }
                }
                OpMetricsEvent::Error | OpMetricsEvent::ErrorAsync => {
                    stat.errors += 1;
                    stat.in_flight = stat.in_flight.saturating_sub(1);
                    if stat.in_flight == 0 {
                        stat.started = None;
                    }
                }
            }
        });
        Some(callback)
    })
}

/// Waktu eksekusi terakhir (R4): load modul, evaluasi, dan total.
#[derive(Debug, Clone, Copy, Default)]
pub struct ExecutionTimings {
    pub load: Duration,
    pub evaluate: Duration,
    pub total: Duration,
}

/// Rincian inisialisasi engine (R4): isolate/deno_core vs bootstrap vs web shim.
#[derive(Debug, Clone, Copy, Default)]
pub struct InitTimings {
    /// `JsRuntime::new` (isolate V8 + deno_core init; termasuk init platform V8 sekali per proses).
    pub runtime: Duration,
    /// Eksekusi script bootstrap (`globalThis.ramonyx`, AbortController, console).
    pub bootstrap: Duration,
    /// Eksekusi web shim (URL/Headers/ReadableStream/fetch/timers/MessageChannel/crypto).
    pub web_shim: Duration,
    /// Total inisialisasi engine.
    pub total: Duration,
}
