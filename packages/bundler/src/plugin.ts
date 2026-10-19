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
}

/** Identitas + tipe untuk plugin; mengembalikan nilai apa adanya. */
export function definePlugin(plugin: RamonyxPlugin): RamonyxPlugin {
  return plugin;
}

export interface LoadedPlugins {
  readonly vite: PluginOption[];
  readonly middleware: Middleware[];
  readonly hooks: AppHooks | undefined;
}

/** Resolusi plugin → daftar konkret (vite/middleware/hooks) untuk dipakai build/dev/start. */
export async function loadPlugins(
  plugins: readonly RamonyxPlugin[] | undefined,
  context: PluginContext,
): Promise<LoadedPlugins> {
  const vite: PluginOption[] = [];
  const middleware: Middleware[] = [];
  const hooks: AppHooks[] = [];

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
  }

  return { vite, middleware, hooks: mergeHooks(...hooks) };
}
