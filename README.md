# Ramonyx

Framework full-stack TypeScript + runtime eksperimental (Rust + V8), dikembangkan sebagai dua
proyek yang terintegrasi tetapi terpisah. Visi dan keputusan teknis lengkap:
[docs/BLUEPRINT.md](docs/BLUEPRINT.md).

> **Status: Phase 2 berjalan — file routing + SSR React (tanpa hydration) sudah ada**:
> halaman `page.tsx`/`layout.tsx`/`error.tsx` + loader, endpoint `src/routes/api/**`, middleware,
> validasi schema (Standard Schema), adapter runtime Node & in-memory. Bundler Vite, hydration,
> dev server, dan runtime Rust menyusul sesuai roadmap. Klaim mengikuti aturan BLUEPRINT §10.

## Quick start

```bash
pnpm install
pnpm test          # suite kontrak v0
pnpm typecheck
pnpm lint
pnpm dev           # http://localhost:3000 (SSR + API)
pnpm bench         # baseline autocannon
```

## Peta dokumen

| Dokumen | Isi |
| --- | --- |
| [`docs/BLUEPRINT.md`](docs/BLUEPRINT.md) | Blueprint teknis: arsitektur, stack, threat model, benchmark, roadmap fase |
| [`docs/PRD.md`](docs/PRD.md) | Persyaratan produk (sebagian masih pertanyaan terbuka) |
| [`docs/architecture.md`](docs/architecture.md) | Ringkasan arsitektur, peta package, kontrak framework ↔ runtime |
| [`docs/adr/`](docs/adr/README.md) | Catatan keputusan arsitektur (ADR) |
| [`docs/api/core-contract.md`](docs/api/core-contract.md) | Kontrak API framework core v0 + catatan implementasi |
| [`docs/security/threat-model.md`](docs/security/threat-model.md) | Threat model + basis OWASP ASVS |
| [`docs/benchmark-protocol.md`](docs/benchmark-protocol.md) | Protokol benchmark |
| [`docs/coding-standards.md`](docs/coding-standards.md) | Standar kode, dependensi, testing |
| [`docs/roadmap/phase-0-1.md`](docs/roadmap/phase-0-1.md) | Status + breakdown tugas Phase 0–1 |
| [`AGENTS.md`](AGENTS.md) | Pintu masuk sesi agen |

## Prasyarat

- Node.js ≥24 — menjalankan `.ts` langsung (type stripping); lihat ADR-0005.
- pnpm 12 — standalone via `curl -fsSL https://get.pnpm.io/install.sh | sh -` (mesin dev:
  `~/.local/share/pnpm/bin`); CI memakai corepack.
- Rust toolchain — Phase 4+ (sudah terpasang di mesin dev).

## Aturan singkat

- Bahasa: dokumen/narasi internal Bahasa Indonesia; teks yang dilihat publik (README npm, docs
  situs, pesan error) Bahasa Inggris.
- Klaim performa/keamanan hanya dengan bukti yang bisa dijalankan — lihat BLUEPRINT §10 dan
  [`docs/benchmark-protocol.md`](docs/benchmark-protocol.md).
