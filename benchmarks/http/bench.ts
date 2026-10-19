import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { createNodeHost } from "@ramonyx/adapter-runtime";
import autocannon from "autocannon";
import { createApp } from "../../apps/playground/src/app.ts";
import {
  baselinePathFor,
  captureEnvironment,
  environmentsMatch,
  envMismatchNote,
  LEGACY_HTTP_BASELINE,
} from "../lib/env.ts";
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

// Baseline per-lingkungan (ADR-0074): default path memuat kunci lingkungan (platform/arch/
// node-major/cpu) sehingga mesin berbeda tidak saling menimpa baseline.
const environment = captureEnvironment();
const defaultBaseline = baselinePathFor(environment, { name: "http" });
const baselinePath = resolve(process.cwd(), argValue("--baseline") ?? defaultBaseline);
const outPath = resolve(process.cwd(), argValue("--out") ?? defaultBaseline);
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
  for (const kandidat of [baselinePath, resolve(process.cwd(), LEGACY_HTTP_BASELINE)]) {
    try {
      baseline = JSON.parse(await readFile(kandidat, "utf8")) as BenchArtifact;
      if (kandidat !== baselinePath) {
        console.log(
          `catatan: baseline per-lingkungan belum ada — memakai baseline lama ${relative(process.cwd(), kandidat)}`,
        );
      }
      break;
    } catch {
      // coba kandidat berikutnya
    }
  }
  if (baseline === undefined) {
    console.log(`(baseline tidak ditemukan untuk ${defaultBaseline} — laporan tanpa perbandingan)`);
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
  // Guard lingkungan (ADR-0074): pembandingan ketat hanya sahih di lingkungan yang sama.
  const cocok = environmentsMatch(baseline.environment, environment);
  if (!cocok) {
    console.log(
      `catatan: lingkungan berbeda (${envMismatchNote(baseline.environment, environment) ?? "tidak diketahui"}) — bandingkan dengan hati-hati.`,
    );
    if (strict) {
      console.error(
        `--strict tidak bisa dipakai lintas lingkungan: ${envMismatchNote(baseline.environment, environment)}. ` +
          "Jalankan di lingkungan baseline atau perbarui baseline (`pnpm bench` di mesin ini).",
      );
      process.exitCode = 1;
    }
  }

  const report = compareArtifacts(baseline, payload as unknown as BenchArtifact, tolerancePercent);
  console.log(`\n${formatReport(report)}`);
  if (report.breached && strict && cocok) {
    console.error("REGRESI melebihi toleransi (mode --strict)");
    process.exitCode = 1;
  }
}

await server.close();
