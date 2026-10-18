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
 * Bundle client memuat semua halaman untuk sekarang; code splitting menyusul.
 */
export function generateClientEntry(
  pages: readonly LoadedPage[],
  options: GenerateClientEntryOptions,
): string {
  const imports: string[] = [];
  const vars = new Map<string, string>();

  const varFor = (file: string): string => {
    const existing = vars.get(file);
    if (existing !== undefined) {
      return existing;
    }
    const name = `m${vars.size}`;
    vars.set(file, name);
    imports.push(
      `import * as ${name} from ${JSON.stringify(toImportSpecifier(options.from, file))};`,
    );
    return name;
  };

  const registry = pages.map((page) => {
    if (page.pageFile === undefined) {
      throw new RouteManifestError(
        `Halaman ${page.path} tidak punya pageFile; jalankan loadPageRoutes() dulu sebelum generateClientEntry().`,
      );
    }
    const pageVar = varFor(page.pageFile);
    const layoutVars = (page.layoutFiles ?? []).map((file) => varFor(file));
    return `  ${JSON.stringify(page.path)}: { page: ${pageVar}, layouts: [${layoutVars.join(", ")}] },`;
  });

  return [
    "// File ini digenerate otomatis oleh @ramonyx/compiler — jangan diedit manual.",
    'import { hydrateAll } from "@ramonyx/react/client";',
    ...imports,
    "",
    "hydrateAll({",
    ...registry,
    "});",
    "",
  ].join("\n");
}
