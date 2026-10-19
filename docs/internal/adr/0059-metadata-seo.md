---
adr: 0059
title: "Metadata Halaman & SEO (`sitemap.xml`/`robots.txt`)"
visibility: internal
---

# ADR-0059: Metadata Halaman & SEO (`sitemap.xml`/`robots.txt`)

- Status: Accepted (2026-10-18)
- Tanggal: 2026-10-18
- Sumber: TODO `p1-metadata-seo` (analisis kesenjangan §3: "Head/metadata API: partial — hanya
  title/status; tanpa description/OG/head injection per halaman")

## Konteks

Halaman hanya bisa menetapkan `title`/`status`; tidak ada description, canonical, atau kartu
berbagi (OG/Twitter), dan tidak ada bantuan sitemap/robots — situs publik harus mengakalinya
di luar framework.

## Keputusan

1. **`PageMetadata` diperluas** (core): `description`, `canonical`, `image`, `type`, `robots`
   (`"index" | "noindex"`). `title`/`status` tetap.
2. **`<head>` per halaman** dibangun `@ramonyx/ssr` (`metadataHead`) dan diteruskan ke
   `DocumentRenderer` lewat opsi `head` (kontrak sudah ada; dokumen kustom tidak berubah).
   - `og:url` memakai origin request; `image` relatif diabsolutkan dengan origin request.
   - Semua nilai di-escape (metadata bisa memuat `<`/`"`).
   - `robots: "noindex"` → `<meta name="robots" content="noindex">`.
3. **Helper SEO** (`@ramonyx/ssr`, tanpa konfigurasi origin):
   - `sitemapXml(entries, { origin })` dan `robotsTxt(options)`;
   - `createSeoRoutes({ pages, extraPaths?, robots? })` → `GET /sitemap.xml` + `GET /robots.txt`
     dari manifest: rute statis + `getStaticPaths`; **halaman `noindex` dan halaman error
     (status ≥ 400) dikecualikan**; URL absolut dibangun dari request (benar di domain mana pun).
4. **Helper pola rute ke core**: `hasDynamicSegment`/`fillRouteParams` (dipakai prerender/SSG
   ADR-0056 dan SEO) — satu implementasi.
5. **Dogfood**: template memakai `createSeoRoutes` + `description`; situs docs mengekspor
   `sitemap.xml` (flag `--origin`; workflow Pages mengirim `https://ramonyxjs.github.io`) dan
   `pages.yml` menyetel `NODE_ENV=production` untuk ekspor.

## Bukti

- `packages/ssr/test/pages.test.ts`: tag head lengkap (description/robots/canonical/OG/Twitter,
  escaping, absolutisasi gambar); tanpa metadata tidak ada tag tambahan.
- `packages/ssr/test/seo.test.ts`: sitemap/robots + `createSeoRoutes` (exclude noindex/404/dinamis
  tanpa paths; origin dari request).
- `packages/core/test/page.test.ts`: `fillRouteParams`/`hasDynamicSegment`.
- `apps/create-app/test/create-app.test.ts`: smoke — `/sitemap.xml` memuat beranda & bukan 404,
  `/robots.txt` memuat `Sitemap:`.
- `apps/docs/test/docs.test.ts`: ekspor `sitemap.xml` dengan origin + base subpath.

## Alternatif yang ditolak

- **Konfigurasi origin global** (`siteUrl` di config): menambah konfigurasi wajib; origin request
  benar untuk sebagian besar kasus (di belakang proxy: dokumentasikan).
- **`<Head>` component (React)** untuk injeksi tag: mengikat ke adapter UI; metadata deklaratif
  di modul halaman tetap adapter-agnostik (ADR-0003).
- **Sitemap otomatis untuk rute dinamis tanpa `getStaticPaths`**: tidak ada sumber kebenaran
  daftar URL; dibiarkan keluar (dokumentasi).

## Konsekuensi

- Situs publik mendapat SEO dasar tanpa pustaka tambahan; sitemap konsisten dengan prerender SSG.
- Sisa kandidat: `lastmod` otomatis dari mtime git (butuh build-time), hreflang (i18n p3),
  JSON-LD helper.
