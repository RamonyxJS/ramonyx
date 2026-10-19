---
adr: 0035
title: "Streaming Request + Batas Body Server"
visibility: internal
---

# ADR-0035: Streaming Request + Batas Body Server

- Status: Accepted (2026-10-18)
- Tanggal: 2026-10-18
- Sumber: BLUEPRINT §9 (Phase 5: HTTP/streaming), ADR-0022/0024/0030

## Konteks

Sejak R2a, **seluruh body request di-buffer penuh di Rust** (`Incoming::collect()`) **tanpa
batas** sebelum payload dikirim ke JS. Dua masalah: (1) gap DoS — klien dapat memaksa runtime
mengalokasikan memori sebesar apa pun; (2) "streaming request" (R2 sisa) belum ada — handler
tidak dapat mulai bekerja sebelum body selesai tiba.

## Keputusan

### Body sebagai ReadableStream pull-model

- Connection task tidak lagi mengumpulkan body. Ia menjalankan **forwarder** yang membaca frame
  `Incoming` bertahap dan mengisi channel kecil (kapasitas 8 chunk ≈ backpressure TCP).
- Payload `op_http_accept` mendapat `bodies[(server_id, request_id)] = Receiver<Result<Bytes, String>>`;
  JS menarik chunk lewat `op_http_body_read` (async, `{ chunk: Option<Vec<u8>> }`, `null` = EOF)
  dan membatalkan lewat `op_http_body_drop`.
- Bootstrap menyusun `payload.body` sebagai `ReadableStream` (pull → `op_http_body_read`), sehingga
  `serveHandler` meneruskan **stream yang sama** ke `Request` — pipeline framework
  (`readBodyText` → `getReader()`) bekerja tanpa perubahan.
- `RequestPayload.body: String` **dihapus** (perubahan kontrak `serve` low-level; dicatat).
- Salinan `Request` (mis. middleware `cspNonce` yang mengganti header) meneruskan stream yang
  sama ke hilir — tanpa ini body hilang pada request POST (ditemukan lewat fixture playground).

### Batas body server (413 dini + saat baca)

- `serve(port, handler, { maxBodyBytes })` / `serveHandler(..., { maxBodyBytes })`, **default
  1 MiB** (selaras ADR-0011).
- **Dini**: `content-length` > batas → 413 dari Rust **tanpa memanggil handler** dan tanpa
  membaca body (respons memuat `connection: close`).
- **Chunked**: forwarder berhenti saat total melebihi batas dan mengirim error ke pembaca →
  handler menerima error saat membaca (dapat merespons 413 sendiri). Memori Rust tetap terbatas
  oleh batas + kapasitas channel.

## Bukti

- `body_limit_413_dini_tanpa_handler`: POST 4 KiB dengan batas 1 KiB → **413** dan handler
  **tidak dipanggil**; POST kecil tetap 200.
- `streaming_request_bertahap_ke_handler`: klien chunked mengirim chunk pertama lalu menunggu —
  handler menulis marker **setelah chunk pertama diterima** (Rust test menunggu marker sebelum
  mengirim sisa body) → terbukti pembacaan bertahap end-to-end; total byte benar (9).
- `streaming_request_melebihi_batas_saat_dibaca`: chunked 4 KiB dengan batas 1 KiB → handler
  menerima error "melebihi batas" dan merespons **413**.
- Fixture playground (POST tervalidasi lewat `serveHandler`) tetap lulus; smoke CLI exit 0.
- 78 test Rust total; lint/typecheck/clippy/fmt bersih.

## Batasan yang dicatat jujur

- Chunk antar-ops dikodekan sebagai array angka (serde) — bukan zero-copy; cukup untuk v1,
  kandidat optimasi (buffer op2) berikutnya.
- Batas berlaku **per request**; jumlah koneksi/permintaan bersamaan belum dibatasi di runtime
  (framework `createHandler` punya `maxConcurrent`, ADR-0012).
- Tekanan backpressure bergantung pada konsumen JS yang membaca stream; handler yang mengabaikan
  body membuat forwarder menunggu (channel penuh) sampai request ditutup.

## Alternatif yang ditolak

- **Tetap buffering + batas** (streaming hanya secara API): tidak menutup kebutuhan "body masuk
  bertahap" dan tetap menahan memori penuh per request.
- **Buffer op2 (`&mut [u8]` lintas await)**: belum stabil untuk kebutuhan ini; array angka
  sederhana dan benar lebih dulu.

## Konsekuensi

- R2 sisa "streaming request" selesai; jalur DoS memori body tertutup (batas + backpressure).
- Handler dapat memproses unggahan besar bertahap (mis. validasi per chunk) tanpa menunggu
  seluruh body.
