import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { generateClientEntry } from "@ramonyx/compiler";
import type { LoadedPage } from "@ramonyx/core";
import { build } from "vite";

export interface BuildClientOptions {
  readonly appDir: string;
  readonly pages: readonly LoadedPage[];
  /** Relatif terhadap appDir; default "dist/client". */
  readonly outDir?: string;
  /** Hasilkan source map (`.js.map` + `sourcesContent`); default true. */
  readonly sourcemap?: boolean;
  /** URL publik bundle untuk `<script type="module">`; default "/assets/client.js". */
  readonly scriptPath?: string;
  readonly minify?: boolean;
}

export interface BuildClientResult {
  readonly outDir: string;
  readonly scriptPath: string;
  readonly entryFile: string;
}

/**
 * Membundel client (React + registry halaman) memakai Vite (ADR-0005).
 * Output ditulis ke `<appDir>/dist/client` dan siap disajikan sebagai aset statis.
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
          entryFileNames: "client.js",
          chunkFileNames: "chunks/[name]-[hash].js",
          assetFileNames: "[name][extname]",
        },
      },
    },
  });

  return {
    outDir,
    scriptPath: options.scriptPath ?? "/assets/client.js",
    entryFile,
  };
}
