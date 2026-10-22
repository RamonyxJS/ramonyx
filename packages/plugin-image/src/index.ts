// Plugin varian gambar (ADR-0079) — **build-time**, `sharp` sebagai peer opsional (tidak
// diinstal otomatis). Menghasilkan varian resize + format modern (WebP/AVIF) untuk
// `src/assets/**`, mencatat dimensi intrinsik + varian di manifest, sehingga resolver
// (`assets.image(...)`) dan komponen `Image` merender `srcset`/`<picture>` otomatis.
// Cache berbasis content-hash di `.ramonyx/image-cache`.

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, extname, join } from "node:path";
import {
  type AssetProcessorInput,
  type AssetProcessorOutput,
  definePlugin,
  type PluginContext,
} from "@ramonyx/bundler";
// Tipe saja (tanpa impor runtime): `sharp` tetap peer opsional.
import type sharp from "sharp";

type SharpFactory = typeof sharp;

export type ImageFormat = "webp" | "avif" | "jpeg" | "png";

export interface ImagePluginOptions {
  /** Lebar varian (difilter ≤ lebar intrinsik); default `[320, 640, 960, 1280, 1920]`. */
  readonly widths?: readonly number[];
  /**
   * Format keluaran; default `["webp"]`. `avif` lebih kecil tetapi jauh lebih lambat saat
   * build (opt-in). Berkas asli tetap disalin sebagai fallback universal.
   */
  readonly formats?: readonly ImageFormat[];
  /** Kualitas encoder lossy (webp/avif/jpeg); default 78. */
  readonly quality?: number;
  /** Aktifkan cache di disk; default true. */
  readonly cache?: boolean;
  /** Direktori cache (relatif appDir); default `.ramonyx/image-cache`. */
  readonly cacheDir?: string;
  /** Sertakan varian selebar intrinsik (melengkapi srcset); default true. */
  readonly includeIntrinsicWidth?: boolean;
  /** Buat blur/LQIP data URI untuk background anti-CLS; default true. */
  readonly placeholder?: boolean;
}

const DEFAULT_WIDTHS: readonly number[] = [320, 640, 960, 1280, 1920];
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".avif", ".tiff"]);

function formatExt(format: ImageFormat): string {
  return format === "jpeg" ? "jpg" : format;
}

/** `img/hero.png` + 640 + webp → `img/hero-640.webp` (relatif assetsDir). */
function variantPath(original: string, width: number, format: ImageFormat): string {
  const ext = extname(original);
  const base = original.slice(0, original.length - ext.length);
  return `${base}-${width}.${formatExt(format)}`;
}

function targetWidths(intrinsic: number, options: ImagePluginOptions): number[] {
  const widths = new Set<number>();
  for (const width of options.widths ?? DEFAULT_WIDTHS) {
    if (width > 0 && width < intrinsic) {
      widths.add(Math.round(width));
    }
  }
  if (options.includeIntrinsicWidth !== false) {
    widths.add(intrinsic);
  }
  return [...widths].sort((a, b) => a - b);
}

async function loadSharp(): Promise<SharpFactory> {
  try {
    // sharp adalah CJS (`export =`) — interop Node ESM: pabrik ada di `default`.
    const mod = (await import("sharp")) as unknown as { default?: SharpFactory };
    const factory = mod.default ?? (mod as unknown as SharpFactory);
    if (typeof factory !== "function") {
      throw new Error("modul sharp tidak dapat dipakai");
    }
    return factory;
  } catch (error) {
    throw new Error(
      "Plugin image butuh `sharp` (peer opsional — tidak diinstal otomatis): jalankan " +
        "`pnpm add sharp` di aplikasi Anda, atau lepaskan plugin dari `ramonyx.config.ts`. " +
        `Penyebab: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

async function encode(
  sharp: SharpFactory,
  data: Uint8Array,
  width: number,
  format: ImageFormat,
  quality: number,
  cacheFile: string | undefined,
): Promise<Uint8Array> {
  if (cacheFile !== undefined) {
    try {
      return await readFile(cacheFile);
    } catch {
      // cache miss — lanjut encode
    }
  }

  let pipeline = sharp(data, { failOn: "none" }).resize({ width, withoutEnlargement: true });
  if (format === "webp") {
    pipeline = pipeline.webp({ quality });
  } else if (format === "avif") {
    pipeline = pipeline.avif({ quality });
  } else if (format === "jpeg") {
    pipeline = pipeline.jpeg({ quality });
  } else {
    pipeline = pipeline.png();
  }
  const hasil = await pipeline.toBuffer();

  if (cacheFile !== undefined) {
    await mkdir(dirname(cacheFile), { recursive: true });
    await writeFile(cacheFile, hasil);
  }
  return hasil;
}

/**
 * Plugin varian gambar — pakai di `ramonyx.config.ts`:
 *
 * ```ts
 * import { imageOptimizer } from "@ramonyx/plugin-image";
 * export default defineConfig({ plugins: [imageOptimizer({ formats: ["avif", "webp"] })] });
 * ```
 */
export function imageOptimizer(options: ImagePluginOptions = {}) {
  const quality = options.quality ?? 78;
  const formats = options.formats ?? (["webp"] as const);

  return definePlugin({
    name: "image",
    async assets(context: PluginContext, asset: AssetProcessorInput) {
      const ext = extname(asset.path).toLowerCase();
      if (!IMAGE_EXTENSIONS.has(ext)) {
        return undefined;
      }

      const sharp = await loadSharp();
      const metadata = await sharp(asset.data, { failOn: "none" }).metadata();
      const placeholder =
        options.placeholder === false
          ? undefined
          : `data:image/webp;base64,${(
              await sharp(asset.data, { failOn: "none" })
                .resize({ width: 24, withoutEnlargement: true })
                .blur(8)
                .webp({ quality: 25 })
                .toBuffer()
            ).toString("base64")}`;
      const width = metadata.width;
      const height = metadata.height;
      if (width === undefined || height === undefined || width === 0 || height === 0) {
        return undefined;
      }

      const cacheDir =
        options.cache === false
          ? undefined
          : join(context.appDir, options.cacheDir ?? ".ramonyx/image-cache");
      const contentKey = createHash("sha256").update(asset.data).digest("hex").slice(0, 16);

      const outputs: AssetProcessorOutput[] = [];
      for (const target of targetWidths(width, options)) {
        const variantHeight = Math.max(1, Math.round((height * target) / width));
        for (const format of formats) {
          const cacheFile =
            cacheDir === undefined
              ? undefined
              : join(cacheDir, `${contentKey}-${target}-q${quality}.${formatExt(format)}`);
          const data = await encode(sharp, asset.data, target, format, quality, cacheFile);
          outputs.push({
            path: variantPath(asset.path, target, format),
            data,
            width: target,
            height: variantHeight,
            format: formatExt(format),
          });
        }
      }

      return {
        meta: {
          width,
          height,
          ...(placeholder === undefined ? {} : { placeholder }),
        },
        outputs,
      };
    },
  });
}
