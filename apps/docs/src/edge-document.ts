// Dokumen untuk artefak edge: font di-resolve dari asset map yang di-inline oleh
// `ramonyx build --target edge` (tanpa `node:fs`). Renderer di-cache per set URL font.
import type { DocumentOptions, DocumentRenderer } from "@ramonyx/ssr";

import { createDocument, type DocumentFonts } from "./document.ts";

const fallback: DocumentFonts = {
  serif: "/assets/fonts/instrument-serif-latin.woff2",
  serifItalic: "/assets/fonts/instrument-serif-italic-latin.woff2",
  sans400: "/assets/fonts/plex-sans-400-latin.woff2",
  sans500: "/assets/fonts/plex-sans-500-latin.woff2",
  sans600: "/assets/fonts/plex-sans-600-latin.woff2",
};

const cache = new Map<string, DocumentRenderer>();

function resolveFont(assets: DocumentOptions["assets"], path: string): string {
  return assets?.url(`fonts/${path}`) ?? fallback[path as keyof DocumentFonts] ?? path;
}

export const document: DocumentRenderer = (options) => {
  const assets = options.assets;
  const fonts: DocumentFonts = {
    serif: resolveFont(assets, "instrument-serif-latin.woff2"),
    serifItalic: resolveFont(assets, "instrument-serif-italic-latin.woff2"),
    sans400: resolveFont(assets, "plex-sans-400-latin.woff2"),
    sans500: resolveFont(assets, "plex-sans-500-latin.woff2"),
    sans600: resolveFont(assets, "plex-sans-600-latin.woff2"),
  };
  const key = `${fonts.serif}|${fonts.serifItalic}|${fonts.sans400}|${fonts.sans500}|${fonts.sans600}`;
  let renderer = cache.get(key);
  if (renderer === undefined) {
    renderer = createDocument("", fonts);
    cache.set(key, renderer);
  }
  return renderer(options);
};
