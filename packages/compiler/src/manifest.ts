import type { Dirent } from "node:fs";
import { readdir } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import type { RouteDefinition, RouteEntry } from "@ramonyx/core";
import { RouteManifestError } from "./errors.ts";
import { type ModuleImporter, nativeImporter } from "./import.ts";

export const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"] as const;

export type HttpMethod = (typeof HTTP_METHODS)[number];

export interface CreateRouteManifestOptions {
  /** Direktori `src/routes` aplikasi. */
  readonly dir: string;
  /** Subdirektori endpoint API (default "api"). File di luar ini belum dipindai. */
  readonly apiDir?: string;
  /** Cara memuat modul route (default: import Node; dev server memakai ssrLoadModule Vite). */
  readonly importer?: ModuleImporter;
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

/** Satu file route API + method HTTP yang diekspornya (untuk codegen server/edge — ADR-0058). */
export interface ApiRouteFile {
  readonly file: string;
  readonly routePath: string;
  readonly methods: readonly HttpMethod[];
}

/**
 * Daftar file `src/routes/api/**` beserta method yang diekspor (memvalidasi ekspor).
 * Dipakai `createRouteManifest` (runtime Node) dan codegen entry server/edge.
 */
export async function listApiRoutes(options: CreateRouteManifestOptions): Promise<ApiRouteFile[]> {
  const apiDir = options.apiDir ?? "api";
  const importer = options.importer ?? nativeImporter;
  const files = await collectRouteFiles(options.dir, apiDir);
  const result: ApiRouteFile[] = [];

  for (const file of files) {
    const module = await importer(file.absolute, `route ${file.routePath}`);
    const methods = HTTP_METHODS.filter((method) => module[method] !== undefined);
    if (methods.length === 0) {
      throw new RouteManifestError(
        `Route ${file.routePath} (${file.absolute}) tidak mengekspor HTTP method. Ekspor salah satu: ${HTTP_METHODS.join(", ")}.`,
      );
    }
    result.push({ file: file.absolute, routePath: file.routePath, methods });
  }

  return result;
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
  const importer = options.importer ?? nativeImporter;
  const apiRoutes = await listApiRoutes(options);
  const entries: RouteEntry[] = [];

  for (const file of apiRoutes) {
    // Modul sudah termuat di `listApiRoutes` (cache importer) — ambil definisinya.
    const module = await importer(file.file, `route ${file.routePath}`);
    for (const method of file.methods) {
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
