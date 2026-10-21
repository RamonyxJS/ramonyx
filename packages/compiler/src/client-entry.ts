import { relative, sep } from "node:path";
import type { LoadedPage } from "@ramonyx/core";
import { RouteManifestError } from "./errors.ts";

export interface GenerateClientEntryOptions {
  /** Direktori tempat file entry ditulis (dipakai untuk impor relatif). */
  readonly from: string;
}

function toImportSpecifier(from: string, file: string): string {
  const rel = relative(from, file).split(sep).join("/");
  return rel.startsWith(".") ? rel : `./${rel}`;
}

/**
 * Menghasilkan entry client (`hydrateAll` + registry halaman).
 * Setiap halaman/layout dimuat lewat dynamic import, sehingga bundler memecah chunk per rute;
 * halaman aktif di-load saat hydration/navigasi, bukan seluruh registry di awal.
 */
export function generateClientEntry(
  pages: readonly LoadedPage[],
  options: GenerateClientEntryOptions,
): string {
  const loaders: string[] = [];
  const loaderVars = new Map<string, string>();

  const loaderFor = (file: string): string => {
    const existing = loaderVars.get(file);
    if (existing !== undefined) {
      return existing;
    }
    const name = `l${loaderVars.size}`;
    loaderVars.set(file, name);
    loaders.push(
      `const ${name} = () => import(${JSON.stringify(toImportSpecifier(options.from, file))});`,
    );
    return name;
  };

  const registry = pages.map((page) => {
    if (page.pageFile === undefined) {
      throw new RouteManifestError(
        `Halaman ${page.path} tidak punya pageFile; jalankan loadPageRoutes() dulu sebelum generateClientEntry().`,
      );
    }
    const pageLoader = loaderFor(page.pageFile);
    const layoutLoaders = (page.layoutFiles ?? []).map((file) => loaderFor(file));
    const all = [pageLoader, ...layoutLoaders];
    const names = all.map((_, index) => (index === 0 ? "page" : `layout${index - 1}`));
    return [
      `  ${JSON.stringify(page.path)}: async () => {`,
      `    const [${names.join(", ")}] = await Promise.all([${all.map((name) => `${name}()`).join(", ")}]);`,
      `    return { page, layouts: [${layoutLoaders.map((_, index) => `layout${index}`).join(", ")}] };`,
      "  },",
    ].join("\n");
  });

  return [
    "// File ini digenerate otomatis oleh @ramonyx/compiler — jangan diedit manual.",
    'import { enableClientNavigation, hydrateAll } from "@ramonyx/react/client";',
    ...loaders,
    "",
    "const registry = {",
    ...registry,
    "};",
    "",
    "void hydrateAll(registry);",
    "enableClientNavigation(registry);",
    "",
  ].join("\n");
}
