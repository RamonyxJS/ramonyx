---
adr: 0079
title: "Pipeline Gambar M2 — Plugin `assets`, Varian Build-time, Koreksi Layout Aset"
visibility: internal
---

# ADR-0079: Pipeline Gambar M2 — Plugin `assets`, Varian Build-time, Koreksi Layout Aset

- Status: Accepted (2026-10-19)
- Tanggal: 2026-10-19
- Sumber: TODO `p2-asset-pipeline` (gate M2: "plugin + audit dependency + build-time"); rencana
  Fase 3 (M1 = manifest/resolver/`Image`, ADR-0069).

## Konteks

M1 (ADR-0069) memberi fondasi tanpa dependency: pindai `src/assets/**` → hash → manifest →
resolver → komponen `Image` (anti-CLS, lazy). Gate M2: resize/format modern **butuh dependency**
dan harus lewat plugin + audit. Selain itu, e2e baru (test varian gambar) **menemukan bug M1**:
berkas aset ditulis ke `dist/client/assets/**`, tetapi URL yang dihasilkan resolver
(`/assets/<path>`) dipetakan `serveStatic({ dir: dist/client, prefix: "/assets" })` ke
`dist/client/<path>` → **404 di produksi** (test M1 hanya memeriksa manifest/berkas, tidak pernah
fetch HTTP aset).

## Keputusan

1. **Hook `assets` pada kontrak plugin** (aditif, ADR-0065/0067): dipanggil per berkas
   `src/assets/**` saat build; mengembalikan `meta` (dimensi intrinsik) + `outputs` (berkas turunan
   dengan lebar/format). CLI meneruskan `loadPlugins(...).assets` → `buildClient({ assetProcessors })`
   → `collectAssets(..., { processors })`.
2. **Paket ke-16 `@ramonyx/plugin-image`**: `imageOptimizer(options)` — varian resize +
   WebP/AVIF saat build. **`sharp` = peer opsional** (tidak diinstal otomatis; pesan error
   memandu `pnpm add sharp`). Opsi: `widths` (default 320–1920 + lebar intrinsik), `formats`
   (default `["webp"]`; `avif` opt-in karena jauh lebih lambat), `quality` (78), `cache`
   (`.ramonyx/image-cache`, kunci = content-hash + opsi).
3. **Manifest diperluas (aditif)**: entri aset memuat `width`/`height` + `variants[]`
   (`file`, `bytes`, `width`, `height`, `format`).
4. **Resolver**: `AssetResolver.image(path)` → `ResolvedImage` (`src`, `width`, `height`,
   `srcSet`, `sources[{type, srcSet}]`) — `image` menjadi **wajib** di tipe (perubahan API pra-1.0;
   implementor kustom cukup mengembalikan `{ src }`). Helper edge-safe
   `createAssetResolverFromMap(map)` di `@ramonyx/core` dipakai resolver Node **dan** artefak edge
   (peta `AssetInfo` di-inline — ADR-0069) → satu logika.
5. **Komponen `Image`**: prop `sources` → `<picture><source type srcSet sizes/><img …/></picture>`;
   tanpa `sources` tetap `<img>` (backward compatible). Pakai:
   `<Image {...assets.image("img/hero.png")} alt="…" sizes="…" />`.
6. **Koreksi layout (bug M1)**: berkas aset ditulis di **root keluaran klien**
   (`dist/client/**`, sama seperti bundle Vite) dan `file` di manifest adalah path relatif root
   itu; URL = `<prefix>/<file>` (1:1). Regresi dijaga test HTTP nyata (create-app) + e2e
   (browser memuat varian).
7. **Dev tanpa varian** (jujur, didokumentasikan): dev menyajikan `src/assets/**` apa adanya;
   `assets.image()` mengembalikan `{ src }` (tanpa `srcSet`/dimensi). Build = sumber kebenaran.

## Bukti

- `packages/plugin-image/test/image.test.ts`: hook (dimensi + varian ter-resize diverifikasi
  `sharp.metadata()`), cache hit tidak menulis ulang (mtime), integrasi `buildClient` (manifest +
  berkas + resolver), bentuk plugin.
- `packages/bundler/test/assets.test.ts`: kontrak prosesor (meta + varian ber-hash + manifest +
  `assetInfoMap`), `collectAssets` deterministik.
- `packages/core/test/assets.test.ts`: `createAssetResolverFromMap` (srcSet terurut, sources
  avif→webp, varian format asli, path tak dikenal).
- `packages/react/test/image.test.ts`: `<picture>` + `<source>` + `sizes` diteruskan.
- `apps/create-app/test/create-app.test.ts`: **fetch HTTP aset** dari manifest (regresi M1) —
  200 + content-type.
- `apps/playground/e2e/image.spec.ts`: browser memuat varian WebP (`currentSrc` 200,
  `naturalWidth > 0`); playground memakai plugin dari `ramonyx.config.ts` (dogfood CLI).
- Audit dependency: `pnpm audit` + kebijakan ADR-0016 (`minimumReleaseAge`); sharp tanpa build
  script (prebuilt via optionalDependencies).

## Alternatif yang ditolak

- **`sharp` sebagai dependency wajib** dari core/plugin: menambah ±10 MB + binary native ke setiap
  instalasi; peer opsional = aplikasi memilih.
- **Encoder WASM (@jsquash) sekarang**: tanpa native, tetapi lebih lambat + menambah beberapa paket
  besar untuk diaudit; kandidat M2b bila ada kebutuhan lingkungan tanpa sharp.
- **`<img srcset>` dengan AVIF saja**: `srcset` tidak dapat menegosiasikan format — butuh
  `<picture>` (dipilih).
- **Varian on-the-fly di dev**: kompleks (cache per request, plugin di dev server) — ditunda;
  dev memakai berkas asli.
- **Mempertahankan layout M1** (`dist/client/assets/**`): URL tetap 404; diperbaiki.

## Konsekuensi

- Aplikasi bisa mendapat `srcset`/`<picture>` + dimensi otomatis dengan satu plugin + `sharp`.
- Build lebih lambat saat pertama (cache menolong); `avif` opt-in.
- Plugin ecosystem kini punya **2 plugin nyata** (kunjungan + image); kontrak tetap
  **experimental** — hook `assets` baru ditambahkan di ADR ini.
- Kandidat lanjutan: M2b WASM fallback, placeholder blur (LQIP), varian dev on-demand,
  `ramonyx add` (registry plugin).
