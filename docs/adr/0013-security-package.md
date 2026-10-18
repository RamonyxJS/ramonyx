# ADR-0013: Paket Security — Security Headers + CSRF Double-Submit (Web Crypto)

- Status: Accepted (2026-10-18)
- Tanggal: 2026-10-18
- Sumber: BLUEPRINT §7 (XSS/CSRF), §9 Phase 3, ASVS (V3/V6/V14)

## Konteks

Threat model mencantumkan XSS/CSP dan CSRF, tetapi framework belum punya primitifnya. Dibutuhkan
header keamanan dasar yang aman-by-default dan proteksi CSRF yang tidak memaksa satu model auth.

## Keputusan

Paket baru `@ramonyx/security` (dependencies: `@ramonyx/core` saja):

- `securityHeaders(options)`: default `X-Content-Type-Options: nosniff`,
  `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY`;
  CSP/Permissions-Policy **opt-in**. CSP **default nonaktif** karena hydration menempelkan script
  inline — perlu nonce/hash dulu. HSTS sengaja tidak diatur (butuh HTTPS = deployment).
- `csrfProtection(options)`: pola **double-submit cookie** — token 32 byte dari
  `crypto.getRandomValues` (Web Crypto; tanpa `node:*` → runtime-agnostic), cookie `ramonyx-csrf`
  (SameSite=Lax, opsi `Secure`, sengaja **bukan** HttpOnly), verifikasi header `x-csrf-token`
  dengan perbandingan waktu-konstan; method aman menerbitkan token, method tidak aman tanpa
  token/mismatch → 403.
- Verifikasi field formulir (body) dan CSP nonce **ditunda** (butuh koordinasi body/nonce).

## Alternatif yang ditolak

- Token tersinkronisasi di server (session store) — menambah state; double-submit cukup untuk v0.
- CSP default menyala dengan `'unsafe-inline'` — rasa aman palsu; lebih baik nonaktif dan jujur.
- `node:crypto` — mengunci ke Node; Web Crypto tersedia di Node dan calon runtime sendiri.

## Konsekuensi

- Aplikasi mengaktifkan lewat middleware (`securityHeaders()`, `csrfProtection()`); playground
  sudah memakai `securityHeaders()`.
- CSRF saat ini header-only (belum untuk form HTML biasa) sampai verifikasi field menyusul.
- Pemetaan ASVS awal: `docs/security/asvs-mapping.md` — bukan klaim kepatuhan.
