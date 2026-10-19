# Devtools (panel dev)

Panel dev-only untuk melihat **rute, timing request/loader/render, status hydration, dan ukuran
bundel/aset** saat `ramonyx dev` berjalan (ADR-0077). Tidak ada di produksi: kolektornya hanya
dibuat oleh dev server (`createDevServer`), bukan oleh `ramonyx start`.

## Pemakaian

```bash
ramonyx dev
# dev: http://localhost:5173 (Vite + HMR) → SSR http://127.0.0.1:3000
# devtools: http://localhost:5173/__ramonyx/devtools (panel dev-only — rute, timing, hydration)
```

Buka URL panel di browser. Panel mem-polling `GET /__ramonyx/data` tiap 2 detik.

## Data yang ditampilkan

| Bagian | Sumber | Catatan |
| --- | --- | --- |
| **Rute** | `loadPageRoutes` dev server | Diperbarui saat file rute berubah (watcher yang sama dengan regenerasi entry client) |
| **Bundel & aset** | `dist/client/ramonyx.assets.json` + ukuran berkas | Kosong bila belum pernah `ramonyx build` — panel tidak membangun sendiri |
| **Request terakhir** | Middleware kolektor + hook `AppHooks` | 50 request terbaru; method, path, status, total, loader, render, cache, hydration |

**Hydration** dideteksi dari HTML respons: `payload` bila ada `<script id="ramonyx-payload">`,
`none` bila halaman HTML tanpa payload (mis. halaman error — ADR-0007).

## Cara kerja

- Dev server membuat `DevtoolsCollector` (`packages/bundler/src/devtools.ts`):
  - **middleware** (paling luar di rantai) mencatat setiap request + status + durasi, dan untuk
    respons HTML memeriksa payload hydration (via `response.clone()`, dev-only);
  - **hooks** `onLoaderEnd`/`onRenderEnd` menempelkan timing loader/render ke request.
- CLI `ramonyx dev` menggabungkan hook plugin + hook devtools (`mergeHooks`) dan menaruh
  middleware devtools sebelum middleware plugin.
- Endpoint `/__ramonyx/*` dilayani **dev server** (tidak diproksikan ke SSR, tidak pernah ada di
  produksi).

## Batasan (jujur)

- Korelasi loader/render → request memakai "request terbuka terakhir dengan path sama" — event
  hook tidak membawa identitas request; cukup untuk dev berkonkurensi rendah.
- Daftar **rute halaman** saja (rute API tidak discan terpisah).
- Panel menampilkan **request yang melewati SSR**; permintaan yang di-short-circuit middleware
  plugin tetap tercatat (devtools middleware paling luar), tetapi request ke `/__ramonyx/*` dan
  aset Vite tidak melewati kolektor.
- Bukan pengganti observability produksi — untuk itu pakai `docs/observability.md`.

## Programatik

```ts
import { createDevServer } from "@ramonyx/bundler";

const dev = await createDevServer({ appDir, target: "http://127.0.0.1:3000" });
// dev.devtools.hooks + dev.devtools.middleware → pasang ke handler aplikasi
// dev.devtools.snapshot() → { routes, assets, requests }
```
