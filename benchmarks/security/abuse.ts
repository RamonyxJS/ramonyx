import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { cpus } from "node:os";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import autocannon from "autocannon";

interface ScenarioResult {
  readonly name: string;
  readonly expectation: string;
  readonly ok: boolean;
  readonly url: string;
  readonly requests: { readonly total: number; readonly perSecond: number };
  readonly codes: { readonly twoxx: number; readonly fourxx: number; readonly fivexx: number };
  readonly errors: number;
  readonly timeouts: number;
}

interface Scenario {
  readonly name: string;
  readonly expectation: string;
  readonly ok: (result: autocannon.Result) => boolean;
  readonly run: () => Promise<autocannon.Result>;
}

const DURATION_SECONDS = 2;
const SCENARIO_CONNECTIONS = 5;
/** > default 1 MiB (ADR-0011). */
const BIG_BODY = "x".repeat(1_200_000);

/** Ukur RSS proses anak (Linux /proc) agar tidak tercampur memori autocannon (klien di proses ini). */
async function readRssMb(pid: number): Promise<number | null> {
  try {
    const status = await readFile(`/proc/${pid}/status`, "utf8");
    const match = /VmRSS:\s+(\d+)\s+kB/.exec(status);
    return match?.[1] === undefined ? null : Math.round(Number(match[1]) / 1024);
  } catch {
    return null;
  }
}

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const registerPath = fileURLToPath(new URL("../../tools/register.mjs", import.meta.url));

const serverProcess = spawn(
  process.execPath,
  ["--import", registerPath, "apps/playground/src/main.ts"],
  { cwd: repoRoot, stdio: ["ignore", "ignore", "pipe"] },
);

const base = "http://localhost:3000";
{
  const deadline = Date.now() + 10_000;
  let ready = false;
  while (!ready) {
    try {
      const response = await fetch(`${base}/api/hello`);
      ready = response.ok;
    } catch {
      // server belum siap
    }
    if (!ready && Date.now() > deadline) {
      serverProcess.kill("SIGKILL");
      throw new Error("server playground tidak siap dalam 10s (port 3000 terpakai?)");
    }
    if (!ready) {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
}

const jsonHeaders = { "content-type": "application/json" };

const scenarios: readonly Scenario[] = [
  {
    name: "oversized-body",
    expectation: "ditolak 4xx (413) tanpa 5xx",
    ok: (result) => result["4xx"] > 0 && result["2xx"] === 0 && result["5xx"] === 0,
    run: () =>
      autocannon({
        url: `${base}/api/hello`,
        method: "POST",
        headers: jsonHeaders,
        body: BIG_BODY,
        connections: SCENARIO_CONNECTIONS,
        duration: DURATION_SECONDS,
      }),
  },
  {
    name: "malformed-json",
    expectation: "400, tanpa 5xx",
    ok: (result) => result["4xx"] === result.requests.total && result["5xx"] === 0,
    run: () =>
      autocannon({
        url: `${base}/api/echo`,
        method: "POST",
        headers: jsonHeaders,
        body: "{bukan json",
        connections: SCENARIO_CONNECTIONS,
        duration: DURATION_SECONDS,
      }),
  },
  {
    name: "invalid-schema",
    expectation: "400, tanpa 5xx",
    ok: (result) => result["4xx"] === result.requests.total && result["5xx"] === 0,
    run: () =>
      autocannon({
        url: `${base}/api/echo`,
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify({ message: 123 }),
        connections: SCENARIO_CONNECTIONS,
        duration: DURATION_SECONDS,
      }),
  },
  {
    name: "path-traversal-assets",
    expectation: "404, tanpa 2xx",
    ok: (result) => result["4xx"] === result.requests.total && result["2xx"] === 0,
    run: () =>
      autocannon({
        url: `${base}/assets/..%2f..%2fpackage.json`,
        connections: SCENARIO_CONNECTIONS,
        duration: DURATION_SECONDS,
      }),
  },
  {
    name: "huge-query",
    expectation: "200 (query diabaikan), tanpa 5xx",
    ok: (result) => result["2xx"] === result.requests.total && result["5xx"] === 0,
    run: () => {
      const query = Array.from({ length: 200 }, (_, index) => `k${index}=v`).join("&");
      return autocannon({
        url: `${base}/api/hello?${query}`,
        connections: SCENARIO_CONNECTIONS,
        duration: DURATION_SECONDS,
      });
    },
  },
  {
    name: "valid-echo",
    expectation: "200 (body streaming + schema valid)",
    ok: (result) => result["2xx"] === result.requests.total && result["5xx"] === 0,
    run: () =>
      autocannon({
        url: `${base}/api/echo`,
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify({ message: "halo" }),
        connections: 10,
        duration: DURATION_SECONDS,
      }),
  },
];

const results: ScenarioResult[] = [];
for (const scenario of scenarios) {
  const result = await scenario.run();
  const ok = scenario.ok(result);
  results.push({
    name: scenario.name,
    expectation: scenario.expectation,
    ok,
    url: result.url,
    requests: { total: result.requests.total, perSecond: result.requests.average },
    codes: { twoxx: result["2xx"], fourxx: result["4xx"], fivexx: result["5xx"] },
    errors: result.errors,
    timeouts: result.timeouts,
  });
  console.log(
    `${ok ? "OK   " : "GAGAL"} ${scenario.name} — ${JSON.stringify({
      total: result.requests.total,
      "2xx": result["2xx"],
      "4xx": result["4xx"],
      "5xx": result["5xx"],
      errors: result.errors,
      timeouts: result.timeouts,
    })}`,
  );
}

// Soak: load wajar sambil memantau RSS (indikasi pertumbuhan tak terkendali).
const rssSamples: number[] = [];
const sampler = setInterval(() => {
  void readRssMb(serverProcess.pid ?? 0).then((rss) => {
    if (rss !== null) {
      rssSamples.push(rss);
    }
  });
}, 1000);
const soakResult = await autocannon({
  url: `${base}/api/hello`,
  connections: 50,
  duration: 20,
  pipelining: 1,
});
clearInterval(sampler);

// Jeda 3s setelah beban: melihat apakah RSS stabil/turun (bukan tumbuh terus).
for (let tick = 0; tick < 3; tick += 1) {
  await new Promise((resolve) => setTimeout(resolve, 1000));
  const rss = await readRssMb(serverProcess.pid ?? 0);
  if (rss !== null) {
    rssSamples.push(rss);
  }
}

const rssFirst = rssSamples.at(0) ?? 0;
const rssLast = rssSamples.at(-1) ?? 0;

const payload = {
  generatedAt: new Date().toISOString(),
  scenario: "abuse-case + soak memori (playground; tanpa build client)",
  environment: {
    platform: process.platform,
    arch: process.arch,
    node: process.version,
    cpus: cpus().length,
    cpuModel: cpus()[0]?.model ?? "unknown",
  },
  tool: "autocannon 8.0.0",
  note: "Artefak benchmark keamanan — bukan klaim; threshold per workload menyusul (protokol §8)",
  results,
  soak: {
    connections: 50,
    loadSeconds: 20,
    drainSeconds: 3,
    measurement: "RSS proses server (anak) via /proc/<pid>/status — bukan proses klien",
    requestsPerSecond: soakResult.requests.average,
    latency: { p50: soakResult.latency.p50, p99: soakResult.latency.p99 },
    errors: soakResult.errors,
    rssMb: {
      samples: rssSamples,
      first: rssFirst,
      last: rssLast,
      min: Math.min(...rssSamples),
      max: Math.max(...rssSamples),
      delta: rssLast - rssFirst,
    },
  },
};

const target = new URL("../results/phase3-abuse.json", import.meta.url);
await mkdir(dirname(fileURLToPath(target)), { recursive: true });
await writeFile(target, `${JSON.stringify(payload, null, 2)}\n`);

serverProcess.kill("SIGTERM");
await new Promise<void>((resolve) => {
  const timer = setTimeout(() => {
    serverProcess.kill("SIGKILL");
    resolve();
  }, 3000);
  serverProcess.once("exit", () => {
    clearTimeout(timer);
    resolve();
  });
});

const failed = results.filter((result) => !result.ok);
if (failed.length > 0) {
  console.error(`GAGAL: ${failed.map((result) => result.name).join(", ")}`);
  process.exitCode = 1;
} else {
  console.log("semua skenario abuse-case sesuai ekspektasi");
}
