---
adr: 0084
title: "Metadata Dinamis per Request dari Data Loader (`generateMetadata`)"
visibility: internal
---

# ADR-0084: Metadata Dinamis per Request dari Data Loader (`generateMetadata`)

- Status: Accepted (2026-10-25)
- Tanggal: 2026-10-25
- Sumber: audit aplikasi nyata Oktober 2026, temuan #5 — field SEO di admin Rama hanya tersimpan
  di D1 dan tidak pernah memengaruhi `<head>` publik karena `PageMetadata` dibaca sebagai ekspor
  modul statis.

## Konteks

`metadata` statis (ADR-0059) cukup untuk halaman dengan judul tetap, tetapi situs nyata sering
menentukan title/description/canonical/OG dari data per request:

- profil/SEO global yang diedit admin (Rama Portfolio),
- halaman detail produk/artikel yang judulnya berasal dari database,
- halaman yang perlu `noindex`/status 404 berdasarkan hasil loader.

Sebelum keputusan ini, satu-satunya jalan adalah menduplikasi query ke loader lalu memaksa
metadata statis, atau memindahkan logika SEO ke luar framework. Keduanya membuat data dan
`<head>` tidak konsisten.

## Keputusan

1. **Ekspor baru `generateMetadata(context)`** di modul halaman (`PageModule`):
   - konteks = konteks loader + `data` hasil loader (`PageMetadataContext`);
   - boleh sinkron atau async, mengembalikan `PageMetadata`;
   - `context.load` memakai **graf loader per-request yang sama** dengan loader, sehingga query
     ber-key sama tidak diulang bila loader sudah memakainya.
2. **Dieksekusi SSR setelah loader, sebelum status/head/body dirender** — termasuk jalur
   streaming, sehingga metadata tidak pernah muncul setelah byte pertama. Ini menambah satu
   await sebelum streaming dimulai; pekerjaan metadata harus proporsional.
3. **Penggabungan dangkal**: `{ ...metadata, ...generateMetadata(...) }`. Field yang tidak diisi
   generator tetap memakai nilai statis; `undefined` eksplisit menghapus field statis. Hanya
   `generateMetadata` yang dipanggil; tidak ada pemanggilan ganda.
4. **`status` dari metadata hasil generator** mengikuti validasi yang sama (integer 100–599;
   nilai tidak valid → 200). Metadata ikut dihitung ulang pada render ulang setelah action.
5. **Error generator masuk jalur error halaman** yang sudah ada (biasanya 500); metadata statis
   tetap menjadi fallback untuk judul dokumen error bila `error.tsx` tersedia.
6. **Tidak ada perubahan protokol client**: head tetap dirender server dan direkonsiliasi oleh
   soft navigation (ADR-0008). Generator tidak dijalankan di browser.
7. **Batas yang disengaja**:
   - tidak ada metadata dari `layout.tsx` (halaman tetap satu-satunya sumber; menghindari
     merge berlapis yang tidak perlu);
   - `createSeoRoutes` tetap memakai manifest statis — metadata dinamis tidak bisa mengubah
     daftar URL sitemap;
   - nilai `defer()` belum diselesaikan saat metadata berjalan — pakai field loader biasa;
   - tidak ada cache metadata terpisah; cache loader yang ada tetap berlaku.

## Alternatif yang ditolak

- **`metadata` sebagai fungsi dengan tanda tangan loader** (tanpa `data`): memaksa query ulang
  atau memindahkan state ke luar request.
- **Metadata dieksekusi paralel dengan loader**: generator butuh data loader; menjalankannya
  paralel hanya aman bila generator tidak bergantung data, dan menambah kompleksitas tanpa
  manfaat nyata.
- **`<Head>` component React**: mengikat ke adapter UI dan melanggar pemisahan ADR-0003.
- **Metadata di-cache per path**: staf/admin dapat mengubah data kapan saja; cache yang salah
  lebih berbahaya daripada satu query yang sudah dideduplikasi.

## Konsekuensi

- Situs publik dapat memakai satu sumber data untuk body dan `<head>`; admin SEO langsung
  berlaku pada request berikutnya.
- Metadata dinamis menambah latency sebelum respons/streaming dimulai. Dokumentasi menyarankan
  query ringan atau `context.load` bersama.
- Sitemap statis tidak otomatis mengetahui halaman dinamis ber-`noindex`; aplikasi tetap
  mengatur `getStaticPaths`/entri sitemap secara eksplisit.

## Cara membuktikan

- `packages/ssr/test/pages.test.ts`:
  - `generateMetadata` menerima data loader, query, request, dan berbagi `load` (satu query);
  - merge statis (image tetap) + override (title/type/canonical/robots) + `undefined` menghapus;
  - `status` dinamis 404;
  - error generator → 500.
- `packages/core/src/page.ts` mengekspor `PageMetadataContext`/`PageMetadataGenerator`.
- Aplikasi nyata: Rama Portfolio memakai `generateMetadata` untuk `seo_title`/`seo_description`
  dari D1.
