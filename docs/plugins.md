# Plugin

Plugin memperluas aplikasi pada tiga titik: **build** (plugin Vite), **request** (middleware
global), dan **runtime** (hook aplikasi). Keputusan desain: ADR-0067; kontrak dasar: ADR-0065.

> Status: **experimental** — stabil untuk dipakai, tetapi kontrak masih dapat bertambah (aditif).
> **Dua plugin nyata sudah ada** (`kunjungan` di playground + `@ramonyx/image`), dan hook `assets`
> baru ditambahkan (ADR-0079); kontrak dibekukan setelah satu siklus rilis tanpa perubahan.
> Laporkan kebutuhan kontrak lewat issue.

## Menulis plugin

```ts
// src/plugins/kunjungan.ts
import { type RamonyxPlugin, definePlugin } from "@ramonyx/bundler";
import type { AppHooks, Middleware } from "ramonyx";

export function kunjungan(): RamonyxPlugin {
  return definePlugin({
    name: "kunjungan",
    // Plugin Vite (build klien, dev server, edge) — diteruskan apa adanya.
    vite: () => ({ name: "kunjungan-vite" /* ... */ }),
    // Middleware global pre-routing (berjalan sebelum routing, bisa short-circuit).
    middleware: () =>
      [
        async (context, next) => {
          const response = await next();
          const headers = new Headers(response.headers);
          headers.set("x-kunjungan", "1");
          return new Response(response.body, { status: response.status, headers });
        },
      ] satisfies Middleware[],
    // Hook aplikasi (timing/invalidasi) — digabung dengan hook lain (ADR-0065).
    hooks: () => ({ onInvalidate: (event) => console.log("invalidasi", event) }) satisfies AppHooks,
  });
}
```

## Memakai plugin

```ts
// ramonyx.config.ts
import { defineConfig } from "ramonyx";
import { kunjungan } from "./src/plugins/kunjungan.ts";

export default defineConfig({
  plugins: [kunjungan()],
});
```

`ramonyx dev|build|start` memuat plugin dari config (key `plugins` — pass-through ADR-0065) dan
melaporkan namanya (`✓ plugin: kunjungan`).

**Entry kustom** (`src/server.ts`, ADR-0076): bila aplikasi butuh logger/cache/instrumentasi
sendiri, buat `src/server.ts` yang mengekspor `createHandler(options)` — CLI tetap menjalankan
(port/host dari config) dan **plugin tetap dimuat & dibungkus CLI**:

```ts
// src/server.ts
import type { AppHooks, FetchHandler } from "ramonyx";
import { createApp } from "./app.ts";

export interface ServerEntryOptions {
  readonly clientScript?: string;
  readonly hooks?: AppHooks;
  readonly streaming?: boolean;
}

export async function createHandler(options: ServerEntryOptions = {}): Promise<FetchHandler> {
  return createApp({
    clientScript: options.clientScript,
    hooks: options.hooks,          // hook plugin dari CLI
    streaming: options.streaming,  // dari config app.streaming
  });
}
```

`ramonyx dev|start` otomatis memakai `src/server.ts` bila ada (jika tidak: `src/app.ts`).
Helper `loadPlugins` + `withMiddleware` tetap tersedia untuk skenario programatik lain.

### Hook `assets` (build-time — ADR-0079)

Plugin dapat memproses `src/assets/**` saat `ramonyx build` (mis. varian gambar):

```ts
import { definePlugin } from "@ramonyx/bundler";

export const contoh = definePlugin({
  name: "contoh-aset",
  async assets(context, asset) {
    if (!asset.path.endsWith(".png")) return undefined;
    return {
      meta: { width: 800, height: 600 },                       // dimensi intrinsik → manifest
      outputs: [{ path: "img/varian-400.webp", data: bytes, width: 400, format: "webp" }],
    };
  },
});
```

Berkas turunan diberi hash konten otomatis dan dicatat di `ramonyx.assets.json` (`variants`),
sehingga `assets.image(...)` + komponen `Image` merender `srcset`/`<picture>`. Contoh nyata:
`@ramonyx/plugin-image` (sharp peer opsional).

## Aturan

- **`middleware` harus edge-safe** (tanpa `node:*`) bila artefak `--target edge` dipakai —
  guard build menolaknya dengan pesan jelas.
- **`hooks` diteruskan lewat `createApp(options)`** oleh CLI: aplikasi disarankan menerima opsi
  `hooks` dan meneruskannya ke `createHandler`/`createPageRoutes` (template & aplikasi repo sudah;
  tanpa penerusan, hook plugin tidak aktif — middleware & Vite tetap jalan).
- Middleware plugin berjalan **sebelum** middleware aplikasi (pre-routing) — cocok untuk logging,
  penanda, atau pemblokiran awal.

## Publikasi

1. Nama paket: `ramonyx-plugin-<nama>` (konvensi; tidak dipaksakan mesin).
2. Struktur minimal: `package.json` (exports ESM, `peerDependencies: ramonyx`, `@ramonyx/bundler`
   untuk tipe) + satu file yang mengekspor fungsi pabrik plugin.
3. Versi mengikuti semver; tandai dukungan versi Ramonyx di README (`ramonyx >=0.2`).
4. Kontrak masih experimental: tambahan kontrak diumumkan di CHANGELOG + ADR.

## Contoh di repo

- `apps/playground/src/plugins/kunjungan.ts` — middleware penanda + hook invalidasi; diuji di
  `apps/playground/test/app.test.ts` dan test CLI `apps/create-app/test/create-app.test.ts`
  (plugin Vite passthrough).

## Batasan (jujur)

- Tanpa registry/otomatisasi instalasi (belum ada `ramonyx add`).
- Tanpa hook untuk loader/route individual (hanya pre-routing + hook aplikasi).
- Urutan antar-plugin mengikuti urutan di config (tidak ada prioritas eksplisit).
