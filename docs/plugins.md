# Plugin

Plugin memperluas aplikasi pada tiga titik: **build** (plugin Vite), **request** (middleware
global), dan **runtime** (hook aplikasi). Keputusan desain: ADR-0067; kontrak dasar: ADR-0065.

> Status: **experimental** — stabil untuk dipakai, tetapi kontrak masih dapat bertambah (aditif).
> **Dua plugin nyata sudah ada** (`kunjungan` di playground + `@ramonyx/image`), dan hook `assets`
> baru ditambahkan (ADR-0079); **kriteria stabilisasi + panduan publikasi: ADR-0080**
> (stabil setelah satu siklus rilis tanpa perubahan aditif). Laporkan kebutuhan kontrak lewat issue.

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

## Mempublikasikan plugin

Referensi nyata: **`@ramonyx/plugin-image`** (paket ke-16, ADR-0079) — struktur, staging rilis, dan
test-nya bisa dijadikan contoh.

1. **Nama & bentuk**: konvensi komunitas `ramonyx-plugin-<nama>` (atau `@scope/ramonyx-plugin-*`);
   plugin resmi memakai `@ramonyx/plugin-<nama>`. ESM-only, `engines.node >= 24`.
2. **Kirim JS terkompilasi, bukan `.ts`**: plugin pihak ketiga hidup di `node_modules` — Node
   **tidak** type-strip berkas di sana (paket repo ini source-first hanya karena dijalankan dari
   workspace). Build dengan `tsc`/esbuild ke `dist/`:

   ```json
   {
     "name": "ramonyx-plugin-contoh",
     "type": "module",
     "exports": { ".": { "types": "./dist/index.d.ts", "default": "./dist/index.js" } },
     "peerDependencies": { "@ramonyx/bundler": "^0.3.0", "ramonyx": "^0.3.0" },
     "engines": { "node": ">=24" }
   }
   ```

   Pakai **`peerDependencies`** (bukan `dependencies`) agar tipe/kontrak mengikuti versi aplikasi.
   Dependency berat (mis. encoder gambar) ditandai **peer opsional** (`peerDependenciesMeta`) dan
   dimuat dinamis dengan pesan error yang memandu — pola `sharp` di `@ramonyx/plugin-image`.
3. **Kontrak yang dipakai**: `definePlugin({ name, vite?, middleware?, hooks?, assets? })` dari
   `@ramonyx/bundler`; tipe `RamonyxPlugin`/`PluginContext` mengikuti versi peer.
4. **Uji sebelum publikasi**: pasang di aplikasi uji (atau playground repo) dan jalankan
   `ramonyx build` (hook `assets`), `ramonyx dev`/`start` (middleware/hooks); sertakan test minimal
   yang memanggil hook langsung (contoh: `packages/plugin-image/test/image.test.ts`).
5. **Versi & kompatibilitas**: semver; sebutkan rentang Ramonyx yang didukung di README plugin.
   Perubahan kontrak (aditif) diumumkan lewat CHANGELOG + ADR repo.
6. **Stabilisasi kontrak** (ADR-0080): kontrak dideklarasikan **stabil** setelah **satu siklus
   rilis tanpa perubahan aditif** (rilis berikutnya, bila tidak ada perubahan). Setelah stabil,
   perubahan breaking mengikuti semver + catatan migrasi.

## Contoh di repo

- `apps/playground/src/plugins/kunjungan.ts` — middleware penanda + hook invalidasi; diuji di
  `apps/playground/test/app.test.ts` dan test CLI `apps/create-app/test/create-app.test.ts`
  (plugin Vite passthrough).

## Batasan (jujur)

- Tanpa registry/otomatisasi instalasi (belum ada `ramonyx add`) — instalasi manual lewat
  package manager.
- Plugin pihak ketiga harus mengirim JS terkompilasi (bukan `.ts`) — lihat panduan publikasi.
- Tanpa hook untuk loader/route individual (hanya pre-routing + hook aplikasi).
- Urutan antar-plugin mengikuti urutan di config (tidak ada prioritas eksplisit).
