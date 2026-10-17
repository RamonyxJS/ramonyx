import { mkdir, writeFile } from "node:fs/promises";
import { cpus } from "node:os";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createNodeHost } from "@ramonyx/adapter-runtime";
import { createHandler } from "@ramonyx/server";
import autocannon from "autocannon";
import { appMiddleware, routes } from "../../apps/playground/src/manifest.ts";

const handler = createHandler({ routes, middleware: appMiddleware });
const host = createNodeHost();
const server = await host.serve(handler, { port: 0 });

const connections = 50;
const durationSeconds = 10;

const result = await autocannon({
  url: new URL("/api/hello", server.url).href,
  connections,
  duration: durationSeconds,
  pipelining: 1,
});

const payload = {
  generatedAt: new Date().toISOString(),
  scenario: "GET /api/hello — routing statis + middleware logging (tanpa I/O)",
  environment: {
    platform: process.platform,
    arch: process.arch,
    node: process.version,
    cpus: cpus().length,
    cpuModel: cpus()[0]?.model ?? "unknown",
  },
  tool: "autocannon 8.0.0",
  connections,
  durationSeconds,
  result: {
    requestsPerSecond: result.requests.average,
    latency: {
      p50: result.latency.p50,
      p90: result.latency.p90,
      p97_5: result.latency.p97_5,
      p99: result.latency.p99,
      max: result.latency.max,
    },
    throughputBytesPerSecond: result.throughput.average,
    errors: result.errors,
    non2xx: result.non2xx,
  },
};

const target = new URL("../results/phase1-baseline.json", import.meta.url);
await mkdir(dirname(fileURLToPath(target)), { recursive: true });
await writeFile(target, `${JSON.stringify(payload, null, 2)}\n`);

await server.close();
console.log(JSON.stringify(payload.result, null, 2));
