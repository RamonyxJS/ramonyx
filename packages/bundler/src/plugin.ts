// Kontrak plugin (ADR-0065/0067) — passthrough Vite + middleware + hooks aplikasi.
//
// Kontrak ini **experimental** sampai ada ≥2 plugin nyata (kebijakan ADR-0065): stabil untuk
// dipakai, tetapi dapat bertambah (aditif) tanpa dijanjikan beku.

import {
  type AppHooks,
  type Logger,
  type Middleware,
  mergeHooks,
  type RamonyxConfig,
} from "@ramonyx/core";
import type { PluginOption } from "vite";
import type { AssetProcessor, AssetProcessorInput, AssetProcessorResult } from "./assets.ts";

export interface PluginContext {
  readonly appDir: string;
  /** Config hasil `resolveConfig` (termasuk key pass-through untuk plugin). */
  readonly config: RamonyxConfig;
  readonly logger: Logger;
  readonly mode: "dev" | "build" | "start";
}

export interface RamonyxPlugin {
  readonly name: string;
  /** Plugin Vite (klien, dev, edge) — diteruskan apa adanya; tunduk guard `node:*` (ADR-0058/0063). */
  vite?(
    context: PluginContext,
  ): PluginOption | readonly PluginOption[] | Promise<PluginOption | readonly PluginOption[]>;
  /** Middleware global pre-routing (harus edge-safe bila artefak edge dipakai). */
  middleware?(
    context: PluginContext,
  ): Middleware | readonly Middleware[] | Promise<Middleware | readonly Middleware[]>;
  /** Hook aplikasi (timing/invalidasi) — digabung dengan hook lain (ADR-0065). */
  hooks?(context: PluginContext): AppHooks | Promise<AppHooks>;
  /**
   * Transformasi aset build (ADR-0079): dipanggil per berkas `src/assets/**` saat
   * `ramonyx build`; hasilnya menambah metadata (dimensi) + varian (mis. resize/format gambar).
   */
  assets?(
    context: PluginContext,
    asset: AssetProcessorInput,
  ): AssetProcessorResult | undefined | Promise<AssetProcessorResult | undefined>;
}

/** Identitas + tipe untuk plugin; mengembalikan nilai apa adanya. */
export function definePlugin(plugin: RamonyxPlugin): RamonyxPlugin {
  return plugin;
}

export interface LoadedPlugins {
  readonly vite: PluginOption[];
  readonly middleware: Middleware[];
  readonly hooks: AppHooks | undefined;
  /** Prosesor aset (dari hook `assets` plugin — ADR-0079). */
  readonly assets: AssetProcessor[];
}

/** Resolusi plugin → daftar konkret (vite/middleware/hooks) untuk dipakai build/dev/start. */
export async function loadPlugins(
  plugins: readonly RamonyxPlugin[] | undefined,
  context: PluginContext,
): Promise<LoadedPlugins> {
  const vite: PluginOption[] = [];
  const middleware: Middleware[] = [];
  const hooks: AppHooks[] = [];
  const assets: AssetProcessor[] = [];

  for (const plugin of plugins ?? []) {
    const viteResult = await plugin.vite?.(context);
    if (viteResult !== undefined) {
      if (Array.isArray(viteResult)) {
        vite.push(...(viteResult as PluginOption[]));
      } else {
        vite.push(viteResult as PluginOption);
      }
    }

    const middlewareResult = await plugin.middleware?.(context);
    if (middlewareResult !== undefined) {
      if (Array.isArray(middlewareResult)) {
        middleware.push(...(middlewareResult as Middleware[]));
      } else {
        middleware.push(middlewareResult as Middleware);
      }
    }

    const hooksResult = await plugin.hooks?.(context);
    if (hooksResult !== undefined) {
      hooks.push(hooksResult);
    }

    if (plugin.assets !== undefined) {
      const hook = plugin.assets.bind(plugin);
      assets.push((asset) => hook(context, asset));
    }
  }

  return { vite, middleware, hooks: mergeHooks(...hooks), assets };
}
