import { fileURLToPath } from "node:url";
import { createConsoleLogger, createNodeHost } from "@ramonyx/adapter-runtime";
import { createDevServer } from "@ramonyx/bundler";
import { resolveConfig } from "ramonyx";
import config from "../ramonyx.config.ts";
import { createApp } from "./app.ts";

const resolved = resolveConfig(config);
const appDir = fileURLToPath(new URL("..", import.meta.url));
const target = `http://localhost:${resolved.server.port}`;

// Vite (transform + HMR) sebagai front; modul halaman dimuat ulang via module graph-nya.
const dev = await createDevServer({ appDir, target, port: 5173 });

const host = createNodeHost();
const app = await createApp({
  env: host.env,
  logger: createConsoleLogger(),
  strictValidation: resolved.app.strictValidation,
  clientScript: "/.ramonyx/client-entry.ts",
  clientModules: ["/@vite/client"],
  importer: dev.importer,
  reloadManifests: true,
});

await host.serve(app, { port: resolved.server.port, host: resolved.server.host });
console.log(`dev: ${dev.url} (Vite + HMR) → SSR ${target}`);
