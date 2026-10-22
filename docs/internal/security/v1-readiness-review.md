# Framework 1.0 Readiness — Security & Soak Review

Tanggal: 2026-10-22 · Lingkup: baseline Node + auth/session/CSRF + abuse/soak.
Status: **belum lulus penuh** — ada satu temuan stabilitas yang harus diselesaikan sebelum 1.0.

## Kontrol yang ditinjau

- PBKDF2-HMAC-SHA256 password hashing (salt acak, 210.000 iterasi) + verifikasi constant-time.
- Session store server-side: expiry, rotasi ID saat login, revocation saat logout; cookie
  bertanda tangan dan opsi aman default.
- CSRF double-submit: header untuk JS dan field `_csrf` untuk form tanpa JS; token aktif
  diteruskan ke loader setelah action.
- Error login generik, rate limit per proses, cookie `HttpOnly`/`Secure`/`SameSite`.
- Cookie stateless tidak dienkripsi; store bawaan in-memory dan rate limit per proses dicatat
  sebagai batasan deployment, bukan temuan kerentanan.

## Perintah & hasil

```bash
SOAK_SECONDS=300 pnpm bench:security
pnpm audit --audit-level high
pnpm test
```

- `pnpm audit --audit-level high`: **tidak ada kerentanan yang diketahui**.
- 6/6 abuse-case sesuai ekspektasi: oversized body, JSON malformed, schema invalid, path
  traversal aset, query besar, echo valid.
- Soak 300 dtk, 50 koneksi, ±525 req/dtk: **0 error, 0 timeout, 0 respons 5xx**.
- Headroom limit tetap berjalan (body/timeout/concurrency).

## Temuan F-1 — pertumbuhan RSS soak

RSS proses server naik dari **231 MB → 637 MB** (puncak 678 MB, delta 406 MB) selama 300 detik;
`heapUsed` akhir ±422 MB, `heapTotal` ±517 MB. Tidak ada error atau 5xx. Ini bisa berupa
pertumbuhan heap V8 normal di bawah beban tanpa GC, tetapi belum dibuktikan plateau setelah
snapshot/forced-GC. **Tidak boleh diklaim "memory stabil" sebelum ada bukti tambahan.**

Tindakan yang diperlukan:

1. Heapshot/forced-GC pada akhir soak untuk membedakan retensi objek vs kapasitas heap.
2. Uji soak lebih panjang / bertahap dan tetapkan batas pertumbuhan yang dapat diterima.
3. Jika ada retensi, perbaiki dan ulangi abuse+soak sebelum 1.0.

## Gate lain yang belum selesai

- Benchmark regression masih report-only; baseline runner konsisten/self-hosted belum tersedia
  (ADR-0045/0074).
- Rilis 1.0.0 dan upgrade guide belum diterbitkan; API stability policy sudah ditambahkan di
  `docs/public/api/versioning.md` dan contract test diperluas untuk auth/security.
- Runtime Rust tetap jalur eksperimental terpisah; keputusan produksi ada di item TODO P3.
