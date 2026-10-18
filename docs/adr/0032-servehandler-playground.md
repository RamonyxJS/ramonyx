# ADR-0032: Jembatan `serveHandler` + Playground Subset Berjalan di Runtime

- Status: Accepted (2026-10-18)
- Tanggal: 2026-10-18
- Sumber: BLUEPRINT §9 (exit criteria Phase 4: "framework demo berjalan di runtime alpha dan
  lulus subset compatibility tests"), ADR-0022/0028/0031

## Konteks

Kontrak framework adalah `FetchHandler = (request: Request) => Promise<Response>`. Di runtime,
`ramonyx.serve` menerima payload Rust low-level (`path/method/headers/body/signal`) — aplikasi
nyata (`createHandler`) membutuhkan `Request` standar. Tanpa jembatan ini, "framework demo
berjalan di runtime" tidak dapat dibuktikan end-to-end lewat HTTP.

## Keputusan

- **`ramonyx.serveHandler(port, handler)`**: jembatan standar di atas `serve`:
  - payload → `Request` (`method`, `headers`, `body` string, `signal` — cancellation klien ikut
    sampai ke pipeline `request.signal`);
  - `Response` → loop serve: header via `entries()`, body `ReadableStream`/teks; error handler
    tetap ditangkap loop → 500.
- **Perbaikan byte-stream di loop `serve`** (temuan fixture): chunk non-string dulu dipaksa
  `String(chunk)` → `Uint8Array` menjadi `"104,97,..."` (body rusak). Kini byte di-decode UTF-8
  mode stream + flush sisa byte sebelum stream ditutup. Decoder dibuat **lazy** karena web shim
  dimuat setelah bootstrap.
- **Fixture "playground subset"** — komposisi seperti `apps/playground` (tanpa bagian Node-only
  `@ramonyx/compiler` yang memindai berkas): halaman SSR React (layout berantai, loader, rute
  dinamis `[nama]`, `HttpError` + halaman error), API JSON + POST body tervalidasi, middleware
  `securityHeaders` + `cspNonce`; disajikan `serveHandler` dan diuji **end-to-end lewat `fetch`**
  (termasuk payload hydration + atribut nonce pada script).

## Bukti

- Unit `serve_handler_bridge_request_dan_response`: GET teks, POST body + JSON, respons streaming,
  `request.signal` tersedia; semua lewat server + fetch sungguhan (allow_all).
- Compatibility `playground_subset_berjalan_di_runtime` (fixture `playground-subset.mjs`):
  `<title>Beranda</title>`, layout `class="layout"`, komponen `dari loader`, container
  `#ramonyx-root`, script payload + `/assets/client.js`, **nonce CSP konsisten** antara header dan
  atribut script, `x-content-type-options: nosniff`; `/halo/budi` → 200; `/gagal` → **418** dengan
  halaman error kustom; `/api/echo` POST → 200 / 400; path tak dikenal → 404.
- Smoke CLI: fixture playground `run --allow-net` → exit 0.

## Exit criteria Phase 4 (BLUEPRINT §9)

> "framework demo berjalan di runtime alpha dan lulus subset compatibility tests"

**Tercapai** dengan lingkup yang dicatat jujur: aplikasi berbentuk playground (halaman + API +
security) berjalan di runtime, dan subset compatibility (core/router/schema/server/security/ssr/
react/React SSR sync+streaming/CJS/fetch) lulus di CI. Yang **bukan** bagian klaim: `@ramonyx/compiler`
(pemindai berkas Node-only), https/TLS, streaming request bertahap, worker/kuota — pekerjaan Phase 5.

## Batasan yang dicatat jujur

- Jembatan v1: body request dibuffer menjadi string (biner lossy); respons selalu melalui jalur
  stream chunked (kecuali body non-stream).
- Payload `serve` low-level tetap ada (dipakai test dan API mentah); `serveHandler` adalah jalur
  yang direkomendasikan untuk aplikasi.

## Alternatif yang ditolak

- **Mengubah kontrak `serve`** menjadi Request penuh: memecah test/API low-level yang ada dan
  menghilangkan jalur minimal tanpa shim; jembatan terpisah lebih jelas.
- **Menjalankan `apps/playground` apa adanya**: terhalang `node:url`/compiler (build-time Node) —
  itu memang pembagian tugas; fixture subset menguji komposisi yang sama tanpa bagian Node.

## Konsekuensi

- Aplikasi framework dapat dijalankan di runtime dengan satu baris: `ramonyx.serveHandler(0, app)`.
- Fokus berikutnya bergeser ke Phase 5: isolasi worker + kuota, streaming request, https/TLS,
  dan release pipeline (blueprint §9).
