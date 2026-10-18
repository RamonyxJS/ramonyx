# ADR-0030: `fetch` Client + `ReadableStream` + Body Streaming (Runtime)

- Status: Accepted (2026-10-18)
- Tanggal: 2026-10-18
- Sumber: ADR-0022/0024/0027/0029, BLUEPRINT §9 (R2 sisa: streaming; compatibility lanjutan)

## Konteks

Setelah interop CJS (ADR-0029), tiga kebutuhan tersisa di jalur "framework demo di runtime":

1. **POST body**: pipeline `@ramonyx/server` membaca body lewat `request.body.getReader()`, dan
   `ReadableStream` belum ada → body request selalu `null`.
2. **SSR streaming**: `renderToReadableStream` (react-dom) membuat **byte stream pull-based**
   (`new ReadableStream({ type: "bytes", pull }, { highWaterMark: 0 })`) — butuh ReadableStream
   sungguhan dengan controller.
3. **`fetch`**: dipakai `@ramonyx/security` (`guardedFetch`), test security, dan aplikasi.

## Keputusan

### `ReadableStream` minimal (web_shim)

- Konstruktor `new ReadableStream(source, strategy)` dengan `start`/`pull`/`cancel`;
  controller `enqueue`/`close`/`error`/`desiredSize`/`byobRequest = null`.
- `type: "bytes"` diperlakukan sebagai antrean chunk (tanpa BYOB) — cukup untuk React.
- Reader: `read()`/`cancel()`/`releaseLock()`; `for await` lewat `Symbol.asyncIterator`;
  `pull` dipanggil ulang tiap antrean kosong dan ada pembaca (semantik `highWaterMark: 0`).
- Backpressure tidak ditegakkan (antrean tumbuh) — dicatat sebagai batasan.

### `Request`/`Response` dengan body streaming

- Body disimpan sebagai byte + stream; `text()`/`json()` membaca stream (di-cache) sehingga
  `new Response(response.body, ...)` (pola middleware) dan `request.body.getReader()`
  (pipeline server) berfungsi.
- `clone()` untuk body yang belum dibuffer (murni stream) melempar error jelas — bukan diam-diam salah.

### `fetch` (JS) + `op_fetch` (Rust, hyper client)

- Cakupan v1: **`http://` saja** (TLS/`https://` ditolak dengan pesan jelas), **tanpa redirect
  otomatis** (3xx dikembalikan apa adanya), timeout 30 detik, body respons dibuffer dengan batas
  **10 MiB**, body dikembalikan sebagai teks UTF-8 (biner lossy — dicatat).
- Permission `--allow-net[=host,...]` ditegakkan **per host** sebelum koneksi.
- Kegagalan transport → `TypeError("fetch failed: ...")`; status 4xx/5xx **tidak** melempar.

### `TextDecoder` mode stream

- `decode(bytes, { stream: true })` menyimpan sisa urutan multibyte antar-chunk — tanpa ini body
  request ber-chunk (dan HTML streaming React) bisa rusak di karakter non-ASCII.

### Perbaikan graceful shutdown (temuan)

- `server.close()` kini **membangunkan `op_http_accept` yang sedang menunggu** (flag + `Notify`).
  Sebelumnya, koneksi keep-alive menahan sender channel sehingga penutupan channel saja tidak
  cukup → event loop tidak pernah drain → proses menggantung. Ini bagian dari "graceful shutdown
  terkoordinasi" (sisa R2).

## Bukti

- Unit engine: ReadableStream (start/pull/`type: "bytes"`/`for await`), TextDecoder split
  multibyte, `Request.body` → `readBodyText`, `Response` dari stream; **fetch roundtrip** ke
  `ramonyx.serve` lokal (GET JSON, body stream, 404) dan **penolakan tanpa `--allow-net`**.
- Compatibility: fixture `route-pipeline.mjs` **POST body** (validasi 200/400 via stream);
  fixture `react-stream-ssr.mjs` — `renderToReadableStream` → `<!DOCTYPE html>…` lengkap
  dibaca `for await` (integrasi `compat_stream_ssr.rs`).
- Smoke CLI: server + 3 fetch + `close()` → exit 0 bersih.

## Batasan yang dicatat jujur (belum didukung)

- **HTTPS/TLS** (butuh rustls/ring — ditunda), redirect otomatis, body biner (`fetch` teks),
  `Response.body` streaming dari jaringan (transport dibuffer), streaming **request** bertahap,
  BYOB reader, `tee()`, backpressure/`TransformStream`, `fetch` dengan `AbortSignal` (signal tetap
  diterima di API `Request` tetapi belum membatalkan koneksi).

## Alternatif yang ditolak

- **Reqwest** untuk fetch: menarik TLS + banyak dependency; hyper client sudah ada untuk server.
- **Menunggu streaming transport penuh**: menghambat POST body, SSR streaming, dan suite security
  — padahal API-level streaming (yang dipakai framework) bisa dipenuhi lebih dulu.

## Konsekuensi

- `@ramonyx/security` (guardedFetch/SSRF) kini bisa diuji di runtime; POST body tuntas di pipeline.
- Transport buffered tetap menjadi sisa R2; angka batas (10 MiB/30 s) adalah keputusan v1 dan
  dapat dikonfigurasi pada iterasi berikutnya.
