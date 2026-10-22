import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { generateClientEntry, lintClientBoundaries } from "@ramonyx/compiler";
import { errorHint, type LoadedPage } from "@ramonyx/core";
import { build, type PluginOption } from "vite";
import { type AssetProcessor, collectAssets, DEFAULT_ASSETS_DIR } from "./assets.ts";
import {
  type AssetManifest,
  CLIENT_MANIFEST_FILE,
  readAssetManifest,
  writeAssetManifest,
} from "./manifest.ts";
import { serverOnlyPlugin } from "./server-only.ts";

export type { AssetEntry, AssetManifest, AssetMap } from "./manifest.ts";
export { CLIENT_MANIFEST_FILE, readAssetManifest } from "./manifest.ts";

const SERVER_ONLY_IMPORT = /(?:from|import\s*\(|require\s*\()\s*["'](node:[^"']+)["']/g;
const BROWSER_EXTERNAL_MARKER = "__vite-browser-external";

export interface BuildClientOptions {
  readonly appDir: string;
  readonly pages: readonly LoadedPage[];
  /** Relatif terhadap appDir; default "dist/client". */
  readonly outDir?: string;
  /** Hasilkan source map (`.js.map` + `sourcesContent`); default true. */
  readonly sourcemap?: boolean;
  /** Prefix URL publik aset (untuk `scriptPath` hasil); default "/assets". */
  readonly assetsUrlPrefix?: string;
  readonly minify?: boolean;
  /** Plugin Vite tambahan (dari plugin Ramonyx — ADR-0067). */
  readonly plugins?: readonly PluginOption[];
  /** Prosesor aset (hook `assets` plugin — ADR-0079). */
  readonly assetProcessors?: readonly AssetProcessor[];
  /**
   * Direktori aset (relatif appDir) yang dipindai & disalin ber-hash ke `assets/**` +
   * dicatat di manifest (ADR-0069). Default `src/assets` bila ada; `false` mematikan.
   */
  readonly assetsDir?: string | false;
}

export interface BuildClientResult {
  readonly outDir: string;
  /** URL bundle klien ber-fingerprint, mis. `/assets/client-D3fK2p.js`. */
  readonly scriptPath: string;
  readonly entryFile: string;
  /** Nama berkas (relatif terhadap outDir) yang dihasilkan build. */
  readonly files: readonly string[];
}

/**
 * Membundel client (React + registry halaman) memakai Vite (ADR-0005).
 *
 * Nama berkas memuat **hash konten** (`client-<hash>.js`, ADR-0055) sehingga dapat disajikan
 * dengan `cache-control: immutable`; peta nama ditulis ke `ramonyx.assets.json` dan dibaca
 * server lewat `readClientScript`.
 */
/** Pre-check (ADR-0063): modul yang masuk bundle klien (page/layout) dilarang mengimpor `node:*`. */
async function assertClientFilesBrowserSafe(pages: readonly LoadedPage[]): Promise<void> {
  const files = new Set<string>();
  for (const page of pages) {
    if (page.pageFile !== undefined) {
      files.add(page.pageFile);
    }
    for (const layout of page.layoutFiles ?? []) {
      files.add(layout);
    }
  }

  const violations: string[] = [];
  for (const file of files) {
    let source: string;
    try {
      source = await readFile(file, "utf8");
    } catch {
      continue;
    }
    for (const match of source.matchAll(SERVER_ONLY_IMPORT)) {
      violations.push(`${file} → ${match[1] ?? "?"}`);
    }
  }

  if (violations.length > 0) {
    throw new Error(
      "Batas server/client dilanggar (ADR-0063): modul yang masuk bundle klien mengimpor API server:\n" +
        violations.map((entry) => `  - ${entry}`).join("\n") +
        "\nPindahkan kode server ke modul `*.server.ts` yang hanya diimpor dari loader/action/route API, " +
        `atau akses lewat API route. ${errorHint("RMX-BUILD-1")}`,
    );
  }
}

/** Post-build (ADR-0063): output tidak boleh memuat shim browser-external Vite atau `node:*` (impor transitif). */
async function assertBundleBrowserSafe(outDir: string): Promise<void> {
  const files = (await readdir(outDir, { recursive: true })).filter((file) => file.endsWith(".js"));
  const violations = new Set<string>();
  for (const file of files) {
    const source = await readFile(join(outDir, file), "utf8");
    if (source.includes(BROWSER_EXTERNAL_MARKER)) {
      violations.add(file);
    }
    for (const match of source.matchAll(SERVER_ONLY_IMPORT)) {
      violations.add(`${file} → ${match[1] ?? "?"}`);
    }
  }

  if (violations.size > 0) {
    throw new Error(
      "Bundel klien memuat API server (ADR-0063) — kemungkinan impor transitif dari modul klien:\n" +
        [...violations].map((entry) => `  - ${entry}`).join("\n") +
        `\nPisahkan modul server (\`*.server.ts\`) dan impor hanya dari loader/action/route API. ${errorHint("RMX-BUILD-2")}`,
    );
  }
}

export async function buildClient(options: BuildClientOptions): Promise<BuildClientResult> {
  const outDir = join(options.appDir, options.outDir ?? "dist/client");
  const entryDir = join(options.appDir, ".ramonyx");
  const entryFile = join(entryDir, "client-entry.ts");

  const boundaryViolations = await lintClientBoundaries(options.pages);
  if (boundaryViolations.length > 0) {
    throw new Error(
      "Batas server/client dilanggar (ADR-0063): modul halaman/layout/error mengimpor API server:\n" +
        boundaryViolations
          .map((violation) => `  - ${violation.file} → ${violation.specifier}`)
          .join("\n") +
        "\nPindahkan impor tersebut ke modul `*.server.ts` yang hanya dipakai loader/action/route API. " +
        errorHint("RMX-BUILD-1"),
    );
  }

  await assertClientFilesBrowserSafe(options.pages);

  await mkdir(entryDir, { recursive: true });
  await writeFile(entryFile, generateClientEntry(options.pages, { from: entryDir }));

  await build({
    configFile: false,
    root: options.appDir,
    logLevel: "warn",
    esbuild: { jsx: "automatic" },
    plugins: [...(options.plugins ?? []), serverOnlyPlugin()],
    build: {
      outDir,
      emptyOutDir: true,
      target: "es2022",
      minify: options.minify ?? false,
      // Source map produksi (default aktif): `sourcesContent` di-embed agar map tetap
      // berguna walau sumber TS tidak ikut disajikan (ADR-0046).
      sourcemap: options.sourcemap ?? true,
      modulePreload: false,
      rollupOptions: {
        input: entryFile,
        output: {
          entryFileNames: "client-[hash].js",
          chunkFileNames: "chunks/[name]-[hash].js",
          assetFileNames: "[name]-[hash][extname]",
        },
      },
    },
  });

  await assertBundleBrowserSafe(outDir);

  const files = (await readdir(outDir, { recursive: true })).filter(
    (file) => !file.endsWith(CLIENT_MANIFEST_FILE),
  );
  const clientFile = files.find((file) => /^client-.*\.js$/.test(file));
  if (clientFile === undefined) {
    throw new Error(`build klien tidak menghasilkan client-<hash>.js di ${outDir}`);
  }

  // Pipeline aset (ADR-0069): pindai `src/assets/**` → salin ber-hash + catat di manifest.
  const assetsDir =
    options.assetsDir === false
      ? null
      : join(options.appDir, options.assetsDir ?? DEFAULT_ASSETS_DIR);
  let assets: Awaited<ReturnType<typeof collectAssets>>["assets"] = {};
  if (assetsDir !== null && existsSync(assetsDir)) {
    const collected = await collectAssets(assetsDir, outDir, {
      processors: options.assetProcessors,
    });
    assets = collected.assets;
  }

  const manifest: AssetManifest = {
    client: clientFile,
    files: [...files].sort(),
    ...(Object.keys(assets).length > 0 ? { assets } : {}),
  };
  await writeAssetManifest(outDir, manifest);

  const prefix = (options.assetsUrlPrefix ?? "/assets").replace(/\/$/, "");
  return { outDir, scriptPath: `${prefix}/${clientFile}`, entryFile, files: manifest.files };
}

/**
 * URL bundle klien dari manifest hasil build — dipakai server (`ramonyx start`, aplikasi)
 * agar tetap benar saat nama berkas ber-hash. Fallback `/assets/client.js` bila manifest
 * belum ada (mis. server dijalankan tanpa build — CLI sudah memperingatkan).
 */
export async function readClientScript(
  clientDir: string,
  options: { urlPrefix?: string } = {},
): Promise<string> {
  const prefix = (options.urlPrefix ?? "/assets").replace(/\/$/, "");
  const manifest = await readAssetManifest(clientDir);
  return manifest === null ? `${prefix}/client.js` : `${prefix}/${manifest.client}`;
}
