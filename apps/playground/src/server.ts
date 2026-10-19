// Entry server kustom playground (ADR-0076): CLI `ramonyx dev|start` menjalankan ini —
// port/host dari config, plugin dimuat & dibungkus CLI; di sini hanya kebutuhan khusus
// playground (logger, cache, instrumentasi memori).

import { createConsoleLogger } from "@ramonyx/adapter-runtime";
import type { ModuleImporter } from "@ramonyx/compiler";
import { type AppHooks, createCache, type FetchHandler, resolveConfig } from "ramonyx";
import config from "../ramonyx.config.ts";
import { createApp } from "./app.ts";

export interface ServerEntryOptions {
  readonly clientScript?: string;
  readonly clientModules?: readonly string[];
  readonly importer?: ModuleImporter;
  readonly reloadManifests?: boolean;
  readonly hooks?: AppHooks;
  readonly streaming?: boolean;
}

let memoryLogAktif = false;

export async function createHandler(options: ServerEntryOptions = {}): Promise<FetchHandler> {
  const resolved = resolveConfig(config);

  // Instrumentasi soak (dipakai `pnpm bench:security`): breakdown memori tiap detik ke stdout.
  if (process.env.RAMONYX_MEMORY_LOG === "1" && !memoryLogAktif) {
    memoryLogAktif = true;
    setInterval(() => {
      const usage = process.memoryUsage();
      console.log(
        `[mem] rss=${Math.round(usage.rss / 1048576)} heapUsed=${Math.round(usage.heapUsed / 1048576)} heapTotal=${Math.round(usage.heapTotal / 1048576)} external=${Math.round(usage.external / 1048576)} arrayBuffers=${Math.round(usage.arrayBuffers / 1048576)}`,
      );
    }, 1000).unref();
  }

  return createApp({
    logger: createConsoleLogger(),
    strictValidation: resolved.app.strictValidation,
    clientScript: options.clientScript,
    clientModules: options.clientModules,
    importer: options.importer,
    reloadManifests: options.reloadManifests,
    streaming: options.streaming,
    cache: createCache(),
    hooks: options.hooks,
  });
}
