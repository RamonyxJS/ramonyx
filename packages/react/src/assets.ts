// Komponen `Image` (ADR-0069, M1) — sugar untuk praktik baik: width/height eksplisit
// (anti-CLS), `loading="lazy"` + `decoding="async"` default, `srcSet`/`sizes` passthrough.
//
// Tanpa JSX (paket framework berjalan di Node murni — ADR-0006). URL aset diselesaikan
// server-side lewat resolver (`createAssetResolver` → `loader({ assets })`).

import { type CSSProperties, createElement, type ReactElement } from "react";

export interface ImageSource {
  /** MIME sumber (mis. `image/avif`, `image/webp`) — untuk `<source type>`. */
  readonly type: string;
  readonly srcSet: string;
}

export interface ImageProps {
  /** URL aset hasil resolver (`assets.url("img/foto.png")`); `undefined` → tidak dirender. */
  readonly src: string | undefined;
  readonly alt: string;
  /** Lebar intrinsik (wajib bersama `height` untuk mencegah CLS). */
  readonly width?: number;
  readonly height?: number;
  /** `srcset` (mis. varian @2x yang disediakan aplikasi). */
  readonly srcSet?: string;
  /**
   * Sumber per format (ADR-0079) — dari `assets.image("img/foto.png")`; bila ada, dirender
   * sebagai `<picture><source …/><img …/></picture>`.
   */
  readonly sources?: readonly ImageSource[];
  readonly sizes?: string;
  readonly loading?: "lazy" | "eager";
  readonly fetchPriority?: "high" | "low" | "auto";
  readonly className?: string;
  readonly style?: CSSProperties;
}

/** Komponen gambar; mengembalikan `null` bila `src` tidak tersedia (aset belum dibangun). */
export function Image({
  src,
  alt,
  width,
  height,
  srcSet,
  sources,
  sizes,
  loading = "lazy",
  fetchPriority,
  className,
  style,
}: ImageProps): ReactElement | null {
  if (src === undefined || src.length === 0) {
    return null;
  }
  const img = createElement("img", {
    src,
    alt,
    width,
    height,
    srcSet,
    sizes,
    loading,
    decoding: "async",
    ...(fetchPriority !== undefined ? { fetchpriority: fetchPriority } : {}),
    ...(className !== undefined ? { className } : {}),
    ...(style !== undefined ? { style } : {}),
  });
  if (sources === undefined || sources.length === 0) {
    return img;
  }
  return createElement(
    "picture",
    null,
    ...sources.map((source) =>
      createElement("source", {
        key: source.type,
        type: source.type,
        srcSet: source.srcSet,
        ...(sizes !== undefined ? { sizes } : {}),
      }),
    ),
    img,
  );
}
