# Protokol Benchmark — Ramonyx

- Status: Phase 0. Sumber: `docs/BLUEPRINT.md` §8.
- Aturan utama: **tidak ada klaim performa tanpa pengukuran yang bisa dijalankan.**

## 1. Prinsip

- Hardware, OS, versi runtime, dan konfigurasi **sama** untuk semua perbandingan.
- Handler melakukan pekerjaan identik dan menghasilkan response identik.
- Warm-up, lalu beberapa pengulangan independen.
- Laporkan **distribusi** (p50/p95/p99) + throughput + error rate + CPU + memori — bukan hanya rata-rata.
- Hasil disimpan sebagai artefak CI; regresi konsisten diselidiki sebelum rilis.
- Klaim UX (halaman cepat) diukur terpisah dengan Web Vitals di browser (Phase 2+).

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
- Baseline Phase 1 di-commit (mis. `benchmarks/results/phase1-baseline.json`) sebagai pembanding regresi.
- Web Vitals (Phase 2): `benchmarks/results/phase2-web-vitals.json` dari spec e2e (artefak,
  bukan klaim; threshold per workload menyusul).

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
