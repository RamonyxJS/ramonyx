# Changelog

Format mengikuti [Keep a Changelog](https://keepachangelog.com/); versi mengikuti semver.

## [0.1.1] — 2026-10-18

Rilis cepat setelah 0.1.0: **CLI `ramonyx`**, template scaffolder berbasis CLI, perbaikan
adapter, dan penguatan runtime eksperimental.

### Framework (baseline produksi)

- **CLI `@ramonyx/devtools` v1** (ADR-0053): `ramonyx dev` (Vite + HMR → SSR), `ramonyx build`,
  `ramonyx start` (produksi — `NODE_ENV=production` otomatis), `ramonyx doctor`; konvensi
  `src/app.ts` `createApp(options?)`; loader TypeScript/JSX dipasang programatik sehingga
  `pnpm exec ramonyx …` bekerja dengan Node polos.
- **Template `create-ramonyx-app`**: boilerplate `build.ts`/`src/main.ts` dihapus → skrip
  `ramonyx dev|build|start`; `src/app.ts` menerima opsi (client/importer/reload/streaming).
- **`@ramonyx/adapter-runtime`**: normalisasi loopback IPv6 `::1` → `127.0.0.1` (identitas klien
  stabil untuk rate limit/logging lintas jalur IPv4/IPv6).

### Runtime Rust + V8 (eksperimental)

- **Plugin: backoff eksponensial + reset stabil** (`delayMs·2^n` ≤ `backoffMaxMs`; kuota pulih
  setelah generasi stabil) dan **health-check otomatis via watchdog** (deteksi senyap tanpa
  induk menunggu `receive`) — ADR-0050.
- **Sandbox OS plugin via Landlock** (ADR-0051): kelas eksplisit baca/tulis/TCP, irisan dengan
  permission efektif, auto-izin entry/CA TLS/proc-self kuota, fail-hard bila kernel tak
  mendukung; uji kernel positif/negatif.

### Tooling & docs

- **Situs dokumentasi di-host** di GitHub Pages (ekspor statis 65+ halaman, subpath-safe) — ADR-0052.
- Bench: guard lintas-mesin untuk `--strict` + evaluasi tercatat (ADR-0045).
- CI: perbaikan laten (toolchain Rust, `pnpm install` di job Rust, test menggantung `::1`,
  race worker) + Pages workflow.

## [0.1.0] — 2026-10-18

Rilis pertama (alpha). Framework Node.js (Phase 0–3 selesai) + runtime Rust/V8 eksperimental
(exit criteria Phase 4 tercapai).

### Framework (baseline produksi, Node ≥ 24)

- **Core/runtime**: `createHandler` (routing file, middleware, validasi schema di trust
  boundary), adapter Node (`@ramonyx/adapter-runtime`), paket meta `ramonyx`.
- **Hardening (Phase 3)**: limit body 1 MiB → 413, timeout 10 s → 503, concurrency 100 →
  503 + `Retry-After`; rate limit per klien (`x-ramonyx-remote-address`, anti-spoof);
  security headers, CSRF double-submit, CSP nonce, SSRF guard (`guardedFetch`), output limit;
  fuzz fast-check, suite security, abuse/soak bench, ASVS mapping (12 kriteria teruji).
- **UI (Phase 2)**: SSR React (`@ramonyx/react`, `@ramonyx/ssr`), hydration payload
  `window.__RAMONYX__`, soft navigation, dev server Vite + HMR, file routing.
- **Compiler/bundler**: `@ramonyx/compiler` (manifest route + load halaman), `@ramonyx/bundler`
  (build produksi), `@ramonyx/testing` (harness).

### Runtime Rust + V8 (eksperimental)

- Engine V8 (`deno_core`): ESM + TypeScript (deno_ast), resolusi `node_modules` v1, **interop
  CommonJS v1** (graf `require` statis), `web_shim` (URL/Headers/Request/Response/
  `ReadableStream`/`fetch`/`crypto`/timers/MessageChannel), builtin `node:net`/`node:dns/promises`.
- HTTP server pull-model: keep-alive, cancellation (`request.signal`), streaming respons +
  **streaming request** (body pull-model, `maxBodyBytes` → 413 dini), `serveHandler` (jembatan
  `FetchHandler`).
- **`fetch`**: http/https (TLS diverifikasi, CA kustom `--tls-ca`), redirect follow/manual/error
  (permission per hop, strip header sensitif lintas origin).
- **Compatibility terverifikasi**: pipeline framework (core/router/schema/server), **SSR React**
  (sync + streaming `renderToReadableStream`), **subset `@ramonyx/security`**, dan **playground
  subset** berjalan di runtime (ADR-0028/0029/0030/0031/0032).
- **Permission deny-all** + pencabutan runtime (`ramonyx.permissions`), **isolasi worker**
  (isolate terpisah, pesan JSON, permission irisan anti-eskalasi, kill switch), **resource
  limits**: `--max-heap-mb` (heap V8), `--timeout-ms` (wall-clock), `--max-cpu-ms` (CPU
  per-thread), `--max-rss-mb` (RSS proses — menangkap memori eksternal).
- **Profiling**: timings per fase (`engine.executed`), metrik op `--op-metrics`, baseline
  `benchmarks/runtime-startup.sh` → `benchmarks/results/runtime-startup.json`.

### Tooling & proses

- pnpm workspaces + loader esbuild dev (ADR-0006), Vite bundler (ADR-0005/0007), CI
  lint → typecheck → test → build → security, Dependabot + kebijakan dependency
  (`minimumReleaseAge`, ADR-0016).
- **Pipeline rilis v1** (ADR-0039): build paket (ESM + `.d.ts`), tarball npm, binary runtime,
  `SHA256SUMS` + `release-manifest.json`, dan verifikasi instalasi di proyek konsumen bersih
  (`pnpm release:verify`).

### Catatan

- Runtime Rust **eksperimental** — belum ada klaim produksi; lihat batasan per ADR
  (tanpa HTTP/2, tanpa TLS server, tanpa Isolasi proses, dsb.).
- Klaim mengikuti aturan BLUEPRINT §10 (hanya yang dapat dijalankan/dibuktikan).
