---
adr: 0037
title: "R4 — Profiling Startup (Timings + Metrik Op + Baseline)"
visibility: internal
---

# ADR-0037: R4 — Profiling Startup (Timings + Metrik Op + Baseline)

- Status: Accepted (2026-10-18)
- Tanggal: 2026-10-18
- Sumber: BLUEPRINT §8 (benchmark: distribusi, bukan rata-rata) & §9 (Phase 5: profiling),
  §10 (disiplin klaim)

## Konteks

"Optimasi startup" tanpa instrumentasi adalah tebakan. R4 dimulai dengan membuat waktu startup
**terukur dan dapat dilaporkan** — per fase, bukan satu angka gelap — plus baseline yang dapat
diulang di mesin siapa pun.

## Keputusan

### Timings per eksekusi

- `Engine::last_timings()` → `ExecutionTimings { load, evaluate, total }`:
  - `load` = resolusi + baca + transpile modul (via loader);
  - `evaluate` = evaluasi modul + event loop sampai selesai;
  - `total` = wall-clock sejak eksekusi dimulai.
- CLI mencatatkan `engine.executed` dengan `startupMs` (inisialisasi engine: V8 + bootstrap +
  web shim) dan `timings` (`loadMs`/`evalMs`/`totalMs`) — angka yang sama terlihat di log
  terstruktur, bukan hanya di bench.

### Metrik op opsional (`--op-metrics` / `EngineOptions.op_metrics`)

- Memakai `RuntimeOptions::op_metrics_factory_fn` (deno_core): per op mencatat
  **jumlah dispatch/error** dan **waktu in-flight** (wall-clock sejak dispatch pertama sampai
  selesai; op lain yang dipanggil di dalamnya ikut terhitung).
- **Mati secara default** — tanpa callback metrik, jadi tanpa biaya saat tidak dipakai
  (diverifikasi test: `op_metrics()` kosong).
- CLI mencetak `runtime.metrics` (15 op teratas per waktu) setelah eksekusi.

### Baseline yang dapat diulang

- `benchmarks/runtime-startup.sh` menjalankan binary release N kali (`RUNS`, default 7) untuk
  3 skenario — `mini`, `mini --op-metrics`, dan `four-workers` (4 worker paralel) — lalu menulis
  `benchmarks/results/runtime-startup.json` berisi **median/min/max** (bukan rata-rata, sesuai
  BLUEPRINT §8).

## Baseline (mesin dev, release build — bukan klaim publik)

Perangkat: mesin dev (Linux), `cargo build --release -p ramonyx-runtime-cli`, `RUNS=7`,
**median (min–maks)**; tanpa pemisahan warm-up. Hasil lengkap:
`benchmarks/results/runtime-startup.json`.

| Skenario | Wall proses | `startupMs` | rincian init: `v8Ms` / `bootstrapMs` / `webShimMs` | `loadMs` | `evalMs` | `totalMs` |
| --- | --- | --- | --- | --- | --- | --- |
| `mini` (console.log) | 42.2 ms (40.0–49.0) | 31.4 ms | **28.6** / 0.78 / 1.57 | 0.36 | 0.31 | 0.62 ms |
| `mini --op-metrics` | 45.4 ms (42.9–48.5) | 34.1 ms | 30.7 / 0.70 / 2.04 | 0.35 | 0.28 | 0.61 ms |
| `four-workers` (4 worker) | 84.5 ms (83.0–91.0) | 29.9 ms | 26.7 / 0.74 / 1.95 | 0.41 | 38.7 | 38.7 ms |

## Temuan

- **Inisialisasi V8/deno_core = 91% dari `startupMs`** (`v8Ms` 26.7–30.7 ms): platform V8 (sekali
  per proses) + isolate + deno_core init. `bootstrapMs` + `webShimMs` hanya **~2.4 ms (7.5%)**;
  load+evaluasi skrip kecil < 1 ms.
- **4 worker** menambah ~39 ms dari ~42 ms baseline (~9.7 ms marginal per isolate) — jumlah yang
  konsisten dengan biaya isolate (platform sudah ter-init), bukan biaya script.
- **Overhead `--op-metrics` tidak terukur** pada sampel ini (selisih di dalam noise). Tetap
  default mati karena biaya per-dispatch tidak gratis untuk beban besar.

## Investigasi kandidat optimasi: V8 startup snapshot (dilanjutkan 2026-10-18)

Snapshot startup (bootstrap + web shim ter-bake) dievaluasi terhadap angka di atas:

- **Plafon keuntungan ≈ 2.35 ms per isolate** (`bootstrapMs` + `webShimMs`): ~5.6% wall CLI
  satu-run, ~7.5% dari init, ~24% dari biaya marginal per worker.
- **Jalur build-time di Cargo ditolak mesin**: `build.rs` butuh mengeksekusi snapshot-builder
  yang menggunakan crate ini sendiri → Cargo menolak **cyclic package dependency**
  (`js-engine` build-dep `js-engine`). Jalur alternatif (crate builder terpisah + graph
  dependency kedua, atau artefak snapshot per-platform yang di-generate lebih dulu) menambah
  kompleksitas build yang nyata untuk keuntungan di bawah 10%.
- **Keputusan: snapshot tidak dikerjakan sekarang** (ditolak dengan alasan terukur, bukan
  diabaikan). Kandidat optimasi berikutnya yang lebih tepat sasaran: **warm worker pool**
  (menghilangkan ~10 ms per worker) dan/atau penerimaan biaya platform V8 sekali per proses
  sebagai sifat runtime.

## Batasan yang dicatat jujur

- Angka baseline dari **satu mesin dev**, tanpa isolasi CPU; bukan klaim publik dan tidak
  dibandingkan dengan runtime lain.
- Waktu op adalah **wall-clock in-flight**, bukan atribusi CPU presisi; op async yang tumpang
  tindih membuat rentang waktu antar-op saling mengandung. Untuk profiling presisi, V8
  `--prof`/sampling profiler adalah jalur lanjutan (belum diekspos).
- Timings mengukur eksekusi terakhir per engine (bukan histogram kumulatif).

## Alternatif yang ditolak

- **Langsung optimasi (snapshot V8) tanpa pengukuran**: berisiko besar untuk keuntungan yang
  belum diukur; baseline ini menentukan apakah snapshot memang menjawab hotspot.
- **Mengaktifkan metrik op selamanya**: biaya per-dispatch tidak sepadan untuk produksi.

## Konsekuensi

- R4 paruh pertama (profiling + baseline + prosedur) selesai; kandidat optimasi (snapshot
  startup, worker pool) kini punya angka pembanding untuk membuktikan keuntungannya.
- Regresi startup ke depan dapat dideteksi dengan menjalankan ulang skrip baseline dan
  membandingkan JSON-nya.
