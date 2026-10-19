# ADR-0067: Plugin Ecosystem — Passthrough Vite, Middleware, Hook

- Status: Accepted (2026-10-18)
- Tanggal: 2026-10-18
- Sumber: TODO `p2-plugin-ecosystem`; rencana komprehensif Fase 2 (memakai kontrak F0 —
  ADR-0065).

## Konteks

`buildClient`/`createDevServer`/`buildEdge` tidak menerima plugin; `ramonyx.config.ts` tidak
punya jalur untuk ekstensi. Ekosistem (Nuxt modules, Astro integrations) adalah moat framework
besar; tanpa kontrak, setiap kebutuhan dirakit sendiri dan tidak bisa dibagikan.

## Keputusan

1. **Kontrak** (dari F0, `@ramonyx/bundler`): `definePlugin({ name, vite?, middleware?, hooks? })`
   + `loadPlugins(plugins, PluginContext)`; status **experimental** sampai ≥2 plugin nyata.
2. **Pemuatan dari config**: `plugins` dibaca dari `ramonyx.config.ts` (pass-through ADR-0065);
   CLI `ramonyx dev|build|start` memuatnya, melaporkan nama (`✓ plugin: …`), dan meneruskan:
   - `vite` → opsi baru `plugins` di `buildClient`/`buildEdge`/`createDevServer` (aditif);
   - `middleware` → **`withMiddleware(handler, middleware, { env, logger })`** (helper baru di
     `@ramonyx/server`) — membungkus handler apa pun (pre-routing), sehingga plugin bekerja untuk
     aplikasi tanpa mengubah `createApp` aplikasi;
   - `hooks` → diteruskan lewat `createApp({ hooks })`: **konvensi aplikasi** (seperti
     `clientScript`); template/docs/playground meneruskan ke `createHandler`/`createPageRoutes`.
     Tanpa penerusan, hook plugin tidak aktif (middleware & Vite tetap jalan) — didokumentasikan.
3. **Aturan edge**: middleware plugin tunduk guard `node:*` (ADR-0058/0063); plugin Vite ikut
   bundel edge bila dipakai — pesan guard tetap menyebut modul.
4. **Contoh nyata (dogfood)**: `apps/playground/src/plugins/kunjungan.ts` (middleware penanda
   per-path + hook `onInvalidate`) dipakai di config playground; entry kustom playground memakai
   `loadPlugins` + `withMiddleware` (jalur yang sama dengan CLI). Test CLI di create-app menambah
   plugin dengan hook Vite `generateBundle` → banner di bundle klien (passthrough terverifikasi
   end-to-end).
5. **Publikasi**: konvensi nama `ramonyx-plugin-*` + panduan di `docs/plugins.md`.

## Bukti

- `packages/server/test/pipeline.test.ts`: `withMiddleware` (ganti request, short-circuit,
  identitas saat kosong).
- `apps/playground/test/app.test.ts`: plugin contoh — middleware menambah `x-kunjungan`
  (per-path), hook `onInvalidate` terbaca dari `loadPlugins`.
- `apps/create-app/test/create-app.test.ts`: plugin dari config dimuat CLI (nama dilaporkan) +
  banner Vite muncul di bundle klien hasil `ramonyx build`.
- `docs/plugins.md` (kontrak, aturan, publikasi, batasan).

## Alternatif yang ditolak

- **Plugin wajib mengubah `createApp` aplikasi** (menyuntik middleware/hook di dalam): memaksa
  setiap aplikasi menulis boilerplate; `withMiddleware` + konvensi `hooks` cukup tanpa itu.
- **Hook plugin lewat global registry**: menyulitkan test & multi-app; DI eksplisit dipilih.
- **Menunggu kontrak "sempurna" sebelum contoh**: justru menghambat umpan balik; experimental +
  contoh nyata dipilih (pelajaran yang sama dengan runtime Rust).
- **Preset per-platform (Vercel/Nuxt-style modules) sekarang**: butuh uji platform nyata; tetap
  kandidat (TODO `p2-edge-platform-smoke`).

## Konsekuensi

- Ekosistem bisa tumbuh tanpa mengubah core; `p2-asset-pipeline` akan menjadi plugin pertama
  "serius" (memakai jalur yang sama).
- Kontrak dapat bertambah (aditif) sampai stabil; `features.json` menandai `partial`.
- Sisa kandidat: registry/`ramonyx add`, hook per-route, prioritas plugin, plugin edge preset.
