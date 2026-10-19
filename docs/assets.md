# Aset (Gambar, Font, dll.)

Ramonyx memindai `src/assets/**` saat build: setiap berkas disalin ke `dist/client/assets/**`
dengan **hash konten** (immutable cache — ADR-0055) dan dicatat di manifest
`ramonyx.assets.json`. Server menyelesaikan URL lewat **resolver** — karena Node tidak dapat
`import foto.png` seperti Vite (keputusan desain: ADR-0069).

> Status: **M1** (tanpa dependency) — resize/format modern menyusul sebagai M2 (gate dependency).

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
  return { hero: assets?.url("img/hero.png") };   // → "/assets/img/hero-abc123.png"
}

export default function Halaman({ data }: PageProps<{ hero?: string }>) {
  return <Image src={data.hero} alt="Hero" width={1200} height={630} />;
}
```

`Image` memberi default aman: `width`/`height` eksplisit (anti-CLS), `loading="lazy"`,
`decoding="async"`; `srcSet`/`sizes` dapat diisi bila aplikasi menyediakan varian.

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
- Nama berkas ber-hash konten → aman di-cache `immutable`; konten berubah = nama berubah.
- **Edge**: peta aset **di-inline** ke artefak saat build (tanpa fs — ADR-0069).
- `buildClient({ assetsDir: false })` mematikan pemindaian otomatis; `assetsDir` kustom didukung.

## Batasan (jujur)

- **Tanpa resize/format modern** (M1): sediakan varian sendiri via `srcSet` bila perlu.
- Dev memakai jalur **tanpa hash** (`fallbackToPath`) — nama berbeda dari produksi (disengaja).
- Tanpa kompresi otomatis font/gambar; gunakan berkas yang sudah dioptimalkan.
- M2 (resize build-time) hanya jika memenuhi gate ADR-0069: dependency opsional lewat plugin,
  audit supply chain lolos, build-time saja.
