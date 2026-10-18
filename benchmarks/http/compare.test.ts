import assert from "node:assert/strict";
import { test } from "node:test";

import { type BenchArtifact, compareArtifacts, formatReport } from "./compare.ts";

function artifact(
  requestsPerSecond: number,
  latency: { p50: number; p90: number; p99?: number },
): BenchArtifact {
  return { result: { requestsPerSecond, latency } };
}

test("semua metrik dalam toleransi → tidak breach", () => {
  const report = compareArtifacts(
    artifact(10_000, { p50: 10, p90: 20, p99: 30 }),
    artifact(9_500, { p50: 11, p90: 22, p99: 33 }),
    20,
  );
  assert.equal(report.breached, false);
  assert.equal(report.comparisons.length, 4);
  assert.ok(report.comparisons.every((comparison) => !comparison.breach));
});

test("latency p50 naik melewati toleransi → breach", () => {
  const report = compareArtifacts(
    artifact(10_000, { p50: 10, p90: 20 }),
    artifact(10_000, { p50: 15, p90: 21 }),
    30,
  );
  assert.equal(report.breached, true);
  const p50 = report.comparisons.find((comparison) => comparison.metric.includes("p50"));
  assert.equal(p50?.breach, true);
  assert.equal(p50?.deltaPercent, 50);
});

test("requests/detik turun melewati toleransi → breach (arah turun)", () => {
  const turun = compareArtifacts(
    artifact(10_000, { p50: 10, p90: 20 }),
    artifact(6_000, { p50: 10, p90: 20 }),
    25,
  );
  assert.equal(turun.breached, true);
  const naik = compareArtifacts(
    artifact(10_000, { p50: 10, p90: 20 }),
    artifact(13_000, { p50: 10, p90: 20 }),
    25,
  );
  assert.equal(naik.breached, false, "kenaikan throughput bukan regresi");
});

test("baseline tanpa latency / nilai nol aman (tanpa pembagian nol)", () => {
  const tanpaLatency = compareArtifacts(
    { result: { requestsPerSecond: 100 } },
    artifact(100, { p50: 1, p90: 2 }),
    25,
  );
  assert.equal(tanpaLatency.comparisons.length, 1);
  assert.equal(tanpaLatency.comparisons[0]?.metric, "requests/detik");

  const nol = compareArtifacts(
    artifact(0, { p50: 0, p90: 0 }),
    artifact(1, { p50: 1, p90: 1 }),
    25,
  );
  assert.equal(nol.comparisons.length, 0);
  assert.equal(nol.breached, false);
});

test("formatReport memuat metrik dan catatan report-only", () => {
  const teks = formatReport(
    compareArtifacts(
      artifact(10_000, { p50: 10, p90: 20 }),
      artifact(5_000, { p50: 10, p90: 20 }),
      25,
    ),
  );
  assert.match(teks, /p50/);
  assert.match(teks, /requests\/detik/);
  assert.match(teks, /report-only/);
  assert.match(teks, /melewati toleransi/);
});
