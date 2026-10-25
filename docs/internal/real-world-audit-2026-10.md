# Audit aplikasi nyata — Midman + Rama Portfolio (Oktober 2026)

Status: **audit selesai, fase 1 sebagian diimplementasikan di framework**.
Dua aplikasi diperlakukan sebagai **black-box integration targets**, bukan bagian dari core.
Kode bisnis, data pelanggan, secret, dan konfigurasi akun tidak masuk repo Ramonyx.

## Metode

- Membaca source dan artefak build dua aplikasi.
- Menjalankan build/deploy, memeriksa output `dist/client`, `dist/edge`, dan HTML Worker.
- Menguji soft navigation, hash anchor, form action, D1, auth/session, CSP, custom domain.
- Mencocokkan temuan dengan TODO/fitur framework yang sudah ada agar tidak menduplikasi.

## Temuan

| # | Temuan | Bukti | Status | Tindakan |
| --- | --- | --- | --- | --- |
| 1 | Entry client `/assets/client-*.js` ditulis di root `dist/client`, tetapi static host edge menyajikan direktori sebagai root. | Kedua app menyalin manual `client-*.js` + `chunks/` ke `dist/client/assets/`. | **Fixed** | `mirrorClientAssets()` dipanggil oleh `buildClient()`. |
| 2 | `public/` sebenarnya sudah disalin Vite ke `dist/client`, tetapi tidak didokumentasikan sebagai kontrak. Kedua app menyalin ulang. | Build `buildClient` tanpa script app menghasilkan `dist/client/fonts/**`. | Dokumentasi | Hapus salinan manual saat update app; dokumentasikan di deployment. |
| 3 | Hash anchor setelah soft navigation / hydration sebelumnya menjadi tanggung jawab app. | Rama memakai `HashBoot`; tanpa itu `#pengalaman` bisa berhenti di posisi awal. | **Fixed di client** | Client navigation sekarang scroll ke target hash; initial hydration juga. Aplikasi dapat menghapus `HashBoot` setelah upgrade. |
| 4 | `PendingButton` tidak bisa mencocokkan form tertentu, sementara `useActionStatus` bisa. | Kedua app membuat `SubmitButton` sendiri karena `PendingButton` tidak menerima `formId`. | **Fixed** | `PendingButton` menerima `formId` dan tidak meneruskannya ke DOM. |
| 5 | Metadata halaman masih statis; field SEO di admin Rama tidak dapat mengubah `<head>` per request. | `PageMetadata` dibaca dari module route, bukan data loader. | Backlog P2 | Desain `generateMetadata`/`metadata(data)` per-request dengan test SSR. |
| 6 | HTML `Ctrl+U` sangat panjang karena body React SSR satu baris. | `devmoon.net`: 722 baris, baris body ±20 KB; payload ±11 KB. | Bukan bug | Pertimbangkan formatter dev-only; produksi tetap compact. |
| 7 | PWA masih app-level (manifest, SW, offline, ikon). | Midman memelihara `src/pwa.ts` dan route middleware sendiri. | Backlog P2 | Recipe/helper opsional; jangan masukkan ke core. |
| 8 | Diagnostik batas server/client sudah berguna, tetapi baru muncul saat build. | Rama pernah mengimpor helper dari `*.server.ts` ke komponen. | Backlog P2 | Pertimbangkan lint/analyzer yang menunjuk export server sebelum bundling. |
| 9 | D1/auth/CSRF/rate-limit adalah pola berulang di app. | Midman dan Rama memiliki adapter serupa. | Bukan core | Pertahankan sebagai integration kit/resep; jangan menambah coupling core. |

## Yang sudah baik dan tidak perlu diubah

- `createSession`, CSRF, security headers, rate limit, D1 adapter-agnostic.
- Server actions + progressive enhancement.
- Soft navigation, prefetch, view transitions.
- Edge build + asset manifest + source map policy.
- Server/client boundary error message.
- Streaming SSR dan hydration.

## Fase implementasi

### Fase 1 — fondasi (sedang/selesai)

1. Mirror client entry + chunks ke `dist/client/assets`.
2. Hash scroll di client navigation dan initial hydration.
3. `PendingButton` dengan `formId`.
4. Test unit untuk mirror dan prop baru.
5. Dokumentasi deployment: root static host vs Node `/assets`.

### Fase 2 — DX dan metadata

1. Dev-only HTML source formatter atau endpoint debug.
2. `generateMetadata`/metadata function yang menerima data loader.
3. Diagnostik batas server/client lebih awal.
4. PWA recipe (bukan core).

### Fase 3 — update aplikasi

Setelah rilis versi framework:

- **Midman**
  - naikkan dependency ke versi rilis,
  - hapus salinan manual `client-*`/`chunks` dan `public/`,
  - gunakan `PendingButton` dengan `formId`,
  - build/deploy/smoke: checkout, webhook, admin, email, PWA.
- **Rama Portfolio**
  - naikkan dependency,
  - hapus `HashBoot`,
  - hapus salinan manual aset klien/public,
  - gunakan `PendingButton` dengan `formId`,
  - smoke anchor `#profil`, `#pengalaman`, `#sistem`, `#catatan`, mobile, admin.

### Fase 4 — showcase

- Sanitasi dua studi kasus (tanpa secret/data bisnis).
- Publikasikan di `docs/public/showcase`.
- Tambahkan fixture/e2e minimal untuk pola edge + D1 + auth + soft navigation.
- Jangan menautkan repo privat tanpa izin.

## Gate

- `pnpm lint`
- `pnpm typecheck`
- `pnpm test` (termasuk test baru)
- build + edge smoke
- aplikasi: build, deploy preview, smoke auth/action/hash/mobile
- tidak ada klaim performa tanpa benchmark yang dapat dijalankan
