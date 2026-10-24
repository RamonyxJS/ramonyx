// Benchmark publik: overhead routing/JSON handler Ramonyx vs Hono vs Node baseline.
//
// Batas: ini BUKAN benchmark SSR/full-stack. Ketiganya memakai adapter HTTP Node yang sama,
// tanpa TLS, logging, middleware, database, atau static asset. Tujuannya membandingkan biaya
// framework pada satu endpoint JSON yang identik; hasilnya tidak boleh dipakai untuk klaim SSR.
//
// Protokol: warm-up + beberapa run, median antar-run + spread min/max, artefak mentah dengan
// environment dan versi. Jalankan: `pnpm bench:public`.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { dirname, relative, resolve } from "node:path";
import { createHandler } from "@ramonyx/server";
import autocannon from "autocannon";
import { Hono } from "hono";
import { route } from "ramonyx";
import { type RunMetrics, summarizeRuns } from "../http/stats.ts";
import { captureEnvironment, envKey } from "../lib/env.ts";

type FetchHandler = (request: Request) => Promise<Response> | Response;

interface Target {
  readonly id: "node" | "ramonyx" | "hono";
  readonly label: string;
  readonly note: string;
  readonly handler: FetchHandler;
}

interface RunningTarget extends Target {
  readonly url: string;
  readonly server: Server;
}

const args = process.argv.slice(2);
const argValue = (name: string): string | undefined => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};
const connections = Math.max(1, Number(argValue("--connections") ?? "50"));
const durationSeconds = Math.max(1, Number(argValue("--duration-seconds") ?? "10"));
const warmupSeconds = Math.max(1, Number(argValue("--warmup-seconds") ?? "3"));
const repeats = Math.max(2, Number(argValue("--repeats") ?? "5"));
const environment = captureEnvironment();
const outPath = resolve(
  process.cwd(),
  argValue("--out") ?? `benchmarks/results/public/http-frameworks-${envKey(environment)}.json`,
);

const ramonyx = createHandler({
  routes: [
    {
      method: "GET",
      path: "/api/hello",
      definition: route({ handler: ({ json }) => json({ hello: "world" }) }),
    },
  ],
});

const hono = new Hono();
hono.get("/api/hello", (context) => context.json({ hello: "world" }));

const targets: readonly Target[] = [
  {
    id: "node",
    label: "Node built-in http (lower bound)",
    note: "Direct ServerResponse with the same JSON body; no router.",
    handler: async () => Response.json({ hello: "world" }),
  },
  {
    id: "ramonyx",
    label: "Ramonyx createHandler",
    note: "Route table + handler; no middleware, validation, cache, or static assets.",
    handler: (request) => ramonyx(request),
  },
  {
    id: "hono",
    label: "Hono 4.13.13",
    note: "Hono app.fetch; same shared Node fetch adapter and JSON route.",
    handler: (request) => hono.fetch(request),
  },
];

/** Adapter FetchHandler → Node http yang sama untuk ketiga target (adapter bukan variabel). */
async function startTarget(target: Target): Promise<RunningTarget> {
  const server = createServer(async (incoming, outgoing) => {
    try {
      const url = new URL(incoming.url ?? "/", `http://${incoming.headers.host ?? "127.0.0.1"}`);
      const headers = new Headers();
      for (const [name, value] of Object.entries(incoming.headers)) {
        if (value !== undefined) {
          headers.set(name, Array.isArray(value) ? value.join(", ") : value);
        }
      }
      const request = new Request(url, {
        method: incoming.method,
        headers,
        ...(incoming.method === "GET" || incoming.method === "HEAD"
          ? {}
          : { body: incoming as never }),
      });
      const response = await target.handler(request);
      outgoing.statusCode = response.status;
      response.headers.forEach((value, name) => {
        if (name.toLowerCase() !== "set-cookie") outgoing.setHeader(name, value);
      });
      if (response.body !== null) {
        for await (const chunk of response.body) {
          outgoing.write(chunk);
        }
      }
      outgoing.end();
    } catch {
      outgoing.statusCode = 500;
      outgoing.end("benchmark adapter error");
    }
  });
  await new Promise<void>((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  const address = server.address();
  if (address === null || typeof address !== "object") {
    server.close();
    throw new Error(`tidak bisa membaca port untuk ${target.id}`);
  }
  return {
    ...target,
    server,
    url: `http://127.0.0.1:${address.port}/api/hello`,
  };
}

async function runOnce(url: string, seconds: number): Promise<RunMetrics> {
  const result = await autocannon({
    url,
    connections,
    duration: seconds,
    pipelining: 1,
  });
  return {
    latency: {
      p50: result.latency.p50,
      p90: result.latency.p90,
      p97_5: result.latency.p97_5,
      p99: result.latency.p99,
      max: result.latency.max,
    },
    requestsPerSecond: result.requests.average,
    throughputBytesPerSecond: result.throughput.average,
    errors: result.errors,
    non2xx: result.non2xx,
  };
}

async function closeTarget(target: RunningTarget): Promise<void> {
  await new Promise<void>((resolveClose) => target.server.close(() => resolveClose()));
}

const packageJson = JSON.parse(await readFile(resolve(process.cwd(), "package.json"), "utf8")) as {
  devDependencies?: Record<string, string>;
};
const ramonyxPackage = JSON.parse(
  await readFile(resolve(process.cwd(), "packages/ramonyx/package.json"), "utf8"),
) as { version?: string };

const running: RunningTarget[] = [];
try {
  for (const target of targets) running.push(await startTarget(target));

  // Parity check before load: the comparison must measure the same observable response.
  const parity: Record<string, string> = {};
  for (const target of running) {
    const response = await fetch(target.url);
    if (response.status !== 200) throw new Error(`${target.id}: parity status ${response.status}`);
    parity[target.id] = await response.text();
  }
  const bodies = new Set(Object.values(parity));
  if (bodies.size !== 1) throw new Error(`parity gagal: ${JSON.stringify(parity)}`);

  for (const target of running) {
    await runOnce(target.url, warmupSeconds);
    console.log(`warm-up ${target.id} ${warmupSeconds}s selesai (dibuang)`);
  }

  const runs: Record<string, RunMetrics[]> = Object.fromEntries(
    running.map((target) => [target.id, []]),
  );
  for (let index = 1; index <= repeats; index += 1) {
    // Interleave target per run agar drift termal tidak hanya menghukum satu framework.
    for (const target of running) {
      const metrics = await runOnce(target.url, durationSeconds);
      runs[target.id]?.push(metrics);
      console.log(
        `run ${index}/${repeats} ${target.id}: p50=${metrics.latency.p50}ms ` +
          `p99=${metrics.latency.p99}ms rps=${Math.round(metrics.requestsPerSecond)}`,
      );
    }
  }

  const result = {
    schemaVersion: 1,
    benchmark: "public-http-frameworks-v1",
    generatedAt: new Date().toISOString(),
    scenario:
      "GET /api/hello — JSON handler, shared Node http Fetch adapter, no middleware/logging/IO",
    scope:
      "Routing/JSON handler only; excludes SSR, hydration, static assets, databases, TLS, and framework middleware.",
    environment,
    versions: {
      node: process.version,
      ramonyx: ramonyxPackage.version ?? "unknown",
      hono: packageJson.devDependencies?.hono ?? "unknown",
      autocannon: packageJson.devDependencies?.autocannon ?? "unknown",
    },
    load: { connections, durationSeconds, warmupSeconds, repeats, pipelining: 1 },
    parity: { passed: true, body: Object.values(parity)[0] },
    targets: running.map((target) => {
      const targetRuns = runs[target.id] ?? [];
      return {
        id: target.id,
        label: target.label,
        note: target.note,
        result: summarizeRuns(targetRuns),
        perRun: targetRuns,
      };
    }),
  };

  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(result, null, 2)}\n`);

  console.log("\nmedian antar-run:");
  for (const target of result.targets) {
    const metrics = target.result;
    console.log(
      `  ${target.id.padEnd(8)} rps=${Math.round(metrics.requestsPerSecond)} ` +
        `(spread ${Math.round(metrics.spread.requestsPerSecond.min)}–${Math.round(metrics.spread.requestsPerSecond.max)}) ` +
        `p50=${metrics.latency.p50}ms p99=${metrics.latency.p99}ms`,
    );
  }
  console.log(`artefak: ${relative(process.cwd(), outPath)}`);
  if (result.targets.some((target) => target.result.errors > 0 || target.result.non2xx > 0)) {
    process.exitCode = 1;
  }
} finally {
  await Promise.all(running.map(closeTarget));
}
