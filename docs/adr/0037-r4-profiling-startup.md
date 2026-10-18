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

| Skenario | Wall proses | `startupMs` (init engine) | `loadMs` | `evalMs` | `totalMs` |
| --- | --- | --- | --- | --- | --- |
| `mini` (console.log) | 49.7 ms (45.2–62.3) | 34.9 ms (31.7–39.5) | 0.42 | 0.38 | 0.83 ms (0.55–1.1) |
| `mini --op-metrics` | 49.5 ms (44.2–56.1) | 37.0 ms (31.1–44.0) | 0.31 | 0.29 | 0.62 ms (0.51–0.85) |
| `four-workers` (4 worker) | 90.5 ms (88.8–93.9) | 33.7 ms (32.2–36.0) | 0.45 | 39.1 | 39.5 ms (38.4–42.9) |

## Temuan

- **Startup didominasi inisialisasi engine (V8/deno_core): ~35 ms dari ~50 ms wall (~70%)**,
  sedangkan load+evaluasi skrip kecil < 1 ms dan sisanya (~15 ms) proses/CLI. Bootstrap + web
  shim per isolate hanya sebagian kecil dari 35 ms tersebut.
- **4 worker** menambah ~40 ms total (~10 ms marginal per isolate) — angka inilah yang akan
  dipangkas oleh **V8 startup snapshot** dan/atau worker pool (kandidat optimasi berikutnya,
  belum dikerjakan).
- **Overhead `--op-metrics` tidak terukur** pada sampel 7 run ini (selisih di dalam noise;
  median justru lebih rendah). Klaim yang jujur: tidak ada bukti biaya signifikan untuk skrip
  kecil; tetap dimatikan secara default karena biaya per-dispatch tidak gratis.

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
