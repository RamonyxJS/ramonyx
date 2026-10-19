---
adr: 0024
title: "Runtime HTTP R2b — Cancellation Klien + Keep-Alive"
visibility: internal
---

# ADR-0024: Runtime HTTP R2b — Cancellation Klien + Keep-Alive

- Status: Accepted (2026-10-18)
- Tanggal: 2026-10-18
- Sumber: BLUEPRINT §3 (R2: cancellation, streaming), ADR-0022

## Konteks

R2a: body di-buffer, `Connection: close` per request, tanpa cancellation. Dua kebutuhan nyata:
(1) handler harus tahu bila klien **putus** saat masih berjalan, (2) keep-alive untuk performa.

## Keputusan

- **Keep-alive menyala**: header `connection: close` paksa dihapus; hyper HTTP/1.1 mengelola
  keep-alive (klien tetap bisa meminta close). Diuji: dua request pipelined pada satu koneksi.
- **Deteksi klien putus**: `ObservedIo` — wrapper `tokio::io::AsyncRead/AsyncWrite` di sekitar
  socket yang menandai **EOF** (`ReadBuf` kosong) lewat `AtomicBool` + `Notify`. Service future
  melakukan `select!` antara respons dan sinyal putus (pola daftar-`notified`-lalu-cek untuk
  menghindari race `notify_waiters`), lalu menggugurkan `respond_rx` bila klien pergi.
- **Sinkronisasi ke JS**: ops `op_http_watch(serverId, requestId)` (polling 25 ms) mengembalikan
  `true` saat sender respons tertutup; bootstrap memasang `request.signal` (`AbortController
  polyfill` minimal — deno_core tidak menyediakan DOM API) dan meng-`abort` handler yang masih
  berjalan. Handler dapat memakai `request.signal` untuk berhenti lebih awal.
- **Klien yang menutup terlalu cepat**: hyper membatalkan koneksi sebelum request sampai ke
  handler (tidak ada yang perlu dibatalkan) — perilaku diterima; `op_http_respond` pada klien yang
  sudah pergi menjadi **no-op** (bukan error, server tetap hidup).
- **Streaming body**: tetap **belum** (R2c) — dicatat eksplisit, tidak diklaim.

## Alternatif yang ditolak

- **`notify_one`/permit Notify** — pola `notify_waiters` + flag dengan urutan registrasi yang
  benar sudah cukup dan lebih sederhana dipahami.
- **Membaca socket duplikat (`try_clone`) untuk watch** — dua pembaca bersaing mengambil byte dari
  stream yang sama; merusak parsing hyper.
- **Timeout/polling dari JS murni** — tidak bisa melihat status koneksi; deteksi harus di IO layer.

## Konsekuensi

- Handler panjang kini dapat dibatalkan (hemat CPU) dan server tidak mati karena klien pergi.
- `AbortController`/`AbortSignal` adalah **polyfill minimal** kita (bukan spesifikasi lengkap);
  perluasan (reason sebagai Error, throwIfAborted) menyusul bila dibutuhkan.
- Streaming respons/permintaan tetap terbuka; throughput masih satu respons penuh per request.
