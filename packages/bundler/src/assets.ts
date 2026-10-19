// Pipeline aset (ADR-0069, M1 — tanpa dependency): pindai `src/assets/**`, salin ke
// `dist/client/assets/**` dengan **hash konten**, catat di `ramonyx.assets.json`, dan sediakan
// resolver untuk server (`assetUrl`/`createAssetResolver`).
//
// Catatan desain: Node SSR tidak dapat `import foto.png` (hanya Vite/klien yang bisa). Karena itu
// M1 memakai **manifest + helper** (bukan loader kustom) — paritas SSR ↔ klien tanpa mesin baru.

import { createHash } from "node:crypto";
import { copyFile, mkdir, readdir, readFile, stat } from "node:fs/promises";
import { dirname, extname, join, posix, relative, sep } from "node:path";
import type { AssetResolver } from "@ramonyx/core";
import {
  type AssetEntry,
  type AssetManifest,
  type AssetMap,
  readAssetManifest,
} from "./manifest.ts";

export type { AssetEntry, AssetMap } from "./manifest.ts";

/** Direktori aset default (relatif appDir) — dipindai otomatis bila ada. */
export const DEFAULT_ASSETS_DIR = "src/assets";

async function collectFiles(dir: string, found: string[] = []): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith(".")) {
      continue;
    }
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      await collectFiles(path, found);
    } else if (entry.isFile()) {
      found.push(path);
    }
  }
  return found;
}

export interface CollectAssetsResult {
  readonly assets: AssetMap;
  readonly files: readonly string[];
}

/**
 * Salin aset dari `assetsDir` ke `<clientOutDir>/assets/**` dengan nama ber-hash konten.
 * Key manifest = path relatif posix terhadap `assetsDir` (mis. `img/logo.png`).
 */
export async function collectAssets(
  assetsDir: string,
  clientOutDir: string,
): Promise<CollectAssetsResult> {
  const files = await collectFiles(assetsDir);
  const assets: Record<string, AssetEntry> = {};
  const copied: string[] = [];

  for (const file of files) {
    const data = await readFile(file);
    const hash = createHash("sha256").update(data).digest("hex").slice(0, 10);
    const rel = relative(assetsDir, file).split(sep).join(posix.sep);
    const ext = extname(rel);
    const tanpaExt = rel.slice(0, rel.length - ext.length);
    const targetRel = posix.join("assets", `${tanpaExt}-${hash}${ext}`);
    const target = join(clientOutDir, targetRel);

    await mkdir(dirname(target), { recursive: true });
    await copyFile(file, target);

    assets[rel] = { file: targetRel, bytes: data.byteLength };
    copied.push(targetRel);
  }

  return { assets, files: copied };
}

export interface AssetUrlOptions {
  /** Prefix URL publik; default `/assets`. */
  readonly urlPrefix?: string;
}

/** URL publik entri aset; `undefined` bila path tidak ada di manifest. */
export function assetUrl(
  manifest: AssetManifest | null,
  path: string,
  options: AssetUrlOptions = {},
): string | undefined {
  const entry = manifest?.assets?.[normalizeAssetPath(path)];
  if (entry === undefined) {
    return undefined;
  }
  const prefix = (options.urlPrefix ?? "/assets").replace(/\/$/, "");
  const tanpaPrefix = entry.file.startsWith("assets/")
    ? entry.file.slice("assets/".length)
    : entry.file;
  return `${prefix}/${tanpaPrefix}`;
}

function normalizeAssetPath(path: string): string {
  return path
    .replace(/^\.?\//, "")
    .split(sep)
    .join(posix.sep);
}

export interface CreateAssetResolverOptions extends AssetUrlOptions {
  /**
   * Fallback ke `${prefix}/<path>` (tanpa hash) bila manifest belum ada/tidak memuat entri —
   * untuk **dev** (Vite menyajikan `src/assets/**` apa adanya) — default false.
   */
  readonly fallbackToPath?: boolean;
}

/**
 * Resolver aset untuk server (dipakai loader lewat `createPageRoutes({ assets })`):
 * membaca manifest sekali; di dev pakai `fallbackToPath: true` (Vite menyajikan file mentah).
 */
export async function createAssetResolver(
  clientDir: string,
  options: CreateAssetResolverOptions = {},
): Promise<AssetResolver> {
  const manifest = await readAssetManifest(clientDir);
  const prefix = (options.urlPrefix ?? "/assets").replace(/\/$/, "");

  return {
    url(path: string): string | undefined {
      const found = assetUrl(manifest, path, { urlPrefix: prefix });
      if (found !== undefined) {
        return found;
      }
      if (options.fallbackToPath === true) {
        return `${prefix}/${normalizeAssetPath(path)}`;
      }
      return undefined;
    },
  };
}

/** Direktori aset ada? (dipakai buildClient untuk memindai `src/assets` secara otomatis). */
export async function assetsDirExists(assetsDir: string): Promise<boolean> {
  try {
    return (await stat(assetsDir)).isDirectory();
  } catch {
    return false;
  }
}

/** Tag `<link rel="preload">` untuk font (masukkan lewat `metadata.head` halaman/dokumen). */
export function fontPreloadTag(
  href: string,
  options: { readonly type?: string; readonly crossorigin?: boolean } = {},
): string {
  const type = options.type ?? "font/woff2";
  const crossorigin = (options.crossorigin ?? true) ? " crossorigin" : "";
  return `<link rel="preload" as="font" type="${type}" href="${href}"${crossorigin} />`;
}
