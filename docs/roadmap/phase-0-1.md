# Roadmap Phase 0–1

- Status per 2026-10-18: **Phase 0–3 selesai; Phase 4 berjalan** (R0 selesai, R1-lite: eksekusi
  JavaScript via V8 berjalan di CLI runtime).
- Sumber: `docs/BLUEPRINT.md` §9 dan §12.

## Phase 0 — Foundation & RFC ✅

Exit criteria: keputusan arsitektur terdokumentasi dan dapat diuji.

- [x] Bootstrap repo (README, `.gitignore`, git `main`)
- [x] ADR-0001 strategi runtime (Accepted)
- [x] ADR-0002 baseline tooling & CI (Accepted)
- [x] ADR-0003 adapter UI React (Accepted)
- [x] ADR-0004 kontrak schema Standard Schema (Accepted; diimplementasikan di `packages/schema`)
- [x] ADR-0005 bundler (Accepted; Phase 1 source-first tanpa bundler)
- [x] `docs/architecture.md`, `docs/api/core-contract.md` v0, threat model, benchmark protocol,
      coding standards
- [x] Keputusan pemilik (2026-10-18): lisensi **MIT**, scope **`@ramonyx/*`**, browser matrix
      evergreen (2 versi terakhir, ES2022), rekonsiliasi PRD — ADR-0018

## Phase 1 — Framework MVP (inti selesai di mesin dev) ✅

Exit criteria: demo app berjalan di Node.js, integration test lulus, baseline performa tercatat.

1. [x] Prasyarat: pnpm 12 standalone (`PNPM_HOME`), Node 24
2. [x] Workspace: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`; `apps/playground`;
      `packages/{core,router,server,schema,adapter-runtime,testing,ramonyx}`
3. [x] CI: lint → typecheck → test → security checks (build menyusul Phase 2 — ADR-0005)
4. [x] `adapter-runtime`: kontrak `RuntimeHost` + adapter in-memory + Node
5. [x] `core`: context, middleware, error handling + `HttpError`
6. [x] `router`: statis + parameter, 404/405, normalisasi trailing slash
7. [x] `schema`: Standard Schema + normalisasi issues (diuji zod 4 & valibot 1)
8. [x] `server`: HTTP → middleware → router → handler + validasi input/output; loader config
9. [x] `testing`: `createTestServer`
10. [x] Demo `apps/playground` + integration test — **46 tes hijau**
11. [x] Baseline benchmark: `benchmarks/results/phase1-baseline.json` (mesin dev: ±1.200–1.300 req/s,
    p50 ±35 ms, p99 81–123 ms, 0 error dari dua run; **bukan klaim publik**)
12. [x] Dokumen disinkronkan (catatan semantik di `core-contract.md` §10)

Catatan implementasi Phase 1:

- Source-first: paket mengekspor `.ts`, dijalankan Node type stripping; syntax non-erasable dilarang.
- Handler menerima output hasil validasi schema (transform/strip diterapkan), bukan input mentah.
- Manifest route eksplisit; file-based routing menyusul Phase 2.

## Phase 2 — Full-stack (berjalan)

- [x] File routing API: `createRouteManifest` (`packages/compiler`) — pindai `src/routes/api/**`,
      `index`/`[param]`, prefix `_` diabaikan, file tanpa method → error saat startup
- [x] File routing halaman + SSR React: `loadPageRoutes` → `createPageRoutes` (`packages/ssr`) →
  adapter `packages/react` (layout/loader/error.tsx)
- [x] Bundler Vite + hydration (ADR-0005/0007): `@ramonyx/bundler` → `client.js`; payload
  `window.__RAMONYX__` + `hydrateAll` + aset statis `/assets/*`; diverifikasi di browser nyata
- [x] Dev server/HMR (ADR-0009): Vite (5173) + proxy manual ke SSR (3000); manifest/halaman
  dimuat ulang via `ssrLoadModule` (tanpa restart); live reload diverifikasi di browser
- [x] Client navigation (navigasi tanpa reload, ADR-0008): fetch HTML → swap `#ramonyx-root` →
  re-hydrate → `pushState`/`popstate`; diverifikasi di browser nyata
- [x] Browser test otomatis (Playwright, ADR-0010): hydration, soft navigation + back/forward
  (sentinel), halaman error 404/400; baseline Web Vitals → `benchmarks/results/phase2-web-vitals.json`

**Phase 2 selesai** (2026-10-18).

## Phase 3 — Security & performance hardening (berjalan)

Exit criteria: acceptance criteria keamanan yang ditetapkan lulus (BLUEPRINT §9).

- [x] Resource limits (ADR-0011): body 1 MiB → 413 (content-length sebelum routing + streaming),
      timeout 10s → 503 + `request.signal`
- [x] Body adapter Node streaming (tanpa buffer penuh)
- [x] Prototype pollution: `parseQuery` aman untuk `__proto__`/`constructor`
- [x] Fuzz/property test (fast-check): router matching, query parsing, normalisasi schema
- [x] Suite keamanan `tests/security/` (413, timeout+abort, pollution, default limit)
- [x] Abuse-case & soak terukur (`pnpm bench:security`, `SOAK_SECONDS` untuk durasi; ADR-0010-style
      artefak): 6 skenario serangan (oversized, JSON rusak, schema invalid, traversal, query raksasa,
      echo valid) semua sesuai ekspektasi tanpa 5xx/error. **Soak 5 menit + drain**: `heapUsed`
      sawtooth dengan full GC periodik (max ~0,9 GB → turun ~0,15 GB), `external` datar (≤7 MB),
      0 error → bukan kebocoran native; RSS high-water ~1,1 GB karena GC malas (saran operasional:
      batasi `--max-old-space-size`/container memory). Breakdown heap tersimpan di artefak.
      Soak berjam-jam tetap diperlukan sebelum klaim stabilitas (protokol §8).
- [x] Dependency audit berkelanjutan (ADR-0016): audit high di push/PR + cron mingguan, Dependabot
      (grup dev/prod, tanpa auto-merge), quarantine rilis 24 jam (`minimumReleaseAge`), kebijakan
      `docs/security/dependency-policy.md`; provenance menyusul saat publikasi
- [x] Pemetaan awal OWASP ASVS (`docs/security/asvs-mapping.md`) + primitif XSS/CSRF:
      `@ramonyx/security` — `securityHeaders()`, `cspNonce()` (CSP nonce, ADR-0014),
      `csrfProtection()` (ADR-0013)
- [x] Concurrency limit / load shedding (ADR-0012): default 100 → 503 + `Retry-After`, tanpa antrean
- [x] Output limit dokumen SSR (ADR-0015) + rate limiting per klien (ADR-0017)
- [ ] Defer eksplisit (bukan blocker Phase 4): verifikasi CSRF via field form (menunggu API body
      bersama), IP-pinning guard SSRF, React fast-refresh plugin, code splitting client bundle,
      `apps/create-app` + `apps/docs`, topologi rilis/versioning, perluasan pemetaan per item ASVS
- [x] Catch-all router `[...name]` + halaman 404 HTML kustom (`metadata.status`) — gap "path tak
      dikenal → JSON" ditutup (uji unit + e2e)

**Phase 3 selesai** (2026-10-18) — exit criteria "acceptance criteria keamanan yang ditetapkan
lulus": 12 kriteria teruji di `docs/security/asvs-mapping.md`; seluruh baris threat model tertutup
kecuali path traversal runtime & isolasi plugin (Phase 4). Berikutnya: keputusan pemilik lalu
Phase 4 (runtime alpha).

## Phase 4 — Runtime alpha: Rust + V8 (berjalan)

- [x] **R0** — Workspace Cargo (root `Cargo.toml`, members `runtime/crates/*`), toolchain dipin
      (`rust-toolchain.toml` 1.99.0 + rustfmt/clippy), `runtime-core` (config `ramonyx.runtime.json`
      + structured logger JSON-lines), CLI `ramonyx-runtime` (`version`/`config`/`run`), exit code &
      error jelas; 15 test Rust + clippy/fmt bersih (ADR-0019)
- [x] **R1** — Module loader ESM (resolusi relatif + fallback ekstensi/index) + **transpile
      TypeScript** via `deno_ast` (ADR-0021); `run main.ts` dengan import relatif `.ts` berjalan
      end-to-end lewat V8; bare specifier ditolak dengan pesan jelas (ADR-0021)
- [x] **R1 sisa (parsial)** — resolusi paket `node_modules` **ESM v1** (ADR-0026): walk-up,
      `exports` (kondisi import/module/default, subpath, wildcard), fallback `module`/`main`/
      `index.js`; CJS ditolak dengan pesan jelas; diuji 5 unit + 1 integrasi engine
- [ ] **Sisa package compat** — interop CommonJS, kondisi `imports`/self-reference, urutan key
      penuh; import JSON/WASM
- [x] **R2a** — I/O dasar (ADR-0022): `ramonyx.sleep/readTextFile/writeTextFile/env.get`;
      **HTTP server pull-model** (`serve(port, handler)` → `{ port, close() }`, bind 127.0.0.1,
      handler `{status, headers, body}`); diverifikasi test Rust hermetik + `curl` end-to-end
- [x] **R2b** — Cancellation klien (`ObservedIo` + `op_http_watch` + `request.signal`) dan
      **keep-alive** (ADR-0024); server tetap hidup saat klien putus; respons ke klien yang pergi
      menjadi no-op; diuji (abort saat handler berjalan, dua request satu koneksi)
- [x] **R2c** — **Streaming respons chunked** (ADR-0025): handler `body` sebagai AsyncIterable;
      ops `stream_start/chunk/end` dengan backpressure; `Transfer-Encoding: chunked` via hyper;
      cancellation tetap berlaku; diuji 3 chunk berurutan
- [ ] **R2 sisa** — streaming **request** (body masuk bertahap), graceful shutdown terkoordinasi
- [x] **R3a** — **Permission model** (ADR-0023): default **deny-all**; flag
      `--allow-read/write/net/env[=daftar]`; penegakan di ops fs/env/serve dengan pesan berisi
      petunjuk flag; canonicalization path (traversal tertutup); diverifikasi unit + engine + CLI
- [ ] **R3 sisa** — worker isolation, quota CPU/memori, pencabutan permission, shutdown terkoordinasi
- [ ] **R4** — optimasi startup/profiling

## Phase 3–5 (ringkas — detail di BLUEPRINT §9)

- **Phase 3:** fuzzing, abuse-case, load test, resource limits, dependency audit, security
  regression suite.
- **Phase 4:** runtime alpha (Rust + V8): executable, module loader, permission & API sistem dasar.
- **Phase 5:** runtime beta: HTTP/streaming/shutdown/cancellation, isolasi, profiling,
  compatibility suite, rilis.
