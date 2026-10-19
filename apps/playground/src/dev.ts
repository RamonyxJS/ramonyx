import { fileURLToPath } from "node:url";
import { createConsoleLogger, createNodeHost } from "@ramonyx/adapter-runtime";
import { createDevServer, loadPlugins, type RamonyxPlugin } from "@ramonyx/bundler";
import { withMiddleware } from "@ramonyx/server";
import { createCache, resolveConfig } from "ramonyx";
import config from "../ramonyx.config.ts";
import { createApp } from "./app.ts";

const resolved = resolveConfig(config);
const appDir = fileURLToPath(new URL("..", import.meta.url));
const target = `http://localhost:${resolved.server.port}`;

const logger = createConsoleLogger();
const plugins = await loadPlugins(config.plugins as RamonyxPlugin[] | undefined, {
  appDir,
  config: resolved,
  logger,
  mode: "dev",
});

// Vite (transform + HMR) sebagai front; modul halaman dimuat ulang via module graph-nya.
const dev = await createDevServer({ appDir, target, port: 5173, plugins: plugins.vite });

const host = createNodeHost();
const app = withMiddleware(
  await createApp({
    env: host.env,
    logger,
    strictValidation: resolved.app.strictValidation,
    clientScript: "/.ramonyx/client-entry.ts",
    clientModules: ["/@vite/client"],
    importer: dev.importer,
    reloadManifests: true,
    streaming: true,
    cache: createCache(),
    hooks: plugins.hooks,
  }),
  plugins.middleware,
  { env: host.env, logger },
);

await host.serve(app, { port: resolved.server.port, host: resolved.server.host });
console.log(`dev: ${dev.url} (Vite + HMR) → SSR ${target}`);
