# ADR-0045: Performance Regression Gate (Report-Only)

- Status: Accepted (2026-10-18)
- Tanggal: 2026-10-18
- Sumber: audit implementasi (`docs/IMPLEMENTATION_STATUS.md` §4/§10), BLUEPRINT §8/§10

## Konteks

Benchmark HTTP sudah ada (`benchmarks/http/bench.ts`, baseline
`benchmarks/results/phase1-baseline.json`), tetapi CI hanya mengunggah artefak — tidak ada
deteksi regresi. Audit mencatat ini sebagai gap P1/P2 prioritas: "bandingkan p50/p90 tanpa
menimpa baseline".

## Keputusan

- **Mode report-only** pada bench HTTP: `--out <path>` + `--compare [--baseline <path>]
  [--tolerance-pct <n>] [--strict]`.
  - Baseline **dibaca sebelum** penulisan apa pun, sehingga `--compare` tetap bermakna walau
    tujuan tulis sama dengan baseline (perilaku lama `pnpm bench` = update baseline tetap ada,
    eksplisit).
  - Perbandingan murni ada di `benchmarks/http/compare.ts` (fungsi tanpa I/O → diuji unit):
    latency p50/p90/p99 **naik** > toleransi = regresi; **requests/detik turun** > toleransi =
    regresi; baseline 0/invalid dilewati (tanpa pembagian nol).
  - Default **tidak memblokir** (exit 0); `--strict` menyediakan exit 1 untuk kelak ketika
    threshold sudah stabil.
- **Script `pnpm bench:report`**: menulis `benchmarks/results/latest-http.json` (gitignored) +
  bandingkan terhadap baseline (toleransi 25%).
- **CI**: langkah "Performance report (report-only, non-blocking)" menjalankan
  `pnpm bench:report`; artefak `latest-http.json` ikut diunggah. **Tidak** menjalankan
  `pnpm bench` (yang menimpa baseline) di CI.
- **Runtime startup** (`benchmarks/runtime-startup.sh`): perbandingan report-only vs baseline
  (median `wallMs`/`engineStartupMs` untuk skenario `mini` & `four-workers`), toleransi
  `TOLERANCE_PCT` (default 25), skip otomatis bila out == baseline; `STRICT=1` → exit 1.

## Bukti

- Unit: `benchmarks/http/compare.test.ts` (5 test: dalam toleransi; p50 naik; throughput turun;
  baseline tanpa latency/nol; format laporan) — masuk `pnpm test` (glob `benchmarks/**`).
- Uji hidup: `pnpm bench:report` pada mesin dev menghasilkan laporan terhadap baseline 2026-10-17
  dan **mendeteksi sinyal nyata**: `latency p50 35 → 48 ms (+37.1%)` ⚠, sementara p90/p99 dan
  throughput dalam toleransi — persis perilaku "report-only: memunculkan, tidak memblokir".
- Baseline **tidak tersentuh** (`git status` bersih; artefak laporan terpisah & gitignored).
- 133 tes Node total (sebelumnya 128).

## Batasan yang dicatat jujur

- Gate **belum memblokir** (sesuai rencana); risiko flakiness mesin dev masih nyata — sinyal
  p50 di atas perlu ditinjau, bukan langsung dianggap regresi kode (lingkungan bisa berbeda).
- Benchmark HTTP = satu run 10 s (belum warm-up + beberapa ulangan seperti protokol §8 penuh);
  laporan mencetak catatan bila `cpuModel` baseline berbeda.
- Threshold 25% adalah pilihan awal, bukan hasil kalibrasi statistik.
- Bandingkan hanya di mesin sebanding; angka tidak dijadikan klaim publik.

## Alternatif yang ditolak

- **Gate blocking langsung**: baseline belum cukup stabil (dev machine, satu run); memblokir
  akan menghasilkan noise.
- **Menimpa baseline otomatis per CI run**: menghilangkan makna pembanding.

## Konsekuensi

- Regresi performa kini terlihat di setiap CI run (dan lokal via `pnpm bench:report`) tanpa
  risiko mengubah artefak baseline.
- Langkah lanjutan: protokol §8 penuh (warm-up + ulangan + distribusi), kalibrasi toleransi
  dari beberapa run, lalu pertimbangkan `--strict` untuk skenario yang stabil.
