---
adr: 0062
title: "Primitif Sesi & Cookie (Tanda Tangan HMAC)"
visibility: internal
---

# ADR-0062: Primitif Sesi & Cookie (Tanda Tangan HMAC)

- Status: Accepted (2026-10-18)
- Tanggal: 2026-10-18
- Sumber: TODO `p1-auth-session` (analisis kesenjangan §3: "Auth: belum — aplikasi memutuskan
  sendiri; tanpa helper session")

## Konteks

Hampir semua aplikasi nyata butuh sesi; tanpa primitif, setiap aplikasi merakit cookie sendiri
(mudah salah: tanpa tanda tangan, atribut cookie lemah, perbandingan tidak aman). Framework
pesaing menyediakan helper sesi (Remix cookie sessions, SvelteKit cookies + Lucia, Nuxt
nuxt-auth-utils) atau mengandalkan ekosistem (Auth.js).

## Keputusan

1. **`@ramonyx/security` (edge-safe, Web Crypto) menyediakan**:
   - `parseCookies`/`serializeCookie`/`expireCookie` — dengan **default aman**
     (HttpOnly, Secure, SameSite=Lax, Path=/);
   - `signValue`/`verifyValue` — HMAC-SHA256 (`<nilai>.<base64url>`), verifikasi via
     `crypto.subtle.verify` (perbandingan konstan-waktu di WebCrypto);
   - `createSession({ secret, cookieName?, maxAgeSeconds?, cookie? })` →
     `read(request)` / `commit(data)` / `clear()`; payload JSON ditandatangani
     (bukan dienkripsi — didokumentasikan).
2. **Action dapat menyetel cookie**: `PageActionResult.headers` (mis. `set-cookie`) menyebar ke
   respons render ulang **dan** dipakai saat render ulang — cookie baru/penghapusan diterapkan ke
   header `Cookie` request render (per nama: ganti atau hapus; `Max-Age=0` = hapus), sehingga
   loader melihat sesi terbaru dalam satu request.
3. **Dogfood**: playground `/sesi` — form masuk/keluar memakai action + session; e2e menguji
   jalur JS (tanpa reload) dan **tanpa JavaScript**, termasuk cookie bertahan antar navigasi.
4. **Bukan** penyediaan auth lengkap: tidak ada UI login, store pengguna, atau rotasi secret
   otomatis (didokumentasikan sebagai batasan).

## Bukti

- `packages/security/test/cookies.test.ts`: parse/serialize (default aman), tanda tangan
  roundtrip/tamper/secret salah/format rusak.
- `packages/security/test/session.test.ts`: commit→read roundtrip, tamper → null, secret berbeda
  tidak saling percaya, `clear()` Max-Age=0, maxAge kustom.
- E2E `apps/playground/e2e/session.spec.ts`: masuk → pesan + "masuk sebagai …" pada render ulang;
  keluar → sesi hilang; tanpa JS → cookie bertahan antar navigasi penuh.
- Regresi yang tertangkap & diperbaiki: (a) `new Request(request)` pada request terpakai
  (body dikonsumsi) → 500; (b) cookie `Max-Age=0` ikut digabung sehingga logout tidak terlihat
  pada render ulang.

## Alternatif yang ditolak

- **Cookie terenkripsi (AES-GCM)**: menambah kompleksitas kunci/rotasi; untuk data sensitif,
  store eksternal + id lebih tepat. Ditandatangani + didokumentasikan lebih jujur.
- **Session store bawaan (in-memory/Redis)**: keputusan infrastruktur milik aplikasi; primitif
  tanda tangan cukup untuk sesi ringan dan tetap edge-safe.
- **JWT**: menambah verifikasi klaim/expiry/audience yang tidak diperlukan untuk cookie sesi
  server-rendered.

## Konsekuensi

- Alur login/logout dasar menjadi ~20 baris dengan atribut aman; edge-compatible (Web Crypto).
- `PageActionResult.headers` juga berguna untuk header lain (mis. `cache-control` per hasil action).
- Sisa kandidat: rotasi secret (dua kunci), `session.destroy` berbasis store, integrasi CSRF
  otomatis untuk action ber-sesi.
