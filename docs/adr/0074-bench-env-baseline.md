# ADR-0074: Baseline Benchmark Per-Lingkungan + Guard `--strict`

- Status: Accepted (2026-10-18)
- Tanggal: 2026-10-18
- Sumber: TODO `p2-bench-env-baseline` (utang ADR-0045: "gate report-only; `--strict` hanya
  sahih di mesin baseline"); rencana komprehensif F5.
- **Memperbarui**: ADR-0045 (gate report-only) — mekanisme blocking kini eksplisit per-lingkungan.

## Konteks

Baseline tunggal (`phase1-baseline.json`, `ssr-baseline.json`) dipakai lintas mesin; guard lama
hanya membandingkan `cpuModel`. Akibatnya: (a) mesin berbeda saling menimpa baseline, (b) sulit
membangun gate blocking yang jujur — CI GitHub-hosted (±3× lebih cepat, hardware bervariasi)
tidak dapat memakai baseline mesin dev.

## Keputusan

1. **Baseline per-lingkungan** (`benchmarks/lib/env.ts`): `captureEnvironment()` (platform, arch,
   node, nodeMajor, cpus, cpuModel) + `envKey()` (slug stabil) + path
   `benchmarks/results/baselines/<bench>-<key>.json` (`http-…`/`ssr-…`).
   - Default `pnpm bench` / `pnpm bench:ssr` menulis baseline **per-lingkungan** (mesin berbeda
     tidak saling menimpa).
   - Baseline lama **dipertahankan** sebagai fallback pembanding bila baseline per-lingkungan
     belum ada (dicatat di output; tidak ada informasi yang dihapus).
2. **Guard `--strict` diperkuat**: `environmentsMatch()` (platform + arch + nodeMajor + cpuModel;
   jumlah core diabaikan) — `--strict` **menolak** (exit 1) saat baseline berasal dari lingkungan
   berbeda, dengan catatan yang menyebut field berbeda (`envMismatchNote`). Pembandingan ketat
   hanya berjalan saat lingkungan cocok.
3. **Keputusan blocking (memperbarui ADR-0045)**: gate **tetap report-only di CI repo ini**
   (GitHub-hosted runner: hardware tidak dijamin sama antar-run sehingga baseline per-lingkungan
   tidak dapat diandalkan di sana). Jalur menuju blocking: runner konsisten (self-hosted atau
   dedicated) → generate baseline di runner itu (`pnpm bench`) → commit → `--strict` sahih di
   sana. Ini dicatat sebagai pilihan operasional, bukan pekerjaan repo.
4. **Prosedur regenerasi** (masuk `docs/benchmark-protocol.md`): mesin tenang → `pnpm bench` /
   `pnpm bench:ssr` → commit `benchmarks/results/baselines/<file>.json` (satu berkas per
   lingkungan; jangan mencampur mesin).
5. **Baseline mesin dev saat ini ter-commit** (Ryzen 5 7520U, WSL2) — angka noisy (ADR-0045),
   tetap dicatat sebagai baseline lingkungan tersebut dan dapat diregenerasi.

## Bukti

- `benchmarks/lib/env.test.ts`: `envKey` stabil/slug, `environmentsMatch` (core diabaikan;
  platform/arch/nodeMajor/cpu berbeda → false; tanpa info → false), `envMismatchNote`, capture.
- `pnpm bench` + `pnpm bench:ssr` menghasilkan
  `benchmarks/results/baselines/{http,ssr}-linux-x64-node24-amd-ryzen-5-7520u-….json`
  (tabrakan nama tanpa prefiks bench ditemukan dan diperbaiki dalam sesi ini).
- `pnpm bench:report` (jalur CI) tetap report-only dan membandingkan terhadap baseline
  per-lingkungan bila ada.

## Alternatif yang ditolak

- **Satu baseline global dengan normalisasi faktor** (mis. skala relatif CI/dev): menyembunyikan
  perbedaan mesin — angka tidak dapat dipercaya; ditolak.
- **Baseline di-generate otomatis di CI lalu dipakai untuk gate**: hardware GitHub-hosted
  bervariasi antar-run → gate akan flaky/false-positive; ditolak.
- **Menghapus baseline lama**: aturan "jangan hapus informasi"; lama dipertahankan sebagai
  fallback pembanding.

## Konsekuensi

- Setiap mesin memiliki baseline sendiri; gate ketat menjadi mungkin tanpa lompatan mesin.
- CI tetap report-only (keputusan jujur, dicatat) — jalur self-hosted tersedia.
- Sisa kandidat: baseline runtime Rust per-lingkungan (script shell saat ini), normalisasi
  artefak lintas-N (statistik lebih kaya), auto-deteksi runner dedicated di CI.
