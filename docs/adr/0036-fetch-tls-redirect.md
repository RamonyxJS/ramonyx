# ADR-0036: `fetch` https (TLS Diverifikasi) + Redirect Otomatis

- Status: Accepted (2026-10-18)
- Tanggal: 2026-10-18
- Sumber: BLUEPRINT §9 (compatibility lanjutan), ADR-0030/0015

## Konteks

`fetch` runtime hanya mendukung `http://` dan tidak mengikuti redirect — banyak API nyata
memerlukan https dan perilaku redirect yang benar (termasuk aturan method/body dan header
sensitif). Ini juga titik keamanan: verifikasi TLS tidak boleh dimatikan demi kemudahan, dan
`guardedFetch` (SSRF) bergantung pada mode `redirect: "manual"` agar dapat memvalidasi tiap hop.

## Keputusan

### TLS (rustls + ring)

- Connector `hyper-rustls` dengan **verifikasi aktif**: root dari `webpki-roots` + opsional
  **CA tambahan** (file PEM) lewat `--tls-ca <path.pem>` / `EngineOptions.tls_ca_file`.
  Tidak ada opsi mematikan verifikasi — CA privat ditangani dengan menambah root, bukan
  melewati validasi.
- CA diwarisi worker dari induk (tidak dapat di-override per worker).
- Init gagal cepat dengan pesan jelas: file tidak ada / PEM tidak valid / tanpa sertifikat.
- Rantai `source()` error ditampilkan: `Display` hyper-util hanya "client error (Connect)"
  sedangkan penyebab sebenarnya (mis. `UnknownIssuer`) ada di source — tanpa ini kegagalan TLS
  tidak dapat didiagnosis dari pesan.

### Redirect (`redirect: "follow" | "manual" | "error"`)

- Default **follow**, maksimum **10 hop**; `manual` mengembalikan 3xx apa adanya (dipakai
  `guardedFetch`); `error` melempar.
- **Permission `--allow-net` diperiksa ulang untuk setiap hop** — redirect lintas host tidak
  boleh melewati permission.
- Aturan method/body (selaras undici): 303 → GET tanpa body; 301/302 dari POST → GET; 307/308
  mempertahankan method + body. Header body (`content-type`/`content-length`/`transfer-encoding`)
  dibuang saat berubah ke GET.
- **Header sensitif** (`authorization`, `cookie`, `proxy-authorization`) dibuang saat hop
  **lintas origin**; same-origin dipertahankan.
- `response.url` berisi URL final, `response.redirected` true bila ada redirect yang diikuti.

## Bukti

- `tests/fetch_tls.rs` (hermetik, tanpa jaringan luar — sertifikat self-signed `rcgen` +
  server `rustls` blocking):
  - tanpa CA kustom → verifikasi **gagal** (pesan memuat `UnknownIssuer`/certificate);
  - dengan CA kustom → https 200 "halo-tls";
  - CA tidak valid / path hilang → error init yang jelas;
  - rantai redirect tak berujung → error "melebihi batas ... redirect".
- Unit engine: follow (302 → 200, `redirected`, `url` final), `manual` (302 apa adanya),
  `error` (melempar); 307 lintas origin (method+body dipertahankan, `authorization` **dibuang**);
  303 → GET tanpa body; 307 same-origin (`authorization` dipertahankan).
- Smoke CLI: redirect 302 → `FINAL 200 true sampai-di-b`.
- 84 test Rust total; lint/typecheck/clippy/fmt bersih.

## Batasan yang dicatat jujur

- Hanya **HTTP/1.1** (tanpa ALPN h2), tanpa client certificate, tanpa proxy.
- Body request/response `fetch` masih dibuffer (response dibaca penuh; request dikirim
  sekaligus) — streaming arah klien belum.
- Batas redirect tetap 10 (bukan opsi per panggilan di v1).

## Alternatif yang ditolak

- **native-tls/OpenSSL**: menambah ketergantungan sistem; rustls murni-Rust + ring lebih
  portabel dan sudah sepakat dengan arah runtime.
- **Flag "insecure"/skip-verify**: ditolak — memperbesar permukaan salah pakai; kebutuhan
  CA privat diselesaikan dengan root tambahan.

## Konsekuensi

- `fetch` siap untuk API https nyata; `guardedFetch` tetap aman karena mode `manual` + validasi
  per hop + strip header lintas origin.
- Item "https/TLS + redirect" pada compatibility lanjutan selesai; sisa: suite lebih luas,
  kuota CPU/memori eksternal, isolasi proses, profiling (R4), rilis.
