import { mkdir, readFile, writeFile } from "node:fs/promises";
import { cpus } from "node:os";
import { dirname, relative, resolve } from "node:path";
import { createNodeHost } from "@ramonyx/adapter-runtime";
import autocannon from "autocannon";
import { createApp } from "../../apps/playground/src/app.ts";
import { type BenchArtifact, compareArtifacts, formatReport } from "./compare.ts";

// Benchmark HTTP baseline (blueprint §8). Default menulis ulang baseline ter-commit;
// mode **report-only** (--out ke berkas lain + --compare) dipakai CI tanpa menyentuh
// baseline — lihat ADR-0045 dan `pnpm bench:report`.

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

const connections = 50;
const durationSeconds = 10;

const result = await autocannon({
  url: new URL("/api/hello", server.url).href,
  connections,
  duration: durationSeconds,
  pipelining: 1,
});

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

await mkdir(dirname(outPath), { recursive: true });
await writeFile(outPath, `${JSON.stringify(payload, null, 2)}\n`);

console.log(JSON.stringify(payload.result, null, 2));
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
