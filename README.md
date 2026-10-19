# Ramonyx

Framework full-stack TypeScript (Node ≥ 24) + runtime Rust/V8 **eksperimental**: file routing,
SSR React (+ streaming), hydration + soft navigation, middleware security, validasi schema di
tepi kepercayaan, dan benchmark/gate reproducible.

> **Status: alpha 0.4.1 — terbit di npm** (2026-10-20, 16 paket `@ramonyx/*` + `ramonyx` +
> `create-ramonyx-app`, **dengan provenance**) — lihat
> [Rilis v0.4.1](https://github.com/RamonyxJS/ramonyx/releases/tag/v0.4.1).
> Framework Node adalah baseline produksi; runtime Rust/V8 eksperimental. Aplikasi baru:
> `pnpm create ramonyx-app aplikasi-saya` → `pnpm dev|build|start` (CLI `ramonyx`).
> Verifikasi registry end-to-end: scaffold → install → build → start → SSR + API.
> Checklist rilis (internal): [docs/internal/releasing.md](docs/internal/releasing.md).

## Mulai cepat

```bash
# scaffold aplikasi baru (dari registry):
pnpm create ramonyx-app aplikasi-saya
cd aplikasi-saya && pnpm install && pnpm build && pnpm start

# atau dari repo (kontribusi framework):
corepack enable pnpm && pnpm install && pnpm dev   # Vite :5173 → SSR :3000
```

## Yang sudah ada (terverifikasi)

- **Framework**: file routing (`src/routes`), lifecycle loader → render → dokumen; **SSR React**
  dengan **streaming** (opt-in, `createPageRoutes({ streaming: true })`) + payload hydration
  `window.__RAMONYX__` + soft navigation.
- **CLI devtools** (`@ramonyx/devtools`): `ramonyx dev` (Vite + HMR + **panel devtools**
  `/__ramonyx/devtools`: rute, timing, hydration, bundel), `ramonyx build`
  (`--static`, `--target edge`, `--watch`), `ramonyx start`, `ramonyx doctor` — konvensi
  `src/app.ts` `createApp(options?)` (+ `src/server.ts` opsional untuk entry kustom).
- **Server**: middleware `next(request?)`, timeout 10 dtk → 503, batas body 1 MiB → 413, load
  shedding (concurrency 100), rate limit per klien, validasi schema (Standard Schema) di tepi.
- **Security**: security headers, CSP nonce, CSRF double-submit, SSRF guard (`@ramonyx/security`).
- **Data & aset**: revalidasi/ISR-lite (`export const revalidate` + cache tags, ADR-0066);
  pipeline aset `src/assets/**` (hash + manifest, ADR-0069) + **varian gambar WebP/AVIF** via
  plugin (`@ramonyx/plugin-image`, `sharp` opsional) → `assets.image()` + `Image` `<picture>`.
- **Ekstensi**: kontrak plugin (`ramonyx.config.ts` → Vite + middleware + hooks + hook `assets`),
  typed routes (`.ramonyx/routes.ts`), metadata/SEO (sitemap/robots), observability
  (trace-id/log/metrik), server actions (progressive enhancement).
- **Deploy**: Node (`ramonyx start`), **statis** (`--static`, prerender + 404.html),
  **edge/serverless** (`--target edge` → `{ fetch }`, diuji smoke workerd di CI).
- **Docs agen (MCP)**: `@ramonyx/mcp-docs-server` — tools `search_docs`/`get_page`/
  `get_feature_status`/`get_rules`/`list_adrs` (stdio, `npx -y @ramonyx/mcp-docs-server`;
  pemasangan: [docs/public/for-agents.md](docs/public/for-agents.md)).
- **Benchmark**: protokol §8 (warm-up + ulangan + distribusi) dengan gate **report-only** —
  HTTP, SSR (sinkron vs streaming + suspense), Web Vitals di e2e, baseline per-lingkungan.
- **Runtime Rust/V8 (eksperimental)**: ESM + TypeScript + `node_modules`, permission **deny-all**,
  isolasi worker + plugin (proses terpisah + supervisi), HTTP streaming, resource limits —
  lihat `runtime/` dan `docs/internal/adr/`.

## Verifikasi

```bash
pnpm lint && pnpm typecheck && pnpm test   # tes Node
pnpm build && pnpm test:e2e                # e2e (Playwright)
cargo test --workspace                     # tes Rust
pnpm docs:validate                         # dokumentasi machine-readable (blocking)
pnpm audit --audit-level high              # bersih
```

Angka aktual (versi, jumlah paket/ADR/test) ada di satu tempat:
[docs/machine/stats.json](docs/public/machine/stats.json) — generate ulang: `pnpm docs:stats`.

## Struktur

| Path | Isi |
| --- | --- |
| `packages/*` | framework: `core`, `router`, `schema`, `server`, `ssr`, `react`, `compiler`, `bundler`, `security`, `adapter-runtime`, `testing`, `devtools` (CLI), `mcp-docs-server` (MCP), `plugin-image` (gambar), meta `ramonyx` |
| `apps/playground` | app demo (SSR + hydration + streaming + security) |
| `apps/docs` | situs dokumentasi (dogfood penuh: SSR + soft navigation) |
| `apps/create-app` | scaffolder (`create-ramonyx-app`) |
| `runtime/` | runtime Rust + V8 — Cargo workspace (eksperimental) |
| `benchmarks/` | protokol §8: HTTP, SSR, security/soak, startup |
| `docs/public` | dokumentasi publik (situs) · `docs/internal` | blueprint, roadmap, audit, ADR penuh (karantina) · `docs/CONTENT_POLICY.md` |

## Dokumentasi

**Online:** https://ramonyxjs.github.io/ramonyx/ (situs di-host dari **`docs/public/` saja** — ADR-0052/0082).

Mulai dari [docs/internal/BLUEPRINT.md](docs/internal/BLUEPRINT.md) (blueprint internal),
[docs/internal/IMPLEMENTATION_STATUS.md](docs/internal/IMPLEMENTATION_STATUS.md) (snapshot audit internal),
dan [docs/public/adr/README.md](docs/public/adr/README.md) (keputusan publik) / [docs/internal/adr/README.md](docs/internal/adr/README.md) (catatan penuh).

Untuk agen AI dan fakta terstruktur: [docs/public/machine/README.md](docs/public/machine/README.md) —
status fitur + bukti (`features.json`), indeks ADR (`adrs.json`), aturan menulis aplikasi
(`rules.json`), kontrol keamanan (`security.json`), dan `llms.txt`/`llms-full.txt`.
Kanal MCP: `npx -y @ramonyx/mcp-docs-server` — [docs/public/for-agents.md](docs/public/for-agents.md).

## Lisensi

MIT — lihat [LICENSE](LICENSE).
