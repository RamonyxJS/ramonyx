// Resolusi aset (ADR-0069 M1 + ADR-0079 M2) — **edge-safe** (tanpa `node:*`), dipakai:
//   - bundler (membangun peta dari manifest build) — `createAssetResolver`;
//   - artefak edge (peta di-inline ke entry — ADR-0058/0069);
//   - komponen `Image` (`@ramonyx/react/assets`) lewat data `ResolvedImage`.

/** Varian satu aset (mis. hasil resize/format modern — ADR-0079). */
export interface AssetVariantInfo {
  /** URL publik varian (mis. `/assets/img/hero-640-ab12.webp`). */
  readonly url: string;
  readonly width: number;
  readonly height?: number;
  /** Format berkas: `webp`, `avif`, atau ekstensi asli (`png`, `jpg`, …). */
  readonly format: string;
  readonly bytes?: number;
}

/** Info satu aset: URL + dimensi intrinsik + varian (opsional). */
export interface AssetInfo {
  readonly url: string;
  readonly width?: number;
  readonly height?: number;
  readonly variants?: readonly AssetVariantInfo[];
}

/** `<source>` untuk `<picture>` (satu per format modern). */
export interface ResolvedImageSource {
  readonly type: string;
  readonly srcSet: string;
}

/** Data siap pakai untuk komponen `Image` (spread: `<Image {...assets.image("a.png")} />`). */
export interface ResolvedImage {
  /** URL berkas asli (fallback universal). */
  readonly src: string;
  readonly width?: number;
  readonly height?: number;
  /** `srcset` format modern (untuk `<img>` di dalam `<picture>`). */
  readonly srcSet?: string;
  /** `<source>` per format modern (avif/webp) — untuk `<picture>`. */
  readonly sources?: readonly ResolvedImageSource[];
}

/** MIME format gambar modern yang didukung `<source type>` (ADR-0079). */
const MODERN_MIME: Record<string, string> = {
  avif: "image/avif",
  webp: "image/webp",
};

function normalizeAssetPath(path: string): string {
  return path.replace(/^\.?\//, "").replace(/\\/g, "/");
}

function srcSetFor(variants: readonly AssetVariantInfo[]): string {
  return [...variants]
    .sort((a, b) => a.width - b.width)
    .map((variant) => `${variant.url} ${variant.width}w`)
    .join(", ");
}

/**
 * Peta aset (path → `AssetInfo`) → resolver. `sources` diisi hanya untuk format modern
 * (avif/webp) yang punya varian; urutan avif → webp → lain.
 */
export function createAssetResolverFromMap(map: Readonly<Record<string, AssetInfo>>): {
  url(path: string): string | undefined;
  image(path: string): ResolvedImage | undefined;
} {
  return {
    url(path) {
      return map[normalizeAssetPath(path)]?.url;
    },
    image(path) {
      const info = map[normalizeAssetPath(path)];
      if (info === undefined) {
        return undefined;
      }
      const variants = info.variants ?? [];
      if (variants.length === 0) {
        return {
          src: info.url,
          ...(info.width !== undefined ? { width: info.width } : {}),
          ...(info.height !== undefined ? { height: info.height } : {}),
        };
      }

      const perFormat = new Map<string, AssetVariantInfo[]>();
      for (const variant of variants) {
        const daftar = perFormat.get(variant.format) ?? [];
        daftar.push(variant);
        perFormat.set(variant.format, daftar);
      }

      const avif = perFormat.get("avif");
      const webp = perFormat.get("webp");
      const sources: ResolvedImageSource[] = [];
      if (avif !== undefined && avif.length > 0) {
        sources.push({ type: MODERN_MIME.avif as string, srcSet: srcSetFor(avif) });
      }
      if (webp !== undefined && webp.length > 0) {
        sources.push({ type: MODERN_MIME.webp as string, srcSet: srcSetFor(webp) });
      }

      // `srcset` untuk `<img>` di dalam `<picture>`: format modern yang tersedia (webp → avif),
      // atau varian format asli bila tidak ada format modern (valid: sama dengan `src`).
      const modern = webp ?? avif;
      const srcSet = modern !== undefined ? srcSetFor(modern) : srcSetFor(variants);
      return {
        src: info.url,
        ...(info.width !== undefined ? { width: info.width } : {}),
        ...(info.height !== undefined ? { height: info.height } : {}),
        ...(srcSet.length > 0 ? { srcSet } : {}),
        ...(sources.length > 0 ? { sources } : {}),
      };
    },
  };
}
