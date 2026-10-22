# Framework 1.0 Readiness — Security & Soak Review

Tanggal: 2026-10-22 · Lingkup: baseline Node + auth/session/CSRF + abuse/soak.
Status: **F-1 terdiagnosis** (allocator/retensi RSS, bukan kebocoran heap JS); gate 1.0 masih
terbuka untuk benchmark blocking dan rilis 1.0.

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

## Temuan F-1 — pertumbuhan RSS soak (diselidiki)

RSS proses server naik dari **231 MB → 637 MB** (puncak 678 MB, delta 406 MB) selama 300 detik;
`heapUsed` akhir ±422 MB, `heapTotal` ±517 MB. Tidak ada error atau 5xx.

**Diagnosis lanjutan (60 detik, server `--expose-gc` + probe `/__gc`):**

- Full playground: RSS 130 → 436 MB; setelah `global.gc()` **heapUsed 422 → 21 MB**,
  `heapTotal` 25 MB, RSS tetap 432 MB.
- Minimal API: RSS 118 → 383 MB; setelah GC **heapUsed 16 MB**, RSS 380 MB.

**Kesimpulan:** tidak ada retensi objek JavaScript yang terlihat; angka `heapUsed` turun drastis
setelah GC. Pertumbuhan RSS adalah **kapasitas/allocator V8 yang tidak dikembalikan ke OS**, bukan
bukti kebocoran heap framework. Benchmark soak yang hanya memakai RSS memang menyesatkan; angka
RSS tetap dicatat sebagai caveat, bukan klaim stabilitas memori absolut.

**Tindakan lanjutan untuk 1.0:** jika ingin klaim RSS stabil, tambahkan probe post-GC ke harness
formal dan uji plateau lebih panjang; jangan memakai delta RSS mentah sebagai satu-satunya gate.

## Gate lain yang belum selesai

- Benchmark regression masih report-only; baseline runner konsisten/self-hosted belum tersedia
  (ADR-0045/0074).
- Rilis 1.0.0 dan upgrade guide belum diterbitkan; API stability policy sudah ditambahkan di
  `docs/public/api/versioning.md` dan contract test diperluas untuk auth/security.
- Runtime Rust tetap jalur eksperimental terpisah; keputusan produksi ada di item TODO P3.
