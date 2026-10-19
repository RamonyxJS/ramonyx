# ADR (Architecture Decision Records)

Satu keputusan = satu file `NNNN-judul-singkat.md` (nomor berurutan; jangan mengganti nomor lama).

- Status: `Proposed` (menunggu keputusan pemilik) · `Accepted` · `Rejected` · `Superseded by NNNN`
- Format minimum: Judul · Status · Tanggal · Konteks · Keputusan · Alternatif yang ditolak · Konsekuensi · Cara membuktikan.
- Keputusan baru yang mengubah keputusan lama → ADR baru dengan status `Superseded by`, jangan edit retroaktif.

| ADR | Judul | Status |
| --- | --- | --- |
| [0001](0001-runtime-strategy.md) | Strategi runtime: Node.js baseline + Rust/V8 eksperimental | Accepted |
| [0002](0002-baseline-tooling.md) | Baseline tooling, bahasa, dan CI | Accepted |
| [0003](0003-ui-adapter-react.md) | Adapter UI pertama: React | Accepted |
| [0004](0004-schema.md) | Kontrak schema validasi (Standard Schema) | Accepted |
| [0005](0005-bundler.md) | Bundler awal | Accepted |
| [0006](0006-jsx-loader.md) | Loader JSX dev/test (esbuild, bukan tsx) | Accepted |
| [0007](0007-hydration.md) | Hydration: payload inline + satu bundle client | Accepted |
| [0008](0008-client-navigation.md) | Client navigation: soft navigation (fetch → swap → re-hydrate) | Accepted |
| [0009](0009-dev-server.md) | Dev server: Vite front + proxy manual + ssrLoadModule | Accepted |
| [0010](0010-browser-e2e.md) | Browser E2E Playwright + baseline Web Vitals | Accepted |
| [0011](0011-resource-limits.md) | Resource limits secure-by-default (body 1 MiB, timeout 10s) | Accepted |
| [0012](0012-concurrency-limit.md) | Concurrency limit / load shedding (default 100, 503 + Retry-After) | Accepted |
| [0013](0013-security-package.md) | Paket security: headers + CSRF double-submit (Web Crypto) | Accepted |
| [0014](0014-csp-nonce.md) | CSP nonce + request replacement di middleware | Accepted |
| [0015](0015-ssrf-guard-output-limit.md) | SSRF guard (`guardedFetch`) + output limit dokumen SSR | Accepted |
| [0016](0016-dependency-policy.md) | Kebijakan dependency & supply chain | Accepted |
| [0017](0017-rate-limiting.md) | Rate limiting per klien (identitas adapter + trustProxy opt-in) | Accepted |
| [0018](0018-owner-decisions.md) | Keputusan pemilik: MIT, @ramonyx/*, browser matrix, rekonsiliasi PRD | Accepted (pemilik) |
| [0019](0019-runtime-r0.md) | Runtime R0: workspace Rust, CLI, konfigurasi, logging (+ R1-lite) | Accepted |
| [0020](0020-v8-engine.md) | Engine JavaScript: V8 via `deno_core` | Accepted |
| [0021](0021-module-loader.md) | Module loader ESM + transpile TypeScript (deno_ast) | Accepted |
| [0022](0022-runtime-io.md) | Runtime I/O (R2a): timer, fs, env, HTTP server pull-model | Accepted |
| [0023](0023-permission-model.md) | Permission model (R3a): secure by default, flag `--allow-*` | Accepted |
| [0024](0024-http-cancellation.md) | Runtime HTTP R2b: cancellation klien + keep-alive | Accepted |
| [0025](0025-response-streaming.md) | Runtime HTTP R2c: streaming respons (chunked) | Accepted |
| [0026](0026-node-modules.md) | Resolusi `node_modules` ESM (versi 1) | Accepted |
| [0027](0027-web-shim.md) | Web platform basics (`web_shim`) untuk runtime | Accepted |
| [0028](0028-compat-suite.md) | Compatibility suite v1: pipeline framework di runtime | Accepted |
| [0029](0029-commonjs-interop.md) | Interop CommonJS v1 + demo SSR React di runtime | Accepted |
| [0030](0030-fetch-readablestream.md) | `fetch` client + `ReadableStream` + body streaming | Accepted |
| [0031](0031-builtins-crypto-security.md) | Builtin subset + `crypto` + security di runtime | Accepted |
| [0032](0032-servehandler-playground.md) | Jembatan `serveHandler` + playground subset di runtime | Accepted |
| [0033](0033-resource-limits.md) | Resource limits: kuota heap, watchdog timeout, revoke permission | Accepted |
| [0034](0034-worker-isolation.md) | Isolasi worker + kuota (isolate terpisah per worker) | Accepted |
| [0035](0035-streaming-request.md) | Streaming request + batas body server (413 dini) | Accepted |
| [0036](0036-fetch-tls-redirect.md) | `fetch` https (TLS diverifikasi) + redirect otomatis | Accepted |
| [0037](0037-r4-profiling-startup.md) | R4: profiling startup — timings, metrik op, baseline | Accepted |
| [0038](0038-cpu-rss-quotas.md) | Kuota CPU per-thread + RSS proses (gap memori eksternal) | Accepted |
| [0039](0039-release-pipeline.md) | Release pipeline v1: artefak, verifikasi instalasi, rilis 0.1.0 | Accepted |
| [0040](0040-plugin-process-isolation.md) | Isolasi level proses untuk plugin (`ramonyx.spawn`) | Accepted |
| [0041](0041-create-app.md) | `apps/create-app` — scaffolder aplikasi | Accepted |
| [0042](0042-docs-app.md) | `apps/docs` — situs dokumentasi (dogfood SSR React) | Accepted |
| [0043](0043-plugin-supervision.md) | Supervisi restart plugin (`restart` pada `ramonyx.spawn`) | Accepted |\n| [0044](0044-plugin-health-check.md) | Health-check plugin (heartbeat + deteksi senyap) | Accepted |
| [0045](0045-perf-regression-gate.md) | Performance regression gate (report-only) | Accepted |
| [0046](0046-source-maps.md) | Source map produksi (client bundle + paket npm) | Accepted |
| [0047](0047-ssr-streaming-node.md) | SSR streaming di runtime Node (`renderToReadableStream` + `server.edge`) | Accepted |
| [0048](0048-bench-ssr-vitals.md) | Bench SSR + ambang Web Vitals (report-only) + `NODE_ENV` produksi | Accepted |
| [0049](0049-pra-publikasi.md) | Kesiapan pra-publikasi: publish dari artefak terverifikasi + dist-tag + `create-ramonyx-app` | Accepted |
| [0050](0050-plugin-backoff-watchdog.md) | Plugin: backoff eksponensial + health-check otomatis (watchdog) | Accepted |
| [0051](0051-plugin-sandbox-landlock.md) | Sandbox OS plugin (Landlock LSM): FS + TCP kernel-level | Accepted |
| [0052](0052-docs-hosting-pages.md) | Ekspor statis + hosting dokumentasi (GitHub Pages) | Accepted |
| [0053](0053-devtools-cli.md) | CLI `ramonyx` (`@ramonyx/devtools` v1): dev/build/start/doctor | Accepted |
| [0054](0054-machine-readable-docs.md) | Lapisan dokumentasi machine-readable (`docs/machine/`, llms.txt, validator CI) | Accepted |
| [0055](0055-http-production-basics.md) | Dasar HTTP produksi: kompresi, ETag/304, fingerprinting aset, helper cache | Accepted |
| [0056](0056-static-generation.md) | Static generation: `prerenderRoutes` + `ramonyx build --static` (dogfood docs, 404 HTML, NODE_ENV produksi) | Accepted |
| [0057](0057-server-actions.md) | Server actions: `action` per halaman (FormData, actionSchema, PRG 303, progressive enhancement) | Accepted |
| [0058](0058-edge-target.md) | Target build edge/serverless (`--target edge`, kontrak fetch handler) + `guardedFetch` ke subpath | Accepted |
| [0059](0059-metadata-seo.md) | Metadata halaman (description/OG/Twitter/robots) + `sitemap.xml`/`robots.txt` | Accepted |
| [0060](0060-prefetch.md) | Prefetch halaman klien (hover/focus/viewport, cache LRU + TTL) | Accepted |
| [0061](0061-middleware-per-folder.md) | Middleware per-folder otomatis + route group `(grup)` | Accepted |
| [0062](0062-auth-session.md) | Primitif sesi & cookie (HMAC, Web Crypto) + action men-set cookie | Accepted |
| [0063](0063-server-client-boundary.md) | Batas server/client: konvensi `*.server.ts` + stub poison-pill + penegakan build | Accepted |
| [0064](0064-ip-pinning.md) | IP-pinning `guardedFetch` (resolve sekali + patok alamat, menutup DNS-rebinding) | Accepted |
| [0065](0065-extension-contracts.md) | Kontrak ekstensi bersama: config pass-through, `AppHooks`, `KeyValueStore`, kontrak plugin | Accepted |
| [0066](0066-revalidate.md) | Revalidasi data (ISR-lite): cache loader + SWR + invalidasi path/tag dari action | Accepted |
| [0067](0067-plugin-ecosystem.md) | Plugin: passthrough Vite + middleware pre-routing (`withMiddleware`) + hooks dari config | Accepted |
| [0068](0068-edge-env-and-smoke.md) | Binding env platform edge (`envFromRequest`) + smoke di runtime nyata (workerd) | Accepted |
| [0069](0069-asset-pipeline-m1.md) | Pipeline aset M1: manifest + resolver + `Image` (tanpa dependency, tanpa loader) | Accepted |
| [0070](0070-watch-mode.md) | Watch mode build (`ramonyx build --watch`, debounce + antrean aman) | Accepted |
