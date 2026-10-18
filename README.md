# Ramonyx

Framework full-stack TypeScript (Node ≥ 24) + runtime Rust/V8 **eksperimental**: file routing,
SSR React (+ streaming), hydration + soft navigation, middleware security, validasi schema di
tepi kepercayaan, dan benchmark/gate reproducible.

> **Status: alpha 0.1.0 — terbit di npm** (2026-10-18, `@ramonyx/*` + `ramonyx` +
> `create-ramonyx-app`) — lihat [Rilis v0.1.0](https://github.com/RamonyxJS/ramonyx/releases/tag/v0.1.0)
> (16 aset: tarball npm + binary runtime + `SHA256SUMS` + manifest). Framework Node adalah
> baseline produksi; runtime Rust/V8 eksperimental (Phase 4 selesai, Phase 5 berjalan).
> Verifikasi registry end-to-end: scaffold → install → build → start → SSR.
> Checklist rilis: [docs/releasing.md](docs/releasing.md).

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
- **CLI devtools** (`@ramonyx/devtools`): `ramonyx dev` (Vite + HMR), `ramonyx build`,
  `ramonyx start` (produksi), `ramonyx doctor` — konvensi `src/app.ts` `createApp(options?)`.
- **Server**: middleware `next(request?)`, timeout 10 dtk → 503, batas body 1 MiB → 413, load
  shedding (concurrency 100), rate limit per klien, validasi schema (Standard Schema) di tepi.
- **Security**: security headers, CSP nonce, CSRF double-submit, SSRF guard (`@ramonyx/security`).
- **Benchmark**: protokol §8 (warm-up + ulangan + distribusi) dengan gate **report-only** —
  HTTP, SSR (sinkron vs streaming + suspense), Web Vitals di e2e.
- **Runtime Rust/V8 (eksperimental)**: ESM + TypeScript + `node_modules`, permission **deny-all**,
  isolasi worker + plugin (proses terpisah + supervisi), HTTP streaming, resource limits —
  lihat `runtime/` dan `docs/adr/`.

## Verifikasi

```bash
pnpm lint && pnpm typecheck && pnpm test   # 156 tes Node
pnpm build && pnpm test:e2e                # 5 e2e (Playwright)
cargo test --workspace                     # 101 tes Rust
pnpm audit --audit-level high              # bersih
```

## Struktur

| Path | Isi |
| --- | --- |
| `packages/*` | framework: `core`, `router`, `schema`, `server`, `ssr`, `react`, `compiler`, `bundler`, `security`, `adapter-runtime`, `testing`, `devtools` (CLI), meta `ramonyx` |
| `apps/playground` | app demo (SSR + hydration + streaming + security) |
| `apps/docs` | situs dokumentasi (dogfood penuh: SSR + soft navigation) |
| `apps/create-app` | scaffolder (`create-ramonyx-app`) |
| `runtime/` | runtime Rust + V8 — Cargo workspace (eksperimental) |
| `benchmarks/` | protokol §8: HTTP, SSR, security/soak, startup |
| `docs/` | blueprint, arsitektur, ADR, roadmap, audit status |

## Dokumentasi

**Online:** https://ramonyxjs.github.io/ramonyx/ (situs docs di-host dari `docs/**` — ADR-0052).

Mulai dari [docs/BLUEPRINT.md](docs/BLUEPRINT.md) (sumber kebenaran teknis),
[docs/IMPLEMENTATION_STATUS.md](docs/IMPLEMENTATION_STATUS.md) (status audit berbasis bukti),
dan [docs/adr/README.md](docs/adr/README.md) (keputusan arsitektur 0001–0049).

## Lisensi

MIT — lihat [LICENSE](LICENSE).
