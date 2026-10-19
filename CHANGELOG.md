# Changelog

Format mengikuti [Keep a Changelog](https://keepachangelog.com/); versi mengikuti semver.

## [0.3.0] — 2026-10-19

Rilis fitur: **MCP docs server** (paket ke-15), **pipeline gambar M2** (paket ke-16, `sharp`
peer opsional) + koreksi bug penyajian aset M1, dan hygiene repo (SECURITY/CONTRIBUTING/template
issue-PR).

### Framework (baseline produksi)

- **Pipeline gambar M2** (ADR-0079): plugin **`@ramonyx/plugin-image`** (paket ke-16) — varian
  resize + WebP/AVIF saat build, `sharp` sebagai **peer opsional** (tidak diinstal otomatis),
  cache content-hash di `.ramonyx/image-cache`; hook kontrak plugin **`assets`** (prosesor per
  berkas); manifest diperluas (`width`/`height` + `variants`); resolver **`assets.image()`**
  (src/srcSet/sources/dimensi) dan `Image` merender **`<picture><source>`**; peta aset edge
  di-inline sebagai `AssetInfo` dengan resolver bersama `createAssetResolverFromMap`; dogfood
  playground + e2e browser (varian WebP benar-benar dimuat).
- **Koreksi layout aset (bug M1)**: berkas aset kini ditulis di **root keluaran klien**
  (`dist/client/**`) sehingga URL `<prefix>/<file>` benar-benar disajikan — layout lama
  (`dist/client/assets/**`) 404 dan tertangkap test HTTP aset baru di create-app.

### Perubahan API (pra-1.0)

- **`AssetResolver.image(path)` wajib** (ADR-0079) — `ResolvedImage` (`src`, `width`, `height`,
  `srcSet`, `sources`); resolver kustom cukup mengembalikan `{ src }`.
  `manifest.assets[key].file` kini relatif terhadap root keluaran klien (bukan `assets/...`).

### Framework (baseline produksi)

- **i18n** (ADR-0081): routing locale di `createPageRoutes({ i18n })` — rute per-locale berprefix
  (`/en/…`), default tanpa prefix + normalisasi **308**, `<html lang>`/`dir`, **`hreflang`**
  otomatis (+`x-default`), locale di konteks loader/action + prop halaman + payload hydration,
  cache data loader terisolasi per locale; primitif edge-safe di `@ramonyx/core`
  (`parseAcceptLanguage`, `negotiateLocale`, `localePath`, `createTranslator` — interpolasi,
  plural `Intl.PluralRules`, format angka/tanggal); dogfood playground (`id` default + `/en`) +
  e2e browser; docs `docs/i18n.md`.

### Tooling & docs

- **Benchmark pipeline gambar** (kriteria `p2-asset-pipeline`): `pnpm bench:image` membangun
  playground tanpa/dengan plugin image dan mengukur LCP/CLS/FCP/TTFB (median 3 load, throttle CDP
  ala Slow 3G + load dingin) → artefak `benchmarks/results/image-pipeline-vitals.json`; sinyal
  konsisten: **CLS 0,1 → 0** (dimensi intrinsik), LCP dalam rentang noise (dicatat jujur).
- **Panduan publikasi plugin + kriteria stabilisasi** (ADR-0080): plugin pihak ketiga mengirim JS
  terkompilasi, `peerDependencies` ke `@ramonyx/bundler`/`ramonyx`, dependency berat sebagai peer
  opsional; kontrak dideklarasikan stabil setelah satu siklus rilis tanpa perubahan aditif
  (TODO `p2-plugin-contract-freeze`).
- **MCP docs server** (ADR-0078): paket ke-15 `@ramonyx/mcp-docs-server` (bin `ramonyx-mcp-docs`) —
  server MCP **stdio** tanpa dependency eksternal dengan 5 tools (`search_docs`, `get_page`,
  `get_feature_status`, `get_rules`, `list_adrs`) + resource `ramonyx://machine/*` &
  `ramonyx://docs/<slug>`; snapshot `docs/` dibundel saat rilis (berfungsi via `npx` tanpa clone);
  pemasangan Claude Code/Cursor/OpenCode di `docs/mcp.md`; protokol-level + spawn test, verifikasi
  tarball menjalankan handshake bin.

## [0.2.0] — 2026-10-19

Pengerjaan TODO backlog lengkap (ADR-0055–0077): dasar HTTP produksi (kompresi/aset/static/
actions/edge), metadata & SEO, prefetch, middleware per-folder, sesi & cookie, batas server/client,
kontrak ekstensi (config/hooks/store/plugin), revalidate, aset M1, watch, observability, DX error,
typed routes, bench per-lingkungan, pentest plugin, migrasi CLI, dan panel devtools dev-only.

### Framework (baseline produksi)

- **Dasar HTTP produksi** (ADR-0055): kompresi brotli/gzip di adapter Node (flush per chunk agar
  streaming tetap progresif), aset build **ber-hash** + manifest `ramonyx.assets.json`
  (`readClientScript`), middleware **`serveStatic`** (ETag/304, `immutable` untuk aset
  ber-fingerprint, guard traversal), helper **`cacheControl()`**.
- **Static generation** (ADR-0056): `prerenderRoutes` + **`ramonyx build --static`** — rute statis,
  `getStaticPaths` untuk rute dinamis, `404.html` dari halaman `metadata.status: 404`, aset disalin;
  situs docs memakai fitur ini (dogfood) dan `NODE_ENV=production` kini diset sejak awal di
  build/ekspor (memperbaiki mismatch React dev/prod).
- **Server actions** (ADR-0057): `export const action` per halaman (POST ke path yang sama),
  `actionSchema` (Standard Schema) untuk validasi FormData, redirect **303** (PRG), render ulang
  dengan prop `action` + payload hydration; klien mengintersepsi submit form (tanpa reload) dan
  tetap berfungsi **tanpa JavaScript**.
- **Target edge/serverless** (ADR-0058): `ramonyx build --target edge` → `dist/edge/index.js`
  (kontrak `{ fetch }`); codegen entry server (impor statis, tanpa `node:fs`); React adapter
  memakai `react-dom/server.edge` untuk sinkron + streaming; guard build menolak `node:*`.
- **Metadata & SEO** (ADR-0059): `PageMetadata` diperluas (description/canonical/image/type/robots)
  + injeksi `<head>`; helper `sitemapXml`/`robotsTxt`/`createSeoRoutes` (exclude noindex + halaman
  error; origin dari request).
- **Prefetch klien** (ADR-0060): tautan same-origin dimuat saat hover/focus/viewport (cache LRU
  8 entri, TTL 30 dtk, maks 2 konkuren); navigasi memakai cache tanpa request.
- **Middleware per-folder + route group** (ADR-0061): `middleware.ts` per folder (root otomatis
  untuk semua rute, urutan root→terdalam); urusan pre-routing (aset statis/logging) tetap global;
  folder `(grup)` tidak muncul di URL.
- **Primitif sesi & cookie** (ADR-0062): `@ramonyx/security` — `parseCookies`/`serializeCookie`
  (default aman), `signValue`/`verifyValue` (HMAC Web Crypto), `createSession` (read/commit/clear);
  `PageActionResult.headers` menyebar `set-cookie` ke render ulang (logout langsung terlihat).
- **Batas server/client** (ADR-0063): modul `*.server.ts` distub poison-pill di bundle klien
  (build + dev); impor `node:*` langsung dari modul klien ditolak saat build, impor transitif
  ditangkap scan output — pesan menunjuk file dan solusi.
- **IP-pinning `guardedFetch`** (ADR-0064): DNS di-resolve sekali lalu alamat dipatok ke koneksi
  (`node:http(s)` + `lookup` kustom; Host/SNI tetap hostname asli) — menutup jendela DNS-rebinding;
  body string/bytes/URLSearchParams/ReadableStream didukung.
- **Tutorial end-to-end** (`docs/tutorial.md`): scaffold → loader → API → action → deploy
  (Node/statis/edge), semua perintah terverifikasi test repo.
- **Kontrak ekstensi bersama** (ADR-0065): `resolveConfig` **pass-through** (key tak dikenal
  dipertahankan — plugin/fitur membaca config sendiri); **`AppHooks`** (onRequest/onLoader/
  onRender/onInvalidate, zero-cost) di `createHandler`/`createPageRoutes`; **`KeyValueStore`**
  + `createMemoryStore` + contract test; **kontrak plugin** (`definePlugin`/`loadPlugins`,
  passthrough Vite + middleware + hooks, experimental) di `@ramonyx/bundler`.
  Catatan: hasil `resolveConfig` kini memuat key tambahan (perilaku pass-through).
- **Revalidasi data / ISR-lite** (ADR-0066): `export const revalidate` (TTL) + `cacheTags` per
  halaman; `createCache()` (store in-memory default, pluggable) + `revalidate({paths,tags})`;
  stale-while-revalidate dengan refresh latar belakang (dedupe); **cache data loader, bukan HTML**
  (nonce CSP); GET tanpa query/cookie saja; `context.revalidate` di action + hook `onInvalidate`;
  docs `docs/caching.md`; dogfood playground & template.
- **Plugin** (ADR-0067): `definePlugin`/`loadPlugins` dimuat dari `ramonyx.config.ts` oleh CLI —
  plugin Vite (passthrough ke build/dev/edge), middleware pre-routing (`withMiddleware`), dan
  hooks; contoh `kunjungan` di playground + panduan `docs/plugins.md`. Status **experimental**.
- **Edge tuntas** (ADR-0068): binding env platform diteruskan per request
  (`createHandler({ envFromRequest })`, `EnvReader.getRaw`, `WeakMap` di entry edge);
  smoke **workerd** (runtime Cloudflare) sebagai langkah CI blocking (`pnpm test:edge`) —
  SSR/API/action/env/middleware/404 diuji di runtime nyata; `buildEdge` menormalkan path absolut.
- **Pipeline aset M1** (ADR-0069): `src/assets/**` dipindai saat build → disalin ber-hash ke
  `dist/client/assets/**` + dicatat di `ramonyx.assets.json` (`assets`); resolver
  (`assetUrl`/`createAssetResolver`) lewat `createPageRoutes({ assets })` → `loader({ assets })`;
  komponen **`Image`** (`@ramonyx/react/assets`, anti-CLS + lazy); `fontPreloadTag()` +
  `PageMetadata.head`; dev menyajikan `src/assets` tanpa hash; peta aset **di-inline** ke artefak
  edge; docs `docs/assets.md`. Resize/format (M2) tetap gate dependency.
- **Watch mode** (ADR-0070): `ramonyx build --watch` (debounce + antrean aman, error tidak
  menghentikan watch, SIGINT bersih; mencakup `--static`/`--target edge`).
- **Docs testing** (`docs/testing.md`): pola unit in-process (`@ramonyx/testing`), contract test,
  e2e JS + no-JS, dan contoh di repo.
- **Observability** (ADR-0071): `traceId()` (propagasi/generate, request + respons),
  `requestLogging()` (durasi/status/traceId lewat logger aplikasi), `createMetrics()` (hook
  request/loader/render/invalidasi) + `createMetricsRoute()` (`GET /metrics`) — di
  `@ramonyx/server`, edge-safe; dogfood playground; docs `docs/observability.md`.
- **DX error** (ADR-0072): halaman error **dev** menampilkan stack + file sumber
  (`errorDetails`, otomatis saat bukan produksi; produksi tetap bersih), dan error framework
  memuat **kode stabil** + tautan docs (`RMX-CONFIG-1`, `RMX-ROUTES-1..5`, `RMX-BUILD-1/2`,
  `RMX-EDGE-1`) → `docs/troubleshooting.md`.
- **Baseline benchmark per-lingkungan** (ADR-0074): baseline disimpan per
  (bench × platform × arch × node-major × cpu) di `benchmarks/results/baselines/`; guard
  `--strict` menolak lintas lingkungan dengan catatan field; baseline lama dipertahankan sebagai
  fallback; CI tetap report-only (jalur self-hosted untuk blocking dicatat).
- **Pentest isolasi plugin v1** (ADR-0075): 5 skenario adversarial di CI (fs symlink, env bocor,
  kill switch, kuota CPU, permukaan API) — temuan F1 (plugin bisa spawn plugin → amplifikasi 8ⁿ)
  **diperbaiki: plugin leaf-only**; asesmen + residual jujur di
  `docs/security/plugin-isolation-assessment.md`.
- **Panel devtools dev-only** (ADR-0077): `ramonyx dev` mencetak URL panel
  (`/__ramonyx/devtools`) — rute halaman + berkas, timing request/loader/render dari `AppHooks`,
  status payload hydration, dan ukuran bundel/aset; kolektor menumpang `@ramonyx/bundler`
  (tanpa paket npm baru), tidak pernah aktif di produksi; batasan korelasi didokumentasikan.
- **Konvensi `src/server.ts` + migrasi CLI** (ADR-0076): `ramonyx dev|start` memakai entry kustom
  opsional `src/server.ts` (`createHandler(options)`; CLI tetap host + plugin); `app.streaming`
  masuk config tervalidasi; playground & situs docs kini berjalan lewat CLI (entry lama dihapus,
  bench keamanan spawn CLI); uji konvensi di CI.
- **Typed routes** (ADR-0073): `ramonyx build|dev` menulis modul generate `.ramonyx/routes.ts`
  (`RouteParamsMap` + `routeHref` bertipe, membungkus `fillHref` runtime) — pola/param salah
  tertangkap saat typecheck; komponen `Link` (`@ramonyx/react/link`) memakai navigasi klien +
  prefetch yang ada; docs `docs/typed-routes.md`. (Pivot dari augmentasi `declare module` yang
  tidak merge di TS 7 — diuji.)

### Perubahan API (pra-1.0)

- **`@ramonyx/security`**: `guardedFetch`/`SsrfError` pindah ke subpath **`@ramonyx/security/ssrf`**
  (Node-only); index kini edge-safe (headers/CSP/CSRF/rate-limit saja).

### Tooling & proses

- **Verifikasi rilis** (`scripts/verify-release.mjs`) memeriksa berkas klien app scaffold lewat
  **manifest** `ramonyx.assets.json` — bug ditemukan saat persiapan 0.2.0 (cek lama masih
  mengharapkan `client.js` tanpa hash, padahal aset ber-hash sejak ADR-0055).

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
