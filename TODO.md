# TODO — menuju paritas kompetitif

> **Sumber tunggal: `TODO.json`** — berkas ini hasil generate, jangan diedit manual.
> Generate: `pnpm docs:generate` · Validasi: `pnpm docs:validate` · Konteks: `docs/PLAN-docs-consolidation.md` §3–4.
> Prioritas: **P0** blocker adopsi · **P1** paritas · **P2** diferensiasi & utang yang diakui · **P3** nice-to-have. Ukuran: S (≤1 hari) · M (beberapa hari) · L (1–2 minggu).
> Status fitur saat ini (bukti + batasan): `docs/machine/features.json`.

## Ringkasan

| Prioritas | Jumlah | Item |
| --- | --- | --- |
| P0 — blocker adopsi | 5 | `p0-server-actions` · `p0-static-generation` · `p0-serverless-adapters` · `p0-http-production-basics` · `f0-extension-primitives` |
| P1 — paritas | 8 | `p1-middleware-per-route` · `p1-typed-routes` · `p1-metadata-seo` · `p1-auth-session` · `p1-revalidate` · `p1-prefetch` · `p1-boundary-lint` · `p1-docs-tutorial` |
| P2 — diferensiasi & utang | 12 | `p2-plugin-ecosystem` · `p2-observability` · `p2-bench-env-baseline` · `p2-ip-pinning` · `p2-pentest-plugin` · `p2-asset-pipeline` · `p2-error-dx` · `p2-watch-mode` · `p2-mcp-docs-server` · `p2-context7` · `p2-cli-migration` · `p2-testing-docs` |
| P3 — nice-to-have | 3 | `p3-i18n` · `p3-devtools-ui` · `p3-docs-domain` |

**Quick wins** (dampak besar, usaha kecil): `p0-http-production-basics` · `p1-prefetch` · `p1-docs-tutorial` · `p2-watch-mode` · `p2-context7` · `p2-testing-docs`

**Strategis** (butuh keputusan arsitektur): `p0-server-actions` · `p0-static-generation` · `p0-serverless-adapters` · `p1-auth-session` · `p1-revalidate` · `p2-plugin-ecosystem` · `p2-bench-env-baseline` · `p2-asset-pipeline` · `p2-mcp-docs-server` · `f0-extension-primitives`

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

## P2 — diferensiasi & utang

### `p2-plugin-ecosystem` — Ekosistem plugin/module tingkat framework

*tema: ecosystem · ukuran: L · status: in-progress · sumber: gap §3 (ekosistem) — M1-M3 selesai (ADR-0067); sisa: kontrak stabil setelah >=2 plugin nyata*

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

*tema: rendering · ukuran: L · status: in-progress · sumber: gap §3 (assets) — M1 selesai (ADR-0069); M2 resize gate dependency*

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

*tema: docs · ukuran: S · status: open · sumber: riset §2*

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

## P3 — nice-to-have

### `p3-i18n` — i18n routing + helper terjemahan

*tema: routing · ukuran: L · status: open · sumber: gap §3 (i18n)*

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

*tema: docs · ukuran: S · status: open · sumber: kandidat lama*

- **Apa**: Domain kustom (ramonyx.dev atau serupa) + preview deploy per PR untuk situs docs.
- **Kenapa penting untuk bersaing**: Profesionalisme dan kepercayaan; GitHub Pages subpath sudah jalan, jadi ini peningkatan kenyamanan, bukan kebutuhan.
- **Selesai bila**:
  - [ ] Domain kustom aktif dengan HTTPS + redirect dari Pages
  - [ ] Preview PR (atau keputusan sadar untuk tidak, dicatat)
- **Area kode**: `.github/workflows`, `docs`
- **Pembanding**: Semua docs resmi framework besar berada di domain sendiri.
