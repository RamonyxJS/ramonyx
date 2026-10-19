# ADR-0045: Performance Regression Gate (Report-Only)

- Status: Accepted (2026-10-18)
- Diperbarui oleh: ADR-0074 (baseline per-lingkungan + guard `--strict` lintas lingkungan)
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

## Kalibrasi (2026-10-18, lanjutan)

- **Protokol §8 penuh diterapkan** pada bench HTTP: warm-up 3 s dibuang + **5 ulangan** ×10 s;
  artefak melaporkan **median antar-run** + `spread` min/max + `perRun` (agregasi murni di
  `benchmarks/http/stats.ts`, diuji unit).
- **Temuan kalibrasi:** peringatan awal `p50 +31–37%` adalah **artefak metodologi sekali-jalan
  tanpa warm-up** — dengan protokol penuh, median p50 = 33–35 ms (sama dengan baseline lama),
  p90/p99 bahkan lebih baik. Ulangan pertama memang lebih lambat (p50 44 ms) sebelum stabil;
  warm-up + median menyerap efek itu.
- **Stabilitas terukur:** median antar-invokasi bervariasi ≤ ~9% (p50 33→35, p90 45→49,
  rps 1398→1295); spread dalam satu invokasi rps ±15%.
- **Baseline diperbarui secara eksplisit** (`pnpm bench`, bukan otomatis): p50 34 / p90 48 /
  p99 72 / rps 1318 (5 ulangan + warm-up). Nilai baseline lama (sekali-jalan: p50 35 / p90 62 /
  p99 123 / rps 1177,5) tetap ada di riwayat git dan dokumen audit.
- **Konfirmasi:** `pnpm bench:report` berikutnya membandingkan dalam toleransi di semua metrik
  (p50 +2.9%, p90 +2.1%, p99 +5.6%, rps −0.4%).

## Evaluasi `--strict` (2026-10-18)

- **Mesin dev (baseline): 3 invokasi `bench:report` berturut-turut** → HTTP menandai
  **+68–74% p50** dan rps **−39%** *tanpa perubahan kode* yang relevan (skenario `/api/hello`
  tidak menyentuh React/SSR). Penyebab: beban ambient tooling dev (opencode ~18% CPU, VS Code
  server ~12%, residu Chrome; load average 1.45). **Strict di mesin dev tidak sahih** untuk HTTP.
- **SSR bench: 5 invokasi bersih berturut-turut** (delta maksimum ≤ 17,7%) → `--strict` sahih
  **selama dijalankan di mesin baseline**.
- **CI ±3× lebih cepat** dari mesin dev (p50 11 ms vs 34 ms; rps 4177 vs 1317; SSR large 19 vs
  53 ms): strict di CI tidak akan flaky (selalu lebih cepat), tetapi **tumpul** — regresi nyata
  tersembunyi oleh keunggulan mesin. Baseline dev tidak representatif untuk runner.
- **Keputusan**: (1) guard **lintas-mesin** ditambahkan — `--strict` **menolak** (exit 1 dengan
  pesan jelas) bila `cpuModel` baseline ≠ mesin saat ini, di bench HTTP maupun SSR; (2) langkah
  CI tetap **report-only**; (3) `--strict` dipakai lokal di mesin baseline sebagai cek pra-rilis
  (`pnpm bench:ssr:report --strict` aman; HTTP strict dianjurkan hanya sesaat setelah refresh
  baseline di jendela tenang).
- **Kandidat lanjutan**: baseline **per-lingkungan** (jalankan bench di CI, simpan sebagai
  cache/artefak runner, bandingkan dalam lingkungan yang sama) — barulah strict di CI bermakna.

## Batasan yang dicatat jujur

- Gate **belum memblokir** (sesuai rencana); `--strict` menunggu beberapa invokasi tenang lagi
  untuk metrik yang paling stabil (p50/p90; p99 lebih bervariasi).
- Threshold 25% dipertahankan sebagai pilihan awal — konsisten dengan variasi antar-invokasi
  yang terukur (≤ ~9% untuk median), belum hasil kalibrasi multi-mesin.
- Bandingkan hanya di mesin sebanding; laporan mencetak catatan bila `cpuModel` baseline
  berbeda. Angka tidak dijadikan klaim publik.

## Alternatif yang ditolak

- **Gate blocking langsung**: baseline belum cukup stabil (dev machine, satu run); memblokir
  akan menghasilkan noise.
- **Menimpa baseline otomatis per CI run**: menghilangkan makna pembanding.

## Konsekuensi

- Regresi performa kini terlihat di setiap CI run (dan lokal via `pnpm bench:report`) tanpa
  risiko mengubah artefak baseline.
- Langkah lanjutan: protokol §8 penuh (warm-up + ulangan + distribusi), kalibrasi toleransi
  dari beberapa run, lalu pertimbangkan `--strict` untuk skenario yang stabil.
