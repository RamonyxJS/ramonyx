import { fileURLToPath } from "node:url";
import { createRouteManifest, loadPageRoutes } from "@ramonyx/compiler";
import { createReactRenderer } from "@ramonyx/react";
import { createHandler } from "@ramonyx/server";
import { createPageRoutes } from "@ramonyx/ssr";
import type { FetchHandler } from "ramonyx";

import middleware from "./routes/middleware.ts";

/**
 * Aplikasi __APP_NAME__: route API + halaman SSR React dari `src/routes` (file routing),
 * dengan hydration klien (`/assets/client.js` — jalankan `pnpm build` dulu).
 *
 * Konvensi folder `src/routes`:
 * - `page.tsx` — halaman (loader + komponen React; boleh `layout.tsx`, `error.tsx`);
 * - `api/*.ts` — route API (`export const GET = route({ ... })`).
 */
export async function createApp(): Promise<FetchHandler> {
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
        client: { script: "/assets/client.js" },
      }),
    ],
    middleware,
  });
}
