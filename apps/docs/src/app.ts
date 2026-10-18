import { fileURLToPath } from "node:url";
import { createRouteManifest, loadPageRoutes } from "@ramonyx/compiler";
import { createReactRenderer } from "@ramonyx/react";
import { createHandler } from "@ramonyx/server";
import { createPageRoutes } from "@ramonyx/ssr";
import type { FetchHandler } from "ramonyx";

import { setCatalog } from "./catalog.ts";
import { loadCatalog } from "./docs.ts";
import { document as documentRenderer } from "./document.ts";
import middleware from "./routes/middleware.ts";

/**
 * Situs dokumentasi Ramonyx — dogfood penuh: halaman SSR React dengan **hydration +
 * soft navigation** (klien dibangun `build.ts`) atas berkas markdown di `docs/**`.
 */
export async function createApp(): Promise<FetchHandler> {
  // Katalog diisi sekali di server (markdown → HTML) → modul halaman tetap browser-safe.
  setCatalog(loadCatalog());

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
        document: documentRenderer,
        client: { script: "/assets/client.js" },
      }),
    ],
    middleware,
  });
}
