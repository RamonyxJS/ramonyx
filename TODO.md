# TODO — menuju paritas kompetitif

> **Sumber tunggal: `TODO.json`** — berkas ini hasil generate, jangan diedit manual.
> Generate: `pnpm docs:generate` · Validasi: `pnpm docs:validate` · Konteks: `docs/PLAN-docs-consolidation.md` §3–4.
> Prioritas: **P0** blocker adopsi · **P1** paritas · **P2** diferensiasi & utang yang diakui · **P3** nice-to-have. Ukuran: S (≤1 hari) · M (beberapa hari) · L (1–2 minggu).
> Status fitur saat ini (bukti + batasan): `docs/public/machine/features.json`.

## Ringkasan

| Prioritas | Jumlah | Item |
| --- | --- | --- |
| P0 — blocker adopsi | 6 | `p0-server-actions` · `p0-static-generation` · `p0-serverless-adapters` · `p0-http-production-basics` · `f0-extension-primitives` · `p0-package-readiness-gate` |
| P1 — paritas | 12 | `p1-middleware-per-route` · `p1-typed-routes` · `p1-metadata-seo` · `p1-auth-session` · `p1-revalidate` · `p1-prefetch` · `p1-boundary-lint` · `p1-docs-tutorial` · `p2-public-site-content-policy` · `p1-package-contract-coverage` · `p1-framework-v1-readiness` · `p1-auth-session-complete` |
| P2 — diferensiasi & utang | 22 | `p2-plugin-ecosystem` · `p2-observability` · `p2-bench-env-baseline` · `p2-ip-pinning` · `p2-pentest-plugin` · `p2-asset-pipeline` · `p2-error-dx` · `p2-watch-mode` · `p2-mcp-docs-server` · `p2-context7` · `p2-cli-migration` · `p2-testing-docs` · `p2-plugin-contract-freeze` · `p2-partial-hydration-islands` · `p2-deferred-data-streaming` · `p2-runtime-observability-complete` · `p2-distributed-state-adapters` · `p2-auth-providers-authorization` · `p2-adapter-production-parity` · `p2-request-pipeline-hardening` · `p2-actions-ux` · `p2-i18n-complete` |
| P3 — nice-to-have | 9 | `p3-i18n` · `p3-devtools-ui` · `p3-docs-domain` · `p3-runtime-production-readiness` · `p3-dx-complete` · `p3-media-assets-complete` · `p3-ecosystem-complete` · `p3-benchmark-ci-gate` · `p3-loader-dependencies` |

**Quick wins** (dampak besar, usaha kecil): `p0-http-production-basics` · `p1-prefetch` · `p1-docs-tutorial` · `p2-watch-mode` · `p2-context7` · `p2-testing-docs`

**Strategis** (butuh keputusan arsitektur): `p0-server-actions` · `p0-static-generation` · `p0-serverless-adapters` · `p1-auth-session` · `p1-revalidate` · `p2-plugin-ecosystem` · `p2-bench-env-baseline` · `p2-asset-pipeline` · `p2-mcp-docs-server` · `f0-extension-primitives` · `p2-public-site-content-policy` · `p0-package-readiness-gate` · `p1-framework-v1-readiness` · `p1-auth-session-complete` · `p3-runtime-production-readiness` · `p2-distributed-state-adapters` · `p2-auth-providers-authorization` · `p2-adapter-production-parity` · `p2-actions-ux` · `p3-ecosystem-complete`

## P0 — blocker adopsi

### `p0-server-actions` — Server actions & form handling (mutasi first-class)

*tema: data · ukuran: L · status: done · sumber: gap §3 (mutations) — selesai ADR-0057*

- **Apa**: API `action()` untuk mutasi dari form/komponen: validasi schema di trust boundary, error kembali ke form, progressive enhancement (bekerja tanpa JS), revalidasi data setelah mutasi.
- **Kenapa penting untuk bersaing**: Tanpa mutasi first-class setiap aplikasi harus merakit API route + fetch manual + state client; framework pesaing menjadikan mutasi sebagai jalur utama sehingga CRUD sederhana pun jauh lebih ringkas di sana.
- **Selesai bila**:
  - [ ] Action didefinisikan di file rute dan dapat dipanggil dari form tanpa JavaScript (progressive enhancement)
  - [ ] Validasi Standard Schema + error terstruktur yang bisa ditampilkan per field
  - [ ] Revalidasi loader setelah mutasi sukses
  - [ ] Test unit + e2e (dengan dan tanpa JS) + halaman docs
- **Area kode**: `packages/core`, `packages/server`, `packages/ssr`, `packages/react`
- **ADR**: ADR baru
- **Pembanding**: Next.js Server Actions; Remix/React Router `action` per route; SvelteKit form actions; Nuxt server routes + $fetch.

### `p0-static-generation` — Static generation (SSG) + ekspor statis first-class

*tema: rendering · ukuran: L · status: done · sumber: gap §3 (SSG) — selesai ADR-0056*

- **Apa**: Opsi `prerender` per rute (dan global) + `ramonyx build --static` yang menghasilkan HTML per rute + aset siap host statis — bukan skrip bespoke seperti ekspor situs docs saat ini.
- **Kenapa penting untuk bersaing**: Sebagian besar proyek pertama (marketing, blog, dokumentasi) di-deploy statis; tanpa jalur ini pengguna harus pindah framework atau menulis skrip sendiri, dan situs docs kami sendiri membuktikan kebutuhan ini nyata.
- **Selesai bila**:
  - [ ] API prerender per rute dan global (interaksi dengan loader dinamis terdokumentasi)
  - [ ] CLI `ramonyx build --static` menghasilkan output siap upload (Pages/Netlify/S3) termasuk 404
  - [ ] Situs docs memakai fitur framework ini (dogfood), e2e terhadap output statis
  - [ ] Halaman docs + benchmark ukuran/waktu build
- **Area kode**: `packages/ssr`, `packages/compiler`, `packages/devtools`, `packages/bundler`
- **ADR**: ADR baru
- **Pembanding**: Next.js `output: export`; SvelteKit adapter-static; Astro (default statis); Nuxt `nuxt generate`.

### `p0-serverless-adapters` — Adapter serverless/edge (Cloudflare Workers, Vercel, Deno Deploy)

*tema: deploy · ukuran: L · status: done · sumber: gap §3 (adapters) — selesai ADR-0058 + ADR-0068 (workerd smoke CI + env binding)*

- **Apa**: Adapter yang menghasilkan entry fetch-handler (Request→Response) untuk platform serverless/edge populer + perintah build per-target.
- **Kenapa penting untuk bersaing**: Kebebasan deploy adalah alasan utama memilih framework; saat ini hanya Node standalone, sementara pesaing dapat deploy ke platform populer dengan satu perintah/adapter.
- **Selesai bila**:
  - [ ] Minimal satu platform nyata (mis. Cloudflare Workers) berjalan dengan smoke test di CI
  - [ ] `ramonyx build --target <platform>` menghasilkan artefak yang benar
  - [ ] Dokumentasi deploy per platform + contoh
- **Area kode**: `packages/adapter-runtime`, `packages/devtools`, `packages/bundler`
- **ADR**: ADR baru
- **Pembanding**: Next.js (Vercel/self-host); SvelteKit adapters (node/cloudflare/vercel); Nuxt Nitro presets; Astro adapters.

### `p0-http-production-basics` — Dasar HTTP produksi: kompresi, ETag, fingerprinting aset, helper cache

*tema: perf · ukuran: M · status: done · sumber: gap §3 (compression/asset) — selesai ADR-0055*

- **Apa**: Kompresi gzip/brotli (Accept-Encoding) + ETag/304 di server standalone; hash nama aset build + Cache-Control immutable; helper Cache-Control/revalidate untuk handler.
- **Kenapa penting untuk bersaing**: Server tanpa kompresi dan aset tanpa hash (template memakai `cache-control: no-store`) adalah regresi langsung terhadap Core Web Vitals dan bandwidth — pesaing menangani ini secara default tanpa konfigurasi.
- **Selesai bila**:
  - [ ] Kompresi respons HTML/JS/CSS + test (termasuk klien tanpa Accept-Encoding)
  - [ ] ETag + 304 untuk aset statis + test
  - [ ] Aset build ber-hash dan disajikan `immutable` (template ikut diperbarui)
  - [ ] Benchmark Web Vitals/HTTP sebelum-sesudah dicatat
- **Area kode**: `packages/adapter-runtime`, `packages/bundler`, `packages/core`
- **ADR**: ADR baru
- **Pembanding**: Next.js/SvelteKit/Astro/Nuxt: aset ber-hash + cache immutable dan kompresi di produksi secara default.

### `f0-extension-primitives` — Kontrak ekstensi bersama (Fase 0 rencana pasca-TODO)

*tema: quality · ukuran: M · status: done · sumber: rencana komprehensif Fase 0*

- **Apa**: Config pass-through, AppHooks (zero-cost), KeyValueStore + contract test, kontrak plugin experimental (vite/middleware/hooks) — fondasi anti-rewrite untuk item L berikutnya.
- **Kenapa penting untuk bersaing**: Tanpa primitif bersama, setiap fitur berikutnya (revalidate/plugin/asset/observability/devtools) mengubah core dan menulis mekanisme sendiri.
- **Selesai bila**:
  - [ ] resolveConfig mempertahankan key tak dikenal (root/app/server) + test
  - [ ] AppHooks terpasang di createHandler & createPageRoutes (zero-cost) + test
  - [ ] KeyValueStore + createMemoryStore + contract test (TTL/tag/increment)
  - [ ] Kontrak plugin (definePlugin/loadPlugins) + tipe di @ramonyx/bundler
  - [ ] ADR-0065 + kebijakan aditif di rules.json
- **Area kode**: `packages/core`, `packages/server`, `packages/ssr`, `packages/bundler`
- **ADR**: ADR-0065
- **Pembanding**: Framework besar punya lapisan ekstensi serupa (Nuxt hooks+nitro storage, Astro integrations, SvelteKit hooks) — dibuat sebelum fitur yang membutuhkannya.

### `p0-package-readiness-gate` — Gate kesiapan paket publik (API, peer, metadata, rilis)

*tema: quality · ukuran: M · status: done · sumber: audit kesiapan paket 2026-10-21; rilis 0.4.2 + registry verified*

- **Apa**: Jadikan kesiapan paket publik sebagai gate rilis: kontrak API meta, peer dependency React, metadata/README npm, dan rilis yang dibangun dari main.
- **Kenapa penting untuk bersaing**: Fitur sudah matang, tetapi adopsi publik bisa gagal karena export meta tidak cocok, React terduplikasi, metadata paket minim, atau registry tertinggal dari main.
- **Selesai bila**:
  - [ ] Kontrak export `ramonyx` cocok dengan `docs/public/api/core-contract.md` — atau dokumentasi dikoreksi — dan diuji.
  - [ ] `@ramonyx/react` memakai `react`/`react-dom` sebagai peerDependencies; consumer matrix React 19.x lulus.
  - [ ] 16 paket memiliki deskripsi dan README unik serta metadata npm valid; diverifikasi dengan `npm pack`.
  - [ ] Rilis berikutnya dibangun dari `main`, lolos `release:verify`, provenance, dan verifikasi registry.
  - [ ] CI memiliki gate API export/metadata paket di samping typecheck aplikasi.
- **Area kode**: `packages`, `apps/create-app`, `docs/public/api`, `scripts`, `.github/workflows`
- **Pembanding**: Next.js/SvelteKit menegakkan exports, peer dependency, dan dokumentasi paket; provenance npm menjadi standar adopsi.

## P1 — paritas

### `p1-middleware-per-route` — Middleware per-folder + route groups `(grup)`

*tema: routing · ukuran: M · status: done · sumber: gap §3 (middleware) — selesai ADR-0061*

- **Apa**: `middleware.ts` per folder yang dieksekusi berurutan dari root, dapat mengganti request/response; konvensi route group `(grup)` untuk organisasi folder tanpa segmen URL.
- **Kenapa penting untuk bersaing**: Middleware app-level memaksa pencocokan path manual dan mudah bocor (proteksi area admin harus diingat di satu tempat); struktur per-folder adalah cara berpikir standar di framework pesaing.
- **Selesai bila**:
  - [ ] Compiler menemukan dan mengurutkan middleware per folder
  - [ ] Middleware dapat mengganti request (nonce) dan response (redirect) + test
  - [ ] Route group `(grup)` tidak muncul di URL + test
  - [ ] Halaman docs
- **Area kode**: `packages/compiler`, `packages/server`
- **ADR**: ADR baru
- **Pembanding**: Next.js middleware (per-project + matcher); SvelteKit hooks + layout server load; Nuxt route rules/middleware.

### `p1-typed-routes` — Typed routes (codegen tipe dari manifest)

*tema: dx · ukuran: M · status: done · sumber: gap §3 (typed routes) — selesai ADR-0073*

- **Apa**: Generate tipe rute dari manifest (literal path + params bertipe) sehingga `href` dan `params` salah tertangkap saat typecheck, bukan runtime.
- **Kenapa penting untuk bersaing**: Inferensi TypeScript adalah alasan utama memilih framework TypeScript-first; Next/Nuxt/SvelteKit sudah memberi tipe rute ter-generate, dan tanpa itu Ramonyx tertinggal di DX inti.
- **Selesai bila**:
  - [ ] Codegen tipe saat dev/build (tanpa memperlambat startup signifikan)
  - [ ] Komponen Link/href hanya menerima rute nyata; params bertipe sesuai pola
  - [ ] Test typecheck negatif (rute/params salah = error compile)
  - [ ] Halaman docs
- **Area kode**: `packages/compiler`, `packages/react`, `packages/router`
- **ADR**: ADR baru
- **Pembanding**: Next.js typedRoutes; Nuxt typedPages; SvelteKit $types.

### `p1-metadata-seo` — Metadata halaman lengkap + helper SEO (sitemap/robots)

*tema: rendering · ukuran: M · status: done · sumber: gap §3 (head/metadata) — selesai ADR-0059*

- **Apa**: API metadata per halaman (description, canonical, Open Graph/Twitter) + injeksi `<head>` per halaman + helper sitemap.xml/robots.txt.
- **Kenapa penting untuk bersaing**: Situs publik butuh SEO dan kartu berbagi tautan yang benar; saat ini hanya `title`/`status`, sehingga setiap situs publik langsung butuh akal-akalan.
- **Selesai bila**:
  - [ ] Metadata memperluas PageMetadata (description/OG/Twitter/canonical)
  - [ ] Renderer menyuntikkan `<head>` per halaman + test SSR
  - [ ] Helper sitemap/robots memakai manifest rute + test
  - [ ] Halaman docs SEO
- **Area kode**: `packages/core`, `packages/ssr`, `packages/react`
- **ADR**: ADR baru
- **Pembanding**: Next.js Metadata API; Nuxt useSeoMeta; SvelteKit `<svelte:head>` + pustaka SEO; Astro integrations.

### `p1-auth-session` — Primitif autentikasi: cookie ter-sign + session

*tema: security · ukuran: M · status: done · sumber: gap §3 (auth) — selesai ADR-0062*

- **Apa**: Helper cookie (sign/verify, opsi aman default) + antarmuka session store + contoh alur login/logout yang memakai CSRF dan rate limit yang sudah ada.
- **Kenapa penting untuk bersaing**: Hampir semua aplikasi nyata butuh auth; menyediakan primitif aman mencegah setiap pengguna merakit sendiri (dan salah) — sekaligus memperkuat posisi keamanan Ramonyx.
- **Selesai bila**:
  - [ ] Cookie helper dengan tanda tangan (Web Crypto) + test
  - [ ] Contoh alur login/logout end-to-end (session + CSRF + rate limit)
  - [ ] Halaman docs auth dengan peringatan yang jelas
- **Area kode**: `packages/security`, `packages/core`
- **ADR**: ADR baru
- **Pembanding**: Next.js + Auth.js; Remix cookie sessions; SvelteKit cookies + Lucia; Nuxt nuxt-auth-utils.

### `p1-revalidate` — Revalidasi data (ISR-lite): `revalidate()` + cache server

*tema: data · ukuran: L · status: done · dependensi: `p0-static-generation` · sumber: gap §3 (ISR/caching) — selesai ADR-0066*

- **Apa**: Cache loader/rute dengan TTL + stale-while-revalidate, dan invalidasi on-demand (API/action) — tanpa rebuild penuh.
- **Kenapa penting untuk bersaing**: Konten semi-statis (beranda, katalog) adalah kasus paling umum di produksi; parity ISR/route-rules adalah pembeda antara "bisa dipakai" dan "dipakai serius".
- **Selesai bila**:
  - [ ] `revalidate(seconds)` per loader/rute + stale-while-revalidate + test
  - [ ] Invalidasi on-demand (tag/path) dari action/API + test
  - [ ] Dokumentasi interaksi dengan SSG dan streaming
- **Area kode**: `packages/ssr`, `packages/core`, `packages/server`
- **ADR**: ADR baru
- **Pembanding**: Next.js ISR + revalidateTag; Nuxt route rules + SWR; Astro (di level adapter/CDN).

### `p1-prefetch` — Prefetch halaman saat hover/viewport

*tema: rendering · ukuran: S · status: done · sumber: gap §3 (soft navigation) — selesai ADR-0060*

- **Apa**: Prefetch payload/HTML halaman tujuan saat tautan di-hover atau masuk viewport, lalu soft navigation memakai cache tersebut.
- **Kenapa penting untuk bersaing**: Navigasi instan adalah ekspektasi dasar pengguna web modern; Next.js melakukannya default dan soft navigation kami akan terasa lambat tanpa ini.
- **Selesai bila**:
  - [ ] Prefetch saat hover/viewport dengan batas konkurensi
  - [ ] Soft navigation memakai payload ter-prefetch + test e2e
  - [ ] Tidak menggandakan request saat klik cepat
- **Area kode**: `packages/react`
- **Pembanding**: Next.js Link prefetch (default); SvelteKit preload on hover; Nuxt NuxtLink prefetch.

### `p1-boundary-lint` — Analisis + penegakan batas server/client

*tema: quality · ukuran: M · status: done · sumber: utang (audit) — selesai ADR-0063*

- **Apa**: Konvensi modul server (`*.server.ts`) + analisis build yang menolak impor API server (node:*, rahasia) dari modul yang masuk bundle client, dengan pesan error jelas.
- **Kenapa penting untuk bersaing**: Utang yang diakui di audit dokumentasi: tanpa penegakan, kebocoran server→client adalah bug keamanan yang menunggu terjadi; pesaing punya konvensi + tooling untuk ini.
- **Selesai bila**:
  - [ ] Konvensi ditetapkan dan didokumentasikan (rules.json diperbarui)
  - [ ] Analisis build menolak impor server dari modul client + test negatif
  - [ ] Pesan error menunjuk file dan solusi
- **Area kode**: `packages/compiler`, `packages/bundler`, `packages/core`
- **ADR**: ADR baru
- **Pembanding**: Next.js `server-only` + error boundary Turbopack; SvelteKit $env/static/private; Nuxt folder .server.

### `p1-docs-tutorial` — Tutorial getting-started end-to-end di situs docs

*tema: docs · ukuran: S · status: done · sumber: gap §3 (docs) — selesai docs/tutorial.md*

- **Apa**: Tutorial naratif: scaffold → rute + layout → loader → API + validasi → form → build → deploy, memakai perintah yang benar-benar dijalankan.
- **Kenapa penting untuk bersaing**: Jalur adopsi pertama adalah tutorial, bukan referensi; README kami padat namun tidak menggantikan pengalaman langkah demi langkah yang dimiliki semua pesaing.
- **Selesai bila**:
  - [ ] Halaman tutorial di situs docs (tautan dari README)
  - [ ] Setiap perintah diverifikasi berjalan (diuji saat menulis + di CI smoke bila murah)
  - [ ] Contoh akhir yang bisa di-scaffold
- **Area kode**: `docs`, `apps/docs`
- **Pembanding**: Next.js Learn; React Router tutorial; SvelteKit tutorial; Nuxt getting started; Astro tutorial.

### `p2-public-site-content-policy` — Situs publik + karantina docs/internal (landing + docs, gate kebocoran)

*tema: docs · ukuran: L · status: done · sumber: audit kebocoran + prompt situs publik*

- **Apa**: Pisahkan docs/public vs docs/internal; bangun landing + docs (dogfood SSR) hanya dari docs/public; ADR publik = ringkasan Inggris; validator dua lapis + verify-no-leak (sumber/ekspor/tarball); snapshot MCP publik-only; CI blocking (docs:validate, test:docs, docs:no-leak).
- **Kenapa penting untuk bersaing**: Tiga kanal kebocoran dokumen internal ditemukan live (Pages, llms, tarball MCP); kebijakan karantina menghilangkan kemungkinan build 'kebetulan' merilis internal.
- **Selesai bila**:
  - [ ] docs/public + docs/internal + docs/CONTENT_POLICY.md (pemetaan 100%)
  - [ ] Situs publik (landing + /docs) dari docs/public; alias /dokumen; Cmd+K; Shiki; dark/light; a11y
  - [ ] Gates: docs:validate (publik+internal, satu arah), docs:no-leak, e2e kebijakan+a11y; CI blocking
  - [ ] Rilis MCP 0.4.1 (snapshot publik) + deprecate 0.3.0/0.4.0
- **Area kode**: `apps/docs`, `docs`, `scripts`, `packages/mcp-docs-server`
- **ADR**: ADR-0082
- **Pembanding**: Remix.run docs (dogfood publik), Astro content collections, Next.js docs; tidak ada kompetitor dengan karantina internal + gate tarball

### `p1-package-contract-coverage` — Kontrak API + coverage per paket

*tema: quality · ukuran: M · status: done · dependensi: `p0-package-readiness-gate` · sumber: audit kesiapan paket 2026-10-21; test:coverage per paket + CI gate*

- **Apa**: Tambahkan contract test export/type surface dan baseline coverage per paket, termasuk paket meta yang saat ini belum punya test.
- **Kenapa penting untuk bersaing**: Tanpa kontrak per paket, perubahan export atau dependency bisa lolos typecheck aplikasi tetapi merusak konsumen; coverage juga belum terukur.
- **Selesai bila**:
  - [ ] Setiap paket punya contract test export/type surface minimal.
  - [ ] `ramonyx` meta memiliki test yang memverifikasi re-export sesuai kontrak.
  - [ ] Ada laporan coverage per paket dan ambang minimal untuk paket inti.
  - [ ] CI menjalankan contract test + coverage; regresi API/paket menggagalkan build.
- **Area kode**: `packages`, `scripts`, `.github/workflows`
- **Pembanding**: Next.js/SvelteKit menguji package exports dan tipe publik; proyek matang menjaga coverage paket inti di CI.

### `p1-framework-v1-readiness` — Gerbang kesiapan framework Node 1.0 (100% matang)

*tema: quality · ukuran: L · status: done · dependensi: `p1-auth-session-complete` · sumber: selesai 1.0.0: API stability + contract test; security/abuse/soak + audit; F-1 terdiagnosis (heapUsed 422→21 MB setelah GC, RSS allocator); bench:gate lulus di baseline (HTTP p50 57→43, rps 815→1045; SSR dalam toleransi); VITALS_BUDGET_STRICT; 16 paket 1.0.0 + provenance. Runtime Rust tetap jalur eksperimental terpisah.*

- **Apa**: Menetapkan dan memenuhi kriteria 1.0 untuk baseline Node: tidak ada fitur publik partial, API stabil dengan kebijakan migrasi, keamanan/soak teruji, benchmark blocking, dan dokumentasi upgrade. Runtime Rust tetap jalur terpisah.
- **Kenapa penting untuk bersaing**: Rilis 0.6.0 adalah alpha dan fitur auth-session masih partial; tanpa gerbang eksplisit klaim 100% matang akan melampaui bukti yang tersedia.
- **Selesai bila**:
  - [ ] Semua fitur publik baseline Node berstatus implemented (auth-session partial diselesaikan); runtime Rust tetap eksperimental atau dipromosikan lewat jalur terpisah.
  - [ ] API publik dibekukan dengan semver + migration/deprecation policy dan contract test.
  - [ ] Security review, abuse-case, dan soak panjang lulus; temuan kritis ditutup.
  - [ ] Benchmark gate blocking per-lingkungan + Web Vitals budget dan docs upgrade guide.
  - [ ] Rilis 1.0.0 terverifikasi registry + GitHub Release; tidak ada TODO/dogfooding open atau partial untuk baseline Node (runtime Rust tetap jalur eksperimental terpisah).
- **Area kode**: `packages`, `docs`, `benchmarks`, `.github/workflows`
- **ADR**: ADR baru
- **Pembanding**: Next.js/Nuxt/SvelteKit jalur stabil 1.x dengan kebijakan deprecasi dan upgrade guide.

### `p1-auth-session-complete` — Lengkapi auth/session menjadi alur produksi

*tema: security · ukuran: M · status: done · dependensi: `p1-auth-session` · sumber: selesai: PBKDF2 password hashing, session store/rotation/revoke, CSRF form + header, demo /sesi + e2e JS/no-JS; features.json auth-session implemented*

- **Apa**: Naikkan primitif auth-session dari partial ke alur siap produksi: siklus session lengkap, perlindungan fixation, verifikasi kredensial yang aman, alur login/logout/register, CSRF/rate limit, dan error generik.
- **Kenapa penting untuk bersaing**: features.json menandai `auth-session` partial; primitif saja belum cukup untuk aplikasi nyata dan klaim keamanan 1.0.
- **Selesai bila**:
  - [ ] Session lifecycle lengkap (create/rotate/revoke, expiry, fixation protection) + test.
  - [ ] Alur login/logout/register referensi dengan CSRF, rate limit, cookie aman, dan error generik.
  - [ ] Verifikasi kredensial edge-safe (Web Crypto/PBKDF2 atau integrasi provider) dengan test vektor.
  - [ ] E2E auth dengan dan tanpa JS + dokumentasi keamanan dan migrasi.
- **Area kode**: `packages/security`, `packages/core`, `apps/playground`, `docs/public`
- **ADR**: ADR baru
- **Pembanding**: Auth.js, Lucia, Better Auth, SvelteKit hooks + cookie sessions.

## P2 — diferensiasi & utang

### `p2-plugin-ecosystem` — Ekosistem plugin/module tingkat framework

*tema: ecosystem · ukuran: L · status: done · sumber: riset §2 — selesai ADR-0065/0067/0080 (2 plugin nyata + panduan publikasi; deklarasi stabil: TODO p2-plugin-contract-freeze)*

- **Apa**: Kontrak plugin untuk build + dev + server hooks (pembungkus Vite plugin + hook Ramonyx) + contoh plugin + panduan publikasi.
- **Kenapa penting untuk bersaing**: Ekosistem adalah moat framework besar (Nuxt modules, Astro integrations); tanpa kontrak, setiap kebutuhan pengguna dirakit sendiri dan tidak ada yang bisa dibagikan.
- **Selesai bila**:
  - [ ] Kontrak plugin stabil + hooks terdokumentasi
  - [ ] Minimal satu plugin contoh (mis. analytics/SEO) dipakai di playground
  - [ ] Panduan menulis + mempublikasikan plugin
- **Area kode**: `packages/bundler`, `packages/core`, `packages/devtools`
- **ADR**: ADR baru
- **Pembanding**: Nuxt modules; Astro integrations; SvelteKit Vite plugins; Next.js plugins (terbatas).

### `p2-observability` — Observability: request logging + trace-id + metrik

*tema: quality · ukuran: M · status: done · sumber: gap §3 (observability) — selesai ADR-0071 (di @ramonyx/server)*

- **Apa**: Paket/middleware observability: log request terstruktur, trace-id yang diteruskan ke handler, hook metrik (durasi, status) siap diekspor ke OTel.
- **Kenapa penting untuk bersaing**: Produksi tanpa visibilitas = debugging buta; kompetitor menyediakan integrasi observability (instrumentation, devtools) sebagai jalur resmi.
- **Selesai bila**:
  - [ ] Middleware logging + trace-id + test
  - [ ] Hook metrik terdokumentasi (durasi/status/route)
  - [ ] Contoh ekspor ke OTel atau format JSON
- **Area kode**: `packages/server`, `packages/core`
- **ADR**: ADR baru
- **Pembanding**: Next.js instrumentation + OTel; Nuxt devtools/OTel; SvelteKit hooks + adapter-node logs.

### `p2-bench-env-baseline` — Baseline benchmark per-lingkungan + jalur gate blocking

*tema: perf · ukuran: M · status: done · sumber: utang ADR-0045 + kandidat lama — selesai ADR-0074*

- **Apa**: Baseline benchmark per-lingkungan (runner CI) + skrip pembanding; keputusan ADR apakah gate dapat naik dari report-only menjadi blocking di lingkungan dengan baseline cocok.
- **Kenapa penting untuk bersaing**: Utang yang diakui: gate report-only tidak menahan regresi; CI ±3× lebih cepat dari mesin dev sehingga `--strict` tidak sahih lintas-mesin tanpa baseline terpisah.
- **Selesai bila**:
  - [ ] Baseline per-lingkungan ter-commit + prosedur regenerasi
  - [ ] `--strict`/blocking hanya aktif saat baseline cocok (guard diperkuat) + test
  - [ ] Keputusan blocking dicatat sebagai ADR (perbarui ADR-0045)
- **Area kode**: `benchmarks`, `.github/workflows`
- **ADR**: ADR-0045 (perbarui)
- **Pembanding**: Turbopack benchmarks, SvelteKit bench, Nuxt bundle metrics — semuanya punya gate performa di CI.

### `p2-ip-pinning` — IP-pinning guardedFetch (anti DNS-rebinding)

*tema: security · ukuran: M · status: done · sumber: utang (ADR-0031) — selesai ADR-0064*

- **Apa**: Resolusi DNS sekali lalu sambung ke alamat IP yang divalidasi (bukan resolve ulang oleh klien HTTP), dengan validasi Host/SNI — menutup jendela rebinding.
- **Kenapa penting untuk bersaing**: Celah yang diakui sejak ADR-0031: guard SSRF tanpa pinning masih bisa dibypass lewat DNS rebinding; pesaing umumnya tidak menyediakan guard ini sama sekali, jadi menutupnya memperkuat diferensiasi keamanan.
- **Selesai bila**:
  - [ ] Resolusi + pin alamat pada guardedFetch + test dengan DNS tiruan (rebinding)
  - [ ] Perilaku redirect tetap aman (pin per hop) + test
  - [ ] Dokumentasi + perbarui security.json/ADR-0031
- **Area kode**: `packages/security`
- **ADR**: ADR-0031 (lanjutan)
- **Pembanding**: Tidak umum di framework JS — diferensiasi keamanan bila selesai dengan bukti.

### `p2-pentest-plugin` — Pentest/penilaian escape isolasi plugin

*tema: security · ukuran: M · status: done · sumber: utang (audit) — selesai ADR-0075 (temuan F1 diperbaiki: leaf-only)*

- **Apa**: Penilaian sistematis skenario escape (fs, net, CPU/memori, komunikasi antar-plugin) terhadap worker + proses + Landlock, dengan laporan hasil dan celah.
- **Kenapa penting untuk bersaing**: Sandbox kernel adalah klaim keamanan terkuat kami; tanpa penilaian formal klaim itu rapuh dan tidak boleh dipakai di materi publik.
- **Selesai bila**:
  - [ ] Skenario escape diuji (fs/net/CPU/kill switch) + hasil terdokumentasi
  - [ ] Celah ditemukan dicatat di security.json + TODO lanjutan
  - [ ] Ringkasan publik yang jujur (apa yang terbukti, apa yang tidak)
- **Area kode**: `runtime/crates/js-engine`, `docs/security`
- **ADR**: ADR-0051 (lanjutan)
- **Pembanding**: Tidak ada pembanding langsung — menjadi diferensiasi hanya jika terbukti dan didokumentasikan.

### `p2-asset-pipeline` — Pipeline aset: komponen Image + font self-host

*tema: rendering · ukuran: L · status: done · sumber: kandidat lama — selesai ADR-0069/0079 (M1+M2; artefak LCP/CLS: benchmarks/results/image-pipeline-vitals.json)*

- **Apa**: Komponen `<Image>` (resize/format modern, width/height otomatis) + helper font (self-host + preload + fallback metrik) + impor aset dari komponen.
- **Kenapa penting untuk bersaing**: Gambar dan font adalah penyebab utama CLS/LCP buruk; Next/Nuxt/Astro semuanya menyediakan pipeline bawaan, dan tanpa itu pengguna harus merakit sendiri.
- **Selesai bila**:
  - [ ] Image komponen + optimasi saat build (minimal resize + format) + test
  - [ ] Font helper + preload + docs
  - [ ] Benchmark LCP/CLS playground sebelum-sesudah
- **Area kode**: `packages/bundler`, `packages/react`, `packages/devtools`
- **ADR**: ADR baru
- **Pembanding**: next/image + next/font; @nuxt/image + @nuxt/fonts; Astro `<Image>` + fontsource.

### `p2-error-dx` — DX error: overlay dev + tautan docs + kode error stabil

*tema: dx · ukuran: M · status: done · sumber: gap §3 (DX error) — selesai ADR-0072*

- **Apa**: Overlay error di dev untuk kegagalan SSR/loader (bukan hanya client), pesan error dengan tautan ke halaman docs terkait, dan kode error stabil untuk pencarian.
- **Kenapa penting untuk bersaing**: Kualitas pesan error adalah faktor adopsi yang nyata (pengalaman pertama debugging); pesaing berinvestasi besar di overlay dan pesan yang menuntun.
- **Selesai bila**:
  - [ ] Overlay menampilkan stack + sumber untuk error SSR/loader di dev
  - [ ] Setiap error publik punya tautan docs + kode stabil + test
  - [ ] Halaman docs troubleshooting
- **Area kode**: `packages/compiler`, `packages/bundler`, `packages/ssr`
- **Pembanding**: Next.js error overlay; SvelteKit enhanced error pages; Nuxt error page + devtools.

### `p2-watch-mode` — `ramonyx build --watch` (rebuild otomatis)

*tema: dx · ukuran: S · status: done · sumber: kandidat lama — selesai ADR-0070*

- **Apa**: Mode watch untuk build: bundel ulang client + restart server produksi saat file berubah, untuk alur kerja non-Vite/produksi-like.
- **Kenapa penting untuk bersaing**: Kandidat lama yang teridentifikasi; melengkapi dev server Vite untuk skenario yang membutuhkan perilaku produksi (mis. menguji build sebelum deploy).
- **Selesai bila**:
  - [ ] `ramonyx build --watch` + restart server dengan debounce + test manual terdokumentasi
  - [ ] Dokumentasi perbedaan dev vs watch
- **Area kode**: `packages/devtools`
- **Pembanding**: `vite build --watch`, `nuxt build --watch`, `astro dev`/`astro preview` — semua punya loop rebuild.

### `p2-mcp-docs-server` — MCP docs server (tools untuk agen)

*tema: docs · ukuran: M · status: done · sumber: riset §2 — selesai ADR-0078*

- **Apa**: Server MCP cakupan minimal (stdio, tanpa hosting): tools search docs, get page, get feature status, get rules — membaca machine layer + docs.
- **Kenapa penting untuk bersaing**: Riset §2: Svelte/Nuxt/Astro menjalankan docs MCP; kami menundanya karena infrastruktur, tetapi versi stdio lokal menghapus biaya hosting dan menambah kanal agen yang nyata.
- **Selesai bila**:
  - [ ] Paket MCP (stdio) dengan ≥3 tools yang membaca docs/machine + docs/**
  - [ ] Diuji dengan klien MCP (protocol-level test)
  - [ ] Dokumentasi pemasangan (Claude Code/Cursor/OpenCode)
- **Area kode**: `packages (baru)`, `docs/machine`
- **ADR**: ADR baru
- **Pembanding**: Svelte mcp.svelte.dev; Nuxt nuxt.com/mcp; Astro mcp.docs.astro.build; Next.js runtime MCP (bukan docs).

### `p2-context7` — Daftarkan repo ke Context7

*tema: docs · ukuran: S · status: done · sumber: listing /websites/ramonyx_devmoon_net (495 snippets) diverifikasi ctx7 library/docs 2026-10-21; README + llms + for-agents diperbarui*

- **Apa**: Ajukan repo RamonyxJS/ramonyx ke Context7 (kanal dokumentasi pihak ketiga untuk agen).
- **Kenapa penting untuk bersaing**: Riset: kelima framework besar terdaftar di Context7; gratis, tanpa infrastruktur, dan langsung memberi agen sumber docs yang familiar.
- **Selesai bila**:
  - [ ] Listing Context7 aktif dan diuji (query Ramonyx mengembalikan docs)
  - [ ] Dicatat di README + llms.txt
- **Area kode**: `docs`
- **Pembanding**: Next.js, Svelte, Nuxt, Astro, React Router semuanya terdaftar.

### `p2-cli-migration` — Migrasi playground & docs ke CLI `ramonyx`

*tema: quality · ukuran: M · status: done · sumber: kandidat lama — selesai ADR-0076*

- **Apa**: Ganti skrip ad-hoc repo (build/dev/start playground & docs) dengan CLI `ramonyx` — dogfood CLI di aplikasi nyata milik repo sendiri.
- **Kenapa penting untuk bersaing**: Kandidat lama; dogfooding membuktikan CLI cukup untuk aplikasi nyata dan menutup celah antara template dan praktik repo (dokumen dan CLI tidak boleh divergen).
- **Selesai bila**:
  - [ ] apps/playground + apps/docs berjalan lewat `ramonyx dev|build|start`
  - [ ] e2e + situs docs tetap hijau (termasuk ekspor Pages)
  - [ ] Dokumen repo diperbarui
- **Area kode**: `apps/playground`, `apps/docs`, `packages/devtools`
- **Pembanding**: Dogfooding CLI adalah standar framework (create-next-app memakai next, Nuxt memakai nuxi, SvelteKit memakai vite/svelte-kit).

### `p2-testing-docs` — Panduan testing aplikasi (paket testing + pola)

*tema: docs · ukuran: S · status: done · sumber: gap §3 (testing docs) — selesai docs/testing.md*

- **Apa**: Halaman docs testing: memakai `@ramonyx/testing` (handler in-process), mengetes loader/action, e2e dengan Playwright, pola data.
- **Kenapa penting untuk bersaing**: DX testing adalah faktor retensi; pesaing punya dokumentasi testing yang dalam, sedangkan paket testing kami belum terdokumentasi publik.
- **Selesai bila**:
  - [ ] Halaman docs testing dengan contoh yang dijalankan di CI
  - [ ] README paket testing
- **Area kode**: `docs`, `packages/testing`
- **Pembanding**: SvelteKit testing docs; Nuxt @nuxt/test-utils; Next.js testing setup.

### `p2-plugin-contract-freeze` — Deklarasikan kontrak plugin stabil (setelah satu siklus rilis)

*tema: ecosystem · ukuran: S · status: done · sumber: turunan ADR-0080; diverifikasi git diff v0.3.0..HEAD (plugin.ts/hooks/types tidak berubah), stabil 0.4.2*

- **Apa**: Bila kontrak plugin tidak berubah aditif sejak 0.3.0, deklarasikan stabil di rilis berikutnya: update docs/plugins.md (hapus catatan experimental), features.json plugin-ecosystem → implemented, dan catat di CHANGELOG.
- **Kenapa penting untuk bersaing**: ADR-0080 menetapkan kriteria stabilisasi satu siklus rilis; deklarasi adalah langkah administratif terakhir agar plugin pihak ketiga punya jaminan semver.
- **Selesai bila**:
  - [ ] Verifikasi tidak ada perubahan kontrak aditif sejak 0.3.0
  - [ ] Deklarasi stabil di docs/plugins.md + features.json + CHANGELOG (rilis berikutnya)
- **Area kode**: `docs`, `packages/bundler`
- **ADR**: ADR-0080
- **Pembanding**: Nuxt modules (versi modul + kompatibilitas Nuxt); SvelteKit/Vite plugin ecosystem (peer deps standar)

### `p2-partial-hydration-islands` — Partial hydration / islands per komponen

*tema: rendering · ukuran: L · status: done · dependensi: `p1-package-contract-coverage` · sumber: turunan DF-03/DF-08; code splitting rute selesai — `<Island>` + `defineIsland` dengan deteksi per halaman, e2e playground islands/no-JS/back-forward, halaman docs SSR*

- **Apa**: Hidrasi hanya komponen interaktif (island) yang ditandai, sementara konten statis tetap HTML server tanpa React root penuh.
- **Kenapa penting untuk bersaing**: Code splitting per rute menurunkan bundle awal, tetapi seluruh pohon rute masih di-hydrate; islands mengurangi JS/TBT dan memungkinkan halaman besar tetap interaktif secara selektif.
- **Selesai bila**:
  - [ ] API penanda island (mis. `use client`/`<Island>`) tanpa memecah kontrak halaman.
  - [ ] Server merender island dan client hanya hydrate batas yang ditandai.
  - [ ] Soft navigation/prefetch bekerja tanpa hydration ganda atau mismatch.
  - [ ] Test e2e interaksi, no-JS, back/forward, dan docs.
- **Area kode**: `packages/compiler`, `packages/react`, `packages/ssr`
- **Pembanding**: Astro islands; Next.js client components/partial hydration; Fresh islands.

### `p2-deferred-data-streaming` — Deferred loader/Suspense data yang no-JS-safe

*tema: rendering · ukuran: L · status: done · dependensi: `p1-package-contract-coverage` · sumber: turunan DF-07; `defer` + Suspense, state JSON nonce, fallback no-JS, e2e playground streaming/hydration/back-forward*

- **Apa**: Dukungan data deferred per-boundary yang mengalir setelah shell tanpa mengorbankan HTML tanpa JS dan konsistensi payload hydration.
- **Kenapa penting untuk bersaing**: Streaming shell/body sudah aktif, tetapi loader tetap resolve sebelum render; Suspense naif membuat fallback kosong saat JS mati.
- **Selesai bila**:
  - [ ] Desain payload deferred yang tetap tersedia untuk no-JS/hydration.
  - [ ] Fallback konten server yang terbaca tanpa JS atau mekanisme noscript yang teruji.
  - [ ] Streaming per-boundary + error handling setelah byte pertama.
  - [ ] Test e2e streaming, no-JS, hydration, dan back/forward.
- **Area kode**: `packages/ssr`, `packages/react`
- **Pembanding**: React Router streaming/defer; Next.js Suspense; SvelteKit streaming promises.

### `p2-runtime-observability-complete` — Lengkapi metrik observability runtime Rust

*tema: quality · ukuran: M · status: open · dependensi: `p2-observability` · sumber: features.json `observability-metrics` partial; p2-observability selesai untuk Node*

- **Apa**: Menuntaskan fitur `observability-metrics` partial: timing per fase/op, CPU/RSS/queue/worker, startup, error counters, dan ekspor JSON/OTel untuk runtime Rust.
- **Kenapa penting untuk bersaing**: Runtime eksperimental belum punya visibility yang cukup untuk soak/production decision; observability Node sudah selesai di @ramonyx/server.
- **Selesai bila**:
  - [ ] Metrik runtime mencakup fase startup, op, CPU, RSS, worker/plugin, dan error.
  - [ ] Ekspor JSON/OTel + test + dokumentasi operasional.
  - [ ] Baseline benchmark startup/runtime diperbarui dan dibandingkan.
- **Area kode**: `runtime`, `benchmarks`, `docs/public`
- **Pembanding**: Node OTel, Next.js instrumentation, Deno runtime metrics.

### `p2-distributed-state-adapters` — Adapter state terdistribusi: session, rate limit, cache, observability

*tema: quality · ukuran: L · status: open · dependensi: `p2-observability` · sumber: limitations rate-limit/session/revalidate/observability-logger; audit 2026-10-22*

- **Apa**: Menyediakan kontrak dan adapter produksi untuk state per-proses: session store, rate-limit store, cache/revalidate, dan ekspor metrik/log ke OTel atau backend bersama.
- **Kenapa penting untuk bersaing**: Default in-memory adalah pilihan aman untuk satu proses, tetapi deployment multi-instance membutuhkan store bersama agar session, limit, dan cache konsisten.
- **Selesai bila**:
  - [ ] Kontrak adapter session/rate-limit/cache + implementasi referensi Redis atau KV.
  - [ ] Uji dua instance aplikasi berbagi store: login, limit, invalidasi cache konsisten.
  - [ ] Ekspor metrik/log OTel atau JSON ke collector; dokumentasi deployment dan failure mode.
- **Area kode**: `packages/security`, `packages/server`, `packages/core`, `docs/public`
- **ADR**: ADR baru
- **Pembanding**: SvelteKit adapter stores, Next.js distributed cache, Lucia session adapters.

### `p2-auth-providers-authorization` — Auth lanjutan: OAuth/OIDC, user store, reset/verification, authorization

*tema: security · ukuran: L · status: open · dependensi: `p1-auth-session-complete` · sumber: features.json auth-session limitations; audit 2026-10-22*

- **Apa**: Melengkapi primitif auth menjadi jalur aplikasi nyata: adapter OAuth/OIDC, kontrak user store, password reset/email verification, dan model authorization berbasis role/permission.
- **Kenapa penting untuk bersaing**: Auth 1.0 sudah aman untuk flow dasar, tetapi OAuth, verifikasi email, reset, dan authorization tetap tanggung jawab aplikasi.
- **Selesai bila**:
  - [ ] Adapter OAuth/OIDC + state/PKCE + test provider palsu.
  - [ ] Kontrak user store + alur reset password dan verifikasi email dengan token sekali pakai.
  - [ ] Authorization role/permission terdokumentasi + contoh e2e.
  - [ ] Docs keamanan, migrasi, dan batasan provider.
- **Area kode**: `packages/security`, `apps/playground`, `docs/public`
- **ADR**: ADR baru
- **Pembanding**: Auth.js, Lucia, Better Auth, SvelteKit hooks + authorization helpers.

### `p2-adapter-production-parity` — Paritas adapter produksi: range, presets serverless, precompressed assets

*tema: deploy · ukuran: L · status: open · sumber: limitations adapter-node/adapter-serverless-edge/compression-etag; audit 2026-10-22*

- **Apa**: Menutup gap adapter Node/edge: range request, preset Vercel/Deno Deploy, dan penyajian aset pra-kompresi .br/.gz.
- **Kenapa penting untuk bersaing**: Adapter sudah berjalan, tetapi fitur produksi umum ini masih harus dirakit sendiri oleh pengguna.
- **Selesai bila**:
  - [ ] Range request Node dengan test byte-range dan fallback aman.
  - [ ] Preset build/deploy Vercel dan Deno Deploy + smoke test.
  - [ ] Aset .br/.gz dipilih berdasarkan Accept-Encoding dan diuji e2e.
- **Area kode**: `packages/adapter-runtime`, `packages/devtools`, `packages/bundler`, `docs/public`
- **Pembanding**: SvelteKit adapters, Next.js output tracing, Deno Deploy presets.

### `p2-request-pipeline-hardening` — Pipeline request: middleware matcher, multipart SSRF, upload streaming

*tema: security · ukuran: M · status: open · sumber: limitations middleware-global/ssrf-guard/forms; audit 2026-10-22*

- **Apa**: Menutup gap pipeline: middleware global dengan matcher per-path, validasi FormData/multipart pada SSRF guard, dan penanganan upload besar tanpa buffer berlebih.
- **Kenapa penting untuk bersaing**: Aplikasi produksi biasanya butuh middleware selektif dan form upload; perilaku saat ini aman tetapi terbatas.
- **Selesai bila**:
  - [ ] Matcher middleware per-path dengan test urutan/kompatibilitas.
  - [ ] SSRF guard memvalidasi URL FormData/multipart tanpa membaca body berulang.
  - [ ] Batas upload dan streaming body teruji di Node/edge.
- **Area kode**: `packages/server`, `packages/security`, `packages/core`, `docs/public`
- **Pembanding**: SvelteKit hooks matchers, Next.js middleware matcher, Hono middleware.

### `p2-actions-ux` — Server action UX: pending state, optimistic UI, revalidasi deklaratif

*tema: data · ukuran: M · status: open · sumber: limitations mutations-server-actions; audit 2026-10-22*

- **Apa**: Tambahkan primitif client untuk pending/error/optimistic UI dan revalidasi deklaratif lintas halaman tanpa merakit state manual.
- **Kenapa penting untuk bersaing**: Action sudah progressive enhancement, tetapi aplikasi CRUD modern mengharapkan pending/optimistic behavior yang konsisten.
- **Selesai bila**:
  - [ ] Hook/komponen pending + error + optimistic update dengan test React.
  - [ ] Revalidasi deklaratif per action dan lintas path terdokumentasi.
  - [ ] E2E JS/no-JS untuk action, error, dan update daftar.
- **Area kode**: `packages/react`, `packages/core`, `apps/playground`, `docs/public`
- **Pembanding**: React Router fetchers, Next.js useActionState/useOptimistic, SvelteKit use:enhance.

### `p2-i18n-complete` — i18n lengkap: ICU MessageFormat, deteksi/redirect, lokalisasi per-rute

*tema: routing · ukuran: M · status: open · sumber: limitations i18n; audit 2026-10-22*

- **Apa**: Melengkapi i18n dengan ICU MessageFormat, deteksi Accept-Language/redirect otomatis, dan metadata/konten per-rute per-locale.
- **Kenapa penting untuk bersaing**: Routing locale sudah ada, tetapi format pesan kompleks dan deteksi otomatis masih dirakit aplikasi.
- **Selesai bila**:
  - [ ] Parser/formatter ICU (plural/select/date) dengan test vector.
  - [ ] Middleware deteksi locale + redirect yang dapat dikonfigurasi; cookie preference.
  - [ ] Metadata/hreflang per-rute per-locale + docs/e2e.
- **Area kode**: `packages/core`, `packages/router`, `packages/ssr`, `docs/public`
- **Pembanding**: next-intl, SvelteKit paraglide, Nuxt i18n, Astro i18n.

## P3 — nice-to-have

### `p3-i18n` — i18n routing + helper terjemahan

*tema: routing · ukuran: L · status: done · sumber: gap §3 — selesai ADR-0081*

- **Apa**: Routing locale (prefix/domain), negosiasi Accept-Language, helper terjemahan server/client.
- **Kenapa penting untuk bersaing**: Paritas untuk produk global; tidak mendesak untuk adopsi awal, tetapi menjadi syarat untuk pasar tertentu.
- **Selesai bila**:
  - [ ] Routing locale + negosiasi + test
  - [ ] Helper terjemahan + docs + contoh
- **Area kode**: `packages/router`, `packages/compiler`, `packages/core`
- **ADR**: ADR baru
- **Pembanding**: Next.js i18n routing; Nuxt i18n module; SvelteKit paraglide; Astro i18n routing.

### `p3-devtools-ui` — Panel devtools (rute, timing loader, hydration)

*tema: dx · ukuran: L · status: done · sumber: kandidat lama — selesai ADR-0077*

- **Apa**: Panel di dev server: daftar rute + manifest, timing loader/render per request, status hydration, ukuran bundle.
- **Kenapa penting untuk bersaing**: Devtools meningkatkan retensi dan kecepatan debugging; pesaing besar memilikinya, tetapi ini bukan blocker adopsi.
- **Selesai bila**:
  - [ ] Panel dev + data timing nyata + docs
- **Area kode**: `packages/devtools`, `packages/bundler`
- **ADR**: ADR baru
- **Pembanding**: Nuxt DevTools; Next.js devtools MCP; Vite inspector.

### `p3-docs-domain` — Domain kustom + preview PR untuk situs docs

*tema: docs · ukuran: S · status: done · sumber: domain Worker live 2026-10-21; preview PR otomatis tidak dipakai — lokal/manual deploy terdokumentasi di deployment.md (keputusan 2026-10-21)*

- **Apa**: Domain kustom `ramonyx.devmoon.net` sudah live (Worker) + preview deploy per PR atau keputusan sadar untuk tidak.
- **Kenapa penting untuk bersaing**: Profesionalisme dan kepercayaan; GitHub Pages subpath sudah jalan, jadi ini peningkatan kenyamanan, bukan kebutuhan.
- **Selesai bila**:
  - [ ] Domain kustom aktif dengan HTTPS (Worker; mirror Pages tetap tersedia)
  - [ ] Preview PR (atau keputusan sadar untuk tidak, dicatat)
- **Area kode**: `.github/workflows`, `docs`
- **Pembanding**: Semua docs resmi framework besar berada di domain sendiri.

### `p3-runtime-production-readiness` — Exit criteria runtime Rust: eksperimental → produksi

*tema: deploy · ukuran: L · status: open · dependensi: `p2-runtime-observability-complete` · sumber: features.json: 11 fitur runtime experimental*

- **Apa**: Menetapkan dan memenuhi kriteria produksi runtime Rust: compatibility matrix, isolation/security review, resource limits, soak, HTTP/TLS decision, dan dokumentasi deployment.
- **Kenapa penting untuk bersaing**: 11 fitur runtime masih berstatus experimental; 100% matang harus berarti production-ready atau keputusan eksplisit untuk tetap di luar baseline.
- **Selesai bila**:
  - [ ] ADR exit criteria runtime (termasuk keputusan HTTP/2/TLS server dan isolasi proses/OS).
  - [ ] Compatibility suite + soak 24 jam + resource limit/security tests lulus.
  - [ ] Security review plugin/proses/sandbox; temuan kritis ditutup.
  - [ ] Dokumentasi deployment/limitasi + status features.json diperbarui.
- **Area kode**: `runtime`, `docs/public`, `benchmarks`, `.github/workflows`
- **ADR**: ADR baru
- **Pembanding**: Node/Deno/Bun production runtime docs dan compatibility guarantees.

### `p3-dx-complete` — DX lengkap: typed Link, watch CLI, HMR panel, error overlay, boundary lint

*tema: dx · ukuran: M · status: open · sumber: limitations typed-routes/cli-devtools/dev-server-hmr/error-messages-id/boundary-enforcement; audit 2026-10-22*

- **Apa**: Menutup gap developer experience: href Link bertipe, alias route types, start --watch, panel HMR untuk API route, error overlay, dan lint boundary.
- **Kenapa penting untuk bersaing**: Fitur dasar sudah ada, tetapi gap kecil ini menambah gesekan harian dan kesalahan tipe/rute.
- **Selesai bila**:
  - [ ] Link menerima href bertipe dari route manifest + test tipe.
  - [ ] Alias import route types dan start --watch dengan restart aman.
  - [ ] Panel HMR memetakan API route dan korelasi request; error overlay dev.
  - [ ] Lint boundary client/server dengan pesan actionable.
- **Area kode**: `packages/react`, `packages/devtools`, `packages/compiler`, `docs/public`
- **Pembanding**: Next.js typed routes, Vite HMR overlay, SvelteKit dev tools.

### `p3-media-assets-complete` — Media & aset lengkap: blur placeholder, AVIF, varian dev

*tema: perf · ukuran: M · status: open · sumber: limitations image-optimization/asset-pipeline; audit 2026-10-22*

- **Apa**: Melengkapi pipeline gambar/aset: blur placeholder, AVIF opt-in yang efisien, varian gambar di dev, dan penamaan aset dev yang konsisten.
- **Kenapa penting untuk bersaing**: Pipeline produksi sudah bagus, tetapi pengalaman dev dan kualitas gambar masih memiliki gap yang terlihat pengguna.
- **Selesai bila**:
  - [ ] Placeholder blur/inline LQIP dengan anti-CLS + test.
  - [ ] AVIF opt-in dengan cache build dan dokumentasi biaya.
  - [ ] Varian gambar dev + nama aset dev konsisten/hash.
- **Area kode**: `packages/plugin-image`, `packages/bundler`, `packages/react`, `docs/public`
- **Pembanding**: Next Image, Astro Assets, Nuxt Image, SvelteKit enhanced-img.

### `p3-ecosystem-complete` — Ekosistem: registry plugin, MCP HTTP, skill installer

*tema: ecosystem · ukuran: L · status: open · sumber: limitations plugin-ecosystem/mcp-docs-server/agent-skill; audit 2026-10-22*

- **Apa**: Menutup gap ekosistem: registry/`ramonyx add` plugin, transport HTTP untuk MCP docs, dan instalasi skill agen dari scaffolder.
- **Kenapa penting untuk bersaing**: Kontrak plugin stabil, tetapi penemuan/instalasi masih manual dan MCP hanya stdio.
- **Selesai bila**:
  - [ ] Registry plugin + perintah add/hapus dengan verifikasi integritas.
  - [ ] MCP docs HTTP transport + auth/rate limit, test handshake.
  - [ ] Scaffolder menawarkan instalasi skill/agent docs secara opt-in.
- **Area kode**: `packages/devtools`, `packages/mcp-docs-server`, `apps/create-app`, `docs/public`
- **Pembanding**: Astro integrations, Next.js plugin ecosystem, MCP transports.

### `p3-benchmark-ci-gate` — Benchmark CI blocking dengan baseline runner konsisten

*tema: quality · ukuran: M · status: open · dependensi: `p1-framework-v1-readiness` · sumber: limitations benchmark-gates; bench:gate lokal lulus 2026-10-22*

- **Apa**: Menyediakan runner/baseline konsisten agar regresi HTTP/SSR dapat memblokir CI, bukan hanya report-only lintas-runner.
- **Kenapa penting untuk bersaing**: Gate lokal per-lingkungan sudah ada, tetapi CI GitHub-hosted tidak stabil untuk strict; self-hosted/runner pool diperlukan.
- **Selesai bila**:
  - [ ] Runner self-hosted atau pool dengan baseline per-lingkungan ter-commit.
  - [ ] CI menjalankan strict gate dan gagal pada regresi > toleransi.
  - [ ] Dokumentasi operasional, refresh baseline, dan fallback report-only.
- **Area kode**: `.github/workflows`, `benchmarks`, `docs/public`
- **Pembanding**: Turbopack bench, SvelteKit bench, Nuxt bundle metrics — gate CI.

### `p3-loader-dependencies` — Loader dependencies dan data pipeline lanjutan

*tema: data · ukuran: M · status: open · sumber: limitations data-loaders; audit 2026-10-22*

- **Apa**: Tambahkan deklarasi dependensi antar-loader/route dan dukungan data non-GET yang eksplisit tanpa mengorbankan payload hydration.
- **Kenapa penting untuk bersaing**: Loader saat ini GET-only dan tidak memiliki dependency graph; aplikasi besar perlu deduplikasi/urutan data yang jelas.
- **Selesai bila**:
  - [ ] Dependency graph loader + deduplikasi per request.
  - [ ] Kontrak data non-GET/streaming yang tetap no-JS-safe.
  - [ ] Test integrasi multi-route + docs.
- **Area kode**: `packages/ssr`, `packages/core`, `packages/react`, `docs/public`
- **Pembanding**: React Router loaders, Next.js parallel routes, SvelteKit load dependencies.

## Dogfooding findings

> Temuan nyata saat membangun ulang landing + Worker; commit merujuk perbaikan di repo.

### `DF-01` — Edge target mengabaikan custom document dan subset rute

*status: fixed · area: packages/bundler, packages/compiler, packages/ssr · commit: `b7322c9`*

- **Masalah**: `buildEdge` selalu membangun semua halaman dan memakai dokumen default. Landing di Worker akan kehilangan CSS/font dan berpotensi menarik modul docs/fs.
- **Perbaikan**: Tambah `pagePaths`/`apiPaths`/`document` pada `buildEdge`, dukungan `document` di `generateServerEntry`, serta `DocumentOptions.path/assets` agar font ber-hash di-resolve dari asset map edge. Landing edge memakai `src/edge-document.ts`.

### `DF-02` — Soft navigation belum memakai View Transitions

*status: fixed · area: packages/react · commit: `b7322c9`*

- **Masalah**: `enableClientNavigation` menukar DOM tanpa `document.startViewTransition`, sehingga transisi antar halaman tidak memakai API native dan fokus tidak dipindahkan.
- **Perbaikan**: Bungkus swap dalam View Transition (feature-detect + reduced-motion fallback), fokus ke root setelah navigasi, dan tambah CSS transition name untuk topbar. Diuji di e2e keyboard.

### `DF-03` — Hydration penuh memblokir LCP dan menaikkan TBT

*status: fixed · area: packages/ssr, packages/react, apps/docs · commit: `b7322c9, a4bdf41, fcd4d43`*

- **Masalah**: Satu bundle/hydrate untuk seluruh halaman membuat LCP 2.4 dtk dan TBT 900 ms pada Lighthouse mobile meski konten sudah SSR.
- **Perbaikan**: Tambah `client.load: "interaction"` + hydration idle, CSS-based hero, dan code splitting per rute. Lighthouse lokal LCP 1.7 dtk/TBT rendah. Partial hydration/islands per komponen selesai di `p2-partial-hydration-islands`.

### `DF-04` — Canvas partikel kontinu membebani main thread

*status: fixed · area: apps/docs · commit: `a4bdf41`*

- **Masalah**: Loop rAF 60fps dengan ratusan arc berjalan terus, menaikkan TBT meski hanya dekorasi hero.
- **Perbaikan**: Gambar field statis saat first paint; redraw satu frame per batch pointer/scroll (tanpa loop idle). Field tetap reaktif tetapi CPU idle. TBT turun dari ~900 ms ke ~170 ms.

### `DF-05` — Landing memuat CSS docs + layout halaman panjang

*status: fixed · area: apps/docs, packages/ssr · commit: `a4bdf41`*

- **Masalah**: Dokumen landing membawa seluruh CSS docs (~30 KB) dan seluruh chapter di-layout walau di luar viewport; style/layout menjadi blocker TBT.
- **Perbaikan**: Dokumen memilih varian CSS landing (`path === "/"`), slice CSS docs yang tidak perlu, dan `content-visibility: auto` + `contain-intrinsic-size` untuk chapter. Runtime dark memakai background head eksplisit agar axe tetap benar.

### `DF-06` — GitHub Pages statis tidak bisa menjalankan action/streaming

*status: fixed · area: scripts, wrangler.toml, .github/workflows · commit: `5a1879b, 3d64b2c, 3875562`*

- **Masalah**: Public site di GitHub Pages tidak bisa POST server action, streaming SSR, atau KV; form waitlist tidak mungkin nyata di sana.
- **Perbaikan**: Arsitektur Cloudflare Worker live: landing edge SSR + action di `/`, docs statis sebagai Assets, waitlist KV. Deploy 2026-10-21 ke `ramonyx-site`; custom domain `ramonyx.devmoon.net` aktif (record DNS dibuat Cloudflare), KV `WAITLIST`, Cron Trigger `meta:stars`, Cache API untuk HTML landing, dan dukungan HEAD. Smoke live: home/docs/assets/API, POST waitlist, hydration, pencarian, a11y.

### `DF-07` — Streaming belum aktif; loader tetap memblokir render

*status: fixed · area: apps/docs, packages/ssr · commit: `a4bdf41, fcd4d43`*

- **Masalah**: Docs app memakai render sinkron dan loader selesai sebelum render; streaming SSR belum dimanfaatkan, dan belum ada mekanisme deferred loader/Suspense data.
- **Perbaikan**: Streaming shell/body aktif di Node/docs/edge. Loader tetap resolve sebelum render secara sengaja agar HTML + payload hydration tetap terbaca tanpa JS. Prototipe React Suspense deferred ditolak karena fallback kosong saat JS mati; deferred data no-JS-safe selesai di `p2-deferred-data-streaming` (`defer` + fallback server + state JSON).

### `DF-08` — Client bundle memuat semua halaman (tanpa code splitting)

*status: fixed · area: packages/compiler, packages/react · commit: `a4bdf41, fcd4d43`*

- **Masalah**: `generateClientEntry` mengimpor seluruh registry halaman; landing ikut membawa komponen docs dan tidak ada pemisahan chunk per rute/island.
- **Perbaikan**: `generateClientEntry` memakai dynamic import per halaman/layout; entry hanya memuat rute aktif, chunk terpisah, prefetch HTML menghangatkan chunk. Partial hydration/islands per komponen selesai di `p2-partial-hydration-islands`.

### `DF-09` — Tema tersimpan hilang saat hydration ditunda

*status: fixed · area: packages/ssr, packages/react, apps/docs · commit: `b7322c9, a4bdf41`*

- **Masalah**: Setelah bundle ditunda sampai interaksi, preferensi tema di localStorage baru diterapkan setelah hydration; reload sempat kembali ke tema sistem/flash.
- **Perbaikan**: Tambah bootstrap inline ber-nonce pada ClientOptions (dan edge build) yang menerapkan `data-theme` dari localStorage sebelum paint. Diuji reload e2e.

### `DF-10` — Axe false negative pada section gelap yang di-skip

*status: fixed · area: apps/docs · commit: `a4bdf41`*

- **Masalah**: `content-visibility` melewati background section runtime saat offscreen; axe menghitung kontras di atas paper dan melaporkan teks band-accent gagal.
- **Perbaikan**: Beri `.chapter-head` pada section gelap background band eksplisit (bukan hanya parent), sehingga kontras benar dan axe 100 tanpa mengorbankan skip layout.

### `DF-11` — Root middleware dijalankan dua kali di entry edge — CSP nonce tidak cocok

*status: fixed · area: packages/compiler, packages/ssr, apps/docs · commit: `3875562`*

- **Masalah**: Entry edge memasang `src/routes/middleware.ts` sebagai middleware global, sementara halaman yang sama juga membawanya di `middlewareFiles` (perilaku Node). `cspNonce` berjalan dua kali: header CSP memakai nonce A, HTML memakai nonce B. Semua inline script (payload hydration, bootstrap tema, client loader) diblokir; halaman tampak benar tanpa JS tetapi tidak hidup.
- **Perbaikan**: `generateServerEntry` menyaring file middleware global dari daftar middleware halaman dan API. Satu eksekusi per request; nonce header == nonce script. Diverifikasi live: hydration, Cmd+K, navigasi docs, action waitlist.

### `DF-12` — Fetch GitHub di loader SSR menahan TTFB landing

*status: fixed · area: scripts/build-worker.ts, apps/docs/src/landing.server.ts, wrangler.toml · commit: `3875562`*

- **Masalah**: Loader landing memanggil GitHub API dengan timeout 1,5 dtk pada isolate Worker dingin. Lighthouse live awal: performa 82–95, LCP 2,7–3,6 dtk (run dingin pertama 10,1 dtk). Data eksternal non-kritis berada di jalur kritis HTML.
- **Perbaikan**: Stars dipindah ke KV `meta:stars`; Cron Trigger Worker tiap jam memperbarui. Request hanya membaca KV. HTML landing di-cache Cache API 60 dtk (request pertama tetap SSR). Lighthouse live setelah perbaikan: performa 95/96/97 (median 96), a11y 100, CLS 0, LCP 2,1–2,6 dtk; static export lokal 97/LCP 1,5 dtk.

### `DF-13` — Cloudflare Web Analytics disuntik ke HTML dengan nonce CSP

*status: fixed · area: Cloudflare dashboard · commit: `3875562`*

- **Masalah**: Cloudflare menyuntik `static.cloudflareinsights.com/beacon.min.js` + `/cdn-cgi/rum` ke respons landing dan memakai nonce CSP yang sama, sehingga tetap lolos `script-src`. Ini menambah dua request eksternal dan variasi Lighthouse; bukan berasal dari kode situs.
- **Perbaikan**: Dimatikan Web Analytics/RUM otomatis di dashboard Cloudflare (zone devmoon.net) pada 2026-10-22; cache HTML landing di-purge. Verifikasi live: halaman / dan /docs/ssr-hydration/ tidak lagi memuat static.cloudflareinsights.com maupun /cdn-cgi/rum. Lighthouse live perlu diukur ulang bila ingin mengklaim LCP <2,0 dtk.

### `DF-14` — Soft navigation tidak merekonsiliasi <head> — halaman docs tanpa CSS

*status: fixed · area: packages/react, apps/docs · commit: `6497d41`*

- **Masalah**: Landing memakai CSS split (`GAYA_LANDING`) sedangkan docs memakai `GAYA` penuh. Soft navigation hanya menukar isi `#ramonyx-root` dan `document.title`; style landing tetap aktif setelah pindah ke `/docs/architecture`. Sidebar menjadi daftar bullet, grid docs hilang, metadata/link markdown tidak bertambah. Hard reload memperbaikinya.
- **Perbaikan**: Framework `prepareHead` di `packages/react/src/client.ts` merekonsiliasi title, lang/dir, meta, link, dan style. Style inline distage `media=not all` lalu diaktifkan saat swap; stylesheet baru dipreload sebelum swap; node lama dibuang setelah swap; style baru memakai nonce CSP dokumen aktif. Marker `data-ramonyx-style` ditambahkan ke style server. CSS split landing dipertahankan karena pengukuran lokal menunjukkan full CSS menaikkan TBT/perf (median 94 vs 99 pada split); bug ditutup oleh rekonsiliasi head, bukan dengan memaksa full CSS/hard navigation. Test regresi: `apps/docs/e2e/soft-navigation.spec.ts` (CSS berbeda per rute, link alternate, back/forward, prefetch, stylesheet tambahan).
