---
adr: 0066
title: "Revalidasi Data (ISR-lite) — Cache Loader + SWR + Invalidasi On-Demand"
visibility: internal
---

# ADR-0066: Revalidasi Data (ISR-lite) — Cache Loader + SWR + Invalidasi On-Demand

- Status: Accepted (2026-10-18)
- Tanggal: 2026-10-18
- Sumber: TODO `p1-revalidate` (analisis kesenjangan §3: "ISR/caching route: belum");
  rencana komprehensif Fase 1 (memakai primitif F0: `KeyValueStore`, `AppHooks` — ADR-0065).

## Konteks

Setiap request halaman menjalankan loader lagi; konten semi-statis (beranda, katalog) selalu
menunggu I/O. Framework pesaing menyediakan ISR/route rules; Ramonyx sudah punya SSG
(ADR-0056) tetapi tidak ada caching runtime. Primitif store + hooks sudah tersedia dari F0.

## Keputusan

1. **Yang di-cache adalah data loader, bukan HTML.** HTML memuat **nonce CSP per request**
   (ADR-0014); men-cache HTML berarti memakai ulang nonce — tidak aman. *(Deviasi dari sketsa
   rencana yang menyebut Cache-Control otomatis pada HTML — dibatalkan karena alasan ini.)*
2. **API halaman** (aditif di `PageModule`): `export const revalidate = <detik>` dan
   `export const cacheTags = [...]`.
3. **API aplikasi** (`@ramonyx/core`, diekspor `ramonyx`): `createCache({ store?, onInvalidate? })`
   → `{ store, revalidate({ paths?, tags?, reason? }) }`; `pathTag()`/`routeTag()` internal:
   - entri diberi tag `path:<path konkret>`, `route:<pola>`, + tag kustom;
   - `revalidate({ paths })` = invalidasi tag path; `revalidate({ tags })` = tag kustom.
4. **Wiring**: `createPageRoutes({ cache })`. Tanpa opsi cache → perilaku lama (loader selalu
   jalan) — nol perubahan bagi aplikasi yang tidak memakai.
5. **Stale-while-revalidate**: entri disimpan dengan TTL **2×**; paruh pertama = fresh, paruh
   kedua = stale → permintaan dilayani data lama sementara refresh berjalan di belakang
   (dedupe per key; kegagalan refresh hanya di-log, data lama tetap disajikan).
6. **Keamanan cache**: hanya `GET`; **query string atau cookie → cache dilewati** (respons
   bergantung sesi/filter tidak pernah disajikan dari cache). Kunci = rute + params.
7. **Invalidasi dari action**: `PageActionContext.revalidate` (aditif) memanggil
   `cache.revalidate` + memicu `AppHooks.onInvalidate` (ADR-0065). API route memakai
   `cache.revalidate` langsung; `createCache({ onInvalidate })` tersedia untuk jalur itu.
8. **Store pluggable**: implementasi eksternal (Redis dll.) wajib lolos contract test yang sama
   (`tests/contracts/`).

## Bukti

- `packages/core/test/revalidate.test.ts`: path/tag invalidation + `onInvalidate` (reason default
  & kustom).
- `packages/ssr/test/revalidate.test.ts`: cache hit (loader sekali, `onLoaderEnd.cached`),
  SWR (stale disajikan + refresh belakang), bypass query/cookie, invalidasi dari action
  (menghapus entri + hook), tag kustom, dan perilaku lama saat cache tidak dipasang.
- Dogfood: playground beranda (`revalidate = 60`, penghitung loader terlihat di halaman) +
  template `create-app` (wiring `createCache()` + `revalidate` pada beranda); test playground &
  scaffold tetap hijau.
- `docs/caching.md` (semantik, keamanan, interaksi SSG/streaming/nonce, batasan).

## Alternatif yang ditolak

- **Cache HTML + Cache-Control otomatis**: konflik dengan nonce CSP (poin 1). Ditolak.
- **Cache dengan kunci termasuk query**: kunci tak terbatas + risiko kebocoran data antar query;
  bypass lebih jujur untuk v1.
- **Invalidasi berbasis waktu-saja (tanpa tag/path)**: tidak cukup untuk "ubah produk X, segarkan
  halaman produk X"; tag/path eksplisit dipilih.
- **Store global singleton di core**: menyulitkan test & multi-app per proses; DI eksplisit
  lewat `createCache()`/`createPageRoutes({ cache })` dipilih.

## Konsekuensi

- Konten semi-statis cepat tanpa rebuild; invalidasi eksplisit dari action (satu baris).
- In-memory per proses: multi-instance tidak berbagi cache — didokumentasikan; store eksternal
  dapat ditambah tanpa mengubah API.
- Sisa kandidat: cache per-query (opt-in), `revalidate` untuk API route (helper terpisah),
  purge CDN, cache komponen/segmen.
