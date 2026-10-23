---
adr: 0083
title: "Dev Server Single-Port — Vite Middleware + HMR + SSR dalam Satu HTTP Server"
visibility: internal
---

# ADR-0083: Dev Server Single-Port — Vite Middleware + HMR + SSR dalam Satu HTTP Server

- Status: Accepted (2026-10-23)
- Tanggal: 2026-10-23
- Menggantikan: ADR-0009
- Sumber: DX review output `ramonyx dev` vs Next.js; laporan 404 `client-entry.ts` saat membuka port SSR.

## Konteks

ADR-0009 memakai dua listener: Vite di 5173 dan SSR di 3000, lalu proxy manual. Model ini bekerja
tetapi:

1. Menampilkan dua URL dan membuat port SSR tampak publik.
2. Membuka port SSR menghasilkan 404 untuk `/.ramonyx/client-entry.ts` dan `/@vite/client`.
3. Tidak sesuai model dev satu-port yang dipakai framework modern (Next.js/Turbopack).
4. Menambah bridge proxy Node → fetch terpisah yang harus dirawat.

## Keputusan

1. Vite berjalan dengan `server.middlewareMode: { server }` dan `server.ws: { server }` pada satu
   `node:http` server milik Ramonyx.
2. `vite.middlewares` dipasang sebagai request listener; SSR handler (melalui
   `createNodeRequestListener` dari adapter-runtime) menjadi middleware terakhir.
3. HMR WebSocket menempel ke HTTP server yang sama; tidak ada port 5173.
4. Port publik dev = `server.port` (default 3000); `--port` mengatur dev/start.
5. Hapus mode proxy `createDevServer({ target })`, `proxyToSsr`, `--dev-port`, dan redirect SSR → Vite.
6. `createDevServer` mewajibkan `handler({ importer, devtools })`; ini breaking change → 2.0.0.
7. `createNodeRequestListener` diekspor dari `@ramonyx/adapter-runtime` agar host Node dan dev server
   memakai bridge request/response yang sama.

## Alternatif yang ditolak

- **Mempertahankan dua port tetapi menyembunyikan output**: tidak menyelesaikan 404 dan tidak
  menyatukan bundler/HMR.
- **Vite `server.proxy`**: tidak dapat menjadi middleware SSR terakhir dan tetap dua listener.
- **Menjalankan SSR di dalam Vite `ssrLoadModule` saja**: tidak memberi satu HTTP server untuk HMR,
  API, dan SSR.
- **Mempertahankan proxy mode untuk kompatibilitas**: meninggalkan jalur yang tidak diuji dan
  bertentangan dengan target DX; mayor 2.0.0 adalah kesempatan yang tepat untuk menghapusnya.

## Konsekuensi

- Satu URL dev; `client-entry.ts`, `@vite/client`, aset, SSR, dan API berbagi origin/port.
- HMR tetap aktif dan sudah diuji via WebSocket (`vite-hmr`) di create-app e2e.
- `@ramonyx/bundler` sekarang bergantung pada `@ramonyx/adapter-runtime` untuk bridge.
- Library consumer `createDevServer` harus menyediakan `handler`; tidak ada lagi `target`.
- Streaming, kompresi, abort klien, dan error 500 memakai jalur Node host yang sama.
- Production `ramonyx start` tidak berubah.

## Bukti

- `packages/bundler/src/dev.ts` — middleware mode + SSR fallback.
- `packages/adapter-runtime/src/node.ts` — `createNodeRequestListener`.
- `packages/devtools/src/commands.ts` — satu port, tanpa `--dev-port`.
- `apps/create-app/test/create-app.test.ts` — client entry, Vite client, API, WebSocket HMR.
- Smoke manual: HMR update dan SSR di port 3000.
