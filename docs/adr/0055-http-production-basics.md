# ADR-0055: Dasar HTTP Produksi — Kompresi, ETag/304, Fingerprinting Aset, Helper Cache

- Status: Accepted (2026-10-18)
- Tanggal: 2026-10-18
- Sumber: TODO `p0-http-production-basics` (analisis kesenjangan §3 rencana konsolidasi:
  "compression/etag di server standalone: belum", "aset tanpa hash + `cache-control: no-store`")

## Konteks

Server produksi Ramonyx (adapter Node) mengirim respons **tanpa kompresi**, aset build tanpa
hash konten sehingga template menyajikannya `cache-control: no-store`, dan tidak ada helper
cache. Ini regresi langsung terhadap Core Web Vitals dan bandwidth — pesaing (Next.js,
SvelteKit, Astro, Nuxt) menanganinya secara default.

## Keputusan

1. **Kompresi di adapter Node** (`createNodeHost`, default aktif):
   - brotli diprioritaskan, lalu gzip; `q=0` dihormati; tipe tak terkompresi (gambar, font,
     video) dilewati; `HEAD`/204/304 dilewati; `content-length` dihapus saat mengompresi.
   - `vary: accept-encoding` selalu ditambahkan pada respons yang dapat dikompresi (kebenaran
     cache), termasuk saat kompresi dimatikan lewat opsi.
   - Heuristik "terlalu kecil" hanya bila `content-length` dideklarasikan (< 1 KiB default).
     **Respons streaming selalu dikompresi** (tanpa content-length) dengan **flush per chunk**
     (`Z_SYNC_FLUSH` / `BROTLI_OPERATION_FLUSH`) agar SSR streaming tetap progresif — rasio
     kompresi sedikit turun, TTFB terjaga. Trade-off ini diuji (test streaming + test kompresi).
   - Opsi `compression: false` / `compressionMinBytes` untuk menyesuaikan.
2. **Fingerprinting aset** (`buildClient`): nama berkas memuat hash konten
   (`client-<hash>.js`, chunk `chunks/<name>-<hash>.js`, aset `[name]-[hash][ext]`); peta nama
   ditulis ke `dist/client/ramonyx.assets.json`. `readClientScript`/`readAssetManifest`
   membaca peta itu; fallback `/assets/client.js` bila belum dibangun (server tanpa build).
   `ramonyx start` (CLI) dan aplikasi (docs, playground, template) memakai manifest.
3. **`serveStatic` middleware** (`@ramonyx/adapter-runtime`): ETag lemah (ukuran+mtime) + 304,
   `cache-control: immutable` untuk aset ber-fingerprint (atau `max-age` kustom, default
   `no-cache`), tipe konten lengkap, guard traversal + tolak segmen berawalan titik,
   `GET`/`HEAD` saja, berkas hilang → `next()`. Template/aplikasi repo mengganti middleware
   aset tulis-tangan dengan ini (satu implementasi, teruji).
4. **Helper `cacheControl()`** (`@ramonyx/core`): membangun header `cache-control` siap sebar
   (`maxAge`, `sMaxAge`, `staleWhileRevalidate`, `immutable`, `private`, `noCache`, `noStore`).

## Bukti

- `packages/adapter-runtime/test/node.test.ts`: gzip/br, prioritas, q=0, tipe tak terkompresi,
  heuristik kecil (dengan/tanpa content-length), streaming terkompresi + tetap progresif,
  kompresi dimatikan, `vary` benar.
- `packages/adapter-runtime/test/static.test.ts`: ETag/304, immutable, HEAD, traversal
  ter-encode, dotfile, prefix kustom, header tambahan.
- `packages/bundler/test/build.test.ts`: build nyata → `client-<hash>.js` + manifest +
  `readClientScript` + fallback.
- `packages/core/test/cache.test.ts`: pembentukan header.
- E2E playground (hydration dengan bundle ber-hash) + ekspor situs docs (manifest).

## Alternatif yang ditolak

- **Buffer untuk memutuskan kompresi body kecil** (pola `compression` middleware): menunda
  byte pertama respons streaming sampai ambang tercapai — bertentangan dengan SSR streaming
  (ADR-0047). Ditolak.
- **Kompresi di lapisan framework (handler)**: `Response` standar web tidak memiliki akses
  transport; kompresi adalah tanggung jawab host runtime (adapter). Ditolak.
- **Hash query-string (`client.js?v=<hash>`)** untuk cache busting: tidak memberi
  `immutable` (banyak cache mengabaikan query), dan tidak menyelesaikan peta nama untuk
  `<script>`. Ditolak.

## Konsekuensi

- Produksi default lebih cepat tanpa konfigurasi; aset aman di-cache selamanya karena nama
  ber-hash; server standalone punya ETag/304.
- Aplikasi yang mengandalkan `dist/client/client.js` harus pindah ke manifest
  (`readClientScript`) — template & aplikasi repo sudah; proyek lama memakai fallback
  (peringatan CLI tetap muncul bila manifest tidak ada).
- Sisa kandidat: Range request, pre-compressed aset (`.br`/`.gz` di build), CDN cache header
  otomatis per tipe rute (menyatu dengan `p1-revalidate`).
