---
adr: 0017
title: "Rate Limiting per Klien — Identitas dari Adapter + `trustProxy` Opt-in"
visibility: internal
---

# ADR-0017: Rate Limiting per Klien — Identitas dari Adapter + `trustProxy` Opt-in

- Status: Accepted (2026-10-18)
- Tanggal: 2026-10-18
- Sumber: BLUEPRINT §7 (resource limits), ADR-0012 (concurrency), ADR-0016

## Konteks

Concurrency limit (ADR-0012) membatasi total in-flight, bukan per klien. Rate limiting butuh
identitas klien — dan `x-forwarded-for` bisa dipalsukan bila tidak berada di belakang proxy
tepercaya, jadi identitas tidak boleh diasumsikan.

## Keputusan

- **Adapter Node menulis header internal `x-ramonyx-remote-address`** (`REMOTE_ADDRESS_HEADER` di
  core) dari socket — ditulis **setelah** salinan header klien sehingga tidak dapat dipalsukan
  (ada test eksplisit: klien mengirim header itu → ditimpa adapter).
- **`rateLimit(options)`** di `@ramonyx/security`: fixed-window in-memory per proses; melebihi limit
  → **429** + `Retry-After` + `x-ratelimit-limit`; `maxKeys` (default 10_000) membatasi memori
  dengan eviksi key tertua; `now()` injectable agar test deterministik.
- **Identitas**: default alamat dari adapter; `trustProxy: true` memakai hop pertama
  `x-forwarded-for` (hanya untuk deployment di belakang proxy yang menulisnya); `key(request)` untuk
  kustom (mis. per user).
- **Multi-instance**: limiter ini per proses; pembatasan terdistribusi adalah tanggung jawab edge
  (proxy/gateway) atau backend bersama — dicatat jujur, bukan diklaim.
- **CSRF verifikasi field form ditunda secara eksplisit** sampai ada API parsing body bersama
  (middleware tidak boleh membaca body diam-diam melewati batas 413). Jalur v0 tetap header
  `x-csrf-token`.

## Alternatif yang ditolak

- Mempercayai `x-forwarded-for` secara default — vektor spoofing identitas.
- Token-bucket/sliding-window sekarang — fixed-window cukup untuk v0; dapat di-upgrade tanpa
  mengubah API.
- Menyalakan rate limit global di playground — mematahkan benchmark/e2e; pemasangan adalah pilihan
  aplikasi (opt-in) sesuai profil trafiknya.

## Konsekuensi

- Memori limiter dibatasi `maxKeys`; eviksi membuat klien lama bisa "direset" — trade-off sadar
  untuk anti memory-DoS.
- Respons 429 hanya menyebut limit & `Retry-After` (tidak membocorkan sisa kuota).
- Phase 3 efektif selesai; sisa item (CSRF field form, IP-pinning SSRF) tercatat sebagai pekerjaan
  lanjutan, bukan blocker.
