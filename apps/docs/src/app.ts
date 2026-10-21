import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { serveStatic } from "@ramonyx/adapter-runtime";
import { createAssetResolver, readClientScript } from "@ramonyx/bundler";
import { createRouteManifest, loadPageRoutes } from "@ramonyx/compiler";
import { createReactRenderer } from "@ramonyx/react";
import { createHandler } from "@ramonyx/server";
import { createPageRoutes } from "@ramonyx/ssr";
import type { AppHooks, FetchHandler, Middleware } from "ramonyx";

import { setCatalog } from "./catalog.ts";
import { loadCatalog, readPublicMachine } from "./docs.ts";
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
 * Machine layer publik (`/machine/*`) — hanya membaca `docs/public/machine` (ADR-0082).
 * Di ekspor statis, berkas yang sama disalin ke `outDir/machine`.
 */
const machineAssets: Middleware = async (context, next) => {
  const url = new URL(context.request.url);
  const match = /^\/machine\/([a-z0-9.-]+)$/i.exec(url.pathname);
  if (match === null) {
    return next();
  }
  const isi = readPublicMachine(match[1] ?? "");
  if (isi === null) {
    return next();
  }
  // `llms.txt` berdasar teks; `llms-full.txt` juga teks; sisanya JSON.
  const tipe = (match[1] ?? "").endsWith(".json")
    ? "application/json; charset=utf-8"
    : "text/plain; charset=utf-8";
  return new Response(isi, { headers: { "content-type": tipe, "cache-control": "no-cache" } });
};

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
  setCatalog(await loadCatalog());

  const basePath = (options.basePath ?? "").replace(/\/$/, "");
  const dir = fileURLToPath(new URL("./routes", import.meta.url));
  const appDir = fileURLToPath(new URL("..", import.meta.url));
  // Nama bundle ber-hash dari manifest build (ADR-0055) — diekspor/dijalankan setelah build.
  const clientScript = `${basePath}${await readClientScript(join(appDir, "dist/client"))}`;
  // Font self-host ikut pipeline aset (hash di produksi, fallback path mentah saat dev).
  const assets = await createAssetResolver(join(appDir, "dist/client"), {
    fallbackToPath: true,
    urlPrefix: `${basePath}/assets`,
  });
  const fontUrl = (path: string): string => assets.url(path) ?? `${basePath}/assets/${path}`;

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
        streaming: true,
        document: createDocument(basePath, {
          serif: fontUrl("fonts/instrument-serif-latin.woff2"),
          serifItalic: fontUrl("fonts/instrument-serif-italic-latin.woff2"),
          sans400: fontUrl("fonts/plex-sans-400-latin.woff2"),
          sans500: fontUrl("fonts/plex-sans-500-latin.woff2"),
          sans600: fontUrl("fonts/plex-sans-600-latin.woff2"),
        }),
        client: {
          script: clientScript,
          load: "interaction",
          bootstrap:
            'try{const t=localStorage.getItem("ramonyx-theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch{};document.addEventListener("click",function(e){if(document.documentElement.classList.contains("hydrated"))return;const b=e.target instanceof Element?e.target.closest("[data-theme-toggle]"):null;if(!b)return;const d=document.documentElement;const n=d.dataset.theme==="dark"?"light":"dark";d.dataset.theme=n;try{localStorage.setItem("ramonyx-theme",n)}catch{}},true);',
        },
        hooks: options.hooks,
      }),
    ],
    middleware: [machineAssets, staticAssets],
    hooks: options.hooks,
  });
}
