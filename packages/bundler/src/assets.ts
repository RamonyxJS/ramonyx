// Pipeline aset (ADR-0069 M1, varian ADR-0079 M2 — tanpa dependency): pindai `src/assets/**`,
// salin ke **root keluaran klien** (`dist/client/**`) dengan **hash konten** (URL = `file`, ADR-0079),
// jalankan prosesor plugin (mis. varian gambar dari `@ramonyx/plugin-image`), catat semuanya di
// `ramonyx.assets.json`, dan sediakan resolver (`assetUrl`/`createAssetResolver`/`assetInfoMap`).
//
// Catatan desain: Node SSR tidak dapat `import foto.png` (hanya Vite/klien yang bisa). Karena itu
// M1 memakai **manifest + helper** (bukan loader kustom) — paritas SSR ↔ klien tanpa mesin baru.

import { createHash } from "node:crypto";
import { copyFile, mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, extname, join, posix, relative, sep } from "node:path";
import {
  type AssetInfo,
  type AssetResolver,
  createAssetResolverFromMap,
  type ResolvedImage,
} from "@ramonyx/core";
import {
  type AssetEntry,
  type AssetManifest,
  type AssetMap,
  type AssetVariantEntry,
  readAssetManifest,
} from "./manifest.ts";

export type { AssetEntry, AssetMap } from "./manifest.ts";

/** Direktori aset default (relatif appDir) — dipindai otomatis bila ada. */
export const DEFAULT_ASSETS_DIR = "src/assets";

// ── Kontrak prosesor aset (dipakai hook plugin `assets` — ADR-0079) ──────────────────────────

/** Input prosesor: satu berkas `src/assets/**` (path relatif posix + isi). */
export interface AssetProcessorInput {
  readonly path: string;
  readonly data: Uint8Array;
}

/** Berkas turunan yang dihasilkan prosesor (mis. varian gambar ter-resize). */
export interface AssetProcessorOutput {
  /** Path relatif terhadap `src/assets` (mis. `img/hero-640.webp`) — bundler menambah hash konten. */
  readonly path: string;
  readonly data: Uint8Array;
  /** Lebar varian (dipakai `srcset`). */
  readonly width: number;
  readonly height?: number;
  /** Format berkas; default dari ekstensi `path`. */
  readonly format?: string;
}

/** Hasil prosesor: metadata entri asli + berkas turunan. */
export interface AssetProcessorResult {
  readonly meta?: {
    readonly width?: number;
    readonly height?: number;
    /** Data URI blur/LQIP untuk background anti-CLS. */
    readonly placeholder?: string;
  };
  readonly outputs?: readonly AssetProcessorOutput[];
}

export type AssetProcessor = (
  asset: AssetProcessorInput,
) => AssetProcessorResult | undefined | Promise<AssetProcessorResult | undefined>;

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

function contentHash(data: Uint8Array): string {
  return createHash("sha256").update(data).digest("hex").slice(0, 10);
}

/**
 * `img/hero.png` + hash → `img/hero-<hash>.png` (relatif direktori keluaran klien).
 *
 * Catatan (koreksi M1, ADR-0079): berkas ditulis **di root keluaran klien** — konsisten dengan
 * URL `<prefix>/<path>` dan middleware `serveStatic({ dir: dist/client, prefix: "/assets" })`.
 * Layout M1 (`dist/client/assets/**`) tidak pernah dapat disajikan (URL → root), tertangkap
 * oleh test HTTP aset di create-app.
 */
function hashedTarget(rel: string, hash: string): string {
  const ext = extname(rel);
  const tanpaExt = rel.slice(0, rel.length - ext.length);
  return `${tanpaExt}-${hash}${ext}`;
}

export interface CollectAssetsOptions {
  /** Prosesor plugin (dijalankan berurutan per berkas — ADR-0079). */
  readonly processors?: readonly AssetProcessor[];
}

export interface CollectAssetsResult {
  readonly assets: AssetMap;
  readonly files: readonly string[];
}

/**
 * Salin aset dari `assetsDir` ke `<clientOutDir>/**` dengan nama ber-hash konten.
 * Key manifest = path relatif posix terhadap `assetsDir` (mis. `img/logo.png`);
 * `file` = path relatif terhadap keluaran klien → URL publik = `<prefix>/<file>` (ADR-0079).
 * Prosesor (bila ada) dapat menambah varian + metadata dimensi (ADR-0079).
 */
export async function collectAssets(
  assetsDir: string,
  clientOutDir: string,
  options: CollectAssetsOptions = {},
): Promise<CollectAssetsResult> {
  const files = await collectFiles(assetsDir);
  const assets: Record<string, AssetEntry> = {};
  const copied = new Set<string>();

  for (const file of files) {
    const data = await readFile(file);
    const rel = relative(assetsDir, file).split(sep).join(posix.sep);

    let meta: { width?: number; height?: number; placeholder?: string } = {};
    const outputs: AssetProcessorOutput[] = [];
    for (const processor of options.processors ?? []) {
      const hasil = await processor({ path: rel, data });
      if (hasil === undefined) {
        continue;
      }
      if (hasil.meta !== undefined) {
        meta = { ...meta, ...hasil.meta };
      }
      if (hasil.outputs !== undefined) {
        outputs.push(...hasil.outputs);
      }
    }

    const targetRel = hashedTarget(rel, contentHash(data));
    const target = join(clientOutDir, targetRel);
    await mkdir(dirname(target), { recursive: true });
    await copyFile(file, target);
    copied.add(targetRel);

    const variants: AssetVariantEntry[] = [];
    for (const output of outputs) {
      const outputRel = hashedTarget(output.path, contentHash(output.data));
      const outputTarget = join(clientOutDir, outputRel);
      await mkdir(dirname(outputTarget), { recursive: true });
      await writeFile(outputTarget, output.data);
      copied.add(outputRel);
      variants.push({
        file: outputRel,
        bytes: output.data.byteLength,
        width: output.width,
        ...(output.height !== undefined ? { height: output.height } : {}),
        format: (output.format ?? extname(output.path).slice(1)).toLowerCase(),
      });
    }

    assets[rel] = {
      file: targetRel,
      bytes: data.byteLength,
      ...(meta.width !== undefined ? { width: meta.width } : {}),
      ...(meta.height !== undefined ? { height: meta.height } : {}),
      ...(meta.placeholder !== undefined ? { placeholder: meta.placeholder } : {}),
      ...(variants.length > 0 ? { variants } : {}),
    };
  }

  return { assets, files: [...copied] };
}

export interface AssetUrlOptions {
  /** Prefix URL publik; default `/assets`. */
  readonly urlPrefix?: string;
}

function normalizeAssetPath(path: string): string {
  return path
    .replace(/^\.?\//, "")
    .split(sep)
    .join(posix.sep);
}

/** Berkas keluaran (relatif clientOutDir) → URL publik: `<prefix>/<file>` (1:1 — ADR-0079). */
function fileToUrl(file: string, prefix: string): string {
  return `${prefix}/${file}`;
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
  return fileToUrl(entry.file, (options.urlPrefix ?? "/assets").replace(/\/$/, ""));
}

/**
 * Manifest → peta `AssetInfo` (URL + dimensi + varian) untuk resolver: dipakai
 * `createAssetResolver` (Node) dan artefak edge yang meng-inline peta (ADR-0069/0079).
 */
export function assetInfoMap(
  manifest: AssetManifest | null,
  options: AssetUrlOptions = {},
): Record<string, AssetInfo> {
  const prefix = (options.urlPrefix ?? "/assets").replace(/\/$/, "");
  const map: Record<string, AssetInfo> = {};
  for (const [path, entry] of Object.entries(manifest?.assets ?? {})) {
    map[path] = {
      url: fileToUrl(entry.file, prefix),
      ...(entry.width !== undefined ? { width: entry.width } : {}),
      ...(entry.height !== undefined ? { height: entry.height } : {}),
      ...(entry.placeholder !== undefined ? { placeholder: entry.placeholder } : {}),
      ...(entry.variants !== undefined
        ? {
            variants: entry.variants.map((variant) => ({
              url: fileToUrl(variant.file, prefix),
              width: variant.width,
              ...(variant.height !== undefined ? { height: variant.height } : {}),
              format: variant.format,
              bytes: variant.bytes,
            })),
          }
        : {}),
    };
  }
  return map;
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
 * membaca manifest sekali; di dev pakai `fallbackToPath: true` (Vite menyajikan file mentah;
 * tanpa varian — ADR-0079).
 */
export async function createAssetResolver(
  clientDir: string,
  options: CreateAssetResolverOptions = {},
): Promise<AssetResolver> {
  const manifest = await readAssetManifest(clientDir);
  const prefix = (options.urlPrefix ?? "/assets").replace(/\/$/, "");
  const base = createAssetResolverFromMap(assetInfoMap(manifest, { urlPrefix: prefix }));

  return {
    url(path: string): string | undefined {
      const found = base.url(path);
      if (found !== undefined) {
        return found;
      }
      if (options.fallbackToPath === true) {
        return `${prefix}/${normalizeAssetPath(path)}`;
      }
      return undefined;
    },
    image(path: string): ResolvedImage | undefined {
      const found = base.image(path);
      if (found !== undefined) {
        return found;
      }
      if (options.fallbackToPath === true) {
        // Dev: berkas disajikan apa adanya (tanpa hash/varian/dimensi).
        return { src: `${prefix}/${normalizeAssetPath(path)}` };
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
