---
adr: 0018
title: "Keputusan Pemilik — Lisensi, Scope, Browser Matrix, Rekonsiliasi PRD"
visibility: internal
---

# ADR-0018: Keputusan Pemilik — Lisensi, Scope, Browser Matrix, Rekonsiliasi PRD

- Status: Accepted (keputusan pemilik, 2026-10-18)
- Tanggal: 2026-10-18
- Sumber: pertanyaan terbuka roadmap Phase 0 + PRD

## Keputusan

1. **Lisensi: MIT** — `LICENSE` di root; field `"license": "MIT"` di root dan seluruh paket
   workspace (paket tetap `private: true` sampai publikasi disiapkan).
2. **Scope npm: `@ramonyx/*`** untuk paket internal; paket meta tetap `ramonyx` (tanpa scope).
   Ketersediaan nama di registry diperiksa saat persiapan publikasi — belum diklaim sekarang.
3. **Browser matrix**: Chrome/Edge/Firefox/Safari **dua versi terakhir** (evergreen), JavaScript
   **ES2022**, tanpa polyfill otomatis. `buildClient` sudah menargetkan `es2022`; hydration
   membutuhkan ES modules + `crypto.getRandomValues`.
4. **Rekonsiliasi PRD** (`docs/PRD.md` §Rekonsiliasi): template "mobile" = di luar scope; metrik
   kepuasan dokumentasi 90% = target tanpa klaim sampai ada survei; forum komunitas ditunda
   (kanal awal GitHub); pertanyaan terbuka lain terjawab atau ditunda eksplisit.

## Alternatif yang ditolak

- Lisensi permisif dengan grant paten (Apache-2.0) — pemilik memilih kesederhanaan MIT.
- Polyfill otomatis/transpile ke ES5 — biaya bundle dan kompleksitas tanpa kebutuhan nyata.
- Menjanjikan forum/komunitas sejak awal — komitmen operasional tanpa basis pengguna.

## Konsekuensi

- Paket siap disiapkan untuk publikasi kapan pun (lisensi & scope jelas); **publikasi bukan
  keputusan hari ini**.
- Materi publik harus menyebut dukungan browser sesuai matrix (README).
- Tidak ada keputusan menggantung yang menghambat Phase 4 (runtime alpha).
