// Komponen `Image` (ADR-0069, M1) — sugar untuk praktik baik: width/height eksplisit
// (anti-CLS), `loading="lazy"` + `decoding="async"` default, `srcSet`/`sizes` passthrough.
//
// Tanpa JSX (paket framework berjalan di Node murni — ADR-0006). URL aset diselesaikan
// server-side lewat resolver (`createAssetResolver` → `loader({ assets })`).

import { type CSSProperties, createElement, type ReactElement } from "react";

export interface ImageProps {
  /** URL aset hasil resolver (`assets.url("img/foto.png")`); `undefined` → tidak dirender. */
  readonly src: string | undefined;
  readonly alt: string;
  /** Lebar intrinsik (wajib bersama `height` untuk mencegah CLS). */
  readonly width?: number;
  readonly height?: number;
  /** `srcset` (mis. varian @2x yang disediakan aplikasi). */
  readonly srcSet?: string;
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
  sizes,
  loading = "lazy",
  fetchPriority,
  className,
  style,
}: ImageProps): ReactElement | null {
  if (src === undefined || src.length === 0) {
    return null;
  }
  return createElement("img", {
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
}
