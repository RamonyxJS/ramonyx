import { pathToFileURL } from "node:url";
import { RouteManifestError } from "./errors.ts";

/** Dynamic import modul route/page dari file .ts/.tsx, dengan error yang menyebut file. */
export async function importModule(
  absolute: string,
  label: string,
): Promise<Record<string, unknown>> {
  try {
    return (await import(pathToFileURL(absolute).href)) as Record<string, unknown>;
  } catch (error) {
    throw new RouteManifestError(
      `Gagal mengimpor ${label} (${absolute}): ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
}
