# Aset (Gambar, Font, dll.)

Ramonyx memindai `src/assets/**` saat build: setiap berkas disalin ke `dist/client/assets/**`
dengan **hash konten** (immutable cache — ADR-0055) dan dicatat di manifest
`ramonyx.assets.json`. Server menyelesaikan URL lewat **resolver** — karena Node tidak dapat
`import foto.png` seperti Vite (keputusan desain: ADR-0069).

> Status: **M1 + M2** — M1 (manifest/resolver/`Image`, tanpa dependency, ADR-0069); M2 varian
> gambar (resize + WebP/AVIF) lewat plugin `@ramonyx/plugin-image` dengan `sharp` peer opsional
> (ADR-0079).

## Mulai

1. Taruh berkas di `src/assets` (subfolder bebas):

```
src/assets/
  logo.svg
  img/hero.png
  fonts/inter.woff2
```

2. Wiring resolver di `src/app.ts` (template sudah melakukannya):

```ts
import { createAssetResolver } from "@ramonyx/bundler";

const assets = await createAssetResolver(clientDir, {
  fallbackToPath: true, // dev: Vite menyajikan src/assets apa adanya (tanpa hash)
});

// ... createPageRoutes({ pages, renderer, assets })
```

3. Pakai di loader + render dengan komponen `Image`:

```tsx
import { Image } from "@ramonyx/react/assets";

export async function loader({ assets }) {
  return {
    logo: assets.url("logo.svg"),          // → "/assets/logo-abc123.svg"
    hero: assets.image("img/hero.png"),    // → { src, width, height, srcSet, sources } (M2)
  };
}

export default function Halaman({ data }: PageProps<{ hero?: string }>) {
  return <Image src={data.hero} alt="Hero" width={1200} height={630} />;
}
```

`Image` memberi default aman: `width`/`height` eksplisit (anti-CLS), `loading="lazy"`,
`decoding="async"`. Dengan M2, spread `assets.image(...)` mengisi `src`/`width`/`height`/`srcSet`/
`sources` sekaligus — `sizes` diisi sesuai layout halaman:

```tsx
<Image {...data.hero} alt="Hero" sizes="(max-width: 768px) 100vw, 640px" />
// <picture>
//   <source type="image/webp" srcset="/assets/img/hero-320-….webp 320w, …" sizes="…" />
//   <img src="/assets/img/hero-….png" width="800" height="600" srcset="…" … />
// </picture>
```

## Varian gambar (M2 — plugin image)

```bash
pnpm add @ramonyx/plugin-image sharp
```

```ts
// ramonyx.config.ts
import { imageOptimizer } from "@ramonyx/plugin-image";
import { defineConfig } from "ramonyx";

export default defineConfig({
  plugins: [imageOptimizer({ widths: [320, 640, 960, 1280], formats: ["webp"] })],
});
```

- Saat `ramonyx build`, setiap gambar di `src/assets/**` menghasilkan varian resize (lebar ≤
  intrinsik + lebar intrinsik) dalam format terpilih; berkas asli tetap disalin sebagai fallback.
- Manifest mencatat `width`/`height` + `variants`; resolver mengeksposnya lewat `assets.image()`;
  `Image` merender `<picture>` bila ada `sources` (AVIF/WebP).
- Cache di `.ramonyx/image-cache` (kunci = content-hash + opsi) — build berikutnya tidak meng-encode
  ulang.
- `avif` lebih kecil tetapi jauh lebih lambat saat build (opt-in). `sharp` tidak diinstal otomatis:
  plugin memberi pesan jelas bila belum ada.

## Manifest & helper

## Font

Font cukup diletakkan di `src/assets/fonts/**` (ikut ter-hash + tercatat). Preload lewat
`metadata.head` halaman (atau dokumen kustom):

```tsx
import { fontPreloadTag } from "@ramonyx/bundler";

export const metadata = {
  title: "Beranda",
  head: fontPreloadTag("/assets/fonts/inter-abc123.woff2"),
};
```

## Manifest & helper

```ts
import { assetUrl, readAssetManifest, createAssetResolver } from "@ramonyx/bundler";

const manifest = await readAssetManifest("dist/client");
assetUrl(manifest, "img/hero.png");                  // "/assets/img/hero-abc123.png" | undefined
await createAssetResolver("dist/client");            // { url(path) }
```

- Kunci manifest = path relatif posix terhadap `src/assets` (`img/hero.png`).
- `file` = path relatif terhadap **root keluaran klien** (`dist/client/**`, sama seperti bundle) →
  URL publik = `<prefix>/<file>` (1:1). Koreksi M1: layout lama `dist/client/assets/**` tidak dapat
  dijangkau URL `/assets/**` (ADR-0079).
- Nama berkas ber-hash konten → aman di-cache `immutable`; konten berubah = nama berubah.
- **Edge**: peta aset **di-inline** ke artefak saat build (tanpa fs — ADR-0069).
- `buildClient({ assetsDir: false })` mematikan pemindaian otomatis; `assetsDir` kustom didukung.

## Batasan (jujur)

- **Dev tanpa varian**: `src/assets/**` disajikan apa adanya; `assets.image()` mengembalikan
  `{ src }` saja (tanpa `srcSet`/dimensi) — verifikasi varian di build/e2e (ADR-0079).
- Varian hanya dibuat untuk format raster (PNG/JPEG/WebP/AVIF/TIFF); SVG dilewati (vektor).
- Tanpa placeholder blur (LQIP) dan tanpa varian on-demand; `avif` memperlambat build.
- `sharp` adalah **peer opsional** (tidak diinstal otomatis) — tanpa itu plugin gagal dengan pesan
  yang memandu, bukan diam-diam.
