# Protokol Benchmark — Ramonyx

- Status: **berlaku** (protokol Phase 0; diimplementasikan untuk HTTP/SSR/Web Vitals — ADR-0045/0048; baris matriks lain menyusul). Sumber: `docs/BLUEPRINT.md` §8.
- Aturan utama: **tidak ada klaim performa tanpa pengukuran yang bisa dijalankan.**

## 1. Prinsip

- Hardware, OS, versi runtime, dan konfigurasi **sama** untuk semua perbandingan — ditegakkan
  **baseline per-lingkungan** (ADR-0074): satu berkas baseline per (bench × platform × arch ×
  node-major × cpu), dan `--strict` menolak saat lingkungan berbeda.
- Handler melakukan pekerjaan identik dan menghasilkan response identik.
- Warm-up, lalu beberapa pengulangan independen.
- Laporkan **distribusi** (p50/p95/p99) + throughput + error rate + CPU + memori — bukan hanya rata-rata.
- Hasil disimpan sebagai artefak CI; regresi konsisten diselidiki sebelum rilis.
- Klaim UX (halaman cepat) diukur terpisah dengan Web Vitals di browser (Phase 2+).

## 1b. Baseline per-lingkungan & regenerasi (ADR-0074)

- Baseline disimpan di `benchmarks/results/baselines/<bench>-<env-key>.json` (mis.
  `http-linux-x64-node24-<cpu>.json`, `ssr-…`). Mesin berbeda **tidak** saling menimpa.
- Prosedur regenerasi: jalankan di mesin **tenang** → `pnpm bench` / `pnpm bench:ssr`
  (menulis baseline lingkungan itu) → commit berkasnya. Satu berkas = satu lingkungan.
- Baseline lama (`phase1-baseline.json`, `ssr-baseline.json`) dipertahankan sebagai fallback
  pembanding bila baseline lingkungan belum ada (dicatat di output).
- Gate: `pnpm bench:report` / `pnpm bench:ssr:report` (report-only, CI). `--strict` sahih
  **hanya** di lingkungan baseline — guard menolak lintas lingkungan (platform/arch/node/cpu).
- Keputusan CI: **tetap report-only** (GitHub-hosted runner tidak menjamin hardware sama antar-run).
  Jalur blocking: runner konsisten (self-hosted) → baseline di runner itu → `--strict` di sana.

## 2. Matriks benchmark

| Benchmark | Metrik | Variasi |
| --- | --- | --- |
| Router | Latency, throughput matching | 10 / 100 / 1.000 / 10.000 route |
| HTTP | Requests/s, p50/p95/p99 | Concurrency rendah → tinggi |
| Serialization | Waktu & alokasi memori | JSON kecil, besar, nested |
| SSR | Waktu render, TTFB, ukuran output | Halaman sederhana → kompleks |
| Startup | Cold start, warm start | App minimal vs besar |
| Memory | RSS & heap | Idle, steady load, burst |
| Build | Durasi & ukuran output | Cold build vs incremental |
| Stability | Error rate, pertumbuhan resource | Soak test berjam-jam |
| Security | Rejection rate & resource usage | Malformed input, oversized body, fuzz |

## 3. Alat

- [autocannon](https://github.com/mcollina/autocannon) — benchmark HTTP/1.1.
- [Grafana k6](https://grafana.com/docs/k6/latest/using-k6/thresholds/) — workload & threshold berbasis SLO.
- Web Vitals (Phase 2+): Lighthouse/Playwright.

## 4. Prosedur

1. Catat spesifikasi hardware/OS/versi runtime/konfigurasi di laporan.
2. Pastikan kesetaraan pekerjaan handler (dibuktikan, bukan diasumsikan — mis. response identik).
3. Warm-up, lalu beberapa pengulangan independen (jangan sekali jalan).
4. Catat distribusi latency, throughput, error rate, CPU, memori.
5. Uji keep-alive, payload bervariasi, beban realistis.
6. Simpan hasil; investigasi regresi yang konsisten.

## 5. Penyimpanan & CI

- Skrip per area di `benchmarks/<area>/` (router, http, scalar, ssr, startup, memory).
- Hasil JSON + ringkasan disimpan sebagai **artefak CI**.
- Baseline Phase 1 di-commit (mis. `benchmarks/results/phase1-baseline.json`) sebagai pembanding
  regresi. Bench HTTP kini menerapkan prosedur ini: **warm-up 3 s (dibuang) + 5 ulangan**,
  artefak = median antar-run + `spread` (`pnpm bench` memperbarui baseline secara eksplisit).
- **Mode report-only** (`pnpm bench:report`) membandingkan hasil vs baseline **tanpa** menimpanya
  (toleransi 25%, belum memblokir) dan dipakai langkah CI non-blocking — ADR-0045.
- Bench SSR (`pnpm bench:ssr`, `benchmarks/ssr/bench.tsx`) memakai prosedur sama: warm-up 3 +
  **9 ulangan**, median + `spread`, GC eksplisit (`--expose-gc`); in-process (tanpa socket);
  paritas byte-per-byte sinkron vs streaming + skenario suspense; baseline
  `benchmarks/results/ssr-baseline.json`, report-only `pnpm bench:ssr:report` (lantai delta
  absolut 1 ms) — ADR-0048.
- Web Vitals (Phase 2): baseline `benchmarks/results/phase2-web-vitals.json` — **median 3 load**
  (1 load pemanasan dibuang), diperbarui via `UPDATE_BASELINE_VITALS=1`; run biasa menulis
  `test-results/web-vitals-latest.json` + perbandingan report-only (toleransi 25%) dan ambang
  absolut LCP ≤ 2500 / FCP ≤ 1800 / TTFB ≤ 800 / CLS ≤ 0,1 (`VITALS_STRICT=1` memblokir) — ADR-0048.
- Abuse-case & soak (Phase 3): `benchmarks/results/phase3-abuse.json` (`pnpm bench:security`,
  `SOAK_SECONDS=<detik>` untuk durasi) — skenario serangan + RSS proses server (anak) via `/proc`
  **dan breakdown `heapUsed`/`external`/`arrayBuffers`**; CI meng-upload seluruh
  `benchmarks/results/` sebagai artefak. Interpretasi: `external` datar = tidak ada kebocoran
  native; heap sawtooth = GC periodik (RSS high-water karena GC malas — batasi heap di produksi).

## 6. Acceptance criteria (target eksperimen — bukan hasil)

| Area | Kriteria awal |
| --- | --- |
| Framework overhead | Ukur baseline routing + middleware minimal terlebih dahulu |
| HTTP reliability | Contoh target error rate <1% pada workload valid; sesuaikan untuk production |
| Tail latency | Tetapkan batas p95/p99 per workload setelah baseline ada |
| Memory stability | Tidak ada pertumbuhan memori tak terkendali pada soak test |
| Correctness | Response & error behavior sesuai spesifikasi |
| Security | Semua security acceptance test yang ditetapkan lulus |

Angka final ditetapkan per workload setelah baseline Phase 1 ada. SLO produksi mengikuti kebutuhan
aplikasi masing-masing.
