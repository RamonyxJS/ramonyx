import { createConsoleLogger, createNodeHost } from "@ramonyx/adapter-runtime";
import { createHandler } from "@ramonyx/server";
import { resolveConfig } from "ramonyx";
import config from "../ramonyx.config.ts";
import { appMiddleware, routes } from "./manifest.ts";

const resolved = resolveConfig(config);
const host = createNodeHost();
const handler = createHandler({
  routes,
  middleware: appMiddleware,
  env: host.env,
  logger: createConsoleLogger(),
  strictValidation: resolved.app.strictValidation,
});

const server = await host.serve(handler, {
  port: resolved.server.port,
  host: resolved.server.host,
});

console.log(`playground berjalan di ${server.url}`);
