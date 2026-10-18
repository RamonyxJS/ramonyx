import assert from "node:assert/strict";
import { test } from "node:test";

import { compareVitals, formatVitalsReport, type VitalsArtifact } from "./compare.ts";

function artifact(vitals: Partial<VitalsArtifact["vitals"]> = {}): VitalsArtifact {
  return {
    vitals: { lcp: 300, fcp: 300, ttfb: 40, cls: 0, ...vitals },
  };
}

test("vitals: kenaikan melewati toleransi → breach; baseline cls 0 dilewati", () => {
  const report = compareVitals(artifact(), artifact({ lcp: 500 }), 25);

  assert.deepEqual(
    report.comparison.comparisons.map((comparison) => comparison.metric),
    ["fcp", "lcp", "ttfb"],
    "cls baseline 0 dilewati (tanpa pembagian nol)",
  );
  const lcp = report.comparison.comparisons.find((comparison) => comparison.metric === "lcp");
  assert.equal(lcp?.breach, true, "lcp +66% melewati toleransi 25%");
  assert.equal(report.comparison.breached, true);
});

test("vitals: ambang absolut melaporkan ok/tidak per metrik", () => {
  const report = compareVitals(artifact(), artifact({ lcp: 3000, cls: 0.05 }), 25);
  const byMetric = new Map(report.budgets.map((row) => [row.metric, row]));

  assert.equal(byMetric.get("lcp")?.ok, false, "3000 > 2500");
  assert.equal(byMetric.get("cls")?.ok, true, "0.05 ≤ 0.1");
  assert.equal(byMetric.get("ttfb")?.ok, true);
});

test("formatVitalsReport: memuat perbandingan dan ambang absolut", () => {
  const teks = formatVitalsReport(compareVitals(artifact(), artifact({ lcp: 3000 }), 25));
  assert.ok(teks.includes("perbandingan Web Vitals"));
  assert.ok(teks.includes("ambang absolut (report-only):"));
  assert.ok(teks.includes("⚠ lcp ≤ 2500"));
});
