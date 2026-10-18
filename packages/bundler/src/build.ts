import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { generateClientEntry } from "@ramonyx/compiler";
import type { LoadedPage } from "@ramonyx/core";
import { build } from "vite";

/** Nama berkas manifest aset di direktori keluaran klien (ADR-0055). */
export const CLIENT_MANIFEST_FILE = "ramonyx.assets.json";

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
}

export interface BuildClientResult {
  readonly outDir: string;
  /** URL bundle klien ber-fingerprint, mis. `/assets/client-D3fK2p.js`. */
  readonly scriptPath: string;
  readonly entryFile: string;
  /** Nama berkas (relatif terhadap outDir) yang dihasilkan build. */
  readonly files: readonly string[];
}

/** Manifest aset hasil build (`dist/client/ramonyx.assets.json`). */
export interface AssetManifest {
  readonly client: string;
  readonly files: readonly string[];
}

/**
 * Membundel client (React + registry halaman) memakai Vite (ADR-0005).
 *
 * Nama berkas memuat **hash konten** (`client-<hash>.js`, ADR-0055) sehingga dapat disajikan
 * dengan `cache-control: immutable`; peta nama ditulis ke `ramonyx.assets.json` dan dibaca
 * server lewat `readClientScript`.
 */
export async function buildClient(options: BuildClientOptions): Promise<BuildClientResult> {
  const outDir = join(options.appDir, options.outDir ?? "dist/client");
  const entryDir = join(options.appDir, ".ramonyx");
  const entryFile = join(entryDir, "client-entry.ts");

  await mkdir(entryDir, { recursive: true });
  await writeFile(entryFile, generateClientEntry(options.pages, { from: entryDir }));

  await build({
    configFile: false,
    root: options.appDir,
    logLevel: "warn",
    esbuild: { jsx: "automatic" },
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

  const files = (await readdir(outDir, { recursive: true })).filter(
    (file) => !file.endsWith(CLIENT_MANIFEST_FILE),
  );
  const clientFile = files.find((file) => /^client-.*\.js$/.test(file));
  if (clientFile === undefined) {
    throw new Error(`build klien tidak menghasilkan client-<hash>.js di ${outDir}`);
  }

  const manifest: AssetManifest = { client: clientFile, files: [...files].sort() };
  await writeFile(join(outDir, CLIENT_MANIFEST_FILE), `${JSON.stringify(manifest, null, 2)}\n`);

  const prefix = (options.assetsUrlPrefix ?? "/assets").replace(/\/$/, "");
  return { outDir, scriptPath: `${prefix}/${clientFile}`, entryFile, files: manifest.files };
}

/** Baca manifest aset; `null` bila belum pernah dibangun. */
export async function readAssetManifest(clientDir: string): Promise<AssetManifest | null> {
  try {
    const raw = await readFile(join(clientDir, CLIENT_MANIFEST_FILE), "utf8");
    const parsed = JSON.parse(raw) as Partial<AssetManifest>;
    if (typeof parsed.client !== "string" || parsed.client.length === 0) {
      return null;
    }
    return { client: parsed.client, files: Array.isArray(parsed.files) ? parsed.files : [] };
  } catch {
    return null;
  }
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
