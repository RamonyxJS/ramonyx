# Content Policy — Public vs Internal Docs

## Aturan emas (satu arah)

1. **Build publik hanya membaca `docs/public/`.** Tidak ada filter, redaksi otomatis, pengecualian,
   atau pembacaan `docs/internal/` oleh build situs, ekspor statis, pencarian, `llms.txt`, sitemap,
   maupun paket npm yang membawa snapshot docs.
2. **Dokumen publik hanya boleh merujuk dokumen publik.** Tautan dari `docs/public/**` ke
   `docs/internal/**` dilarang (diperiksa `scripts/verify-no-leak.mjs` + validator).
3. **Ringkasan publik ditulis manual.** Berkas di `docs/public/` adalah konten berdiri sendiri yang
   ditulis manusia; tidak ada ringkasan/redaksi otomatis dari dokumen internal.
4. **Default aman.** Ragu → `internal`. Tidak ada kategori "redacted".
5. Bahasa: halaman prosa publik berbahasa **Inggris**; dokumen internal berbahasa Indonesia.
   Machine layer publik (`docs/public/machine/*.json`) mempertahankan bahasa sumbernya (Indonesia)
   karena merupakan data terstruktur untuk agen; ini batasan yang dicatat, bukan teks prosa.

## Mekanisme build (satu pilihan)

- Pemisahan **fisik**: `docs/public/` dan `docs/internal/`.
- Situs (`apps/docs`) memindai **hanya** `docs/public/` (katalog, pencarian, ekspor statis, sitemap,
  `llms.txt`).
- Rilis npm `@ramonyx/mcp-docs-server` menyalin **hanya** `docs/public/` ke dalam tarball.
- `docs/internal/` tetap di repo (repo publik) — kebijakan ini menjaga **situs/llms/npm**, bukan
  kerahasiaan repo. Jika kerahasiaan repo diperlukan, internal harus dipindah ke repo privat
  (keputusan pemilik, belum dilakukan).

## ADR

- ADR penuh (81) tinggal di `docs/internal/adr/` dengan frontmatter `visibility: internal`.
- ADR publik = **ringkasan berdiri sendiri** di `docs/public/adr/` (8 berkas) dengan frontmatter
  `visibility: public`; nomor ADR dipertahankan, ringkasan mencatat bahwa catatan penuh internal.
- ADR tanpa `visibility` dianggap **internal** (default aman).
- `/docs/adr` hanya menampilkan `docs/public/adr/`.

## Verifikasi CI (blocking)

1. `pnpm docs:validate` — skema machine publik, evidence hanya di root publik, indeks ADR dua arah
   (publik & internal), tautan satu arah, kesegaran `llms`/`api`/`cli`.
2. `pnpm docs:no-leak` — `scripts/verify-no-leak.mjs`: artefak build (situs statis) tidak memuat
   penanda internal (`IMPLEMENTATION_STATUS`, `PLAN-docs`, `threat-model`, `asvs-mapping`,
   `plugin-isolation-assessment`, `PRD`), `llms.txt` hanya path publik, sitemap hanya URL publik,
   tautan publik tidak menunjuk internal, indeks pencarian tidak memuat slug internal, tarball MCP
   hanya berisi docs publik.
3. Playwright: `/docs/adr/0018` → 404; pencarian `threat-model`/`IMPLEMENTATION_STATUS` → 0 hasil.

## Pemetaan 100% berkas `docs/`

| Berkas | Visibilitas | Alasan |
| --- | --- | --- |
| `docs/public/adr/0007-hydration.md` | **public** | halaman publik (Inggris) |
| `docs/public/adr/0047-ssr-streaming.md` | **public** | halaman publik (Inggris) |
| `docs/public/adr/0057-server-actions.md` | **public** | halaman publik (Inggris) |
| `docs/public/adr/0058-edge-target.md` | **public** | halaman publik (Inggris) |
| `docs/public/adr/0066-revalidate.md` | **public** | halaman publik (Inggris) |
| `docs/public/adr/0069-assets.md` | **public** | halaman publik (Inggris) |
| `docs/public/adr/0078-mcp-docs-server.md` | **public** | halaman publik (Inggris) |
| `docs/public/adr/0081-i18n.md` | **public** | halaman publik (Inggris) |
| `docs/public/adr/README.md` | **public** | indeks ADR publik |
| `docs/public/api/core-contract.md` | **public** | referensi API publik (ditulis ulang, Inggris) |
| `docs/public/assets-and-images.md` | **public** | halaman publik (Inggris) |
| `docs/public/data-and-caching.md` | **public** | halaman publik (Inggris) |
| `docs/public/decisions/frontend-stack.md` | **public** | alasan stack (wajib: no unjustified choice) |
| `docs/public/deployment.md` | **public** | halaman publik (Inggris) |
| `docs/public/for-agents.md` | **public** | panduan agen (llms + MCP) |
| `docs/public/getting-started.md` | **public** | halaman publik (Inggris) |
| `docs/public/machine/README.md` | **public** | penjelasan machine layer publik |
| `docs/public/machine/adrs.json` | **public** | indeks ADR publik (hanya 8) |
| `docs/public/machine/adrs.schema.json` | **public** | skema machine layer publik |
| `docs/public/machine/api.json` | **public** | hasil ekstraksi API publik |
| `docs/public/machine/api.schema.json` | **public** | skema machine layer publik |
| `docs/public/machine/cli.json` | **public** | hasil ekstraksi CLI |
| `docs/public/machine/cli.schema.json` | **public** | skema machine layer publik |
| `docs/public/machine/config.schema.json` | **public** | skema machine layer publik |
| `docs/public/machine/features.json` | **public** | status fitur publik (evidence disanitasi) |
| `docs/public/machine/features.schema.json` | **public** | skema machine layer publik |
| `docs/public/machine/glossary.json` | **public** | glosarium |
| `docs/public/machine/glossary.schema.json` | **public** | skema machine layer publik |
| `docs/public/machine/llms-full.txt` | **public** | artefak agen (dibangun dari docs/public) |
| `docs/public/machine/llms.txt` | **public** | artefak agen (dibangun dari docs/public) |
| `docs/public/machine/rules.json` | **public** | aturan menulis aplikasi |
| `docs/public/machine/rules.schema.json` | **public** | skema machine layer publik |
| `docs/public/machine/stats.json` | **public** | angka publik (versi/paket/ADR publik/test) |
| `docs/public/machine/stats.schema.json` | **public** | skema machine layer publik |
| `docs/public/plugins.md` | **public** | halaman publik (Inggris) |
| `docs/public/routing.md` | **public** | halaman publik (Inggris) |
| `docs/public/security/overview.md` | **public** | halaman publik (Inggris) |
| `docs/public/ssr-hydration.md` | **public** | halaman publik (Inggris) |
| `docs/internal/BLUEPRINT.md` | **internal** | blueprint teknis internal |
| `docs/internal/IMPLEMENTATION_STATUS.md` | **internal** | snapshot audit internal |
| `docs/internal/PLAN-docs-consolidation.md` | **internal** | rencana/riset internal |
| `docs/internal/PRD.md` | **internal** | persyaratan produk internal |
| `docs/internal/adr/0001-runtime-strategy.md` | **internal** | catatan penuh ADR internal (Inggris publik = ringkasan terpisah) |
| `docs/internal/adr/0002-baseline-tooling.md` | **internal** | catatan penuh ADR internal (Inggris publik = ringkasan terpisah) |
| `docs/internal/adr/0003-ui-adapter-react.md` | **internal** | catatan penuh ADR internal (Inggris publik = ringkasan terpisah) |
| `docs/internal/adr/0004-schema.md` | **internal** | catatan penuh ADR internal (Inggris publik = ringkasan terpisah) |
| `docs/internal/adr/0005-bundler.md` | **internal** | catatan penuh ADR internal (Inggris publik = ringkasan terpisah) |
| `docs/internal/adr/0006-jsx-loader.md` | **internal** | catatan penuh ADR internal (Inggris publik = ringkasan terpisah) |
| `docs/internal/adr/0007-hydration.md` | **internal** | catatan penuh ADR internal (Inggris publik = ringkasan terpisah) |
| `docs/internal/adr/0008-client-navigation.md` | **internal** | catatan penuh ADR internal (Inggris publik = ringkasan terpisah) |
| `docs/internal/adr/0009-dev-server.md` | **internal** | catatan penuh ADR internal (Inggris publik = ringkasan terpisah) |
| `docs/internal/adr/0010-browser-e2e.md` | **internal** | catatan penuh ADR internal (Inggris publik = ringkasan terpisah) |
| `docs/internal/adr/0011-resource-limits.md` | **internal** | catatan penuh ADR internal (Inggris publik = ringkasan terpisah) |
| `docs/internal/adr/0012-concurrency-limit.md` | **internal** | catatan penuh ADR internal (Inggris publik = ringkasan terpisah) |
| `docs/internal/adr/0013-security-package.md` | **internal** | catatan penuh ADR internal (Inggris publik = ringkasan terpisah) |
| `docs/internal/adr/0014-csp-nonce.md` | **internal** | catatan penuh ADR internal (Inggris publik = ringkasan terpisah) |
| `docs/internal/adr/0015-ssrf-guard-output-limit.md` | **internal** | catatan penuh ADR internal (Inggris publik = ringkasan terpisah) |
| `docs/internal/adr/0016-dependency-policy.md` | **internal** | catatan penuh ADR internal (Inggris publik = ringkasan terpisah) |
| `docs/internal/adr/0017-rate-limiting.md` | **internal** | catatan penuh ADR internal (Inggris publik = ringkasan terpisah) |
| `docs/internal/adr/0018-owner-decisions.md` | **internal** | catatan penuh ADR internal (Inggris publik = ringkasan terpisah) |
| `docs/internal/adr/0019-runtime-r0.md` | **internal** | catatan penuh ADR internal (Inggris publik = ringkasan terpisah) |
| `docs/internal/adr/0020-v8-engine.md` | **internal** | catatan penuh ADR internal (Inggris publik = ringkasan terpisah) |
| `docs/internal/adr/0021-module-loader.md` | **internal** | catatan penuh ADR internal (Inggris publik = ringkasan terpisah) |
| `docs/internal/adr/0022-runtime-io.md` | **internal** | catatan penuh ADR internal (Inggris publik = ringkasan terpisah) |
| `docs/internal/adr/0023-permission-model.md` | **internal** | catatan penuh ADR internal (Inggris publik = ringkasan terpisah) |
| `docs/internal/adr/0024-http-cancellation.md` | **internal** | catatan penuh ADR internal (Inggris publik = ringkasan terpisah) |
| `docs/internal/adr/0025-response-streaming.md` | **internal** | catatan penuh ADR internal (Inggris publik = ringkasan terpisah) |
| `docs/internal/adr/0026-node-modules.md` | **internal** | catatan penuh ADR internal (Inggris publik = ringkasan terpisah) |
| `docs/internal/adr/0027-web-shim.md` | **internal** | catatan penuh ADR internal (Inggris publik = ringkasan terpisah) |
| `docs/internal/adr/0028-compat-suite.md` | **internal** | catatan penuh ADR internal (Inggris publik = ringkasan terpisah) |
| `docs/internal/adr/0029-commonjs-interop.md` | **internal** | catatan penuh ADR internal (Inggris publik = ringkasan terpisah) |
| `docs/internal/adr/0030-fetch-readablestream.md` | **internal** | catatan penuh ADR internal (Inggris publik = ringkasan terpisah) |
| `docs/internal/adr/0031-builtins-crypto-security.md` | **internal** | catatan penuh ADR internal (Inggris publik = ringkasan terpisah) |
| `docs/internal/adr/0032-servehandler-playground.md` | **internal** | catatan penuh ADR internal (Inggris publik = ringkasan terpisah) |
| `docs/internal/adr/0033-resource-limits.md` | **internal** | catatan penuh ADR internal (Inggris publik = ringkasan terpisah) |
| `docs/internal/adr/0034-worker-isolation.md` | **internal** | catatan penuh ADR internal (Inggris publik = ringkasan terpisah) |
| `docs/internal/adr/0035-streaming-request.md` | **internal** | catatan penuh ADR internal (Inggris publik = ringkasan terpisah) |
| `docs/internal/adr/0036-fetch-tls-redirect.md` | **internal** | catatan penuh ADR internal (Inggris publik = ringkasan terpisah) |
| `docs/internal/adr/0037-r4-profiling-startup.md` | **internal** | catatan penuh ADR internal (Inggris publik = ringkasan terpisah) |
| `docs/internal/adr/0038-cpu-rss-quotas.md` | **internal** | catatan penuh ADR internal (Inggris publik = ringkasan terpisah) |
| `docs/internal/adr/0039-release-pipeline.md` | **internal** | catatan penuh ADR internal (Inggris publik = ringkasan terpisah) |
| `docs/internal/adr/0040-plugin-process-isolation.md` | **internal** | catatan penuh ADR internal (Inggris publik = ringkasan terpisah) |
| `docs/internal/adr/0041-create-app.md` | **internal** | catatan penuh ADR internal (Inggris publik = ringkasan terpisah) |
| `docs/internal/adr/0042-docs-app.md` | **internal** | catatan penuh ADR internal (Inggris publik = ringkasan terpisah) |
| `docs/internal/adr/0043-plugin-supervision.md` | **internal** | catatan penuh ADR internal (Inggris publik = ringkasan terpisah) |
| `docs/internal/adr/0044-plugin-health-check.md` | **internal** | catatan penuh ADR internal (Inggris publik = ringkasan terpisah) |
| `docs/internal/adr/0045-perf-regression-gate.md` | **internal** | catatan penuh ADR internal (Inggris publik = ringkasan terpisah) |
| `docs/internal/adr/0046-source-maps.md` | **internal** | catatan penuh ADR internal (Inggris publik = ringkasan terpisah) |
| `docs/internal/adr/0047-ssr-streaming-node.md` | **internal** | catatan penuh ADR internal (Inggris publik = ringkasan terpisah) |
| `docs/internal/adr/0048-bench-ssr-vitals.md` | **internal** | catatan penuh ADR internal (Inggris publik = ringkasan terpisah) |
| `docs/internal/adr/0049-pra-publikasi.md` | **internal** | catatan penuh ADR internal (Inggris publik = ringkasan terpisah) |
| `docs/internal/adr/0050-plugin-backoff-watchdog.md` | **internal** | catatan penuh ADR internal (Inggris publik = ringkasan terpisah) |
| `docs/internal/adr/0051-plugin-sandbox-landlock.md` | **internal** | catatan penuh ADR internal (Inggris publik = ringkasan terpisah) |
| `docs/internal/adr/0052-docs-hosting-pages.md` | **internal** | catatan penuh ADR internal (Inggris publik = ringkasan terpisah) |
| `docs/internal/adr/0053-devtools-cli.md` | **internal** | catatan penuh ADR internal (Inggris publik = ringkasan terpisah) |
| `docs/internal/adr/0054-machine-readable-docs.md` | **internal** | catatan penuh ADR internal (Inggris publik = ringkasan terpisah) |
| `docs/internal/adr/0055-http-production-basics.md` | **internal** | catatan penuh ADR internal (Inggris publik = ringkasan terpisah) |
| `docs/internal/adr/0056-static-generation.md` | **internal** | catatan penuh ADR internal (Inggris publik = ringkasan terpisah) |
| `docs/internal/adr/0057-server-actions.md` | **internal** | catatan penuh ADR internal (Inggris publik = ringkasan terpisah) |
| `docs/internal/adr/0058-edge-target.md` | **internal** | catatan penuh ADR internal (Inggris publik = ringkasan terpisah) |
| `docs/internal/adr/0059-metadata-seo.md` | **internal** | catatan penuh ADR internal (Inggris publik = ringkasan terpisah) |
| `docs/internal/adr/0060-prefetch.md` | **internal** | catatan penuh ADR internal (Inggris publik = ringkasan terpisah) |
| `docs/internal/adr/0061-middleware-per-folder.md` | **internal** | catatan penuh ADR internal (Inggris publik = ringkasan terpisah) |
| `docs/internal/adr/0062-auth-session.md` | **internal** | catatan penuh ADR internal (Inggris publik = ringkasan terpisah) |
| `docs/internal/adr/0063-server-client-boundary.md` | **internal** | catatan penuh ADR internal (Inggris publik = ringkasan terpisah) |
| `docs/internal/adr/0064-ip-pinning.md` | **internal** | catatan penuh ADR internal (Inggris publik = ringkasan terpisah) |
| `docs/internal/adr/0065-extension-contracts.md` | **internal** | catatan penuh ADR internal (Inggris publik = ringkasan terpisah) |
| `docs/internal/adr/0066-revalidate.md` | **internal** | catatan penuh ADR internal (Inggris publik = ringkasan terpisah) |
| `docs/internal/adr/0067-plugin-ecosystem.md` | **internal** | catatan penuh ADR internal (Inggris publik = ringkasan terpisah) |
| `docs/internal/adr/0068-edge-env-and-smoke.md` | **internal** | catatan penuh ADR internal (Inggris publik = ringkasan terpisah) |
| `docs/internal/adr/0069-asset-pipeline-m1.md` | **internal** | catatan penuh ADR internal (Inggris publik = ringkasan terpisah) |
| `docs/internal/adr/0070-watch-mode.md` | **internal** | catatan penuh ADR internal (Inggris publik = ringkasan terpisah) |
| `docs/internal/adr/0071-observability.md` | **internal** | catatan penuh ADR internal (Inggris publik = ringkasan terpisah) |
| `docs/internal/adr/0072-error-dx.md` | **internal** | catatan penuh ADR internal (Inggris publik = ringkasan terpisah) |
| `docs/internal/adr/0073-typed-routes.md` | **internal** | catatan penuh ADR internal (Inggris publik = ringkasan terpisah) |
| `docs/internal/adr/0074-bench-env-baseline.md` | **internal** | catatan penuh ADR internal (Inggris publik = ringkasan terpisah) |
| `docs/internal/adr/0075-plugin-pentest-v1.md` | **internal** | catatan penuh ADR internal (Inggris publik = ringkasan terpisah) |
| `docs/internal/adr/0076-server-entry-cli-migration.md` | **internal** | catatan penuh ADR internal (Inggris publik = ringkasan terpisah) |
| `docs/internal/adr/0077-devtools-panel.md` | **internal** | catatan penuh ADR internal (Inggris publik = ringkasan terpisah) |
| `docs/internal/adr/0078-mcp-docs-server.md` | **internal** | catatan penuh ADR internal (Inggris publik = ringkasan terpisah) |
| `docs/internal/adr/0079-image-pipeline-m2.md` | **internal** | catatan penuh ADR internal (Inggris publik = ringkasan terpisah) |
| `docs/internal/adr/0080-plugin-stabilization.md` | **internal** | catatan penuh ADR internal (Inggris publik = ringkasan terpisah) |
| `docs/internal/adr/0081-i18n.md` | **internal** | catatan penuh ADR internal (Inggris publik = ringkasan terpisah) |
| `docs/internal/adr/README.md` | **internal** | panduan berbahasa Indonesia — menunggu terjemahan sebelum dipublikasikan |
| `docs/internal/api/core-contract.md` | **internal** | kontrak API versi internal (publik ditulis ulang) |
| `docs/internal/architecture.md` | **internal** | arsitektur internal (belum ditulis ulang untuk publik) |
| `docs/internal/assets.md` | **internal** | panduan berbahasa Indonesia — menunggu terjemahan sebelum dipublikasikan |
| `docs/internal/benchmark-protocol.md` | **internal** | metodologi internal (publik menyusul sebagai halaman baru) |
| `docs/internal/caching.md` | **internal** | panduan berbahasa Indonesia — menunggu terjemahan sebelum dipublikasikan |
| `docs/internal/coding-standards.md` | **internal** | standar kontributor internal |
| `docs/internal/deploy-edge.md` | **internal** | panduan berbahasa Indonesia — menunggu terjemahan sebelum dipublikasikan |
| `docs/internal/devtools.md` | **internal** | panduan berbahasa Indonesia — menunggu terjemahan sebelum dipublikasikan |
| `docs/internal/i18n.md` | **internal** | panduan berbahasa Indonesia — menunggu terjemahan sebelum dipublikasikan |
| `docs/internal/machine/README.md` | **internal** | README machine internal |
| `docs/internal/machine/adrs.json` | **internal** | indeks ADR penuh (81) |
| `docs/internal/machine/security.json` | **internal** | kontrol keamanan + celah yang diakui |
| `docs/internal/machine/security.schema.json` | **internal** | skema berkas keamanan internal |
| `docs/internal/machine/todo.schema.json` | **internal** | skema TODO internal |
| `docs/internal/mcp.md` | **internal** | panduan berbahasa Indonesia — menunggu terjemahan sebelum dipublikasikan |
| `docs/internal/observability.md` | **internal** | panduan berbahasa Indonesia — menunggu terjemahan sebelum dipublikasikan |
| `docs/internal/plugins.md` | **internal** | panduan berbahasa Indonesia — menunggu terjemahan sebelum dipublikasikan |
| `docs/internal/releasing.md` | **internal** | checklist rilis pemilik |
| `docs/internal/roadmap/phase-0-1.md` | **internal** | roadmap internal |
| `docs/internal/security/asvs-mapping.md` | **internal** | detail keamanan internal (vektor/skor/temuan) |
| `docs/internal/security/dependency-policy.md` | **internal** | detail keamanan internal (vektor/skor/temuan) |
| `docs/internal/security/plugin-isolation-assessment.md` | **internal** | detail keamanan internal (vektor/skor/temuan) |
| `docs/internal/security/sessions.md` | **internal** | detail keamanan internal (vektor/skor/temuan) |
| `docs/internal/security/threat-model.md` | **internal** | detail keamanan internal (vektor/skor/temuan) |
| `docs/internal/testing.md` | **internal** | panduan berbahasa Indonesia — menunggu terjemahan sebelum dipublikasikan |
| `docs/internal/troubleshooting.md` | **internal** | panduan berbahasa Indonesia — menunggu terjemahan sebelum dipublikasikan |
| `docs/internal/tutorial.md` | **internal** | panduan berbahasa Indonesia — menunggu terjemahan sebelum dipublikasikan |
| `docs/internal/typed-routes.md` | **internal** | panduan berbahasa Indonesia — menunggu terjemahan sebelum dipublikasikan |

## Daftar ADR internal (33)

0001, 0016, 0018, 0019–0040, 0043, 0044, 0049, 0050, 0051, 0052, 0054, 0075 — lihat
`docs/internal/adr/` (frontmatter `visibility: internal`). Publik: 0007, 0047, 0057, 0058, 0066,
0069, 0078, 0081 (ringkasan Inggris di `docs/public/adr/`).

## Promosi konten (bertahap)

Panduan Indonesia yang belum diterjemahkan (assets, i18n, devtools, observability, caching,
troubleshooting, typed routes, testing, mcp, deploy, tutorial) tetap **internal** sampai ditulis
ulang dalam bahasa Inggris sebagai berkas baru di `docs/public/`. Tidak ada penyalinan otomatis.
