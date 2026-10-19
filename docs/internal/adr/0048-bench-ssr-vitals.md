---
adr: 0048
title: "Bench SSR (Sinkron vs Streaming) + Ambang Web Vitals + `NODE_ENV` Produksi"
visibility: internal
---

# ADR-0048: Bench SSR (Sinkron vs Streaming) + Ambang Web Vitals + `NODE_ENV` Produksi

- Status: Accepted (2026-10-18)
- Tanggal: 2026-10-18
- Sumber: protokol benchmark §8 (baris SSR & Web Vitals), ADR-0045/0047, audit `docs/IMPLEMENTATION_STATUS.md`

## Konteks

- Matriks §2 mensyaratkan benchmark SSR (waktu render, TTFB, ukuran output; halaman sederhana →
  kompleks), tetapi belum ada harness; ADR-0047 mencatat "belum ada pengukuran TTFB streaming".
- E2E vitals hanya menulis artefak ("threshold menyusul") tanpa perbandingan apa pun.
- Selama penulisan harness ditemukan: **`NODE_ENV` tidak pernah di-set** — `pnpm start`
  (produksi dan e2e) menjalankan React build **development** di server.

## Keputusan

### Bench SSR (`pnpm bench:ssr`, `benchmarks/ssr/bench.tsx`)

- In-process lewat `createHandler` + `createPageRoutes` (tanpa socket): jalur sinkron vs
  streaming; TTFB = byte pertama body; metrik `sync.totalMs`, `stream.ttfbMs`,
  `stream.totalMs`, `bytes`.
- Skenario: kecil (0.6 KB) / sedang (2000 baris, 80 KB) / besar (10000 baris, 415 KB) +
  **suspense(50 ms)** — konten tertunda, fallback lebih dulu.
- **Paritas byte-per-byte** diperiksa untuk halaman statis (gagal keras bila berbeda); skenario
  suspense memverifikasi fallback muncul **sebelum** konten dan konten hanya ada di jalur streaming.
- Warm-up 3 + 9 ulangan; median + `spread`. **GC eksplisit** (`--expose-gc`) antar-sampel dan
  halaman diperbesar setelah kalibrasi: pada 2–17 ms spread liar (median 5,9 ms dengan rentang
  5,5–13,4 ms); pada skala ~50 ms median stabil (dua report berturut-turut bersih).
- Baseline `benchmarks/results/ssr-baseline.json`; mode report-only `pnpm bench:ssr:report`
  (+ langkah CI non-blocking) memakai perbandingan generik `benchmarks/compare.ts` dengan
  **lantai delta absolut 1 ms** (breach butuh persen > toleransi **dan** delta > 1 ms),
  toleransi 25%.

### Web Vitals (`apps/playground/e2e/vitals.spec.ts`)

- Pengukuran = **median 3 load** (1 load pemanasan dibuang) — satu load terlalu berisik.
- Perbandingan vs baseline report-only (toleransi 25%) + **ambang absolut** panduan umum:
  LCP ≤ 2500 ms, FCP ≤ 1800 ms, TTFB ≤ 800 ms, CLS ≤ 0,1. `VITALS_STRICT=1` mengaktifkan
  kegagalan (belum dipakai CI).
- Baseline direfresh eksplisit (`UPDATE_BASELINE_VITALS=1`): nilai lama 360/360/40,9 ms
  (dev React, sekali load) → baru **LCP 84 / FCP 84 / TTFB 11,1 / CLS 0** (produksi, median 3).

### Lingkungan produksi

- `pnpm start`, `pnpm docs` (bagian server), bench SSR, dan template `create-app` menjalankan
  dengan **`NODE_ENV=production`** → React build produksi. Sebelumnya dev build dipakai tanpa
  disadari pada server "produksi" dan e2e. `pnpm dev` tetap mode dev.

## Bukti

- Baseline SSR + dua report berturut-turut: **semua metrik dalam toleransi**; paritas ✓ untuk
  small/medium/large. Median: small sync 2,8 / ttfb 1,7 ms; medium 14,9 / 12,7 ms;
  large 53,0 / 52,1 ms (total 53,5 ms); suspense ttfb 1,6 ms vs total 57,7 ms (fallback sebelum
  konten ✓, konten hanya di streaming ✓).
- Temuan terukur: untuk pohon **statis**, streaming tidak menurunkan TTFB (React merender shell =
  seluruh pohon); keunggulan muncul saat konten tertunda (ttfb 1,6 ms vs total 57,7 ms).
- Vitals: baseline baru + report bersih (ttfb +21,6%, dalam toleransi); semua ambang absolut ✓.
- E2E 5/5 di atas produksi (React produksi + SSR streaming).

## Batasan yang dicatat jujur

- In-process (tanpa socket) — **bukan** klaim TTFB jaringan; mesin dev; report-only.
- `--strict` sahih **hanya di mesin baseline** — guard lintas-mesin menolak bila `cpuModel`
  berbeda (evaluasi ADR-0045; CI tetap report-only).
- Metrik kecil (< 5 ms) tetap berisik; lantai 1 ms + median meredam, bukan menghapus.
- `--expose-gc` mengubah karakter alokasi antar-sampel (konsisten untuk baseline & report).
- Ambang vitals absolut = panduan umum, bukan target performa yang dijanjikan.

## Alternatif yang ditolak

- **Bench SSR lewat HTTP socket**: menambah noise + urusan port/cleanup; in-process cukup untuk
  deteksi regresi.
- **Persen murni tanpa lantai absolut**: memunculkan flag noise sub-milidetik setiap run.
- **Fail-fast vitals di CI**: flaky di runner bersama; `VITALS_STRICT=1` tersedia untuk lokal.
- **Toleransi berbeda sebelum data multi-mesin**: 25% dipertahankan sampai ada bukti tambahan.

## Konsekuensi

- Protokol §8 baris SSR & Web Vitals kini terimplementasi (report-only, pola sama dengan ADR-0045).
- Semua gate tetap tidak memblokir sampai kalibrasi multi-mesin; baseline diperbarui hanya lewat
  perintah eksplisit.
