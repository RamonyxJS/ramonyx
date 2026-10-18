// Static generation (SSG) — ADR-0056: render rute menjadi HTML saat build.
//
// Dipakai `ramonyx build --static` (CLI) dan aplikasi yang mengekspor sendiri
// (mis. situs docs: `apps/docs/export.ts`). Handler aplikasi dijalankan dengan request
// sintetis sehingga paritas SSR ↔ statis terjaga (satu pipeline, bukan renderer kedua).

import { cp, mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  type FetchHandler,
  fillRouteParams,
  hasDynamicSegment,
  type LoadedPage,
} from "@ramonyx/core";

export interface PrerenderOptions {
  /** Handler aplikasi (hasil `createApp()` dengan `clientScript` produksi). */
  readonly handler: FetchHandler;
  /** Halaman hasil `loadPageRoutes` (untuk enumerasi rute statis + `getStaticPaths`). */
  readonly pages: readonly LoadedPage[];
  /** Direktori keluaran (mis. `dist/static`). */
  readonly outDir: string;
  /** Rute tambahan eksplisit (mis. dari enumerasi aplikasi sendiri). */
  readonly paths?: readonly string[];
  /** Sertakan rute statis (tanpa param) dari manifest; default true. */
  readonly includeStaticPages?: boolean;
  /** Path sintetis untuk halaman 404; default `/__ramonyx-404__`. */
  readonly notFoundPath?: string;
  /** Salin direktori aset klien ke `<outDir>/assets`. */
  readonly clientDir?: string;
  /** Tulis `.nojekyll` (hosting GitHub Pages). */
  readonly nojekyll?: boolean;
  /** Origin sintetis untuk request prerender. */
  readonly origin?: string;
  /** Transformasi HTML per rute (mis. menyuntik link discovery agen). */
  readonly transformHtml?: (html: string, routePath: string) => string;
  /** Tulis `<rute>/index.html` (default true) atau `<rute>.html`. */
  readonly directoryIndex?: boolean;
}

export interface PrerenderRouteInfo {
  readonly path: string;
  readonly file: string;
  readonly status: number;
  readonly bytes: number;
}

export interface PrerenderResult {
  readonly routes: readonly PrerenderRouteInfo[];
  readonly skipped: readonly { readonly path: string; readonly reason: string }[];
  readonly notFoundFile: string | null;
}

function routeToFile(outDir: string, route: string, directoryIndex: boolean): string {
  if (route === "" || route === "/") {
    return join(outDir, "index.html");
  }
  const clean = route.replace(/^\//, "").replace(/\/$/, "");
  return directoryIndex ? join(outDir, clean, "index.html") : join(outDir, `${clean}.html`);
}

/**
 * Render rute → HTML statis di `outDir`.
 *
 * - Rute statis (tanpa param) dari manifest ikut kecuali `page.prerender === false`.
 * - Rute dinamis dienumerasi lewat `getStaticPaths` (bila ada) + `paths` eksplisit.
 * - Halaman 404 ditulis dari `notFoundPath`; aset klien disalin bila `clientDir` diisi.
 * - Status non-2xx pada rute = error build (kecuali halaman 404 yang memang non-2xx?
 *   tidak: 404 harus 404; kegagalan lain menggagalkan build dengan pesan jelas).
 */
export async function prerenderRoutes(options: PrerenderOptions): Promise<PrerenderResult> {
  const origin = options.origin ?? "http://prerender.local";
  const directoryIndex = options.directoryIndex ?? true;
  const includeStatic = options.includeStaticPages ?? true;

  const routes = new Set<string>();
  const skipped: Array<{ path: string; reason: string }> = [];

  for (const page of options.pages) {
    const prerender = page.page.prerender;
    if (prerender === false) {
      skipped.push({ path: page.path, reason: "prerender: false" });
      continue;
    }
    if (!hasDynamicSegment(page.path)) {
      if (includeStatic) {
        routes.add(page.path);
      }
      continue;
    }
    const enumerate = page.page.getStaticPaths;
    if (enumerate === undefined) {
      skipped.push({ path: page.path, reason: "rute dinamis tanpa getStaticPaths" });
      continue;
    }
    for (const params of await enumerate()) {
      const filled = fillRouteParams(page.path, params);
      if (filled === null) {
        skipped.push({ path: page.path, reason: `param kurang: ${JSON.stringify(params)}` });
        continue;
      }
      routes.add(filled);
    }
  }
  for (const path of options.paths ?? []) {
    routes.add(path);
  }

  const rendered: PrerenderRouteInfo[] = [];
  for (const route of [...routes].sort()) {
    const response = await options.handler(new Request(new URL(route, origin)));
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html")) {
      throw new Error(
        `prerender ${route}: respons bukan HTML (content-type: ${contentType || "kosong"}, status ${response.status})`,
      );
    }
    const html = await response.text();
    if (response.status >= 400) {
      const cuplikan = html.replace(/\s+/g, " ").slice(0, 200);
      throw new Error(
        `prerender ${route}: status ${response.status} (halaman harus 2xx) — ${cuplikan}`,
      );
    }
    const file = routeToFile(options.outDir, route, directoryIndex);
    await mkdir(dirname(file), { recursive: true });
    const output = options.transformHtml === undefined ? html : options.transformHtml(html, route);
    await writeFile(file, output);
    rendered.push({
      path: route,
      file,
      status: response.status,
      bytes: Buffer.byteLength(output),
    });
  }

  let notFoundFile: string | null = null;
  if (options.notFoundPath !== undefined) {
    const response = await options.handler(new Request(new URL(options.notFoundPath, origin)));
    if (response.status !== 404) {
      throw new Error(
        `prerender 404: path "${options.notFoundPath}" menghasilkan status ${response.status} (harus 404)`,
      );
    }
    notFoundFile = join(options.outDir, "404.html");
    const html = await response.text();
    const output =
      options.transformHtml === undefined
        ? html
        : options.transformHtml(html, options.notFoundPath);
    await writeFile(notFoundFile, output);
  }

  if (options.clientDir !== undefined) {
    await cp(options.clientDir, join(options.outDir, "assets"), { recursive: true });
  }
  if (options.nojekyll === true) {
    await writeFile(join(options.outDir, ".nojekyll"), "");
  }

  return { routes: rendered, skipped, notFoundFile };
}
