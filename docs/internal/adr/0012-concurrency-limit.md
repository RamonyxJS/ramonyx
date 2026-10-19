---
adr: 0012
title: "Concurrency Limit (Load Shedding) — Default 100, Balas 503 + `Retry-After`"
visibility: internal
---

# ADR-0012: Concurrency Limit (Load Shedding) — Default 100, Balas 503 + `Retry-After`

- Status: Accepted (2026-10-18)
- Tanggal: 2026-10-18
- Sumber: BLUEPRINT §7 (DoS SSR — "concurrency dan output limits"), ADR-0011

## Konteks

ADR-0011 membatasi ukuran body dan durasi per request, tetapi jumlah request **bersamaan** belum
dibatasi: banyak koneksi lambat dapat menghabiskan event loop/resource walau tiap request punya
timeout.

## Keputusan

- `createHandler` menerima `maxConcurrent` (default **100**). Di atas batas → **503** +
  header `Retry-After: 1` + log `warn` "Load shedding", **tanpa antrean** (fail fast).
- Slot dihitung per `createHandler` (per proses) dan dirilis di `finally`, sehingga slot pulih
  walau handler error/timeout.
- Rate limiting per klien **tidak** diputuskan di sini — butuh cerita identitas klien
  (trusted proxy / `x-forwarded-for`); dicatat sebagai keputusan terpisah.

## Alternatif yang ditolak

- Antrean dengan backlog — memindahkan masalah, bukan menyelesaikannya.
- Rate limit per-IP sekarang — butuh identitas klien yang belum ada (proxy tepercaya).
- Tanpa default (opt-in) — melanggar prinsip secure-by-default.

## Konsekuensi

- Beban sah di atas 100 request bersamaan per proses akan menerima 503; aplikasi menaikkan lewat
  opsi `maxConcurrent`.
- Load shedding teramati di log (`path`, `maxConcurrent`, `inFlight`); metrik terstruktur menyusul.
- Item Phase 3 "output limits" (batas ukuran output/SSR) masih terbuka.
