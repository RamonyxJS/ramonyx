import { fileURLToPath } from "node:url";
import { createRouteManifest, loadPageRoutes } from "@ramonyx/compiler";
import { createReactRenderer } from "@ramonyx/react";
import { createHandler } from "@ramonyx/server";
import { createPageRoutes } from "@ramonyx/ssr";
import type { FetchHandler } from "ramonyx";

import { setCatalog } from "./catalog.ts";
import { loadCatalog } from "./docs.ts";
import { createDocument } from "./document.ts";
import middleware from "./routes/middleware.ts";

/**
 * Situs dokumentasi Ramonyx — dogfood penuh: halaman SSR React dengan **hydration +
 * soft navigation** (klien dibangun `build.ts`) atas berkas markdown di `docs/**`.
 */
export interface CreateAppOptions {
  /** Prefix URL saat di-host di subpath (mis. `/ramonyx` di GitHub Pages) — ADR-0052. */
  readonly basePath?: string;
}

export async function createApp(options: CreateAppOptions = {}): Promise<FetchHandler> {
  // Katalog diisi sekali di server (markdown → HTML) → modul halaman tetap browser-safe.
  setCatalog(loadCatalog());

  const basePath = (options.basePath ?? "").replace(/\/$/, "");
  const dir = fileURLToPath(new URL("./routes", import.meta.url));

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
        client: { script: `${basePath}/assets/client.js` },
      }),
    ],
    middleware,
  });
}
