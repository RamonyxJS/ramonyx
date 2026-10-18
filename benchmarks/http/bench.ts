import { mkdir, readFile, writeFile } from "node:fs/promises";
import { cpus } from "node:os";
import { dirname, relative, resolve } from "node:path";
import { createNodeHost } from "@ramonyx/adapter-runtime";
import autocannon from "autocannon";
import { createApp } from "../../apps/playground/src/app.ts";
import { type BenchArtifact, compareArtifacts, formatReport } from "./compare.ts";
import { type RunMetrics, summarizeRuns } from "./stats.ts";

// Benchmark HTTP baseline (protokol §8): **warm-up + beberapa ulangan**, laporkan distribusi
// (median antar-run + spread min/max) — bukan sekali jalan. Default menulis ulang baseline
// ter-commit; mode **report-only** (`--out` lain + `--compare`) dipakai CI tanpa menyentuh
// baseline (ADR-0045).

const args = process.argv.slice(2);
const argValue = (name: string): string | undefined => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};

const baselinePath = resolve(
  process.cwd(),
  argValue("--baseline") ?? "benchmarks/results/phase1-baseline.json",
);
const outPath = resolve(
  process.cwd(),
  argValue("--out") ?? "benchmarks/results/phase1-baseline.json",
);
const compare = args.includes("--compare");
const strict = args.includes("--strict");
const tolerancePercent = Number(argValue("--tolerance-pct") ?? "25");
const repeats = Math.max(1, Number(argValue("--repeats") ?? "5"));
const warmupSeconds = Math.max(0, Number(argValue("--warmup-seconds") ?? "3"));
const durationSeconds = Math.max(1, Number(argValue("--duration-seconds") ?? "10"));
const connections = 50;

// Baca baseline SEBELUM menulis apa pun (agar `--compare` tetap bermakna walau
// tujuan tulisnya adalah baseline itu sendiri).
let baseline: BenchArtifact | undefined;
if (compare) {
  try {
    baseline = JSON.parse(await readFile(baselinePath, "utf8")) as BenchArtifact;
  } catch {
    console.log(`(baseline tidak ditemukan di ${baselinePath} — laporan tanpa perbandingan)`);
  }
}

const handler = await createApp();
const host = createNodeHost();
const server = await host.serve(handler, { port: 0 });
const url = new URL("/api/hello", server.url).href;

const runOnce = async (seconds: number): Promise<RunMetrics> => {
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
};

if (warmupSeconds > 0) {
  await runOnce(warmupSeconds);
  console.log(`warm-up ${warmupSeconds}s selesai (dibuang, tidak masuk statistik)`);
}

const runs: RunMetrics[] = [];
for (let index = 1; index <= repeats; index += 1) {
  const metrics = await runOnce(durationSeconds);
  runs.push(metrics);
  console.log(
    `run ${index}/${repeats}: p50=${metrics.latency.p50}ms p90=${metrics.latency.p90}ms p99=${metrics.latency.p99}ms rps=${Math.round(metrics.requestsPerSecond)}`,
  );
}

const aggregate = summarizeRuns(runs);

const environment = {
  platform: process.platform,
  arch: process.arch,
  node: process.version,
  cpus: cpus().length,
  cpuModel: cpus()[0]?.model ?? "unknown",
};

const payload = {
  generatedAt: new Date().toISOString(),
  scenario: "GET /api/hello — routing statis + middleware logging (tanpa I/O)",
  environment,
  tool: "autocannon 8.0.0",
  connections,
  durationSeconds,
  warmupSeconds,
  repeats,
  result: {
    requestsPerSecond: aggregate.requestsPerSecond,
    latency: aggregate.latency,
    throughputBytesPerSecond: aggregate.throughputBytesPerSecond,
    errors: aggregate.errors,
    non2xx: aggregate.non2xx,
    spread: aggregate.spread,
    perRun: runs,
  },
};

await mkdir(dirname(outPath), { recursive: true });
await writeFile(outPath, `${JSON.stringify(payload, null, 2)}\n`);

console.log("\nagregat (median antar-run):");
console.log(JSON.stringify(aggregate.latency, null, 2));
console.log(`requests/detik: ${Math.round(aggregate.requestsPerSecond)}`);
console.log(
  `spread p50: ${aggregate.spread.latency.p50.min}–${aggregate.spread.latency.p50.max} ms | ` +
    `spread rps: ${Math.round(aggregate.spread.requestsPerSecond.min)}–${Math.round(aggregate.spread.requestsPerSecond.max)}`,
);
console.log(`artefak: ${relative(process.cwd(), outPath)}`);

if (compare && baseline !== undefined) {
  const baselineEnvironment = baseline.environment as
    | { cpuModel?: unknown; node?: unknown }
    | undefined;
  if (
    baselineEnvironment?.cpuModel !== undefined &&
    baselineEnvironment.cpuModel !== environment.cpuModel
  ) {
    console.log(
      `catatan: lingkungan berbeda (baseline: ${String(baselineEnvironment.cpuModel)}; sekarang: ${environment.cpuModel}) — bandingkan dengan hati-hati.`,
    );
  }

  const report = compareArtifacts(baseline, payload as BenchArtifact, tolerancePercent);
  console.log(`\n${formatReport(report)}`);
  if (report.breached && strict) {
    console.error("REGRESI melebihi toleransi (mode --strict)");
    process.exitCode = 1;
  }
}

await server.close();
