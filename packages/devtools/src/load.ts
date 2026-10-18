// Pemuat aplikasi untuk CLI: memasang transform TypeScript/JSX (loader paket) lalu memuat
// `src/app.ts` + `ramonyx.config.ts` secara dinamis (ADR-0053).
//
// `register()` dipanggil di top-level modul ini — hooks berlaku untuk semua `import()` dinamis
// sesudahnya (berkas pengguna `.ts/.tsx`), sementara impor statis CLI sendiri sudah dimuat lebih
// dulu oleh loader repo/Node. Tanpa langkah ini, CLI hasil instalasi npm tidak bisa memuat
// `src/app.ts` pengguna (Node menolak type-stripping di luar node_modules? justru sebaliknya:
// berkas pengguna boleh di-strip, tetapi `.tsx` tetap butuh transform JSX).

import { register } from "node:module";

register("@ramonyx/compiler/register", import.meta.url);

import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import type { ModuleImporter } from "@ramonyx/compiler";
import {
  type FetchHandler,
  type RamonyxConfig,
  type RamonyxConfigInput,
  resolveConfig,
} from "ramonyx";

/** Opsi yang dikirim CLI ke `createApp(options)` aplikasi. */
export interface CreateAppOptions {
  readonly clientScript?: string;
  readonly clientModules?: readonly string[];
  readonly importer?: ModuleImporter;
  readonly reloadManifests?: boolean;
  readonly strictValidation?: boolean;
  readonly streaming?: boolean;
}

export type CreateApp = (options?: CreateAppOptions) => Promise<FetchHandler>;

const CONFIG_CANDIDATES = ["ramonyx.config.ts", "ramonyx.config.mts", "ramonyx.config.js"];

/** Muat `ramonyx.config.ts` (atau default) → config tervalidasi. */
export async function loadConfigFile(
  appDir: string,
  explicitPath?: string,
): Promise<{ config: RamonyxConfig; file?: string }> {
  const candidates =
    explicitPath === undefined
      ? CONFIG_CANDIDATES.map((name) => join(appDir, name))
      : [resolve(appDir, explicitPath)];
  const found = candidates.find((candidate) => existsSync(candidate));
  if (found === undefined) {
    if (explicitPath !== undefined) {
      throw new Error(`Config tidak ditemukan: ${candidates[0] ?? explicitPath}`);
    }
    return { config: resolveConfig({}) };
  }
  const mod = (await import(pathToFileURL(found).href)) as {
    default?: RamonyxConfigInput;
    config?: RamonyxConfigInput;
  };
  const input = mod.default ?? mod.config ?? {};
  return { config: resolveConfig(input), file: found };
}

/** Muat `createApp` dari `src/app.ts` (konvensi CLI). */
export async function loadCreateApp(appDir: string): Promise<CreateApp> {
  for (const relative of ["src/app.ts", "src/app.tsx", "src/app.js"]) {
    const candidate = join(appDir, relative);
    if (!existsSync(candidate)) {
      continue;
    }
    const mod = (await import(pathToFileURL(candidate).href)) as { createApp?: CreateApp };
    if (typeof mod.createApp !== "function") {
      throw new Error(
        `${relative} tidak mengekspor fungsi createApp(options?) — lihat template \`pnpm create:app\`.`,
      );
    }
    return mod.createApp;
  }
  throw new Error(
    "Tidak menemukan src/app.ts — konvensi CLI: ekspor `createApp(options?)` dari src/app.ts.",
  );
}
