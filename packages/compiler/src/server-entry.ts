// Codegen entry **server/edge** (ADR-0058): manifest rute dibangun dari impor statis —
// tanpa `node:fs` saat runtime — sehingga bundel dapat berjalan di platform edge/serverless
// (kontrak `fetch(request) → Response`).

import { relative, sep } from "node:path";
import type { AssetInfo, LoadedPage } from "@ramonyx/core";
import type { ApiRouteFile } from "./manifest.ts";

export interface GenerateServerEntryOptions {
  /** Direktori tempat file entry ditulis (dipakai impor relatif). */
  readonly from: string;
  readonly pages: readonly LoadedPage[];
  readonly apiRoutes: readonly ApiRouteFile[];
  /** File middleware (default export array `Middleware[]`), bila ada. */
  readonly middlewareFile?: string;
  /** URL bundle klien untuk hydration (mis. `/assets/client-<hash>.js`). */
  readonly clientScript?: string;
  /** Aktifkan SSR streaming (renderer React mendukung `renderStream`). */
  readonly streaming?: boolean;
  /**
   * Peta aset (path relatif → `AssetInfo`: URL + dimensi + varian) di-inline ke entry —
   * artefak edge tidak punya filesystem untuk membaca manifest (ADR-0069/0079).
   */
  readonly assets?: Readonly<Record<string, AssetInfo>>;
}

function toImportSpecifier(from: string, file: string): string {
  const rel = relative(from, file).split(sep).join("/");
  return rel.startsWith(".") ? rel : `./${rel}`;
}

/**
 * Menghasilkan entry server/edge: impor statis semua halaman + route API + middleware,
 * lalu ekspor `{ fetch }` (default export) siap dipakai platform edge/serverless.
 */
export function generateServerEntry(options: GenerateServerEntryOptions): string {
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

  const pages = options.pages.map((page) => {
    if (page.pageFile === undefined) {
      throw new Error(
        `Halaman ${page.path} tidak punya pageFile; jalankan loadPageRoutes() dulu sebelum generateServerEntry().`,
      );
    }
    const pageVar = varFor(page.pageFile);
    const layoutVars = (page.layoutFiles ?? []).map((file) => varFor(file));
    const errorVar = page.errorFile === undefined ? "undefined" : varFor(page.errorFile);
    const middlewareVars = (page.middlewareFiles ?? []).map((file) => varFor(file));
    return [
      "  {",
      `    path: ${JSON.stringify(page.path)},`,
      `    page: ${pageVar},`,
      `    layouts: [${layoutVars.join(", ")}],`,
      `    error: ${errorVar},`,
      `    directory: ${JSON.stringify(page.directory)},`,
      `    pageFile: ${JSON.stringify(page.pageFile)},`,
      `    layoutFiles: ${JSON.stringify(page.layoutFiles ?? [])},`,
      `    middlewares: [${middlewareVars.map((name) => `...${name}.default`).join(", ")}],`,
      page.errorFile === undefined ? null : `    errorFile: ${JSON.stringify(page.errorFile)},`,
      "  },",
    ]
      .filter((line): line is string => line !== null)
      .join("\n");
  });

  const apiEntries: string[] = [];
  for (const route of options.apiRoutes) {
    const apiVar = varFor(route.file);
    const middlewareVars = route.middlewareFiles.map((file) => varFor(file));
    const middlewareList = middlewareVars.map((name) => `...${name}.default`).join(", ");
    for (const method of route.methods) {
      apiEntries.push(
        `  { method: ${JSON.stringify(method)}, path: ${JSON.stringify(route.routePath)}, middlewares: [${middlewareList}], definition: ${apiVar}[${JSON.stringify(method)}] },`,
      );
    }
  }

  let middlewareVar: string | undefined;
  if (options.middlewareFile !== undefined) {
    middlewareVar = varFor(options.middlewareFile);
  }

  return [
    "// File ini digenerate otomatis oleh @ramonyx/compiler — jangan diedit manual.",
    'import { createAssetResolverFromMap } from "@ramonyx/core";',
    'import { createHandler } from "@ramonyx/server";',
    'import { createReactRenderer } from "@ramonyx/react";',
    'import { createPageRoutes } from "@ramonyx/ssr";',
    ...imports,
    "",
    "const pages = [",
    ...pages,
    "];",
    "",
    "const apiRoutes = [",
    ...apiEntries,
    "];",
    "",
    "// Binding platform (KV/secret) diteruskan per request — ADR-0068.",
    "const envMap = new WeakMap();",
    "const envFromRequest = (request) => {",
    "  const binding = envMap.get(request);",
    "  if (binding === undefined) return undefined;",
    "  return {",
    '    get: (name) => (typeof binding[name] === "string" ? binding[name] : undefined),',
    "    getRaw: (name) => binding[name],",
    "  };",
    "};",
    "",
    options.assets === undefined || Object.keys(options.assets).length === 0
      ? null
      : `const assetMap = ${JSON.stringify(options.assets)};`,
    options.assets === undefined || Object.keys(options.assets).length === 0
      ? null
      : "const assets = createAssetResolverFromMap(assetMap);",
    "",
    "const handler = createHandler({",
    "  routes: [",
    "    ...apiRoutes,",
    "    ...createPageRoutes({",
    "      pages,",
    "      renderer: createReactRenderer(),",
    options.clientScript === undefined
      ? null
      : `      client: { script: ${JSON.stringify(options.clientScript)} },`,
    options.streaming === true ? "      streaming: true," : null,
    options.assets === undefined || Object.keys(options.assets).length === 0
      ? null
      : "      assets,",
    "    }),",
    "  ],",
    middlewareVar === undefined ? null : `  middleware: ${middlewareVar}.default,`,
    "  envFromRequest,",
    "});",
    "",
    "/** Handler fetch standar — kontrak platform edge/serverless (ADR-0058/0068). */",
    "export const fetch = (request, env) => {",
    "  if (env !== undefined && env !== null) {",
    "    envMap.set(request, env);",
    "  }",
    "  return handler(request);",
    "};",
    "",
    "export default { fetch };",
  ]
    .filter((line): line is string => line !== null)
    .join("\n")
    .concat("\n");
}
