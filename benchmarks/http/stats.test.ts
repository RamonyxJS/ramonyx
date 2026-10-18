import assert from "node:assert/strict";
import { test } from "node:test";

import { type RunMetrics, summarizeRuns } from "./stats.ts";

function run(p50: number, rps: number): RunMetrics {
  return {
    latency: { p50, p90: p50 * 2, p97_5: p50 * 3, p99: p50 * 4, max: p50 * 5 },
    requestsPerSecond: rps,
    throughputBytesPerSecond: rps * 100,
    errors: 0,
    non2xx: 0,
  };
}

test("summarizeRuns: median antar-run + spread min/max", () => {
  const hasil = summarizeRuns([run(30, 1000), run(50, 800), run(40, 1200)]);
  assert.equal(hasil.latency.p50, 40, "median p50");
  assert.equal(hasil.latency.p90, 80);
  assert.equal(hasil.requestsPerSecond, 1000, "median rps");
  assert.deepEqual(hasil.spread.latency.p50, { min: 30, max: 50 });
  assert.deepEqual(hasil.spread.requestsPerSecond, { min: 800, max: 1200 });
});

test("summarizeRuns: error dijumlahkan, run kosong ditolak", () => {
  const denganError = summarizeRuns([
    { ...run(10, 100), errors: 2, non2xx: 1 },
    { ...run(10, 100), errors: 3 },
  ]);
  assert.equal(denganError.errors, 5);
  assert.equal(denganError.non2xx, 1);
  assert.throws(() => summarizeRuns([]));
});
