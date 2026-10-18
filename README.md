# Ramonyx

Framework full-stack TypeScript + runtime eksperimental (Rust + V8), dikembangkan sebagai dua
proyek yang terintegrasi tetapi terpisah. Visi dan keputusan teknis lengkap:
[docs/BLUEPRINT.md](docs/BLUEPRINT.md).

> **Status: exit criteria Phase 4 tercapai (2026-10-18)** — Phase 0–3 selesai dan runtime alpha
> menjalankan **aplikasi playground subset** (halaman SSR React + API + POST + middleware
> security) lewat `ramonyx.serveHandler`, plus subset compatibility suite di CI. Runtime Rust:
> R0 (CLI), R1 (V8, ESM, TypeScript, `node_modules` ESM v1), R2a/b/c (HTTP server, cancellation,
> keep-alive, streaming respons), R3a (permission model **deny-all**), `web_shim`,
> **compatibility suite v1**, **interop CommonJS v1**, **SSR React + SSR streaming**,
> **`fetch` + `ReadableStream`**, **builtin subset (`node:net`/`node:dns/promises`) + `crypto`**,
> dan **subset `@ramonyx/security`** (middleware + guardedFetch/SSRF), plus **resource limits**
> (kuota heap `--max-heap-mb`, watchdog `--timeout-ms`, `ramonyx.permissions.revoke`), plus
> **isolasi worker** (`ramonyx.worker`: thread + isolate V8 terpisah, pesan JSON, permission
> irisan anti-eskalasi, kill switch), **streaming request + batas body server** (body
> pull-model, 413 dini), **`fetch` https + redirect otomatis** (TLS diverifikasi, CA kustom),
> **profiling startup** (timings per fase + metrik op opsional), **kuota CPU per-thread +
> RSS proses** (menutup gap memori eksternal), **pipeline rilis v1** (paket npm 0.1.0 +
> binary runtime + verifikasi instalasi — `pnpm release` / `pnpm release:verify`), dan
> **isolasi level proses untuk plugin** (`ramonyx.spawn` — crash plugin tidak menjatuhkan
> induk). Framework Node tetap baseline produksi; sisa Phase 5: publikasi npm sebenarnya
> (butuh kredensial). Klaim mengikuti aturan BLUEPRINT §10.

## Quick start

Buat aplikasi baru (di dalam repo): `pnpm create:app aplikasi-saya` — lalu `cd aplikasi-saya`,
`pnpm install`, `pnpm start`.


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
