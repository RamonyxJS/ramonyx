---
adr: 0014
title: "CSP Nonce + Request Replacement di Middleware"
visibility: internal
---

# ADR-0014: CSP Nonce + Request Replacement di Middleware

- Status: Accepted (2026-10-18)
- Tanggal: 2026-10-18
- Sumber: ADR-0013 (CSP default nonaktif karena payload inline), BLUEPRINT §7 (XSS/CSP)

## Konteks

ADR-0013 menonaktifkan CSP secara default karena payload hydration adalah script **inline**.
Untuk menyalakan CSP dengan aman dibutuhkan **nonce per request** yang dipakai bersama oleh
middleware (yang menulis header CSP) dan `@ramonyx/ssr` (yang menempelkan atribut `nonce` pada
`<script id="ramonyx-payload">`). Middleware juga belum punya cara menyampaikan data per-request
ke lapisan berikutnya.

## Keputusan

- **Kontrak middleware diperluas**: `next(request?)` boleh menerima request pengganti; lapisan
  berikutnya (dan handler) menerima request tersebut. Implementasi menjaga `signal` tetap
  terhubung (timeout/abort dari ADR-0011 tetap berlaku).
- **`NONCE_HEADER` (`x-ramonyx-nonce`)** didefinisikan di `@ramonyx/core` sebagai kontrak antar
  paket (security → ssr).
- **`cspNonce()`** di `@ramonyx/security`: nonce 16 byte via Web Crypto per request, menitipkan
  lewat header + mengganti request (salinan ber-header, signal diteruskan), lalu menulis
  `Content-Security-Policy` pada respons.
- **Kebijakan default** (`defaultContentSecurityPolicy`): `default-src 'self'`; `script-src 'self'
  'nonce-…'`; `style-src 'self' 'unsafe-inline'` (React memakai atribut `style`);
  `img-src 'self' data:`; `object-src 'none'`; `base-uri 'self'`; `frame-ancestors 'none'`.
  Template bisa diganti via opsi.
- **`@ramonyx/ssr`** membaca `NONCE_HEADER` dari request dan menempelkan `nonce="…"` pada payload
  script bila ada.
- Playground mengaktifkan `cspNonce()`; `securityHeaders()` tetap menangani header lain.

## Alternatif yang ditolak

- SSR membuat nonce sendiri + menulis CSP sendiri — memisahkan kebijakan CSP dari paket security
  dan menggandakan sumber kebenaran.
- Menyimpan nonce di context middleware yang bisa di-mutasi — kontrak context jadi stateful;
  header request lebih eksplisit dan tetap kompatibel dengan `Request` standar.
- CSP `'unsafe-inline'` — memberi rasa aman palsu (ditolak juga di ADR-0013).

## Konsekuensi

- CSP kini **aman dinyalakan** dan dipakai playground; diverifikasi end-to-end (e2e produksi +
  browser dev: hydration jalan, HMR `[vite] connected`, nol error konsol).
- Middleware lain dapat memakai pola request-replacement (mis. auth ke depan) tanpa mengubah API.
- Kebijakan CSP adalah template fungsi; aplikasi dapat memperketat/melonggarkan secara eksplisit.
