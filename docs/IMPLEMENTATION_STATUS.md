# Ramonyx — Implementation Status

> Laporan audit berbasis bukti repository. **Bukan** roadmap kerja (roadmap per fase tetap di
> `docs/roadmap/phase-0-1.md`; file ini dibuat terpisah karena diminta sebagai snapshot status
> implementasi dan tidak menggantikan dokumen tersebut).

## 1. Ringkasan Eksekutif

- **Tanggal audit:** 2026-10-18.
- **Repository/branch:** `main`, commit terakhir `bf1a72e` (working tree bersih sebelum & sesudah
  audit; tidak ada perubahan pengguna yang tertimpa).
- **Fase saat ini (berdasarkan bukti):** Phase 0–3 **selesai**; **exit criteria Phase 4 tercapai**
  (ADR-0032); **Phase 5 berjalan dengan sebagian besar item selesai** (isolasi worker, kuota
  resource, streaming request, pipeline rilis, isolasi proses plugin + supervisi + health-check).
  Sisa Phase 5: evaluasi `--strict` bench + hosting dokumentasi (opsional).
- **Status keseluruhan:** seluruh gate yang dijalankan dalam audit **hijau** — lint, typecheck,
  128 tes Node, 5 e2e, fmt/clippy, 101 tes Rust, build produksi, dan verifikasi rilis
  (instalasi tarball di proyek konsumen bersih). Tidak ada TODO/FIXME di source.
- **Kesimpulan:** repository adalah monorepo pnpm + Cargo workspace berisi framework TypeScript
  (11 paket `@ramonyx/*` + meta `ramonyx` — 12 total, versi 0.1.0) dan runtime Rust/V8
  eksperimental.
  Framework Node adalah baseline produksi; runtime menyatakan dirinya eksperimental dengan
  batasan terdokumentasi per ADR. Yang menghambat "rilis publik" bukan kode melainkan
  keputusan/kredensial pemilik (publikasi npm).

## 2. Status Fitur

| Area | Status | Bukti aktual | Gap / catatan |
|---|---|---|---|
| 1. Foundation & monorepo | DONE | `pnpm-workspace.yaml` (`packages/*`, `apps/*`), `package.json` (`packageManager pnpm@12.14.0`, `engines node>=24`), `tsconfig.base.json` (strict, `erasableSyntaxOnly`, `verbatimModuleSyntax`), `biome.json`, `LICENSE` MIT, `CHANGELOG.md` 0.1.0, versi seragam 0.1.0 (`Cargo.toml`, paket) | — |
| 2. Framework core & public API | DONE | `packages/core/src/*` (`route`, `HttpError`, `resolveConfig`, `defineConfig`, tipe `FetchHandler`/`Middleware`), meta `packages/ramonyx`; test `packages/core/test/{route,config,errors}.test.ts` | Auth/authz bukan bagian paket core (lihat §6) |
| 3. Router & request lifecycle | DONE | `packages/router/src/match.ts` (statis, param, **catch-all `[...name]`**, 405 `method-not-allowed`), pipeline `packages/server/src/handler.ts`; test `packages/router/test/match.test.ts`, `match.fuzz.test.ts`, `packages/server/test/pipeline.test.ts` | — |
| 4. Middleware, context, error, cancellation | DONE | `handler.ts` (`next(request?)`, `strictValidation`), timeout 10 s → 503 + abort `request.signal` (ADR-0011), `HttpError` → status publik; test `pipeline.test.ts`, `tests/security/server-hardening.test.ts` | — |
| 5. Runtime schema validation | DONE | `packages/schema/src/validate.ts` (Standard Schema v1 struktural), adapter (`adapters.test.ts` termasuk zod), fuzz `validate.fuzz.test.ts`; validasi input+output di server (`validateInput`/`validateOutput`) | — |
| 6. Server/client boundary & build output | DONE | `packages/bundler/src/build.ts` (Vite → `dist/client/client.js`), codegen entry `packages/compiler/src/client-entry.ts`; audit menjalankan `pnpm build` → `apps/playground/dist/client` | Belum ada code splitting/chunk manual (default Vite) |
| 7. SSR, streaming, hydration, client navigation | DONE (dengan catatan) | `packages/ssr/src/pages.ts` (loader → render → dokumen + payload `window.__RAMONYX__`), `packages/react/src/{renderer,client}.ts` (hydrate + soft navigation + payload segar setelah navigasi); e2e `ssr.spec.ts`, `navigation.spec.ts` (5/5 lulus audit) | SSR streaming Node terintegrasi (ADR-0047: `Renderer.renderStream` + `react-dom/server.edge`, opt-in `streaming: true` — playground dev+produksi mengaktifkan; parity byte-per-byte + aliran + batas diuji); jalur sinkron tetap dipakai untuk halaman error |
| 8. Compiler, bundler, route manifest, source maps | DONE | `packages/compiler/src/{manifest,pages,client-entry}.ts`, test 5 file; **source map produksi aktif** (ADR-0046): `buildClient` default `sourcemap: true`, paket npm `sourceMap+inlineSources`, `verify-release` memeriksa map + `sourcesContent` | — |
| 9. Security baseline & threat-model | DONE (dengan catatan) | `packages/security` (headers, CSP nonce, CSRF double-submit, rate limit, SSRF guard) + limit body/timeout/concurrency di server; `docs/security/{threat-model,asvs-mapping,dependency-policy}.md`; test `packages/security/test/*` (5 file), `tests/security/`, fuzz; `pnpm audit --audit-level high` exit 0, **No known vulnerabilities found** (override `hyperid@4`) | pentest/escape plugin belum dinilai (lihat §6) |
| 10. Testing, compatibility, regression | DONE | 156 tes Node (termasuk fuzz fast-check), 5 e2e Playwright, 111 tes Rust (termasuk **8 file integrasi** compat: framework, SSR, SSR streaming, security, playground subset, TLS fetch, isolasi proses plugin, CLI) | — |
| 11. Benchmark, profiling, memory, regression | DONE (gate report-only) | Artefak baseline + harness; **gate report-only**: HTTP (ADR-0045), **SSR** (ADR-0048: `benchmarks/ssr/bench.tsx` — paritas byte-per-byte + suspense + `--expose-gc`), **Web Vitals** (median 3 load + ambang absolut); unit compare/stats + langkah CI non-blocking + perbandingan `benchmarks/runtime-startup.sh`; timings+metrik op runtime (ADR-0037) | Gate **belum memblokir** (disengaja); toleransi belum dikalibrasi multi-mesin |
| 12. Developer tooling, CLI, dev server, diagnostics | DONE | `tools/register.mjs` (loader esbuild, ADR-0006), `apps/playground/src/dev.ts` (Vite+HMR→SSR), CLI runtime `ramonyx-runtime` (R0+flag permission/kuota/profiling), `apps/create-app` (scaffolder + smoke), `apps/docs` (dogfood SSR+hydration), `--op-metrics` + log `engine.executed` | — |
| 13. Runtime host & engine integration | DONE (eksperimental) | `runtime/crates/{cli,js-engine,runtime-core}` (deno_core/V8, ADR-0020), compile & 101 tes Rust lulus | Klaim produksi tidak dibuat; lihat batasan per ADR |
| 14. Runtime module loading/fs/net/permission | DONE (subset terdokumentasi) | ESM+TS+`node_modules` v1, interop CommonJS, `web_shim`, builtin `node:net`/`node:dns/promises`, HTTP server pull-model (streaming request+respons), permission deny-all + revoke, kuota heap/CPU/RSS/timeout, worker isolate, proses plugin + supervisi + health-check + backoff eksponensial + watchdog + **sandbox OS (Landlock: FS kelas-denotasi + TCP)** (ADR-0021–0044, ADR-0050/0051) | Batasan eksplisit: tanpa HTTPS server/h2, CommonJS subset, tanpa worker fairness/quota CPU lintas proses, tanpa isolasi namespace/PID (Landlock saja), net deny hanya TCP (bukan UDP/DNS) |
| 15. Docs, examples, CI, release readiness | DONE | 52 ADR (`docs/adr/`), BLUEPRINT/PRD/architecture/api-contract/security docs, situs docs `pnpm docs` **+ hosting GitHub Pages** (ekspor statis `pnpm docs:export`, `pages.yml` — ADR-0052), CI `.github/workflows/ci.yml` (**hijau di runner**), release pipeline `.github/workflows/release.yml` (**dieksekusi sukses pada tag `v0.1.0`** — ADR-0049) + `pnpm release` + `pnpm release:verify` | **Terbit di npm** (13 paket @ 0.1.0) + **GitHub Release** (16 aset); docs publik di https://ramonyxjs.github.io/ramonyx/ — `docs/releasing.md` |

## 3. Implementasi yang Sudah Terverifikasi

Berikut fitur dengan bukti **eksekusi** (bukan hanya keberadaan kode). Semua dijalankan pada audit
ini kecuali disebut lain.

1. **Pipeline HTTP framework (Node)**: routing + validasi + middleware + limit.
   Bukti: `pnpm test` → 128/128 lulus; test kunci `packages/server/test/pipeline.test.ts`,
   `tests/security/server-hardening.test.ts`.
2. **SSR + hydration + soft navigation** di browser sungguhan.
   Bukti: `pnpm test:e2e` (Playwright, 5/5, 10.2 s) — `ssr.spec.ts` (counter interaktif),
   `navigation.spec.ts` (sentinel bertahan + payload segar), `errors.spec.ts`, `vitals.spec.ts`.
3. **Build produksi** (client bundle Vite).
   Bukti: `pnpm build` exit 0 → `apps/playground/dist/client/client.js`.
4. **Rilis terpasang di konsumen bersih (Node polos, tanpa loader)**.
   Bukti: `pnpm release:verify` exit 0 — 12 tarball npm + binary runtime; smoke
   `SMOKE OK halo,dunia paket 24.22.0`; `ramonyx-runtime 0.1.0` + eksekusi skrip.
5. **Runtime Rust/V8**: 101 tes Rust lulus termasuk integrasi compatibility
   (`compat_framework.rs`, `compat_ssr.rs`, `compat_stream_ssr.rs`, `compat_security.rs`,
   `compat_playground.rs`, `fetch_tls.rs`, `plugin_process.rs`) — pipeline framework, SSR, SSR
   streaming, security, playground subset, TLS fetch, isolasi+supervisi+health-check plugin.
6. **Hardening server**: 413 (batas body, termasuk chunked & content-length bohong), 503
   timeout/concurrency — diuji di `tests/security/server-hardening.test.ts`.
7. **Scaffolder & situs docs**: `apps/create-app/test/create-app.test.ts` (struktur + **smoke
   app** + **build klien + aset**), `apps/docs/test/docs.test.ts` (SSR payload, pencarian,
   guard traversal, build klien).

## 4. Pekerjaan Parsial dan Gap

1. **Performance regression gate (benchmark)** — *selesai 2026-10-18 (ADR-0045):* `pnpm bench:report`
   (report-only) + unit compare + langkah CI non-blocking; **kalibrasi tuntas**: protokol §8
   penuh (warm-up 3 s + 5 ulangan, median + spread via `stats.ts`), peringatan `p50 +37%`
   sebelumnya terbukti **artefak sekali-jalan tanpa warm-up**, baseline diperbarui eksplisit
   (p50 34 / p90 48 / p99 72 / rps 1318), perbandingan lanjutan semua dalam toleransi
   (≤ 5.6%). *Diperluas 2026-10-18 (ADR-0048):* gate **SSR** (`pnpm bench:ssr:report` — paritas
   byte-per-byte, skenario suspense, lantai delta 1 ms) + **ambang Web Vitals** (median 3 load,
   ambang absolut, report-only) + `NODE_ENV=production` untuk server produksi/template.
   Sisa: multi-invokasi tambahan bila ingin `--strict`.
   — *kondisi awal:* artefak baseline ada
   (`benchmarks/results/*.json`), harness ada, tetapi CI hanya mengunggah artefak tanpa
   membandingkan threshold, dan audit ini tidak menjalankan bench karena skrip menulis ulang
   baseline ter-commit. *Dampak:* regresi performa tidak terdeteksi otomatis. *Langkah:*
   tambahkan mode bench "report-only" (tanpa menimpa baseline), bandingkan p50/p90 terhadap
   baseline dengan toleransi, jadikan gate non-blocking dahulu.
2. **Source map produksi** — *selesai 2026-10-18 (ADR-0046):* `buildClient` default
   `sourcemap: true`; paket npm `sourceMap + inlineSources`; `verify-release` memeriksa map di
   tarball; bukti: `client.js.map` 19 sumber + `sourcesContent`, asersi create-app/docs lulus.
   — *kondisi awal:* `buildClient` tidak mengaktifkan `build.sourcemap`.
   *Dampak:* stack trace produksi menunjuk ke bundel terminifikasi (minify juga off saat ini).
   *Langkah:* opsi `sourcemap: true` + unggah `.map` sebagai artefak rilis; verifikasi dengan
   memicu error di browser produksi.
3. ~~SSR streaming di framework Node~~ — *selesai 2026-10-18 (ADR-0047):* `Renderer.renderStream`
   opsional + React `renderToReadableStream` via **`react-dom/server.edge`** (build `browser`
   menahan event loop Node lewat `MessageChannel` — ganti setelah diverifikasi); dokumen dipecah
   pada penanda body; adapter Node pipe chunked (putus koneksi bila error setelah header);
   opt-in `streaming: true` (playground dev+produksi). Bukti: 8 test baru (paritas byte-per-byte
   vs sinkron, aliran sungguhan, fallback, batas output, penolakan renderStream), e2e 5/5 di
   atas streaming, smoke `Transfer-Encoding: chunked`, compat runtime tetap lulus.
4. ~~Advisory dependency dev-only~~ — *selesai 2026-10-18:* override `hyperid: 4.0.0`
   (menjatuhkan `uuid <11.1.1`) di `pnpm-workspace.yaml`; autocannon 8 tetap berfungsi (dibuktikan
   dengan menjalankan `pnpm bench:report`); `pnpm audit` → **No known vulnerabilities found**.
5. **Plugin: health-check kooperatif** — *kondisi:* deteksi hang memerlukan
   `ramonyx.heartbeat()` dan hanya dievaluasi saat induk menunggu (`receive`). *Dampak:* plugin
   idle panjang dapat dianggap hang bila salah konfigurasi. *Langkah:* health-check otomatis
   (liveness dari sisi runtime) atau dokumentasi pola heartbeat lebih menonjol di template.
6. ~~Sandbox OS untuk plugin~~ — *selesai 2026-10-18 (ADR-0051):* **Landlock LSM** opt-in
   (`--sandbox*` di CLI; `ramonyx.spawn(..., { sandbox })`), kelas eksplisit (baca/tulis/TCP),
   irisan dengan permission efektif, auto-izin entry dir/CA TLS/proc-self kuota, fail-hard bila
   tak didukung. Uji positif/negatif kernel lulus. Batasan dicatat: tanpa namespace/PID,
   net deny hanya TCP, AllowAll murni tidak bisa dipersempit.

## 5. Hasil Verifikasi

| Pemeriksaan | Command / metode | Hasil | Catatan |
|---|---|---|---|
| Lint | `pnpm lint` | **PASS** | 155 file diperiksa; tanpa perbaikan |
| Typecheck | `pnpm typecheck` | **PASS** | exit 0 |
| Tes Node (unit+integration+fuzz+security) | `pnpm test` | **PASS** | 128 tes, 0 gagal |
| Audit dependency | `pnpm audit --audit-level high` | **PASS** | **No known vulnerabilities found** (setelah override `hyperid@4`) |
| Rust format | `cargo fmt --all --check` | **PASS** | exit 0 |
| Rust lint | `cargo clippy --workspace --all-targets -- -D warnings` | **PASS** | exit 0 |
| Tes Rust | `cargo test --workspace` | **PASS** | 101 lulus, 0 gagal |
| Build produksi | `pnpm build` | **PASS** | `apps/playground/dist/client/client.js` |
| Browser e2e | `PLAYWRIGHT_EXECUTABLE_PATH=<cache ms-playwright chromium-1248> pnpm test:e2e` | **PASS** | 5/5 (10.2 s) |
| Verifikasi rilis | `pnpm release:verify` | **PASS** | tarball npm + binary runtime terpasang & jalan; **termasuk pemeriksaan source map** (`✓ npm: source map (1 sumber)`) |
| Perf report gate | `pnpm bench:report` | **PASS** | Report-only pasca-kalibrasi: p50 +2.94%, p90 +2.08%, p99 +5.56%, rps −0.38% — semua dalam toleransi; baseline tidak tersentuh |
| Source map build | `pnpm build` + inspeksi `client.js.map` | **PASS** | 19 sumber dengan `sourcesContent` |
| Source map paket | `pnpm release` + `verify-release` | **PASS** | `*.js.map` ada di tarball; `sourcesContent` non-kosong |
| Tes Node (pembaruan) | `pnpm test` | **PASS** | **156 tes** (termasuk compare/stats untuk gate HTTP/SSR/vitals + 8 streaming) |
| SSR streaming Node (ADR-0047) | `pnpm test` (ssr/react/adapter) + e2e + curl | **PASS** | parity byte-per-byte vs sinkron; `Transfer-Encoding: chunked`; payload hydration utuh; proses Node keluar bersih (`server.edge`) |
| Kalibrasi bench (protokol §8) | `pnpm bench:report` ×2 + `pnpm bench` (refresh baseline) | **PASS** | median p50 33–35 ms (stabil ≤ ~9% antar-invokasi); perbandingan lanjutan ≤ 5.6% |
| Refresh baseline HTTP | `pnpm bench` | **PASS** | baseline baru: p50 34 / p90 48 / p99 72 / rps 1318 (5 ulangan + warm-up 3 s) |
| Dry-run npm pra-publikasi (ADR-0049) | `npm publish --dry-run` ×13 tarball | **PASS** | exit 0 tanpa warning; nama/versi benar; `create-ramonyx-app` memuat bin 755 + shebang + template |
| CI GitHub pertama (2026-10-18) | `gh run view` + log job | **PASS (setelah perbaikan)** | 3 bug laten ditemukan & diperbaiki: (1) langkah toolchain Rust tanpa input `toolchain`; (2) job Rust tanpa `pnpm install` (fixture compat butuh node_modules); (3) test CI menggantung — assert `::1` vs `127.0.0.1` gagal → `server.close()` terlewat → listener bocor; kini: normalisasi loopback `::1` → `127.0.0.1` di adapter + `try/finally` pada test server + `--test-timeout=120000`/`--test-force-exit` sebagai jaring pengaman. Plus 1 flaky Rust diperbaiki (worker menunggu pesan induk — race "worker sudah berhenti") |
| CI GitHub (setelah semua perbaikan) | run `948aaf5` | **PASS** | gate (lint→test→build→e2e→security) + Rust (fmt/clippy/test) — keduanya hijau di runner |
| Workflow Release `v0.1.0` (ADR-0049) | tag `v0.1.0` → run 39134803417 | **PASS** | 14 artefak + verifikasi penuh (konsumen bersih + scaffold `create-ramonyx-app` build/start/SSR dari tarball + runtime); **GitHub Release** 16 aset (13 tarball + runtime + SHA256SUMS + manifest); job publish skip (NPM_TOKEN belum ada saat itu — secret kini terpasang) |
| Backoff + watchdog plugin (ADR-0050) | `cargo test --workspace` | **PASS** | 104 test Rust; watchdog membunuh plugin senyap **tanpa `receive`** (test baru), reset kuota setelah generasi stabil (test baru), unit backoff eksponensial; 10 test plugin lama tetap hijau |
| Sandbox OS plugin (ADR-0051) | `cargo test --workspace` | **PASS** | 111 test Rust; kernel menolak baca `/etc/hostname` walau permission JS `read: true` (uji fs), `fetch` ditolak kernel saat `sandbox: { net: false }` (ABI≥4), unit saringan ABI+irisan+parse CLI |
| Ekspor + hosting docs (ADR-0052) | `pnpm docs:export --base /ramonyx` + smoke | **PASS** | 65 halaman + 404 + aset + `.nojekyll`; smoke subpath `/ramonyx/` semua 200; base href + tautan `*.md` ditulis ulang; test docs 7/7 (termasuk ekspor end-to-end) |
| Verifikasi rilis (ADR-0049) | `pnpm release` + `release:verify` | **PASS** | 14 artefak; konsumen bersih + source map + **scaffold `app-baru`** + **build + start + SSR halaman dengan Node polos dari tarball** + runtime jalan |
| Loader runtime publik (ADR-0049) | `node --import @ramonyx/compiler/register` | **PASS** | app hasil scaffold jalan tanpa loader repo (Node menolak type-strip .ts di node_modules); pnpm `allowBuilds: esbuild` disertakan template |
| Benchmark HTTP | `pnpm bench` | **NOT RUN** | Skrip menulis ulang `benchmarks/results/phase1-baseline.json` (artefak ter-commit) — tidak dijalankan agar tidak mengubah artefak saat audit |
| Bench SSR (ADR-0048) | `pnpm bench:ssr` + `bench:ssr:report` ×3 | **PASS** | paritas byte-per-byte ✓ (small/medium/large); 2 report berturut-turut semua dalam toleransi; baseline pada skala 0,6–415 KB + suspense |
| Web Vitals (ADR-0048) | e2e + refresh baseline eksplisit | **PASS** | baseline baru: LCP 84 / FCP 84 / TTFB 11,1 / CLS 0 (median 3 load, produksi); report berikutnya semua dalam toleransi; ambang absolut ✓ |
| `NODE_ENV` produksi (ADR-0048) | `pnpm start`/`docs`/template + e2e | **PASS** | temuan: React dev dipakai di server produksi; kini `NODE_ENV=production` (e2e 5/5 di atas produksi) |
| Benchmark keamanan/soak | `pnpm bench:security` | **NOT RUN** | Harness abuse+soak (menulis artefak & menjalankan soak) — di luar cakupan audit ini |
| Baseline startup runtime | `benchmarks/runtime-startup.sh` | **NOT RUN** | Sama: menulis ulang `benchmarks/results/runtime-startup.json` |
| Publikasi npm | `npm publish` ×13 tarball | **PASS (2026-10-18)** | 13 paket @ 0.1.0 terbit (`@ramonyx/*`, `ramonyx`, `create-ramonyx-app`; dist-tag `latest`+`alpha` — npm otomatis menetapkan `latest` pada publish pertama); verifikasi registry end-to-end: scaffold → install → build → start → SSR + API + CSP ✓ |

## 6. Keamanan

**Implemented + tested** (bukti: test yang lulus pada audit `pnpm test`/`cargo test`):

- **Input validation & limits**: limit body 1 MiB → 413 (termasuk kasus chunked dan
  `content-length` bohong), timeout 10 s → 503 + abort `request.signal`, concurrency 100 → 503 +
  `Retry-After` (`tests/security/server-hardening.test.ts`); validasi schema input **dan** output
  (strictValidation) di `packages/server`.
- **Rate limiting** per klien dengan header alamat dari adapter (anti-spoof) + `trustProxy`
  opt-in (`packages/security/test/rate-limit.test.ts`).
- **CSRF** double-submit + perbandingan waktu-konstan (`csrf.test.ts`); **CSP nonce** per request,
  terintegrasi payload hydration (`csp.test.ts`; e2e memeriksa nonce).
- **SSRF guard** `guardedFetch` (tolak privat/loopback/link-local, validasi ulang per hop,
  `allowHosts` eksplisit) — `ssrf.test.ts` (5 skenario), dan di runtime Rust
  (`compat_security.rs`).
- **Path traversal**: guard pada aset `/assets/*` (template & situs docs diuji menolak `..%2F`);
  guard slug docs (`readDoc` menolak keluar dari `docs/`).
- **Dependency hygiene**: kebijakan `minimumReleaseAge: 1440` + Dependabot +
  `pnpm audit` di CI; `docs/security/dependency-policy.md`.
- **Permission boundary (runtime)**: default **deny-all**, flag `--allow-*`, pencabutan runtime
  (`ramonyx.permissions.revoke`, hanya mengurangi), permission plugin/worker = irisan induk
  (anti-eskalasi) — diuji di engine & `plugin_process.rs`.
- **Error handling**: `HttpError` memisahkan pesan publik (4xx) dari detail internal (5xx);
  log terstruktur tanpa menulis isi sensitif (fields eksplisit).

**Not assessed / belum diklaim:**

- Penetration testing independen dan audit pihak ketiga — belum ada.
- Escape sandbox plugin (seccomp/namespace belum ada) — ADR-0040 menyatakan ini isolasi
  crash/kapabilitas, **bukan** sandbox adversarial.
- Kepatuhan penuh OWASP ASVS — pemetaan 12 kriteria teruji ada di
  `docs/security/asvs-mapping.md`, bukan sertifikasi.
- Autentikasi/otorisasi umum: **tidak ditemukan modul auth** di paket framework (di luar scope
  fase yang diaudit; aplikasi memutuskan sendiri).
- ~~1 advisory moderate dev-only (`uuid`)~~ — ditutup via override `hyperid@4` (§4 butir 4); `pnpm audit` bersih.

## 7. Benchmark dan Performa

**Artefak yang ada (ter-commit, mesin dev)** — angka berikut berasal dari artefak, **tidak**
diukur ulang dalam audit ini:

| Artefak | Tanggal | Lingkup | Catatan |
|---|---|---|---|
| `benchmarks/results/phase1-baseline.json` | 2026-10-18 (refresh; sebelumnya 2026-10-17) | HTTP baseline (autocannon, **warm-up + 5 ulangan**) | env: linux x64, Node v24.22.0, 8 vCPU (AMD Ryzen 5 7520U); median p50 34 / p90 48 / p99 72 / rps 1318 |
| `benchmarks/results/phase2-web-vitals.json` | 2026-10-18 (refresh: median 3 load, React produksi) | Web Vitals beranda (Playwright) | LCP 84 / FCP 84 / TTFB 11,1 / CLS 0; nilai lama (sekali load, dev React) 360/360/40,9 |
| `benchmarks/results/ssr-baseline.json` | 2026-10-18 | Bench SSR sinkron vs streaming (warm-up 3 + 9 ulangan, `--expose-gc`) | median: small 2,8/1,7 ms; medium 14,9/12,7 ms (80 KB); large 53,0/52,1 ms (415 KB); suspense ttfb 1,6 ms vs total 57,7 ms |
| `benchmarks/results/phase3-abuse.json` | 2026-10-18 | Abuse-case + soak ringkas | env sama; "bukan klaim" |
| `benchmarks/results/runtime-startup.json` | 2026-10-18 | Startup runtime (7 run, median) | `mini` ~42 ms wall; `four-workers` ~84 ms; detail breakdown `v8Ms/bootstrapMs/webShimMs` (ADR-0037) |

- **Kesimpulan performa:** belum dapat dijadikan klaim publik; protokol ada
  (`docs/benchmark-protocol.md`) dan artefak reproducible (`pnpm bench`, `pnpm bench:ssr`,
  `benchmarks/runtime-startup.sh`, `pnpm bench:security`, vitals e2e). Gate **report-only**
  tersedia (HTTP/SSR/Web Vitals — ADR-0045/0048) tetapi belum memblokir dan toleransi belum
  dikalibrasi multi-mesin; audit awal tidak menjalankan ulang benchmark (alasan di §5).
- **Profiling runtime** tersedia: `engine.executed` (timings per fase) + `--op-metrics`
  (ADR-0037).
- **Report gate berjalan** (ADR-0045) dengan **protokol §8 penuh**: warm-up + 5 ulangan,
  median + spread; kalibrasi membuktikan peringatan `p50 +37%` sebelumnya adalah artefak
  sekali-jalan (median protokol penuh = 33–35 ms). Baseline diperbarui eksplisit.

## 8. Keputusan Arsitektur yang Sudah Ada

**Terdokumentasi (44 ADR di `docs/adr/`, indeks `docs/adr/README.md`)** — yang paling menentukan:

- ADR-0001 runtime dual-track (Node baseline, Rust/V8 eksperimental); ADR-0002 tooling
  (TS strict, ESM, source-first, pnpm); ADR-0003 UI adapter pertama React; ADR-0004 schema
  struktural; ADR-0005/0007/0008/0009 bundler Vite + hydration payload + soft navigation + dev
  server; ADR-0006 loader esbuild; ADR-0010 e2e browser.
- ADR-0011–0017 hardening (limit, concurrency, security package, CSP nonce, SSRF+output limit,
  dependency policy, rate limit); ADR-0018 keputusan pemilik (MIT, scope `@ramonyx/*`, browser
  matrix, rekonsiliasi PRD).
- ADR-0019–0044 runtime (CLI, V8, loader, I/O+HTTP, permission deny-all, cancellation,
  streaming, `node_modules`, `web_shim`, compatibility suite, CJS interop, fetch/streams,
  builtin+crypto+security, playground subset, resource limits, worker, streaming request,
  TLS+redirect, profiling, CPU/RSS quota, release pipeline, plugin proses + supervisi +
  health-check, create-app, docs app).

**Belum ditetapkan (usulan, tanpa mengubah arsitektur):**

- **ADR: Publikasi npm & versioning rilis** — *sebagian dijawab ADR-0049* (publish dari tarball
  terverifikasi, CI ber-token, dist-tag `alpha/beta/rc/latest`, provenance kondisional); yang tetap
  terbuka: semver versi-tunggal vs independent, dan siapa pemegang kredensial.
- **ADR: Strategi performance regression** — threshold per skenario, mode report-only, dan
  kebijakan menaikkan baseline.
- **ADR: Sandbox plugin** — *dijawab ADR-0051*: opt-in, Landlock (tanpa namespace/PID),
  batasan kompatibilitas didokumentasikan (Linux-only, TCP-only, fail-hard).

## 9. Risiko dan Blocker

| Risiko / blocker | Dampak | Bukti | Mitigasi atau keputusan yang diperlukan |
|---|---|---|---|
| ~~Publikasi npm belum dilakukan~~ | — | — | **Selesai 2026-10-18**: 13 paket @ 0.1.0 terbit + verifikasi registry end-to-end (`pnpm dlx create-ramonyx-app` → install/build/start/SSR). Sisa opsional: provenance (rilis berikutnya via CI + repo publik sudah siap) |
| ~~Tanpa performance-regression gate~~ | — | — | **Selesai**: gate report-only + kalibrasi protokol §8 (ADR-0045); `--strict` masih ditinjau |
| ~~Advisory moderate dev-only (`uuid`)~~ | — | — | **Selesai**: override `hyperid@4.0.0` → `pnpm audit` bersih |
| ~~Source map produksi tidak ada~~ | — | — | **Selesai**: ADR-0046 (client bundle + map di tarball npm) |
| Health-check plugin kooperatif | Plugin idle bisa dianggap hang | ADR-0044 §Batasan | Dokumentasi pola + health-check otomatis |
| Sandbox OS belum ada untuk plugin | Plugin tidak terkurung kernel | ADR-0040 §Batasan | ADR sandbox + implementasi opt-in |
| ~~Workflow rilis belum pernah dieksekusi~~ | — | — | **Selesai 2026-10-18**: dieksekusi sukses pada tag `v0.1.0` (14 artefak + GitHub Release; publish idempoten) |

Tidak ada blocker teknis (P0): seluruh build/test/gate hijau pada commit audit.

## 10. Prioritas Berikutnya

**P0 — Blocker:** tidak ada.

**P1 — Core (menuntaskan rilis):**

1. ~~Publikasi npm 0.1.0 + eksekusi `release.yml` sekali.~~ — *npm **terbit 2026-10-18***:
   13 paket @ 0.1.0 (npm otomatis menetapkan `latest` pada publish pertama; `alpha` juga ada).
   Verifikasi registry end-to-end ✓ (`pnpm dlx create-ramonyx-app` → install → build → start →
   SSR + API + CSP). **Workflow `release.yml` dieksekusi sukses** pada tag `v0.1.0` (2026-10-18):
   14 artefak + verifikasi penuh + **GitHub Release** (16 aset); job publish skip (versi sudah ada —
   idempoten); secret `NPM_TOKEN` kini terpasang untuk rilis berikutnya.
2. ~~Perf regression gate (report-only dahulu)~~ — **selesai (ADR-0045/0048)**: gate report-only
   HTTP + SSR + Web Vitals dengan langkah CI non-blocking; baseline hanya berubah lewat perintah
   eksplisit (`pnpm bench`, `pnpm bench:ssr`).

**P2 — Hardening:**

3. ~~Source map produksi~~ — **selesai (ADR-0046)**.
4. ~~Kalibrasi perf gate~~ — **selesai (ADR-0045 lanjutan)**: protokol §8 penuh diterapkan
   (warm-up + 5 ulangan, median/spread); temuan p50 lama = artefak sekali-jalan; baseline
   direfresh eksplisit. Sisa opsional: evaluasi `--strict` setelah beberapa invokasi tenang.
5. ~~Resolusi advisory `uuid` dev-only~~ — **selesai**: override `hyperid@4`; audit bersih.
6. ~~SSR streaming Node (`renderToReadableStream` → Response stream)~~ — **selesai (ADR-0047)**:
   parity konten + aliran + batas diuji; e2e playground produksi berjalan di atas streaming.

**P3 — Future (runtime eksperimental):**

6. ~~Sandbox OS plugin (opt-in)~~ — **selesai (ADR-0051)**: Landlock (FS + TCP), uji
   positif/negatif kernel, irisan permission, fail-hard bila tak didukung.
7. ~~Health-check otomatis plugin (liveness sisi runtime) dan backoff eksponensial~~ — **selesai
   (ADR-0050)**: watchdog latar + backoff eksponensial + reset stabil.
8. Baseline benchmark publik di hardware/CI standar (bila ingin klaim performa §10 BLUEPRINT).

## 11. Definition of Done untuk Fase Berikutnya (Rilis 0.1.0)

- [ ] Versi & changelog siap (0.1.0 — sudah ada; pastikan tag `v0.1.0` konsisten).
- [ ] `pnpm release` menghasilkan 13 artefak (12 npm + 1 runtime) + `SHA256SUMS` + manifest.
- [ ] `pnpm release:verify` lulus di mesin bersih (Node polos, tanpa loader).
- [ ] Workflow `.github/workflows/release.yml` dieksekusi sekali pada tag dan sukses
      (termasuk GitHub Release).
- [ ] Publikasi npm sukses (bila diotorisasi) **atau** keputusan tertulis untuk menunda
      publikasi (dengan alasan) — tanpa klaim "terbit" sebelum benar-benar terbit.
- [ ] Gate CI hijau pada commit tag: lint, typecheck, 128 tes Node, 5 e2e, 101 tes Rust,
      `pnpm audit --audit-level high`.
- [ ] Tidak ada klaim benchmark/keamanan baru tanpa data reproducible (BLUEPRINT §10).

## 12. Catatan Audit dan Keterbatasan

- **Dokumen progres lama:** `docs/roadmap/phase-0-1.md` sudah ada (checklist per fase, diperbarui
  selama pengembangan). Audit ini **tidak menghapus/menggantikannya**; `docs/IMPLEMENTATION_STATUS.md`
  adalah snapshot berbasis bukti, dan keduanya saling merujuk.
- **Benchmark tidak dijalankan ulang** karena ketiga skrip (`pnpm bench`, `pnpm bench:security`,
  `benchmarks/runtime-startup.sh`) menulis ulang artefak baseline yang ter-commit; menjalankannya
  saat audit akan mengubah file repository. Angka di §7 dikutip dari artefak yang ada, bukan
  pengukuran baru.
- **Soak panjang** (`SOAK_SECONDS=300`) dan abuse-case lengkap tidak dijalankan dalam audit
  (durasi & penulisan artefak).
- **e2e** memakai Chromium dari cache Playwright lokal (`~/.cache/ms-playwright/chromium-1248`),
  bukan `playwright install` baru.
- **Tanpa remote/CI runner:** workflow rilis tidak dapat dieksekusi di sini; verifikasi rilis
  dilakukan lokal lewat script yang sama.
- **Platform audit:** linux x64, Node v24.22.0, pnpm 12.14.0, Rust 1.99.0 (toolchain dipin).
  Hasil di platform lain belum diverifikasi (kuota CPU/RSS runtime memang Linux-only).
- **Auth/authz, i18n, database/ORM, dan pentest escape sandbox** tidak dinilai (sandbox OS
  plugin kini ada — ADR-0051 — tetapi belum diuji sebagai target escape/pentest).
- Tidak ada secret/kredensial yang dibaca atau ditampilkan; variabel yang relevan hanya nama
  (`NPM_TOKEN` untuk publikasi).
