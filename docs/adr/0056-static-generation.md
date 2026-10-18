# ADR-0056: Static Generation (SSG) — Prerender + `ramonyx build --static`

- Status: Accepted (2026-10-18)
- Tanggal: 2026-10-18
- Sumber: TODO `p0-static-generation` (analisis kesenjangan §3: "SSG first-class belum — hanya
  ekspor bespoke di apps/docs, bukan fitur framework")

## Konteks

Situs docs mengekspor statis lewat skrip aplikasi (`apps/docs/export.ts`) yang menyalin logika
render → tulis file. Kebutuhan yang sama (marketing, blog, dokumentasi) dialami setiap pengguna,
dan tanpa fitur framework mereka menulis skrip sendiri. Selain itu ditemukan dua bug produksi:
(a) `ramonyx build --static` (baru) dan `pnpm docs:export` memuat React **sebelum**
`NODE_ENV=production` diset → mismatch `react` dev + `react-dom/server` prod
(`dispatcher.getOwner is not a function`), artinya ekspor situs yang terbit selama ini memakai
React dev build di server.

## Keputusan

1. **`prerenderRoutes()` di `@ramonyx/bundler`** (build-time, node:* diizinkan): menjalankan
   **handler aplikasi yang sama** dengan request sintetis (`http://prerender.local/...`) dan
   menulis HTML — paritas SSR ↔ statis 100%, bukan renderer kedua.
   - Rute statis (tanpa param) ikut secara default; `export const prerender = false` opt-out.
   - Rute dinamis dienumerasi `export function getStaticPaths()` (peta param; mendukung
     `[slug]` dan `[...slug]`), plus `paths` eksplisit.
   - `notFoundPath` → `404.html` (wajib benar-benar 404); status non-2xx pada rute = error build
     (dengan cuplikan HTML error agar mudah didiagnosis).
   - Opsi: `clientDir` (salin aset), `nojekyll`, `transformHtml` (mis. link discovery agen
     ADR-0054), `directoryIndex`.
2. **CLI `ramonyx build --static`**: bundel klien → prerender → `dist/static/`
   (index per rute, `404.html` dari halaman `metadata.status: 404`, aset). Ringkasan mencatat
   halaman yang dilewati beserta alasannya.
3. **`NODE_ENV=production` diset paling awal** di `ramonyx build` dan `pnpm docs:export`
   (sebelum modul React dimuat) — memperbaiki mismatch dev/prod; `export.ts` memperingatkan bila
   bukan production.
4. **Dogfood**: `apps/docs/export.ts` memakai `prerenderRoutes` (loop render tulis-tangan
   dihapus); situs docs kini juga punya **halaman 404 HTML** (sebelumnya `404.html` berisi JSON
   `{"error":"Not Found"}`); template `create-app` mendapat `[...slug]/page.tsx` 404 yang sama.

## Bukti

- `packages/bundler/test/prerender.test.ts`: rute statis + getStaticPaths + skip + 404 + aset +
  transform; kegagalan jelas (bukan HTML, status ≥400, 404 yang bukan 404).
- `apps/create-app/test/create-app.test.ts`: `ramonyx build --static` pada app hasil scaffold →
  `dist/static/index.html` + `404.html` HTML + aset ber-hash; regression untuk bug NODE_ENV
  (sebelum perbaikan: status 500 `dispatcher.getOwner is not a function`).
- `apps/docs/test/docs.test.ts`: ekspor subpath `/ramonyx` (halaman, tautan relatif, 404, aset,
  artefak agen) dengan `NODE_ENV=production`.
- `ramonyx build --static` manual pada template: `✓ static: 1 halaman`, `dilewati: /[...slug]
  (prerender: false)`.

## Alternatif yang ditolak

- **Renderer kedua khusus SSG** (mis. React `renderToStaticMarkup` terpisah): duplikasi pipeline,
  risiko divergensi SSR ↔ statis. Ditolak; request sintetis ke handler yang sama lebih sederhana
  dan sudah terbukti (situs docs).
- **`getStaticProps` ala Next (data per rute di build)**: menambah permukaan API; `getStaticPaths`
  + loader yang sudah ada cukup untuk v1 (loader tetap jalan saat prerender).
- **`--static` dengan daftar path dari CLI** (`--static-path`): API programatik `paths` sudah ada;
  CLI memakai enumerasi manifest + `getStaticPaths` (lebih sedikit flag).

## Konsekuensi

- Deploy statis (Pages/Netlify/S3) kini jalur kelas satu; template & docs memakainya.
- Situs docs yang terbit setelah ini memakai React produksi (HTML lebih kecil, lebih cepat) —
  perubahan perilaku yang diinginkan; tercatat di sini karena mengubah artefak publik.
- Sisa kandidat: revalidasi/ISR (`p1-revalidate`), `--static` untuk rute API (tidak relevan),
  header cache per rute statis (menyatu dengan revalidate).
