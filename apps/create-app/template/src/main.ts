import { createNodeHost } from "@ramonyx/adapter-runtime";
import { resolveConfig } from "ramonyx";

import config from "../ramonyx.config.ts";
import { createApp } from "./app.ts";

const resolved = resolveConfig(config);
const host = createNodeHost();
const app = await createApp();

const server = await host.serve(app, {
  port: resolved.server.port,
  host: resolved.server.host,
});

console.log(`__APP_NAME__ berjalan di ${server.url}`);
