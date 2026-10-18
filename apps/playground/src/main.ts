import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createConsoleLogger, createNodeHost } from "@ramonyx/adapter-runtime";
import { readClientScript } from "@ramonyx/bundler";
import { resolveConfig } from "ramonyx";
import config from "../ramonyx.config.ts";
import { createApp } from "./app.ts";

const resolved = resolveConfig(config);
const appDir = fileURLToPath(new URL("..", import.meta.url));
const host = createNodeHost();
const app = await createApp({
  env: host.env,
  logger: createConsoleLogger(),
  strictValidation: resolved.app.strictValidation,
  clientScript: await readClientScript(join(appDir, "dist/client")),
  streaming: true,
});

const server = await host.serve(app, {
  port: resolved.server.port,
  host: resolved.server.host,
});

console.log(`playground berjalan di ${server.url}`);

// Instrumentasi soak (dipakai `pnpm bench:security`): breakdown memori tiap detik ke stdout.
if (process.env.RAMONYX_MEMORY_LOG === "1") {
  setInterval(() => {
    const usage = process.memoryUsage();
    console.log(
      `[mem] rss=${Math.round(usage.rss / 1048576)} heapUsed=${Math.round(usage.heapUsed / 1048576)} heapTotal=${Math.round(usage.heapTotal / 1048576)} external=${Math.round(usage.external / 1048576)} arrayBuffers=${Math.round(usage.arrayBuffers / 1048576)}`,
    );
  }, 1000).unref();
}
