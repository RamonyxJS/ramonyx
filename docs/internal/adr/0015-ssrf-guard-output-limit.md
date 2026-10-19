---
adr: 0015
title: "SSRF Guard (`guardedFetch`) + Output Limit Dokumen SSR"
visibility: internal
---

# ADR-0015: SSRF Guard (`guardedFetch`) + Output Limit Dokumen SSR

- Status: Accepted (2026-10-18)
- Tanggal: 2026-10-18
- Sumber: BLUEPRINT §7 (SSRF; DoS SSR — "output limits"), ADR-0011/0012/0013/0014

## Konteks

Dua baris threat model tersisa di area resource/egress: **SSRF** (app mem-fetch URL dari input
pengguna → layanan internal/metadata cloud) dan **output SSR tak terbatas** (satu halaman bisa
menghasilkan HTML raksasa).

## Keputusan

- **`guardedFetch(input, init, options)`** di `@ramonyx/security`:
  - hanya http/https (dapat dikonfigurasi), menolak `localhost`/`*.localhost`, alamat literal
    privat, dan hostname yang me-resolve ke alamat privat — IPv4: loopback/private/link-local/
    CGNAT/benchmark/multicast/reserved; IPv6: `::`/`::1`, `fc00::/7`, `fe80::/10`, `ff00::/8`,
    IPv4-mapped, `2001:db8::/32`;
  - **redirect divalidasi ulang per hop** (default `maxRedirects: 0` → 3xx dikembalikan apa adanya);
  - `allowHosts` sebagai bypass eksplisit untuk API internal tepercaya.
  - Modul ini memakai `node:dns`/`node:net` (server-side), sehingga allowlist `node:*` diperluas ke
    `packages/security` — ADR-0013 tetap berlaku untuk CSRF/headers/CSP yang web-only.
- **Output limit SSR**: `createPageRoutes({ maxDocumentBytes })` default **2 MiB**; dokumen di atas
  batas → **500** + log error `"Output halaman melebihi batas"` (tanpa memotong HTML).

## Alternatif yang ditolak

- IP-pinning via dispatcher undici sekarang — ditunda; v0 memvalidasi seluruh record hasil resolve.
- Truncation output streaming — menghasilkan HTML rusak; lebih baik gagal jujur (500).
- Tanpa `allowHosts` — aplikasi dengan API internal butuh jalur eksplisit yang tetap aman.

## Konsekuensi

- **Batasan jujur**: validasi DNS dan koneksi tetap dua langkah (window DNS-rebinding belum dipatok);
  pemanggil dengan kebutuhan jaminan kuat memakai `allowHosts` atau menunggu IP-pinning.
- Batas dokumen memakai panjang string (aproksimasi byte; HTML SSR mayoritas ASCII).
- `guardedFetch` bukan pengganti review; pakai untuk fetch ber-target tak tepercaya.
