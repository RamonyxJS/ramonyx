import { mkdir, writeFile } from "node:fs/promises";
import type { ServerResponse } from "node:http";
import { join, relative } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import {
  generateClientEntry,
  loadPageRoutes,
  type ModuleImporter,
  RouteManifestError,
} from "@ramonyx/compiler";
import { type Connect, createServer } from "vite";

export interface DevServerOptions {
  readonly appDir: string;
  /** URL server SSR yang diproksikan (mis. "http://localhost:3000"). */
  readonly target: string;
  readonly port?: number;
}

export interface DevServer {
  readonly url: string;
  /** Importer untuk compiler: modul mengikuti module graph Vite (invalidasi saat file berubah). */
  readonly importer: ModuleImporter;
  readonly target: string;
  close(): Promise<void>;
}

const ENTRY_FILE = "client-entry.ts";

/** Path yang dimiliki Vite (jangan diproksikan ke SSR). */
function isViteRequest(url: string): boolean {
  const path = url.split("?")[0] ?? "";
  return (
    path.startsWith("/@") ||
    path.startsWith("/node_modules/") ||
    path.startsWith("/.ramonyx/") ||
    path.startsWith("/src/") ||
    path === "/favicon.ico"
  );
}

const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "transfer-encoding",
  "content-length",
  "content-encoding",
]);

/**
 * Proxy manual ke SSR (bukan `server.proxy` Vite): request non-Vite diteruskan dengan `fetch`,
 * respons dipipe kembali apa adanya. Body request non-GET/HEAD dialirkan via `Readable.toWeb`.
 */
async function proxyToSsr(
  target: string,
  req: Connect.IncomingMessage,
  res: ServerResponse,
  next: Connect.NextFunction,
): Promise<void> {
  try {
    const url = new URL(req.url ?? "/", target);
    const headers = new Headers();
    for (const [name, value] of Object.entries(req.headers)) {
      if (value === undefined) continue;
      if (Array.isArray(value)) {
        for (const item of value) {
          headers.append(name, item);
        }
      } else {
        headers.set(name, value);
      }
    }

    const method = req.method ?? "GET";
    const init: RequestInit & { duplex?: "half" } = {
      method,
      headers,
      redirect: "manual",
    };
    if (method !== "GET" && method !== "HEAD") {
      init.body = Readable.toWeb(req) as unknown as BodyInit;
      init.duplex = "half";
    }

    const response = await fetch(url, init);
    res.statusCode = response.status;
    response.headers.forEach((value, name) => {
      if (name !== "set-cookie" && !HOP_BY_HOP.has(name)) {
        res.setHeader(name, value);
      }
    });
    const cookies = response.headers.getSetCookie();
    if (cookies.length > 0) {
      res.setHeader("set-cookie", cookies);
    }

    if (response.body === null) {
      res.end();
      return;
    }
    await pipeline(Readable.fromWeb(response.body as never), res);
  } catch (error) {
    next(error);
  }
}

/**
 * Dev server: Vite (transform + HMR) sebagai front, proxy ke server SSR.
 * Modul halaman/manifest dimuat lewat `vite.ssrLoadModule` agar SSR ikut segar saat file berubah
 * (tanpa restart); perubahan di `src/routes` meregenerasi entry client + full-reload browser.
 */
export async function createDevServer(options: DevServerOptions): Promise<DevServer> {
  const appDir = options.appDir;
  const entryDir = join(appDir, ".ramonyx");
  const entryFile = join(entryDir, ENTRY_FILE);
  const routesDir = join(appDir, "src", "routes");

  const vite = await createServer({
    configFile: false,
    root: appDir,
    appType: "custom",
    logLevel: "info",
    esbuild: { jsx: "automatic" },
    server: { port: options.port ?? 5173 },
    plugins: [
      {
        name: "ramonyx-ssr-proxy",
        configureServer(server) {
          server.middlewares.use((req, res, next) => {
            if (req.url === undefined || isViteRequest(req.url)) {
              next();
              return;
            }
            void proxyToSsr(options.target, req, res, next);
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
    const pages = await loadPageRoutes({ dir: routesDir, importer });
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

  await vite.listen();
  const address = vite.httpServer?.address();
  const port =
    typeof address === "object" && address !== null ? address.port : (options.port ?? 5173);

  return {
    url: `http://localhost:${port}`,
    importer,
    target: options.target,
    close: () => vite.close(),
  };
}
