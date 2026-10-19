---
adr: 0058
title: "Target Build Edge/Serverless + Pemisahan `guardedFetch`"
visibility: internal
---

# ADR-0058: Target Build Edge/Serverless + Pemisahan `guardedFetch`

- Status: Accepted (2026-10-18)
- Tanggal: 2026-10-18
- Sumber: TODO `p0-serverless-adapters` (analisis kesenjangan §3: "Adapter serverless/edge:
  belum — hanya Node standalone")

## Konteks

Platform edge/serverless adalah jalur deploy utama bagi banyak tim. Aplikasi Ramonyx memuat
manifest rute **saat runtime dari filesystem** (`createRouteManifest`/`loadPageRoutes` memakai
`node:fs`), sehingga tidak bisa langsung dibundel untuk edge. Selain itu `@ramonyx/security`
mengekspor `guardedFetch` (memakai `node:dns`/`node:net`) dari index-nya, sehingga bundel edge
yang mengimpor middleware keamanan ikut menarik API Node.

## Keputusan

1. **Codegen entry server/edge** (`generateServerEntry` di `@ramonyx/compiler`): impor **statis**
   semua halaman + route API + `middleware.ts`, lalu `export default { fetch }`. Manifest dibangun
   saat build — tanpa `node:fs` di runtime. `listApiRoutes` mengekspor daftar file+method (dipakai
   codegen; `createRouteManifest` memakai helper yang sama agar perilaku identik).
2. **`buildEdge`** (`@ramonyx/bundler`) + CLI **`ramonyx build --target edge`**:
   bundel SSR satu berkas (`ssr.noExternal`, `format: esm`, `codeSplitting: false`),
   `process.env.NODE_ENV` di-define `"production"`, dan **guard**: impor `node:*` yang lolos ke
   bundel = error build dengan pesan yang menyebut penyebab umum.
3. **React adapter memakai `react-dom/server.edge` untuk keduanya** (`renderToString` +
   `renderToReadableStream`) — satu build server yang berjalan di Node maupun edge; build Node
   (`react-dom/server`) tidak lagi diimpor (bundel edge bersih dari `node:stream`).
4. **`@ramonyx/security` dipecah**: index = middleware edge-safe (headers/CSP/CSRF/rate-limit,
   Web Crypto); `guardedFetch`/`SsrfError` pindah ke subpath **`@ramonyx/security/ssrf`**
   (Node-only). Perubahan API publik pra-1.0 (dicatat di CHANGELOG); tidak ada pemakai lain di
   repo.
5. **Konvensi middleware**: `src/routes/middleware.ts` harus edge-safe (tanpa `node:*`).
   Penyajian aset statis (`serveStatic`) adalah urusan host Node dan dipasang di `src/app.ts`
   (template diperbarui). Docs/playground (Node-only) tetap memakai `serveStatic` di middleware —
   `--target edge` pada app seperti itu akan gagal dengan pesan jelas (sesuai kontrak).
6. **Dokumentasi**: `docs/deploy-edge.md` (langkah build, contoh `wrangler.toml`, batasan jujur).

## Bukti

- `apps/create-app/test/create-app.test.ts`: `build --target edge` pada app hasil scaffold →
  artefak dijalankan sebagai fetch handler: SSR 200 + payload + script ber-hash, API JSON,
  action POST, 404 HTML.
- `buildEdge` guard `node:*` (build gagal bila ada) — teruji saat pengembangan (pesan menyebut
  `@ramonyx/security/ssrf`/middleware).
- `packages/security/test/ssrf.test.ts` (impor subpath) + seluruh suite tetap hijau.

## Alternatif yang ditolak

- **Runtime manifest dibaca saat request (pola Node)**: mustahil di edge (tanpa fs).
- **`import.meta.glob` (Vite) untuk manifest runtime**: mengikat ke Vite dan memindahkan logika
  manifest ke bundel; codegen eksplisit lebih deterministik dan dapat diperiksa.
- **Shim `node:*` untuk edge** (mis. polyfill `node:dns`): menyembunyikan batasan dan menambah
  bobot; gagal-cepat lebih jujur.
- **Adapter per-platform sekarang (wrangler/vercel preset)**: kontrak fetch handler + dokumentasi
  memberi nilai lebih dulu; preset menunggu uji platform nyata.

## Konsekuensi

- Satu perintah menghasilkan artefak edge; aplikasi yang mematuhi konvensi (middleware
  edge-safe) langsung siap.
- `guardedFetch` kini subpath — pemakai (bila ada di luar repo) menyesuaikan impor.
- Sisa kandidat (dicatat TODO): binding `env` platform ke handler, `waitUntil`/cache API,
  smoke test platform nyata (workerd/Cloudflare) di CI, preset Vercel/Deno Deploy.
