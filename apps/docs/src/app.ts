import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { serveStatic } from "@ramonyx/adapter-runtime";
import { readClientScript } from "@ramonyx/bundler";
import { createRouteManifest, loadPageRoutes } from "@ramonyx/compiler";
import { createReactRenderer } from "@ramonyx/react";
import { createHandler } from "@ramonyx/server";
import { createPageRoutes } from "@ramonyx/ssr";
import type { AppHooks, FetchHandler } from "ramonyx";

import { setCatalog } from "./catalog.ts";
import { loadCatalog } from "./docs.ts";
import { createDocument } from "./document.ts";

const clientDir = fileURLToPath(new URL("../dist/client", import.meta.url));
// Pre-routing (global): aset statis Node-only. Middleware aplikasi ada di
// `src/routes/middleware.ts` (per-folder, otomatis — ADR-0061).
const staticAssets = serveStatic({
  dir: clientDir,
  prefix: "/assets",
  immutable: true,
  headers: { "x-content-type-options": "nosniff" },
});

/**
 * Situs dokumentasi Ramonyx — dogfood penuh: halaman SSR React dengan **hydration +
 * soft navigation** (klien dibangun `build.ts`) atas berkas markdown di `docs/**`.
 */
export interface CreateAppOptions {
  /** Prefix URL saat di-host di subpath (mis. `/ramonyx` di GitHub Pages) — ADR-0052. */
  readonly basePath?: string;
  /** Hook aplikasi (plugin/CLI — ADR-0065/0067). */
  readonly hooks?: AppHooks;
}

export async function createApp(options: CreateAppOptions = {}): Promise<FetchHandler> {
  // Katalog diisi sekali di server (markdown → HTML) → modul halaman tetap browser-safe.
  setCatalog(loadCatalog());

  const basePath = (options.basePath ?? "").replace(/\/$/, "");
  const dir = fileURLToPath(new URL("./routes", import.meta.url));
  const appDir = fileURLToPath(new URL("..", import.meta.url));
  // Nama bundle ber-hash dari manifest build (ADR-0055) — diekspor/dijalankan setelah build.
  const clientScript = `${basePath}${await readClientScript(join(appDir, "dist/client"))}`;

  const [apiRoutes, pages] = await Promise.all([
    createRouteManifest({ dir }),
    loadPageRoutes({ dir }),
  ]);

  return createHandler({
    strictValidation: true,
    routes: [
      ...apiRoutes,
      ...createPageRoutes({
        pages,
        renderer: createReactRenderer(),
        document: createDocument(basePath),
        client: { script: clientScript },
        hooks: options.hooks,
      }),
    ],
    middleware: [staticAssets],
    hooks: options.hooks,
  });
}
