import { fileURLToPath } from "node:url";
import { serveStatic } from "@ramonyx/adapter-runtime";
import { createAssetResolver } from "@ramonyx/bundler";
import { createRouteManifest, loadPageRoutes, type ModuleImporter } from "@ramonyx/compiler";
import { createReactRenderer } from "@ramonyx/react";
import {
  createHandler,
  createMetrics,
  createMetricsRoute,
  requestLogging,
  traceId,
} from "@ramonyx/server";
import { createPageRoutes } from "@ramonyx/ssr";
import { type AppHooks, type EnvReader, type FetchHandler, type Logger, mergeHooks } from "ramonyx";

// Middleware pre-routing (global): aset statis (Node-only) + logging request.
// Middleware aplikasi ada di `src/routes/middleware.ts` (per-folder, otomatis — ADR-0061).
const clientDir = fileURLToPath(new URL("../dist/client", import.meta.url));
const staticAssets = serveStatic({
  dir: clientDir,
  prefix: "/assets",
  immutable: true,
  headers: { "x-content-type-options": "nosniff" },
});

// Observability (ADR-0071): trace-id + log terstruktur dari paket server.
const observabilityMiddleware = [traceId(), requestLogging()];

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
  /** Cache data loader (ADR-0066) — halaman ber-`revalidate` memakainya. */
  readonly cache?: import("ramonyx").Cache;
  /** Hook aplikasi (plugin/CLI — ADR-0065/0067). */
  readonly hooks?: AppHooks;
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
    // Metrik dasar (ADR-0071) — digabung dengan hook aplikasi/plugin.
    const metrics = createMetrics();
    const hooks = mergeHooks(options.hooks, metrics.hooks);
    // Resolver aset (ADR-0069/0079): produksi memakai manifest ber-hash + varian gambar;
    // dev memakai fallback path (Vite menyajikan `src/assets/**` apa adanya).
    const assets = await createAssetResolver(clientDir, { fallbackToPath: true });
    const pageRoutes = createPageRoutes({
      pages,
      renderer: createReactRenderer(),
      client,
      streaming: options.streaming,
      cache: options.cache,
      hooks,
      assets,
      // Routing locale (ADR-0081): default `id` tanpa prefix, `en` berprefix `/en/...`.
      i18n: { locales: ["id", "en"], defaultLocale: "id" },
    });

    return createHandler({
      routes: [...apiRoutes, createMetricsRoute(metrics), ...pageRoutes],
      middleware: [...observabilityMiddleware, staticAssets],
      env: options.env,
      logger: options.logger,
      strictValidation: options.strictValidation,
      hooks,
    });
  };

  if (options.reloadManifests !== true) {
    return build();
  }
  return async (request) => (await build())(request);
}
