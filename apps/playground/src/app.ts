import { fileURLToPath } from "node:url";
import { serveStatic } from "@ramonyx/adapter-runtime";
import { createRouteManifest, loadPageRoutes, type ModuleImporter } from "@ramonyx/compiler";
import { createReactRenderer } from "@ramonyx/react";
import { createHandler } from "@ramonyx/server";
import { createPageRoutes } from "@ramonyx/ssr";
import type { EnvReader, FetchHandler, Logger, Middleware } from "ramonyx";

// Middleware pre-routing (global): aset statis (Node-only) + logging request.
// Middleware aplikasi ada di `src/routes/middleware.ts` (per-folder, otomatis — ADR-0061).
const clientDir = fileURLToPath(new URL("../dist/client", import.meta.url));
const staticAssets = serveStatic({
  dir: clientDir,
  prefix: "/assets",
  immutable: true,
  headers: { "x-content-type-options": "nosniff" },
});

const requestLogger: Middleware = async (context, next) => {
  const started = performance.now();
  const response = await next();
  context.log.info("request", {
    method: context.request.method,
    path: new URL(context.request.url).pathname,
    status: response.status,
    ms: Math.round(performance.now() - started),
  });
  return response;
};

export interface CreateAppOptions {
  readonly env?: EnvReader;
  readonly logger?: Logger;
  readonly strictValidation?: boolean;
  /** Aktifkan hydration dengan entry client (produksi: "/assets/client.js"; dev: "/.ramonyx/client-entry.ts"). */
  readonly clientScript?: string;
  /** Modul tambahan sebelum entry (mis. "/@vite/client" di dev). */
  readonly clientModules?: readonly string[];
  /** Importer modul manifest/halaman (dev memakai `ssrLoadModule` Vite). */
  readonly importer?: ModuleImporter;
  /** Bangun ulang manifest tiap request (dev, tanpa restart). */
  readonly reloadManifests?: boolean;
  /** SSR streaming untuk halaman (butuh renderer `renderStream`; ADR-0047). */
  readonly streaming?: boolean;
}

/** Route API + halaman SSR dari `src/routes` → handler siap dilayani host apa pun. */
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
    const pageRoutes = createPageRoutes({
      pages,
      renderer: createReactRenderer(),
      client,
      streaming: options.streaming,
    });

    return createHandler({
      routes: [...apiRoutes, ...pageRoutes],
      middleware: [staticAssets, requestLogger],
      env: options.env,
      logger: options.logger,
      strictValidation: options.strictValidation,
    });
  };

  if (options.reloadManifests !== true) {
    return build();
  }
  return async (request) => (await build())(request);
}
