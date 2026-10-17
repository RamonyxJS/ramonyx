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

- `pnpm lint` — Biome; antara lain melarang impor `node:*` di luar `packages/adapter-runtime`.
- `pnpm typecheck` — `tsc --noEmit` (TypeScript 7: `baseUrl` dihapus, `paths` wajib relatif `./`).
- `pnpm test` — `node --test` menjalankan `.ts` langsung; butuh Node ≥24 (type stripping).
- `pnpm bench` — autocannon; hasil ditulis ke `benchmarks/results/`.
- Demo: `node apps/playground/src/main.ts` (default `http://localhost:3000`).
- pnpm hanya tersedia lewat shim corepack di `~/.local/bin`
  (`corepack enable --install-directory ~/.local/bin pnpm`).

## Jebakan yang paling mudah kena

- **Blueprint §4/§5 masih rancangan, belum semuanya diimplementasikan.** Yang nyata:
  `packages/*`, `apps/playground`, `benchmarks/*`. Fitur Phase 2+ (file routing otomatis, SSR,
  dev server/HMR, adapter React) belum ada — cek kode, jangan asumsikan.
- **Syntax harus erasable.** Paket diekspor sebagai `.ts` dan dijalankan Node type stripping:
  dilarang `enum`, `namespace`, parameter property; `erasableSyntaxOnly` + `verbatimModuleSyntax`
  menegakkannya. Impor relatif wajib berekstensi `.ts`.
- **`node:*` hanya di `packages/adapter-runtime`** (plus test/benchmark/playground); ditegakkan lint.
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
adapter UI pertama React (ADR-0003) · host runtime Rust + V8 (Phase 4+) · CI:
lint → typecheck → test → security checks (build menyusul Phase 2, ADR-0005).

## Benchmark (blueprint §8)

Baseline Phase 1: `benchmarks/results/phase1-baseline.json` (mesin dev; bukan klaim publik).
Warm-up + beberapa ulangan, laporkan distribusi (p50/p90/p97_5/p99), bukan rata-rata.

## Status & langkah berikutnya

Phase 0 & Phase 1 inti selesai (46 tes hijau; baseline tercatat). Berikutnya Phase 2 — file
routing, adapter React, SSR, dev server/HMR. Keputusan terbuka: scope npm & lisensi, matrix
browser, rekonsiliasi PRD (lihat `docs/roadmap/phase-0-1.md`).
