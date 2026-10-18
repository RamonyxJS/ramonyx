import { fileURLToPath } from "node:url";
import { serveStatic } from "@ramonyx/adapter-runtime";
import { createRouteManifest, loadPageRoutes, type ModuleImporter } from "@ramonyx/compiler";
import { createReactRenderer } from "@ramonyx/react";
import { createHandler } from "@ramonyx/server";
import { createPageRoutes } from "@ramonyx/ssr";
import type { FetchHandler } from "ramonyx";

import middleware from "./routes/middleware.ts";

// Aset statis hanya untuk host Node (edge: platform menyajikan aset; `middleware.ts` tetap
// edge-safe agar `ramonyx build --target edge` bisa membundelnya — ADR-0058).
const clientDir = fileURLToPath(new URL("../dist/client", import.meta.url));
const staticAssets = serveStatic({ dir: clientDir, prefix: "/assets", immutable: true });

export interface CreateAppOptions {
  /** URL bundle klien (produksi "/assets/client.js"; dev via entry Vite). */
  readonly clientScript?: string;
  /** Modul tambahan sebelum entry (mis. "/@vite/client"). */
  readonly clientModules?: readonly string[];
  /** Importer modul (dev: module graph Vite). */
  readonly importer?: ModuleImporter;
  /** Bangun ulang manifest tiap request (dev, tanpa restart). */
  readonly reloadManifests?: boolean;
  readonly strictValidation?: boolean;
  /** SSR streaming untuk halaman (ADR-0047). */
  readonly streaming?: boolean;
}

/**
 * Aplikasi .tmp-edge: route API + halaman SSR React dari `src/routes` (file routing),
 * dengan hydration klien.
 *
 * Dijalankan lewat CLI: `ramonyx dev` (Vite + HMR), `ramonyx build` (bundle klien),
 * `ramonyx start` (produksi — `NODE_ENV=production` otomatis).
 */
export async function createApp(options: CreateAppOptions = {}): Promise<FetchHandler> {
  const dir = fileURLToPath(new URL("./routes", import.meta.url));
  const client =
    options.clientScript === undefined
      ? undefined
      : { script: options.clientScript, extraModules: options.clientModules };

  const build = async (): Promise<FetchHandler> => {
    const [apiRoutes, pages] = await Promise.all([
      createRouteManifest({ dir, importer: options.importer }),
      loadPageRoutes({ dir, importer: options.importer }),
    ]);

    return createHandler({
      routes: [
        ...apiRoutes,
        ...createPageRoutes({
          pages,
          renderer: createReactRenderer(),
          client,
          streaming: options.streaming,
        }),
      ],
      middleware: [...middleware, staticAssets],
      strictValidation: options.strictValidation,
    });
  };

  if (options.reloadManifests === true) {
    return async (request) => (await build())(request);
  }
  return build();
}
