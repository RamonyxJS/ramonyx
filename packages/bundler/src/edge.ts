// Build target edge/serverless (ADR-0058): bundel SSR satu berkas dari entry yang digenerate
// (impor statis, tanpa `node:fs`) + guard agar tidak ada API Node yang lolos.
//
// Hasil: `<outDir>/index.js` — ESM dengan `export default { fetch(request) }`,
// kontrak Cloudflare Workers / Vercel Edge / Deno Deploy / runtime fetch standar.

import { existsSync } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { generateServerEntry, listApiRoutes, loadPageRoutes } from "@ramonyx/compiler";
import { build, type PluginOption } from "vite";
import { readClientScript } from "./build.ts";

export interface BuildEdgeOptions {
  readonly appDir: string;
  /** Relatif terhadap appDir; default "dist/edge". */
  readonly outDir?: string;
  /** URL bundle klien (default: manifest `dist/client`, fallback `/assets/client.js`). */
  readonly clientScript?: string;
  /** Aktifkan SSR streaming di artefak; default true (renderer React mendukung). */
  readonly streaming?: boolean;
  readonly minify?: boolean;
  /** Plugin Vite tambahan (harus edge-safe — ADR-0067). */
  readonly plugins?: readonly PluginOption[];
}

export interface BuildEdgeResult {
  readonly outDir: string;
  readonly entryFile: string;
  readonly outputFile: string;
  readonly bytes: number;
}

const NODE_IMPORT = /["'](node:[a-z0-9_/-]+)["']/g;

/**
 * Membangun artefak edge dari aplikasi Ramonyx.
 *
 * Manifest rute dibangun saat build (impor statis hasil codegen) sehingga artefak tidak
 * menyentuh filesystem saat runtime; seluruh dependency dibundel (`ssr.noExternal`),
 * `process.env.NODE_ENV` di-define sebagai `"production"`, dan hasilnya diperiksa:
 * impor `node:*` yang lolos = error (runtime edge tidak menyediakannya).
 */
export async function buildEdge(options: BuildEdgeOptions): Promise<BuildEdgeResult> {
  // Path absolut: entry Vite diresolusi relatif terhadap `root`, path relatif akan tergandakan.
  const appDir = resolve(options.appDir);
  const routesDir = join(appDir, "src/routes");
  const outDir = resolve(appDir, options.outDir ?? "dist/edge");
  const entryDir = join(appDir, ".ramonyx");
  const entryFile = join(entryDir, "edge-entry.ts");

  const [pages, apiRoutes] = await Promise.all([
    loadPageRoutes({ dir: routesDir }),
    listApiRoutes({ dir: routesDir }),
  ]);

  const middlewareCandidate = join(routesDir, "middleware.ts");
  const middlewareFile = existsSync(middlewareCandidate) ? middlewareCandidate : undefined;
  const clientScript =
    options.clientScript ?? (await readClientScript(join(appDir, "dist/client")));

  await mkdir(entryDir, { recursive: true });
  await writeFile(
    entryFile,
    generateServerEntry({
      from: entryDir,
      pages,
      apiRoutes,
      middlewareFile,
      clientScript,
      streaming: options.streaming ?? true,
    }),
  );

  await build({
    configFile: false,
    root: appDir,
    logLevel: "warn",
    esbuild: { jsx: "automatic" },
    plugins: [...(options.plugins ?? [])],
    // `*.server.ts` tetap nyata di edge (server) — plugin stub hanya untuk bundle klien.
    // Runtime edge tidak punya `process` — define agar React memakai build produksi.
    define: { "process.env.NODE_ENV": JSON.stringify("production") },
    ssr: { noExternal: true },
    build: {
      outDir,
      emptyOutDir: true,
      target: "es2022",
      minify: options.minify ?? true,
      ssr: entryFile,
      rollupOptions: {
        output: { entryFileNames: "index.js", format: "esm", codeSplitting: false },
      },
    },
  });

  const outputFile = join(outDir, "index.js");
  const bundle = await readFile(outputFile, "utf8");
  const nodeImports = [
    ...new Set([...bundle.matchAll(NODE_IMPORT)].map((match) => match[1] ?? "")),
  ];
  if (nodeImports.length > 0) {
    throw new Error(
      `bundel edge memuat API Node (${nodeImports.join(", ")}) — periksa middleware/kode aplikasi ` +
        "yang memakai `node:*` (mis. `guardedFetch` dari @ramonyx/security/ssrf)",
    );
  }

  const info = await stat(outputFile);
  return { outDir, entryFile, outputFile, bytes: info.size };
}
