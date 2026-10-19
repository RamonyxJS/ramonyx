# ADR-0065: Kontrak Ekstensi Bersama — Config Pass-Through, `AppHooks`, `KeyValueStore`, Plugin

- Status: Accepted (2026-10-18)
- Tanggal: 2026-10-18
- Sumber: rencana komprehensif pasca-TODO (`/home/rdev/.opencode/plan/rencana-komprehensif.md`
  Fase 0) — prinsip anti-rewrite: kontrak dulu, implementasi menyusul, satu primitif untuk
  banyak fitur.

## Konteks

Item-item berikutnya (revalidate, plugin, asset pipeline, observability, devtools) semuanya
membutuhkan hal yang sama: **konfigurasi**, **instrumentasi**, **store**, dan **titik sambung
build**. Bila masing-masing item membuat mekanismenya sendiri, setiap fitur baru akan mengubah
`packages/core` → rewrite berulang. Verifikasi kode menemukan: `resolveConfig` **membuang** key
tak dikenal; tidak ada mekanisme hook; tidak ada abstraksi store; `buildClient`/`createDevServer`
tidak menerima plugin.

Semua fitur pasca-0.1.1 belum dirilis → **freeze window**: kontrak dirapikan sekarang (murah)
sebelum 0.2.0 (mahal setelah rilis).

## Keputusan

1. **Config pass-through** (`packages/core/src/config.ts`): `resolveConfig` mempertahankan key
   tak dikenal di root, `app`, dan `server`. Hanya `app.strictValidation`, `server.port`,
   `server.host` yang divalidasi core; fitur/plugin membaca & memvalidasi key-nya sendiri.
   `RamonyxConfig` diberi index signature. Skema `docs/machine/config.schema.json` tetap
   mendokumentasikan **permukaan tervalidasi** (lebih ketat dari runtime — disengaja).
2. **`AppHooks`** (`packages/core/src/hooks.ts`): `onRequestStart/End`, `onLoaderEnd`,
   `onRenderEnd`, `onInvalidate` + `mergeHooks()`. Diteruskan lewat `createHandler({ hooks })`
   dan `createPageRoutes({ hooks })` (aditif). **Zero-cost**: tanpa hook tidak ada pengukuran
   waktu/objek event. `onRenderEnd.streaming` menandai respons yang memakai jalur aliran
   (dilacak internal via `WeakSet`).
3. **`KeyValueStore`** (`packages/core/src/store.ts`): `get/set/delete/invalidateTags` +
   `increment` opsional; `createMemoryStore()` default (TTL, tag index, eviksi, sweeper
   `unref()`). **Contract test** di `tests/contracts/` — implementasi eksternal (Redis dll.)
   wajib lolos suite yang sama. Dipakai revalidate (F1); rate-limit terdistribusi menyusul.
4. **Kontrak plugin** — **deviasi dari rencana** (didokumentasikan): tipe `RamonyxPlugin`
   ditempatkan di **`@ramonyx/bundler`**, bukan core, karena field `vite` membutuhkan tipe
   `PluginOption` dari Vite; core tetap tanpa dependency. Isi kontrak: `vite` (passthrough),
   `middleware` (pre-routing), `hooks` (digabung `mergeHooks`); `definePlugin()` + `loadPlugins()`
   sudah tersedia. Status **experimental** sampai ≥2 plugin nyata.
5. **Kebijakan aditif** (dicatat di `rules.json`): payload hydration, manifest aset, opsi
   `createHandler`/`createPageRoutes`, dan `PageModule` hanya **bertambah field opsional**;
   perubahan nama/bentuk butuh ADR + jalur deprecasi setelah 0.2.0.

## Bukti

- `packages/core/test/config.test.ts`: pass-through root/app/server + validasi nilai dikenal
  tetap ketat.
- `packages/core/test/hooks.test.ts`: `mergeHooks` (urutan, hook absen dilewati).
- `packages/server/test/pipeline.test.ts`: `onRequestStart/End` terukur untuk 200 dan 404.
- `packages/ssr/test/pages.test.ts`: `onLoaderEnd` (cached=false) + `onRenderEnd` (sinkron
  `streaming: false`, jalur aliran `streaming: true`).
- `tests/contracts/store.test.ts` + `store.contract.ts`: TTL, timpa, tag invalidation, tag
  hantu, increment fixed-window.
- `tests/docs/config-schema.test.ts`: skema tetap ketat untuk permukaan tervalidasi; runtime
  pass-through diuji eksplisit.

## Alternatif yang ditolak

- **Hook per-fitur** (mis. `onRevalidate` di revalidate, `onRequest` di observability):
  duplikasi mekanisme + setiap fitur menyentuh core. Ditolak.
- **Store di paket terpisah**: primitif lintas-fitur; core adalah tempat tipe bersama (tanpa
  dependency) — implementasi eksternal tetap boleh di paket sendiri.
- **Tipe plugin di core**: memaksa core mengimpor tipe Vite (atau `unknown` yang tidak berguna
  untuk DX). Ditempatkan di bundler (dev/build tooling) — konsumen (devtools/app) sudah
  bergantung pada bundler.
- **Placeholder field config untuk fitur mendatang** (`plugins`, `assets`, `i18n`): melanggar
  "jangan tambah sebelum fitur nyata"; pass-through menyelesaikannya tanpa placeholder.

## Konsekuensi

- Fitur berikutnya (F1 revalidate, F2 plugin, F3 asset, observability, devtools) **mengonsumsi**
  primitif ini tanpa mengubah core lagi.
- `resolveConfig` kini mengembalikan key tambahan → pemakai yang membandingkan hasil config
  secara ketat harus menyesuaikan (tidak ada pemakai seperti itu di repo; dicatat di CHANGELOG).
- Sisa: `increment` pada store eksternal, hook `onInvalidate` dipakai penuh di F1, publikasi
  kontrak plugin setelah ≥2 plugin nyata.
