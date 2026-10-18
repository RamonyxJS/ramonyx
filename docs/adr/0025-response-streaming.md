# ADR-0025: Runtime HTTP R2c — Streaming Respons (Chunked)

- Status: Accepted (2026-10-18)
- Tanggal: 2026-10-18
- Sumber: BLUEPRINT §3 (R2: streaming), ADR-0022/0024

## Konteks

R2a/R2b: respons selalu di-buffer penuh; handler tidak bisa mengalirkan data bertahap (SSR
streaming, log tail, unduhan besar). R2c menambahkan streaming **respons**.

## Keputusan

- **Protokol handler**: `body` boleh berupa **AsyncIterable** (async generator) — selain string
  seperti sebelumnya. Deteksi di bootstrap: `typeof body[Symbol.asyncIterator] === "function"`.
- **Ops baru** (pull/push hybrid, masih Rust-tidak-memanggil-V8):
  - `op_http_stream_start` — kirim status+header; membuat channel chunk (kapasitas 8);
    entry pending berubah dari `Buffered` ke `Streaming`;
  - `op_http_stream_chunk` (async) — kirim satu chunk dengan **backpressure** (`await send`);
  - `op_http_stream_end` — akhiri stream (idempoten).
- **Body hyper**: `BoxBody` menyatukan `Full` (buffered) dan `StreamBody` (streaming);
  HTTP/1.1 chunked (`Transfer-Encoding: chunked`) dikelola hyper.
- **Cancellation tetap berlaku**: watch memeriksa `is_closed()` untuk kedua varian entry; chunk
  ke klien yang sudah pergi mengembalikan error → loop streaming berhenti dengan log.
- **Batasan dicatat jujur**: **streaming request belum** (body request masih di-buffer);
  graceful shutdown terkoordinasi belum.

## Alternatif yang ditolak

- **ReadableStream WHATWG** sebagai `body` — perlu implementasi Web Streams penuh; AsyncIterable
  sudah idiomatis di JS modern dan cukup untuk semua use case saat ini.
- **Kirim semua chunk via satu array** — itu bukan streaming; menunda manfaat memori/latensi.
- **Channel tak terbatas** — menghilangkan backpressure; kapasitas 8 memberi tekanan balik nyata.

## Konsekuensi

- Utang teknis kecil: dua representasi body di service (match enum) — dipertahankan eksplisit.
- Handler yang stream harus menutup stream (atau error) agar request selesai; `stream_end` tetap
  dipanggil oleh bootstrap pada error.
- Diverifikasi test hermetik: 3 chunk berurutan + `Transfer-Encoding: chunked` + urutan terjaga +
  proses selesai bersih (39 test Rust total).
