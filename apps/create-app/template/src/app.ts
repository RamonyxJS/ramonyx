import { fileURLToPath } from "node:url";
import { serveStatic } from "@ramonyx/adapter-runtime";
import { createAssetResolver } from "@ramonyx/bundler";
import { createRouteManifest, loadPageRoutes, type ModuleImporter } from "@ramonyx/compiler";
import { createReactRenderer } from "@ramonyx/react";
import { createHandler } from "@ramonyx/server";
import { createPageRoutes, createSeoRoutes } from "@ramonyx/ssr";
import type { AppHooks, FetchHandler } from "ramonyx";

// Aset statis hanya untuk host Node (edge: platform menyajikan aset; `middleware.ts` tetap
// edge-safe agar `ramonyx build --target edge` bisa membundelnya — ADR-0058).
const clientDir = fileURLToPath(new URL("../dist/client", import.meta.url));
// Resolver aset (ADR-0069): produksi memakai manifest (ber-hash); dev memakai fallback
// (`fallbackToPath`) yang disajikan Vite dari `src/assets/**`.
const assets = await createAssetResolver(clientDir, { fallbackToPath: true });
const staticAssets = serveStatic({
  dir: clientDir,
  prefix: "/assets",
  immutable: true,
  headers: { "x-content-type-options": "nosniff" },
});

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
  /** Cache data loader (ADR-0066) — halaman ber-`revalidate` memakainya. */
  readonly cache?: import("ramonyx").Cache;
  /** Hook aplikasi (plugin/CLI — ADR-0065/0067). */
  readonly hooks?: AppHooks;
}

/**
 * Aplikasi __APP_NAME__: route API + halaman SSR React dari `src/routes` (file routing),
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
    // /sitemap.xml + /robots.txt dari manifest halaman (ADR-0059).
    const seoRoutes = await createSeoRoutes({ pages });

    return createHandler({
      routes: [
        ...apiRoutes,
        ...seoRoutes,
        ...createPageRoutes({
          pages,
          renderer: createReactRenderer(),
          client,
          streaming: options.streaming,
          cache: options.cache,
          hooks: options.hooks,
          assets,
        }),
      ],
      middleware: [staticAssets],
      strictValidation: options.strictValidation,
      hooks: options.hooks,
    });
  };

  if (options.reloadManifests === true) {
    return async (request) => (await build())(request);
  }
  return build();
}
