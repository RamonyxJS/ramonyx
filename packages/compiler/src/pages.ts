import type { Dirent } from "node:fs";
import { readdir } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { errorHint, type LoadedPage, type Middleware, type PageModule } from "@ramonyx/core";
import { RouteManifestError } from "./errors.ts";
import { type ModuleImporter, nativeImporter } from "./import.ts";

const PAGE_FILE = /^(page|layout|error|middleware)\.(tsx|ts)$/;

export interface LoadPageRoutesOptions {
  /** Direktori `src/routes` aplikasi. */
  readonly dir: string;
  /** Subdirektori API yang dilewati (default "api"). */
  readonly apiDir?: string;
  /** Cara memuat modul halaman (default: import Node; dev server memakai ssrLoadModule Vite). */
  readonly importer?: ModuleImporter;
}

type FileKind = "page" | "layout" | "error" | "middleware";

/** Segmen route group `(grup)` — organisasi folder tanpa segmen URL (ADR-0061). */
const ROUTE_GROUP = /^\(.+\)$/;

function routePathForDir(dir: string, target: string): string {
  const parts = relative(dir, target)
    .split(sep)
    .filter((part) => part.length > 0 && !ROUTE_GROUP.test(part));
  return parts.length === 0 ? "/" : `/${parts.join("/")}`;
}

/** [dir, ...turun sampai target] — terluar → terdalam (dipakai juga manifest API). */
export function ancestorDirs(dir: string, target: string): string[] {
  const parts = relative(dir, target)
    .split(sep)
    .filter((part) => part.length > 0);
  const result = [dir];
  for (const part of parts) {
    const parent = result.at(-1);
    if (parent === undefined) {
      break;
    }
    result.push(join(parent, part));
  }
  return result;
}

export interface ScannedDirectory {
  page?: string;
  layout?: string;
  error?: string;
  middleware?: string;
}

export async function scanDirectories(
  dir: string,
  apiDir: string,
): Promise<Map<string, ScannedDirectory>> {
  let dirents: Dirent[];
  try {
    dirents = await readdir(dir, { withFileTypes: true, recursive: true });
  } catch (error) {
    throw new RouteManifestError(
      `Tidak bisa membaca direktori route "${dir}": ${error instanceof Error ? error.message : String(error)} ${errorHint("RMX-ROUTES-1")}`,
      { cause: error },
    );
  }

  const directories = new Map<string, ScannedDirectory>();
  for (const dirent of dirents) {
    if (!dirent.isFile()) {
      continue;
    }
    const kind = PAGE_FILE.exec(dirent.name)?.[1] as FileKind | undefined;
    if (kind === undefined) {
      continue;
    }

    const absolute = join(dirent.parentPath, dirent.name);
    const parts = relative(dir, absolute).split(sep);
    if (parts.some((part) => part.startsWith("_"))) {
      continue;
    }
    if (parts[0] === apiDir) {
      continue;
    }

    const bucket = directories.get(dirent.parentPath) ?? {};
    bucket[kind] = absolute;
    directories.set(dirent.parentPath, bucket);
  }
  return directories;
}

async function loadPageModule(
  absolute: string,
  label: string,
  importer: ModuleImporter,
): Promise<PageModule> {
  const module = await importer(absolute, label);
  if (module.default === undefined) {
    throw new RouteManifestError(
      `${label} (${absolute}) tidak punya default export (komponen halaman/layout/error). ${errorHint("RMX-ROUTES-2")}`,
    );
  }
  return module as PageModule;
}

/**
 * Hasilkan modul `.ramonyx/routes.ts` (typed routes — ADR-0073): peta `RouteParamsMap` dari
 * pola rute + `routeHref` bertipe yang membungkus `fillHref` runtime.
 *
 * Modul nyata (bukan `.d.ts` + augmentasi): TS 7 tidak merge augmentasi modul paket di proyek
 * yang sama (duplicate identifier) — modul generate memberi jaminan tipe yang sama tanpa itu.
 */
export function generateRouteTypes(pages: readonly LoadedPage[]): string {
  const entries: string[] = [];
  for (const page of pages) {
    const names: string[] = [];
    for (const match of page.path.matchAll(/\[(?:\.\.\.)?([^\]]+)\]/g)) {
      if (match[1] !== undefined) {
        names.push(match[1]);
      }
    }
    if (names.length === 0) {
      entries.push(`    ${JSON.stringify(page.path)}: undefined;`);
    } else {
      const fields = names.map((name) => `${name}: string`).join("; ");
      entries.push(`    ${JSON.stringify(page.path)}: { ${fields} };`);
    }
  }
  return [
    "// File ini digenerate otomatis oleh @ramonyx/compiler (typed routes — ADR-0073).",
    "// Jangan diedit manual; jalankan `ramonyx build`/`ramonyx dev` untuk memperbarui.",
    'import { fillHref } from "@ramonyx/router";',
    "",
    "export type RouteParamsMap = {",
    ...entries,
    "};",
    "",
    "export type RoutePath = keyof RouteParamsMap;",
    "",
    "export function routeHref<P extends RoutePath>(",
    "  path: P,",
    "  ...args: RouteParamsMap[P] extends undefined ? [] : [params: RouteParamsMap[P]]",
    "): string {",
    "  return fillHref(path, args[0] as Record<string, string> | undefined);",
    "}",
    "",
  ].join("\n");
}

/**
 * Memindai halaman di `src/routes` (di luar `api/`).
 *
 * Konvensi: `page.tsx`/`page.ts` menentukan path (kolom `[param]` = parameter);
 * `layout.tsx` berlaku untuk halaman di direktorinya dan turunannya (root → dalam);
 * `error.tsx` terdekat (naik ke root) dipakai saat render/loader gagal;
 * file/direktori berawalan `_` diabaikan.
 */
export async function loadPageRoutes(options: LoadPageRoutesOptions): Promise<LoadedPage[]> {
  const dir = options.dir;
  const apiDir = options.apiDir ?? "api";
  const importer = options.importer ?? nativeImporter;
  const directories = await scanDirectories(dir, apiDir);

  const pageDirs = [...directories.entries()]
    .filter(([, files]) => files.page !== undefined)
    .sort(([a], [b]) => a.localeCompare(b));

  const pages: LoadedPage[] = [];
  for (const [pageDir, files] of pageDirs) {
    const pageFile = files.page;
    if (pageFile === undefined) {
      continue;
    }
    const path = routePathForDir(dir, pageDir);
    const page = await loadPageModule(pageFile, `halaman ${path}`, importer);

    const layouts: PageModule[] = [];
    const layoutFiles: string[] = [];
    for (const ancestor of ancestorDirs(dir, pageDir)) {
      const layoutFile = directories.get(ancestor)?.layout;
      if (layoutFile !== undefined) {
        layouts.push(
          await loadPageModule(layoutFile, `layout ${routePathForDir(dir, ancestor)}`, importer),
        );
        layoutFiles.push(layoutFile);
      }
    }

    const middlewares: Middleware[] = [];
    const middlewareFiles: string[] = [];
    for (const ancestor of ancestorDirs(dir, pageDir)) {
      const middlewareFile = directories.get(ancestor)?.middleware;
      if (middlewareFile === undefined) {
        continue;
      }
      const module = await importer(middlewareFile, `middleware ${routePathForDir(dir, ancestor)}`);
      const exported = module.default;
      if (!Array.isArray(exported) || !exported.every((item) => typeof item === "function")) {
        throw new RouteManifestError(
          `Middleware ${routePathForDir(dir, ancestor)} (${middlewareFile}) harus mengekspor array fungsi: ` +
            `\`export default [fn, ...] satisfies Middleware[]\`. ${errorHint("RMX-ROUTES-3")}`,
        );
      }
      middlewares.push(...(exported as Middleware[]));
      middlewareFiles.push(middlewareFile);
    }

    let error: PageModule | undefined;
    let errorFile: string | undefined;
    for (const ancestor of ancestorDirs(dir, pageDir).reverse()) {
      const candidate = directories.get(ancestor)?.error;
      if (candidate !== undefined) {
        error = await loadPageModule(
          candidate,
          `error page ${routePathForDir(dir, ancestor)}`,
          importer,
        );
        errorFile = candidate;
        break;
      }
    }

    pages.push({
      path,
      page,
      layouts,
      error,
      directory: pageDir,
      pageFile,
      layoutFiles,
      errorFile,
      middlewares,
      middlewareFiles,
    });
  }

  return pages;
}
