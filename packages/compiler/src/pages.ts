import type { Dirent } from "node:fs";
import { readdir } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import type { LoadedPage, PageModule } from "@ramonyx/core";
import { RouteManifestError } from "./errors.ts";
import { type ModuleImporter, nativeImporter } from "./import.ts";

const PAGE_FILE = /^(page|layout|error)\.(tsx|ts)$/;

export interface LoadPageRoutesOptions {
  /** Direktori `src/routes` aplikasi. */
  readonly dir: string;
  /** Subdirektori API yang dilewati (default "api"). */
  readonly apiDir?: string;
  /** Cara memuat modul halaman (default: import Node; dev server memakai ssrLoadModule Vite). */
  readonly importer?: ModuleImporter;
}

type FileKind = "page" | "layout" | "error";

interface DirectoryFiles {
  page?: string;
  layout?: string;
  error?: string;
}

function routePathForDir(dir: string, target: string): string {
  const parts = relative(dir, target)
    .split(sep)
    .filter((part) => part.length > 0);
  return parts.length === 0 ? "/" : `/${parts.join("/")}`;
}

/** [dir, ...turun sampai target] — terluar → terdalam. */
function ancestorDirs(dir: string, target: string): string[] {
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

async function scanDirectories(dir: string, apiDir: string): Promise<Map<string, DirectoryFiles>> {
  let dirents: Dirent[];
  try {
    dirents = await readdir(dir, { withFileTypes: true, recursive: true });
  } catch (error) {
    throw new RouteManifestError(
      `Tidak bisa membaca direktori route "${dir}": ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }

  const directories = new Map<string, DirectoryFiles>();
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
      `${label} (${absolute}) tidak punya default export (komponen halaman/layout/error).`,
    );
  }
  return module as PageModule;
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
    });
  }

  return pages;
}
