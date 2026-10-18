# ADR-0047: SSR Streaming di Runtime Node (`renderToReadableStream`)

- Status: Accepted (2026-10-18)
- Tanggal: 2026-10-18
- Sumber: audit implementasi (`docs/IMPLEMENTATION_STATUS.md` §4 item 3 / P2-6), ADR-0003/0007/0030

## Konteks

`@ramonyx/ssr` merender halaman secara sinkron (`renderToString`) lalu mengirim satu dokumen
utuh dalam sekali jalan. Jalur streaming hanya ada di runtime Rust (ADR-0030). Akibatnya TTFB
halaman besar di Node menunggu seluruh render selesai, dan kontrak `Renderer` tidak punya jalur
streaming untuk adapter UI.

## Keputusan

- **Kontrak**: `Renderer.renderStream?(element): Promise<ReadableStream<Uint8Array>>` — opsional.
  Renderer tanpa jalur streaming tetap valid; `createPageRoutes({ streaming: true })` otomatis
  memakai jalur sinkron bila renderer tidak mendukung.
- **Adapter React**: `renderToReadableStream` dari **`react-dom/server.edge`** (Web Streams).
  Jalur yang sama dengan runtime (ADR-0030), tanpa impor `node:*` (lint + portabilitas runtime).
  Build **`server.browser` ditolak**: modul itu membuat `MessageChannel` level-modul yang
  menahan event loop Node — proses test/CLI tidak pernah keluar (diverifikasi lewat
  `process._getActiveHandles()`: `MessagePort`; build edge bersih, keluaran identik).
- **Pemisahan dokumen**: dokumen dirender dengan penanda body `<!--__RAMONYX_BODY__-->`, lalu
  dipecah menjadi prefix (head + pembuka) + aliran body + suffix (script hydration). Kontrak
  `DocumentRenderer` tidak berubah; dokumen kustom yang mengabaikan body → fallback sinkron.
- **Batas output**: `maxDocumentBytes` dihitung sepanjang aliran; bila terlampaui aliran
  **diputus** + log — bukan 500, karena status sudah terkirim. Jalur sinkron tetap 500.
- **Adapter Node**: body `Response` di-pipe via `Readable.fromWeb` + `pipeline`
  (backpressure + pembatalan klien); bila error setelah header terkirim, koneksi diputus
  alih-alih menulis 500 palsu.
- **Opt-in**: `streaming: true` di `createPageRoutes` / `createApp` (playground dev+produksi).
  Halaman error selalu dirender sinkron — status harus benar sebelum byte pertama.

## Bukti

- `packages/ssr/test/pages.test.ts` (+6): paritas byte-per-byte streaming vs sinkron (termasuk
  payload hydration); aliran sungguhan (prefix + body pertama terkirim sebelum gate lanjut
  dibuka, script hydration di akhir); fallback (tanpa `renderStream`; dokumen tanpa penanda);
  batas output → aliran diputus + log; `renderStream` menolak → halaman error sinkron + log.
- `packages/react/test/renderer.test.tsx` (+1): paritas byte-per-byte `renderStream` vs `render`
  (React nyata, `server.edge` di Node).
- `packages/adapter-runtime/test/node.test.ts` (+1): chunk pertama tiba sebelum aliran selesai —
  regresi "respons dibuffer penuh" tertangkap timeout.
- e2e playground (5/5) berjalan di atas SSR streaming produksi; smoke: `Transfer-Encoding:
  chunked`, payload hydration utuh, `/api/hello` tetap JSON. Compat suite runtime Rust tetap
  lulus (renderer yang sama di runtime).

## Batasan yang dicatat jujur

- Error **setelah** byte pertama terkirim memutus koneksi — tidak bisa lagi menjadi halaman
  error (batasan HTTP/streaming, bukan bug). Error sebelum byte pertama → halaman error sinkron.
- Belum ada pengukuran TTFB streaming di protokol §8 (SSR belum masuk matriks terukur) —
  tidak ada klaim performa; kandidat pengukuran lanjutan.
- `renderStream` memakai Web Streams; build edge tidak menyediakan `renderToString` — jalur
  sinkron tetap dari `react-dom/server`.
- Dokumen kustom harus menempatkan body apa adanya; dokumen yang mengubah/mengabaikan body
  otomatis memakai jalur sinkron.
- Playground/dev memakai streaming; `apps/docs` sengaja tetap sinkron (kedua jalur tetap teruji).

## Alternatif yang ditolak

- **`renderToPipeableStream` (build Node)**: butuh `node:stream` di `packages/react` — dilarang
  lint dan memutus portabilitas runtime (paket framework harus berjalan di runtime Rust).
- **`react-dom/server.browser`**: `MessageChannel` level-modul menahan proses Node (test/CLI
  menggantung) — dicoba, lalu diganti `server.edge` setelah diverifikasi.
- **Patch global `MessageChannel`** (unref hanya selama impor React): efek samping global lebih
  besar dari manfaat; build edge menyelesaikan akar masalah tanpa patch.
- **Mengubah `DocumentRenderer` menjadi (prefix, suffix)**: breaking untuk dokumen kustom;
  penanda body menjaga kompatibilitas.

## Konsekuensi

- Halaman SSR Node dikirim bertahap (chunked); TTFB tidak lagi menunggu seluruh render.
- `renderStream` menjadi bagian kedua kontrak `Renderer` yang harus dijaga parity-nya oleh
  adapter (diuji byte-per-byte).
- Perilaku batas output berbeda antar jalur (putus koneksi vs 500) — didokumentasikan.
