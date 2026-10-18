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
- `pnpm test` / `pnpm bench` / `pnpm dev` / `pnpm build` — semuanya lewat
  `node --import ./tools/register.mjs` (loader esbuild: TS + JSX automatic; ADR-0006). Butuh Node ≥24.
- `pnpm dev` — dev server: Vite (5173) dengan HMR → SSR (3000); **tanpa build**.
- `pnpm build` + `pnpm start` — produksi: bundle client ke `apps/playground/dist/client/`, lalu SSR di 3000.
- `pnpm test:e2e` — Playwright terhadap build produksi (`pnpm build` + `pnpm start`); browser:
  CI memakai `playwright install chromium`, lokal boleh `PLAYWRIGHT_EXECUTABLE_PATH` ke Chrome yang ada.
- `pnpm create:app <dir>` — scaffold aplikasi Ramonyx baru (template minimal yang berjalan).
- `pnpm docs` — situs dokumentasi lokal (dogfood **penuh**: SSR React + hydration/soft navigation
  atas `docs/**`) di http://127.0.0.1:4000 (build klien + start).
- `pnpm release` — artefak rilis (build paket → tarball npm + binary runtime + SHA256SUMS/manifest
  di `dist/`; **14 artefak** termasuk `create-ramonyx-app`); `pnpm release:verify` — verifikasi
  instalasi di proyek konsumen bersih (Node polos), termasuk scaffold `create-ramonyx-app`.
  Publikasi: `docs/releasing.md` (checklist pemilik; workflow publish dari tarball terverifikasi —
  ADR-0049).
- `benchmarks/runtime-startup.sh` — baseline startup runtime Rust (median wall/startup/load/eval
  dari `RUNS` eksekusi; hasil → `benchmarks/results/runtime-startup.json`; butuh build release).
- `pnpm bench:report` — benchmark HTTP **report-only** (bandingkan vs baseline tanpa menimpanya;
  artefak `benchmarks/results/latest-http.json`; gate belum memblokir — ADR-0045).
- `pnpm bench:ssr` / `pnpm bench:ssr:report` — bench SSR in-process (sinkron vs streaming;
  warm-up + 9 ulangan; paritas byte-per-byte + suspense; `NODE_ENV=production` + `--expose-gc`)
  — report-only, baseline `ssr-baseline.json` (ADR-0048).
- `pnpm bench` — autocannon HTTP baseline (**protokol §8 penuh**: warm-up 3 s + 5 ulangan,
  median/spread; menulis ulang baseline ter-commit — eksplisit); `pnpm bench:security` — abuse-case + soak
  (spawn server terpisah, RSS via /proc; `SOAK_SECONDS=300` untuk soak panjang). Hasil di
  `benchmarks/results/`.
- `pnpm audit --audit-level high` — audit dependency (juga berjalan di CI + cron mingguan).
- Rust (runtime eksperimental): `cargo fmt --all`, `cargo clippy --workspace --all-targets -- -D warnings`,
  `cargo test --workspace`; jalankan: `cargo run -p ramonyx-runtime-cli -- run src/main.ts`
  (ESM + transpile TS via deno_ast). **Default deny-all** — akses fs/env/net butuh flag
  `--allow-read/write/net/env[=daftar]`; `serve()` butuh `--allow-net`.
- pnpm standalone di `~/.local/share/pnpm/bin` (PNPM_HOME; `~/.bashrc` menambahkannya ke PATH).
  Shell non-interaktif perlu `export PATH="$HOME/.local/share/pnpm/bin:$PATH"`. CI memakai corepack.

## Jebakan yang paling mudah kena

- **Blueprint §4/§5 masih rancangan, belum semuanya diimplementasikan.** Yang nyata:
  `packages/*`, `apps/playground`, `apps/docs`, `apps/create-app`, `benchmarks/*`. File routing
  (API + halaman), SSR React (sinkron + streaming), hydration, bundler, dev server/HMR sudah ada;
  `packages/devtools` belum — cek kode, jangan asumsikan.
- **Syntax harus erasable.** Paket diekspor sebagai `.ts` dan dijalankan Node type stripping:
  dilarang `enum`, `namespace`, parameter property; `erasableSyntaxOnly` + `verbatimModuleSyntax`
  menegakkannya. Impor relatif wajib berekstensi `.ts`.
- **JSX hanya lewat loader dev.** Node type stripping tidak memproses JSX; jalankan app/test dengan
  `node --import ./tools/register.mjs` (script `test`/`bench`/`dev` sudah begitu — ADR-0006).
  Paket framework sendiri tetap tanpa JSX agar bisa berjalan di Node murni.
- **Test server wajib `close()` di `finally`.** Assert yang gagal tanpa `finally` membocorkan
  listener dan `node --test` menggantung tanpa batas (pernah terjadi di CI); script `test` memakai
  `--test-timeout=120000` + `--test-force-exit` sebagai jaring pengaman, dan adapter menormalkan
  loopback `::1` → `127.0.0.1`.
- **Produksi = `NODE_ENV=production`.** Skrip `start`/`docs`/bench SSR + template `create-app`
  sudah men-set-nya; tanpa itu React berjalan build dev (pernah terjadi di server produksi —
  ADR-0048).
- **SSR streaming (ADR-0047):** opt-in `streaming: true` di `createPageRoutes`/`createApp`;
  renderer React memakai `react-dom/server.edge` — **jangan** `server.browser` (MessageChannel
  level-modul menahan proses Node: test/CLI menggantung). Error setelah byte pertama = koneksi
  diputus (status/error page hanya berlaku sebelum byte pertama).
- **Hydration:** di dev `pnpm dev` sudah otomatis (entry via Vite); di produksi jalankan
  `pnpm build` dulu lalu `pnpm start` (tanpa build, `/assets/client.js` 404). Payload
  `window.__RAMONYX__` + container `#ramonyx-root`; loader data wajib JSON-serializable;
  halaman error tidak di-hydrate (ADR-0007).
- **Limit default (ADR-0011/0012).** Body request dibatasi **1 MiB → 413**; handler/loader timeout
  **10s → 503** (+ `request.signal` abort); request bersamaan **100 → 503 + Retry-After**
  (load shedding). Aplikasi menyesuaikan lewat opsi `createHandler`
  (`maxBodyBytes`, `timeoutMs`, `maxConcurrent`).
- **Versi dependency baru menunggu 24 jam** (`minimumReleaseAge` di `pnpm-workspace.yaml`) — kalau
  versi rilis baru tidak langsung bisa dipasang, itu disengaja (kebijakan supply chain, ADR-0016).
- **Runtime Rust itu eksperimental & terpisah**: `runtime/` (Cargo workspace) tidak boleh diimpor
  paket TS dan sebaliknya; toolchain dipin `1.99.0` via `rust-toolchain.toml` (rustup mengunduh
  otomatis). `js-engine` mendukung **ESM + TypeScript** (import relatif + fallback ekstensi), API
  `ramonyx.*` (sleep/fs/env/**HTTP server pull-model**, bind 127.0.0.1) dengan **permission model
  deny-all** (`--allow-read/write/net/env`) serta **cancellation** (`request.signal` saat klien
  putus), **keep-alive**, **streaming respons** (`body` AsyncIterable → chunked), dan **resolusi
  `node_modules` ESM v1** (`exports`/`module`/`main`), **`web_shim`** (URL, TextEncoder,
  Headers/Request/Response, setTimeout, MessageChannel — ADR-0027/0029), **compatibility suite v1**
  (pipeline framework nyata — ADR-0028), **interop CommonJS v1 + demo SSR React**
  (`react` + `react-dom/server.browser` di runtime — ADR-0029), **`fetch` + `ReadableStream`
  + body streaming** (POST body, SSR streaming `renderToReadableStream` — ADR-0030), serta
  **builtin subset `node:net`/`node:dns/promises` + `crypto` + subset `@ramonyx/security`**
  (securityHeaders/cspNonce/csrf/rateLimit/guardedFetch — ADR-0031), **resource limits**
  (`--max-heap-mb`, `--timeout-ms`, `ramonyx.permissions.get()/revoke()` — ADR-0033), serta
  **isolasi worker + kuota** (`ramonyx.worker`: thread + isolate V8 terpisah, pesan JSON,
  permission irisan anti-eskalasi, kill switch — ADR-0034), serta **streaming request + batas
  body server** (`payload.body` stream pull-model, `maxBodyBytes` default 1 MiB, 413 dini —
  ADR-0035), **`fetch` https + redirect otomatis** (TLS diverifikasi, CA kustom `--tls-ca`,
  follow/manual/error, permission per hop — ADR-0036), **kuota CPU per-thread + RSS proses**
  (`--max-cpu-ms`/`--max-rss-mb` — ADR-0038), **isolasi level proses untuk plugin**
  (`ramonyx.spawn` + `--plugin`, protokol JSON stdin/stdout, permission irisan, kill — ADR-0040),
  **supervisi restart plugin** (`restart` + `plugin.stats()` — ADR-0043), serta **health-check
  plugin** (`healthCheck` + `ramonyx.heartbeat()` — ADR-0044), serta **perf report gate**
  (`pnpm bench:report`, report-only — ADR-0045) + **source map produksi** (ADR-0046),
  **backoff eksponensial + health-check otomatis plugin** (ADR-0050), serta **sandbox OS
  plugin** (Landlock: FS + TCP kernel-level, ADR-0051). Publikasi npm **selesai** (13 paket
  @ 0.1.0); sisa kandidat: evaluasi `--strict` bench + hosting dokumentasi;
  **kuota heap hanya heap V8** — data `ArrayBuffer` besar tidak
  dihitung dan alokasi raksasa tunggal masih bisa OOM fatal V8 (batasan dicatat); CommonJS pun
  **subset** (require dinamis, modul bawaan Node lewat require, dan require modul ESM ditolak
  dengan pesan jelas) — jangan diklaim lebih. Build pertama V8/deno_core+deno_ast+hyper ±3 menit;
  biarkan `target/` cache.
- **`node:*` hanya di `packages/adapter-runtime`, `packages/compiler` (build-time), dan
  `packages/security` (guard SSRF)**, plus test/benchmark/playground; ditegakkan lint.
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
loader dev esbuild (ADR-0006) · adapter UI pertama React (ADR-0003) · bundler Vite (ADR-0005/0007) ·
host runtime Rust + V8 (Phase 4+) · CI: lint → typecheck → test → build → security checks.

## Benchmark (blueprint §8)

Baseline (mesin dev; **bukan klaim publik**): `phase1-baseline.json` (HTTP),
`ssr-baseline.json` (SSR sinkron vs streaming), `phase2-web-vitals.json` (median 3 load).
Warm-up + beberapa ulangan, laporkan distribusi/median — bukan rata-rata. Gate **report-only**:
`pnpm bench:report`, `pnpm bench:ssr:report`, vitals di e2e (`VITALS_STRICT=1` untuk memblokir).

## Status & langkah berikutnya

Phase 0–3 **selesai** (2026-10-18); keputusan pemilik juga selesai — lisensi **MIT**, scope
**`@ramonyx/*`**, browser matrix evergreen 2 versi terakhir, rekonsiliasi PRD (ADR-0018).
**Phase 4 (runtime alpha) berjalan**: R0 selesai (workspace Cargo, CLI `ramonyx-runtime`, config,
structured logging — ADR-0019), **R1**: V8 via `deno_core` (ADR-0020) + module loader ESM &
transpile TypeScript via `deno_ast` (ADR-0021), **R2a**: I/O dasar + HTTP server pull-model
(ADR-0022), **R2b**: cancellation klien + keep-alive (ADR-0024), **R2c**: streaming respons
chunked (ADR-0025), **R3a**: permission model deny-all dengan flag `--allow-*` (ADR-0023), **resolusi `node_modules`
ESM v1** (ADR-0026), **`web_shim`** (URL/TextEncoder/Headers/Request/Response — ADR-0027),
**compatibility suite v1** (pipeline framework nyata berjalan di runtime — ADR-0028),
**interop CommonJS v1 + demo SSR React** (`react` + `react-dom/server.browser` di runtime —
ADR-0029), **`fetch` + `ReadableStream` + body streaming** (POST body, SSR streaming —
ADR-0030), **builtin subset + subset `@ramonyx/security` di runtime** (`node:net`/
`node:dns/promises`, `crypto.getRandomValues`, middleware security + guardedFetch/SSRF —
ADR-0031), **jembatan `serveHandler` + playground subset** (halaman SSR + API + POST +
security berjalan end-to-end lewat HTTP — ADR-0032), **resource limits** (kuota heap V8,
watchdog timeout, pencabutan permission runtime — ADR-0033), **isolasi worker + kuota**
(thread + isolate V8 terpisah, pesan JSON, permission irisan, kill switch — ADR-0034), dan
**streaming request + batas body server** (body pull-model + 413 dini — ADR-0035), dan
**`fetch` https + redirect** (TLS diverifikasi + CA kustom — ADR-0036), **R4 profiling startup**
(timings per fase, metrik op, baseline; snapshot V8 ditolak dengan alasan terukur — ADR-0037),
**kuota CPU per-thread + RSS proses** (ADR-0038), **release pipeline v1** (paket 0.1.0, tarball npm
+ binary runtime, verifikasi instalasi konsumen — ADR-0039), **isolasi level proses untuk plugin**
(`ramonyx.spawn`, protokol JSON, permission irisan, kill, **supervisi restart** — ADR-0040/0043,
**health-check heartbeat** — ADR-0044, **backoff eksponensial + health-check otomatis
(watchdog)** — ADR-0050, **sandbox OS (Landlock)** — ADR-0051),
**scaffolder aplikasi**
(`pnpm create:app` — template file-routing **SSR React + hydration**, ADR-0041), **SSR streaming
Node** (`renderToReadableStream` via `react-dom/server.edge` — ADR-0047; jalur sinkron tetap
untuk halaman error), **bench SSR + ambang Web Vitals** (report-only — ADR-0048), **pra-publikasi**
(publish dari tarball terverifikasi + guard tag↔versi + dist-tag + `create-ramonyx-app` — ADR-0049),
dan **situs
dokumentasi** (`pnpm docs`, dogfood **penuh**: SSR + hydration/soft navigation atas `docs/**` — ADR-0042) —
semuanya diverifikasi test + smoke.
**Exit criteria Phase 4 tercapai**; **publikasi npm selesai** (2026-10-18: 13 paket @ 0.1.0
terbit — `@ramonyx/*`, `ramonyx`, `create-ramonyx-app`; verifikasi registry end-to-end ✓;
**workflow `release.yml` dieksekusi sukses** pada tag `v0.1.0` → GitHub Release 16 aset, publish
idempoten; CI runner hijau).
Sisa Phase 5/kandidat: evaluasi `--strict` bench, hosting dokumentasi.
Ringkas Phase 3: limits body/timeout/concurrency +
rate limit per klien (ADR-0011/0012/0017), security headers + CSRF + CSP nonce + SSRF guard +
output limit (`@ramonyx/security`, ADR-0013–0015), fuzz fast-check, suite `tests/security/`,
abuse/soak `pnpm bench:security`, ASVS mapping (12 kriteria teruji), dependency policy + Dependabot
(ADR-0016); 156 tes Node + 5 e2e + 111 test Rust hijau.
