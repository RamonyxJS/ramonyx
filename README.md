# Ramonyx

Framework full-stack TypeScript + runtime eksperimental (Rust + V8), dikembangkan sebagai dua
proyek yang terintegrasi tetapi terpisah. Visi dan keputusan teknis lengkap:
[docs/BLUEPRINT.md](docs/BLUEPRINT.md).

> **Status: Phase 4 (runtime alpha) berjalan** — Phase 0–3 selesai. Runtime Rust: R0 (CLI,
> konfigurasi, structured logging), R1 (V8 via deno_core, ESM, TypeScript), R2a (I/O dasar:
> timer/fs/env + HTTP server pull-model — diverifikasi end-to-end). Framework Node tetap baseline
> produksi; runtime eksperimental sampai compatibility/security testing lolos. Klaim mengikuti
> aturan BLUEPRINT §10.

## Quick start

```bash
pnpm install
pnpm test          # suite kontrak v0
pnpm typecheck
pnpm lint
pnpm dev           # dev: Vite+HMR di 5173 → SSR di 3000 (tanpa build)
pnpm build         # produksi: bundle client ke dist/client
pnpm start         # produksi: SSR di http://localhost:3000 (setelah build)
pnpm test:e2e      # e2e Playwright (hydration, navigasi, error, Web Vitals)
pnpm bench         # baseline autocannon
pnpm bench:security  # abuse-case + soak (6 skenario serangan + RSS server)
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

## Lisensi & dukungan

- **Lisensi: MIT** — lihat [LICENSE](LICENSE). Scope paket: `@ramonyx/*` (meta: `ramonyx`).
- **Browser**: Chrome/Edge/Firefox/Safari dua versi terakhir, JavaScript ES2022, tanpa polyfill
  otomatis (ADR-0018).

## Aturan singkat

- Bahasa: dokumen/narasi internal Bahasa Indonesia; teks yang dilihat publik (README npm, docs
  situs, pesan error) Bahasa Inggris.
- Klaim performa/keamanan hanya dengan bukti yang bisa dijalankan — lihat BLUEPRINT §10 dan
  [`docs/benchmark-protocol.md`](docs/benchmark-protocol.md).
