import type { Dirent } from "node:fs";
import { readdir } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import type { RouteDefinition, RouteEntry } from "@ramonyx/core";
import { RouteManifestError } from "./errors.ts";
import { importModule } from "./import.ts";

export const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"] as const;

export type HttpMethod = (typeof HTTP_METHODS)[number];

export interface CreateRouteManifestOptions {
  /** Direktori `src/routes` aplikasi. */
  readonly dir: string;
  /** Subdirektori endpoint API (default "api"). File di luar ini belum dipindai. */
  readonly apiDir?: string;
}

interface RouteFile {
  readonly absolute: string;
  readonly routePath: string;
}

function isRouteDefinition(
  value: unknown,
): value is RouteDefinition<unknown, unknown, unknown, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { handler?: unknown }).handler === "function"
  );
}

function toRoutePath(parts: readonly string[]): string {
  const segments = [...parts];
  const fileName = (segments.at(-1) ?? "").slice(0, -".ts".length);
  if (fileName === "index") {
    segments.pop();
  } else {
    segments[segments.length - 1] = fileName;
  }
  return `/${segments.join("/")}`;
}

async function collectRouteFiles(dir: string, apiDir: string): Promise<RouteFile[]> {
  let dirents: Dirent[];
  try {
    dirents = await readdir(dir, { withFileTypes: true, recursive: true });
  } catch (error) {
    throw new RouteManifestError(
      `Tidak bisa membaca direktori route "${dir}": ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }

  const files: RouteFile[] = [];
  for (const dirent of dirents) {
    if (!dirent.isFile()) {
      continue;
    }
    const name = dirent.name;
    if (!name.endsWith(".ts") || name.endsWith(".d.ts")) {
      continue;
    }
    if (name.startsWith("_")) {
      continue;
    }

    const absolute = join(dirent.parentPath, name);
    const parts = relative(dir, absolute).split(sep);
    if (parts.some((part) => part.startsWith("_"))) {
      continue;
    }
    if (parts[0] !== apiDir) {
      continue;
    }

    files.push({ absolute, routePath: toRoutePath(parts) });
  }

  files.sort(
    (a, b) => a.routePath.localeCompare(b.routePath) || a.absolute.localeCompare(b.absolute),
  );
  return files;
}

/**
 * Memindai `src/routes/api/**` dan membangun manifest `RouteEntry[]`.
 *
 * Konvensi: nama file → path (`index.ts` = direktori itu; `[id].ts` = parameter);
 * file/direktori berawalan `_` diabaikan; file tanpa ekspor HTTP method → error.
 */
export async function createRouteManifest(
  options: CreateRouteManifestOptions,
): Promise<RouteEntry[]> {
  const apiDir = options.apiDir ?? "api";
  const files = await collectRouteFiles(options.dir, apiDir);
  const entries: RouteEntry[] = [];

  for (const file of files) {
    const module = await importModule(file.absolute, `route ${file.routePath}`);
    const exported = HTTP_METHODS.filter((method) => module[method] !== undefined);
    if (exported.length === 0) {
      throw new RouteManifestError(
        `Route ${file.routePath} (${file.absolute}) tidak mengekspor HTTP method. Ekspor salah satu: ${HTTP_METHODS.join(", ")}.`,
      );
    }

    for (const method of exported) {
      const definition = module[method];
      if (!isRouteDefinition(definition)) {
        throw new RouteManifestError(
          `Ekspor ${method} di ${file.routePath} bukan definisi route yang valid (butuh objek dengan fungsi "handler").`,
        );
      }
      entries.push({ method, path: file.routePath, definition });
    }
  }

  return entries;
}
