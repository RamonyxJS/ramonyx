import { existsSync } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { createServer as createHttpServer } from "node:http";
import { extname, join, relative } from "node:path";
import { createNodeRequestListener } from "@ramonyx/adapter-runtime";
import {
  generateClientEntry,
  listApiRoutes,
  loadPageRoutes,
  type ModuleImporter,
  RouteManifestError,
} from "@ramonyx/compiler";
import type { FetchHandler } from "@ramonyx/core";
import { createServer, type Plugin, type PluginOption } from "vite";
import { createDevtoolsCollector, type DevtoolsCollector, devtoolsPanelHtml } from "./devtools.ts";
import { readAssetManifest } from "./manifest.ts";
import { serverOnlyPlugin } from "./server-only.ts";

export interface DevServerOptions {
  readonly appDir: string;
  /**
   * Factory handler SSR. Vite berjalan sebagai middleware di server yang sama; tidak ada
   * port SSR terpisah.
   */
  readonly handler: (context: {
    readonly importer: ModuleImporter;
    readonly devtools: DevtoolsCollector;
  }) => FetchHandler | Promise<FetchHandler>;
  /** Port HTTP server (port publik/dev). */
  readonly port?: number;
  /** Interface bind; default localhost. */
  readonly host?: string;
  /** Plugin Vite tambahan (dari plugin Ramonyx — ADR-0067). */
  readonly plugins?: readonly PluginOption[];
}

export interface DevServer {
  readonly url: string;
  /** Importer untuk compiler: modul mengikuti module graph Vite (invalidasi saat file berubah). */
  readonly importer: ModuleImporter;
  /** Kolektor panel devtools (ADR-0077) — pasang `hooks`/`middleware`-nya ke handler aplikasi. */
  readonly devtools: DevtoolsCollector;
  close(): Promise<void>;
}

const ENTRY_FILE = "client-entry.ts";

const DEV_ASSET_TYPES: Record<string, string> = {
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
};

/**
 * Dev: sajikan `src/assets/**` apa adanya di `/assets/*` (tanpa hash) — paritas dengan
 * resolver aset dev (`createAssetResolver(..., { fallbackToPath: true })`, ADR-0069).
 */
function assetsDevPlugin(appDir: string): Plugin {
  return {
    name: "ramonyx-assets-dev",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url ?? "";
        if (!url.startsWith("/assets/")) {
          next();
          return;
        }
        let rel: string;
        try {
          rel = decodeURIComponent(url.slice("/assets/".length).split("?")[0] ?? "");
        } catch {
          next();
          return;
        }
        if (rel.length === 0 || rel.includes("..")) {
          next();
          return;
        }
        const file = join(appDir, "src", "assets", rel);
        if (!existsSync(file)) {
          next();
          return;
        }
        void readFile(file)
          .then((data) => {
            res.setHeader(
              "content-type",
              DEV_ASSET_TYPES[extname(file).toLowerCase()] ?? "application/octet-stream",
            );
            res.setHeader("cache-control", "no-cache");
            res.end(data);
          })
          .catch(() => next());
      });
    },
  };
}

/**
 * Dev server: Vite (transform + HMR) dan SSR pada satu HTTP server/port. Vite middleware dan
 * HMR WebSocket menempel ke server yang sama, SSR menjadi middleware terakhir.
 *
 * Modul halaman/manifest dimuat lewat `vite.ssrLoadModule` agar SSR ikut segar saat file berubah
 * (tanpa restart); perubahan di `src/routes` meregenerasi entry client + full-reload browser.
 */
export async function createDevServer(options: DevServerOptions): Promise<DevServer> {
  const appDir = options.appDir;
  const entryDir = join(appDir, ".ramonyx");
  const entryFile = join(entryDir, ENTRY_FILE);
  const routesDir = join(appDir, "src", "routes");

  const devtools = createDevtoolsCollector();
  const clientDir = join(appDir, "dist", "client");

  /** Ukuran bundel/aset dari manifest build (bila sudah pernah dibangun). */
  const refreshAssets = async (): Promise<void> => {
    const manifest = await readAssetManifest(clientDir);
    if (manifest === null) {
      devtools.setAssets([]);
      return;
    }
    const names = new Set<string>([manifest.client, ...manifest.files]);
    const entries: { name: string; bytes: number }[] = [];
    for (const name of names) {
      try {
        const info = await stat(join(clientDir, name));
        entries.push({ name, bytes: info.size });
      } catch {
        // berkas hilang (mis. dibersihkan) — lewati
      }
    }
    if (manifest.assets !== undefined) {
      for (const entry of Object.values(manifest.assets)) {
        entries.push({ name: entry.file, bytes: entry.bytes });
      }
    }
    devtools.setAssets(entries);
  };

  const server = createHttpServer();
  const vite = await createServer({
    configFile: false,
    root: appDir,
    appType: "custom",
    logLevel: "info",
    esbuild: { jsx: "automatic" },
    server: {
      middlewareMode: { server },
      ws: { server },
    },
    plugins: [
      ...(options.plugins ?? []),
      serverOnlyPlugin(),
      assetsDevPlugin(appDir),
      {
        name: "ramonyx-devtools",
        configureServer(server) {
          server.middlewares.use((req, res, next) => {
            const path = (req.url ?? "").split("?")[0] ?? "";
            if (path === "/__ramonyx/devtools") {
              res.setHeader("content-type", "text/html; charset=utf-8");
              res.setHeader("cache-control", "no-store");
              res.end(devtoolsPanelHtml());
              return;
            }
            if (path === "/__ramonyx/data") {
              void refreshAssets()
                .catch(() => undefined)
                .then(() => {
                  res.setHeader("content-type", "application/json; charset=utf-8");
                  res.setHeader("cache-control", "no-store");
                  res.end(JSON.stringify(devtools.snapshot()));
                });
              return;
            }
            next();
          });
        },
      },
    ],
  });

  const importer: ModuleImporter = async (absolute, label) => {
    try {
      return (await vite.ssrLoadModule(absolute)) as Record<string, unknown>;
    } catch (error) {
      throw new RouteManifestError(
        `[dev] gagal memuat ${label} (${relative(appDir, absolute) || absolute}) via Vite: ${
          error instanceof Error ? error.message : String(error)
        }`,
        { cause: error },
      );
    }
  };

  const regenerateEntry = async (): Promise<void> => {
    const [pages, apiRoutes] = await Promise.all([
      loadPageRoutes({ dir: routesDir, importer }),
      listApiRoutes({ dir: routesDir, importer }),
    ]);
    devtools.setRoutes([
      ...pages.map((page) => ({
        path: page.path,
        kind: "page" as const,
        ...(page.pageFile !== undefined ? { file: relative(appDir, page.pageFile) } : {}),
      })),
      ...apiRoutes.map((route) => ({
        path: route.routePath,
        kind: "api" as const,
        methods: route.methods,
        file: relative(appDir, route.file),
      })),
    ]);
    await mkdir(entryDir, { recursive: true });
    await writeFile(entryFile, generateClientEntry(pages, { from: entryDir }));
  };
  await regenerateEntry();

  vite.watcher.on("all", (_event, file) => {
    if (!file.startsWith(routesDir)) {
      return;
    }
    void regenerateEntry()
      .catch(() => undefined)
      .finally(() => {
        vite.ws.send({ type: "full-reload" });
      });
  });

  const fetchHandler = await options.handler({ importer, devtools });
  // SSR adalah middleware terakhir: request yang tidak ditangani Vite/plugin masuk ke app.
  vite.middlewares.use(createNodeRequestListener(fetchHandler, { onError: console.error }));
  server.on("request", (req, res) => {
    vite.middlewares(req, res, (error: unknown) => {
      if (error) {
        console.error(error);
        if (!res.headersSent) {
          res.writeHead(500, { "content-type": "application/json" });
        }
        res.end(JSON.stringify({ error: "Internal Server Error" }));
        return;
      }
      if (!res.headersSent) {
        res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      }
      res.end("Not found");
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port ?? 3000, options.host ?? "localhost", () => {
      server.off("error", reject);
      resolve();
    });
  });
  const address = server.address();
  const port =
    typeof address === "object" && address !== null ? address.port : (options.port ?? 3000);
  const host =
    options.host === undefined ||
    options.host === "0.0.0.0" ||
    options.host === "::" ||
    options.host === "127.0.0.1"
      ? "localhost"
      : options.host;

  return {
    url: `http://${host}:${port}`,
    importer,
    devtools,
    close: async () => {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await vite.close();
    },
  };
}
