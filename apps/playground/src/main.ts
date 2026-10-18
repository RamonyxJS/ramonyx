import { createConsoleLogger, createNodeHost } from "@ramonyx/adapter-runtime";
import { resolveConfig } from "ramonyx";
import config from "../ramonyx.config.ts";
import { createApp } from "./app.ts";

const resolved = resolveConfig(config);
const host = createNodeHost();
const app = await createApp({
  env: host.env,
  logger: createConsoleLogger(),
  strictValidation: resolved.app.strictValidation,
  clientScript: "/assets/client.js",
});

const server = await host.serve(app, {
  port: resolved.server.port,
  host: resolved.server.host,
});

console.log(`playground berjalan di ${server.url}`);
