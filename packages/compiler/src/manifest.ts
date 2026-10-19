import type { Dirent } from "node:fs";
import { readdir } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";
import { errorHint, type Middleware, type RouteDefinition, type RouteEntry } from "@ramonyx/core";
import { RouteManifestError } from "./errors.ts";
import { type ModuleImporter, nativeImporter } from "./import.ts";
import { ancestorDirs, scanDirectories } from "./pages.ts";

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

/** Segmen route group `(grup)` — organisasi folder tanpa segmen URL (ADR-0061). */
const ROUTE_GROUP = /^\(.+\)$/;

function toRoutePath(parts: readonly string[]): string {
  const segments = parts.filter((part) => !ROUTE_GROUP.test(part));
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
  /** File middleware per-folder (root → terdalam) untuk rute ini (ADR-0061). */
  readonly middlewareFiles: readonly string[];
}

/**
 * Daftar file `src/routes/api/**` beserta method yang diekspor (memvalidasi ekspor).
 * Dipakai `createRouteManifest` (runtime Node) dan codegen entry server/edge.
 */
export async function listApiRoutes(options: CreateRouteManifestOptions): Promise<ApiRouteFile[]> {
  const apiDir = options.apiDir ?? "api";
  const importer = options.importer ?? nativeImporter;
  const files = await collectRouteFiles(options.dir, apiDir);
  const directories = await scanDirectories(options.dir, apiDir);
  const result: ApiRouteFile[] = [];

  for (const file of files) {
    const module = await importer(file.absolute, `route ${file.routePath}`);
    const methods = HTTP_METHODS.filter((method) => module[method] !== undefined);
    if (methods.length === 0) {
      throw new RouteManifestError(
        `Route ${file.routePath} (${file.absolute}) tidak mengekspor HTTP method. Ekspor salah satu: ${HTTP_METHODS.join(", ")}. ${errorHint("RMX-ROUTES-4")}`,
      );
    }
    const middlewareFiles = ancestorDirs(options.dir, dirname(file.absolute))
      .map((ancestor) => directories.get(ancestor)?.middleware)
      .filter((entry): entry is string => entry !== undefined);
    result.push({ file: file.absolute, routePath: file.routePath, methods, middlewareFiles });
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

  const middlewareCache = new Map<string, Middleware[]>();
  const loadMiddleware = async (file: string): Promise<Middleware[]> => {
    const cached = middlewareCache.get(file);
    if (cached !== undefined) {
      return cached;
    }
    const module = await importer(file, `middleware ${file}`);
    const exported = module.default;
    if (!Array.isArray(exported) || !exported.every((item) => typeof item === "function")) {
      throw new RouteManifestError(
        `Middleware ${file} harus mengekspor array fungsi: \`export default [fn, ...] satisfies Middleware[]\`.`,
      );
    }
    const list = exported as Middleware[];
    middlewareCache.set(file, list);
    return list;
  };

  for (const file of apiRoutes) {
    // Modul sudah termuat di `listApiRoutes` (cache importer) — ambil definisinya.
    const module = await importer(file.file, `route ${file.routePath}`);
    const middlewares: Middleware[] = [];
    for (const middlewareFile of file.middlewareFiles) {
      middlewares.push(...(await loadMiddleware(middlewareFile)));
    }
    for (const method of file.methods) {
      const definition = module[method];
      if (!isRouteDefinition(definition)) {
        throw new RouteManifestError(
          `Ekspor ${method} di ${file.routePath} bukan definisi route yang valid (butuh objek dengan fungsi "handler"). ${errorHint("RMX-ROUTES-5")}`,
        );
      }
      entries.push({ method, path: file.routePath, definition, middlewares });
    }
  }

  return entries;
}
