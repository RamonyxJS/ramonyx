import { pathToFileURL } from "node:url";
import { RouteManifestError } from "./errors.ts";

/**
 * Cara memuat modul route/halaman. Default: dynamic import Node (`nativeImporter`).
 * Dev server dapat menggantinya dengan `vite.ssrLoadModule` agar modul mengikuti
 * module graph Vite (invalidasi saat file berubah).
 */
export type ModuleImporter = (absolute: string, label: string) => Promise<Record<string, unknown>>;

/** Dynamic import modul route/page dari file .ts/.tsx, dengan error yang menyebut file. */
export const nativeImporter: ModuleImporter = async (absolute, label) => {
  try {
    return (await import(pathToFileURL(absolute).href)) as Record<string, unknown>;
  } catch (error) {
    throw new RouteManifestError(
      `Gagal mengimpor ${label} (${absolute}): ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
};
