# AGENTS.md — Ramonyx

Framework full-stack TypeScript + runtime eksperimental (Rust + V8) — dua proyek yang terintegrasi
tetapi terpisah. **Phase 1 (framework MVP inti) sudah berjalan**; runtime Rust/V8 baru Phase 4+
(ADR-0001).

## Baca dulu, berurutan

1. `docs/BLUEPRINT.md` — sumber kebenaran teknis: arsitektur, stack, threat model, roadmap fase.
2. `docs/architecture.md` — ringkasan arsitektur, peta package, kontrak `RuntimeHost`.
3. `docs/api/core-contract.md` — kontrak API v0 + catatan implementasi (§10).
4. `docs/roadmap/phase-0-1.md` — status kerja & langkah berikutnya.
5. `docs/PRD.md` — level produk; "Pertanyaan Terbuka" belum diputuskan.

## Perintah

- `pnpm lint` — Biome; antara lain melarang impor `node:*` di luar `packages/adapter-runtime`/`packages/compiler`.
- `pnpm typecheck` — `tsc --noEmit` (TypeScript 7: `baseUrl` dihapus, `paths` wajib relatif `./`).
- `pnpm test` / `pnpm bench` / `pnpm dev` — semuanya lewat `node --import ./tools/register.mjs`
  (loader esbuild: TS + JSX automatic; ADR-0006). Butuh Node ≥24.
- Demo SSR: `pnpm dev` (default `http://localhost:3000`); hasil bench di `benchmarks/results/`.
- pnpm standalone di `~/.local/share/pnpm/bin` (PNPM_HOME; `~/.bashrc` menambahkannya ke PATH).
  Shell non-interaktif perlu `export PATH="$HOME/.local/share/pnpm/bin:$PATH"`. CI memakai corepack.

## Jebakan yang paling mudah kena

- **Blueprint §4/§5 masih rancangan, belum semuanya diimplementasikan.** Yang nyata:
  `packages/*`, `apps/playground`, `benchmarks/*`. File routing (API + halaman) dan SSR React
  tanpa hydration sudah ada; hydration, bundler, dev server/HMR belum — cek kode, jangan asumsikan.
- **Syntax harus erasable.** Paket diekspor sebagai `.ts` dan dijalankan Node type stripping:
  dilarang `enum`, `namespace`, parameter property; `erasableSyntaxOnly` + `verbatimModuleSyntax`
  menegakkannya. Impor relatif wajib berekstensi `.ts`.
- **JSX hanya lewat loader dev.** Node type stripping tidak memproses JSX; jalankan app/test dengan
  `node --import ./tools/register.mjs` (script `test`/`bench`/`dev` sudah begitu — ADR-0006).
  Paket framework sendiri tetap tanpa JSX agar bisa berjalan di Node murni.
- **`node:*` hanya di `packages/adapter-runtime` dan `packages/compiler` (build-time)**, plus
  test/benchmark/playground; ditegakkan lint.
- **Nama proyek: `ramonyx` (final).**
- **Disiplin klaim (BLUEPRINT §10).** Jangan menulis klaim performa/keamanan tanpa bukti yang bisa
  dijalankan.
- **Bahasa.** Dokumen internal Bahasa Indonesia; teks publik (README npm, docs situs, pesan error) Inggris.
- **Jangan lompat fase.** Phase 2 dulu (framework di Node), runtime Rust+V8 baru Phase 4–5.

## Batas arsitektur yang harus dijaga

- Framework core tidak bergantung pada internal runtime, dan sebaliknya; keduanya harus dapat diuji terpisah.
- Runtime MVP = Node.js. Runtime sendiri = host Rust + engine V8 (bukan menulis engine JS dari nol).
- Compiler menghasilkan artefak eksplisit: client bundle, server bundle, route manifest, metadata build.
- FFI adalah batas yang diaudit: minimalkan `unsafe`, dokumentasikan invariant.
- Jangan bangun sistem reactive UI, compiler frontend, ORM, dan package manager sekaligus; UI lewat
  adapter yang dapat diganti (pertama: React, ADR-0003).
- Keamanan: validasi schema runtime di trust boundary; permission berbasis capability eksplisit;
  JS context terpisah bukan sandbox; isolasi plugin di level proses/OS; SSR butuh timeout/kanselasi/limit.

## Baseline teknis (blueprint §6, ADR-0002)

TypeScript strict · ESM-only · source-first (exports `.ts`) · pnpm workspaces · Node ≥24 ·
loader dev esbuild (ADR-0006) · adapter UI pertama React (ADR-0003) · host runtime Rust + V8
(Phase 4+) · CI: lint → typecheck → test → security checks (build menyusul, ADR-0005).

## Benchmark (blueprint §8)

Baseline Phase 1: `benchmarks/results/phase1-baseline.json` (mesin dev; bukan klaim publik).
Warm-up + beberapa ulangan, laporkan distribusi (p50/p90/p97_5/p99), bukan rata-rata.

## Status & langkah berikutnya

Phase 2 berjalan — file routing API + halaman (layout/loader/error) + SSR React tanpa hydration
selesai; 70 tes hijau. Berikutnya: bundler Vite + hydration, dev server/HMR. Keputusan terbuka:
scope npm & lisensi, matrix browser, rekonsiliasi PRD (lihat `docs/roadmap/phase-0-1.md`).
