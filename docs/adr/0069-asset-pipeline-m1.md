# ADR-0069: Pipeline Aset M1 — Manifest + Resolver (Tanpa Dependency, Tanpa Loader Kustom)

- Status: Accepted (2026-10-18)
- Tanggal: 2026-10-18
- Sumber: TODO `p2-asset-pipeline`; rencana komprehensif Fase 3 (catatan desain: Node SSR tidak
  bisa `import foto.png`).

## Konteks

Vite menyelesaikan `import foto from "./foto.png"` di klien, tetapi **Node SSR tidak** — jalur
"import aset" tidak paritas SSR ↔ klien tanpa loader kustom (hook Node + Vite). Pilihan:
(a) manifest + helper, atau (b) loader ganda. (b) menyentuh `@ramonyx/compiler` register hooks
dan perilaku dev/produksi — lebih besar dan lebih berisiko.

## Keputusan

**M1 memakai (a) manifest + resolver** — tanpa dependency, tanpa loader kustom:

1. **Pemindaian otomatis**: `buildClient` memindai `src/assets/**` (opsi `assetsDir`, `false`
   mematikan), menyalin tiap berkas ke `dist/client/assets/**` dengan **hash konten** (sha256,
   10 hex; struktur subfolder dipertahankan) — memakai jaminan cache immutable ADR-0055.
2. **Manifest diperluas (aditif)**: `ramonyx.assets.json` mendapat `assets: Record<path, {file,
   bytes}>`; `readAssetManifest` meneruskan field baru; `writeAssetManifest` dipisah ke
   `manifest.ts` (menghindari circular import).
3. **Resolver** (bundler): `assetUrl(manifest, path, { urlPrefix? })` (murni) +
   `createAssetResolver(clientDir, { urlPrefix?, fallbackToPath? })`; diteruskan ke loader lewat
   `createPageRoutes({ assets })` → `PageLoaderContext.assets` (core, aditif).
4. **Dev parity**: `createAssetResolver(..., { fallbackToPath: true })` menghasilkan URL tanpa
   hash; plugin dev Vite (`ramonyx-assets-dev`) menyajikan `src/assets/**` di `/assets/*`.
5. **Komponen `Image`** (`@ramonyx/react/assets`, tanpa JSX — ADR-0006): default aman
   (`width`/`height` eksplisit anti-CLS, `loading="lazy"`, `decoding="async"`), `srcSet`/`sizes`
   passthrough; `src` kosong → `null` (aset belum dibangun tidak merusak halaman).
6. **Font**: ikut mekanisme aset; `fontPreloadTag()` (bundler) + `PageMetadata.head` (raw HTML,
   aditif) untuk `<link rel="preload">` — dokumen default sudah merender `head`.
7. **Edge**: peta aset **di-inline** ke artefak saat build (`generateServerEntry({ assets })`) —
   artefak tanpa fs tidak bisa membaca manifest saat runtime. Bug ini ditemukan oleh test edge
   (HTML tanpa logo) dan diperbaiki di sesi yang sama.
8. **M2 (resize/format) tetap gate**: hanya jika (a) diimplementasikan sebagai plugin (dependency
   opsional), (b) audit supply chain lolos (ADR-0016), (c) build-time saja — belum dikerjakan.

## Bukti

- `packages/bundler/test/assets.test.ts`: collectAssets (hash deterministik, struktur, bytes),
  `assetUrl`/`createAssetResolver` (manifest, fallback dev, manifest kosong), `fontPreloadTag`,
  integrasi `buildClient` (scan otomatis → manifest + berkas tersalin).
- `packages/ssr/test/pages.test.ts`: resolver diteruskan ke konteks loader.
- `packages/react/test/image.test.ts`: elemen `img` + default aman + `null` saat tanpa src.
- `apps/create-app/test/create-app.test.ts`: template (logo.svg) — smoke fallback dev, manifest
  + berkas ber-hash setelah build, URL ber-hash di HTML **prerender statis** dan **artefak edge**
  (peta inline), semuanya lewat CLI.
- `docs/assets.md` (pemakaian, manifest, font, batasan).

## Alternatif yang ditolak

- **Loader ganda (Vite + hook Node) untuk `import .png`**: DX lebih mulus tetapi menyentuh
  register hooks compiler + dua jalur resolusi (dev/produksi/edge) yang harus diuji silang —
  ditunda sebagai kandidat M2+ (bukan ditolak permanen).
- **URL tanpa hash + query `?v=<hash>`**: tidak memberi `immutable` (banyak cache mengabaikan
  query) — konsisten dengan penolakan di ADR-0055.
- **Resize on-demand di server**: tidak edge-compatible + dependency berat.

## Konsekuensi

- Aset produksi immutable + anti-CLS dengan nol dependency; dev tetap sederhana (tanpa hash).
- `Image` adalah sugar, bukan optimizer — didokumentasikan jujur di `docs/assets.md`.
- Sisa: M2 resize/format (gate), loader ganda (kandidat), `srcset` otomatis dari varian
  terkonvensi, kompresi font.
