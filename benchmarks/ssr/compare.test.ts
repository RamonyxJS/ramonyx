import assert from "node:assert/strict";
import { test } from "node:test";

import { compareSsrArtifacts, formatSsrReport } from "./compare.ts";

function artifact(ttfb: number, total: number): Record<string, unknown> {
  return {
    pages: {
      small: {
        sync: { totalMs: 1 },
        stream: { ttfbMs: ttfb, totalMs: total },
        bytes: { sync: 100, stream: 100 },
        parity: true,
        spread: { "stream.ttfbMs": { min: 1, max: 9 } },
      },
    },
  };
}

test("bench SSR: metrik halaman naik melewati toleransi → breach; spread dilewati", () => {
  const report = compareSsrArtifacts(artifact(2, 3), artifact(3, 3.5), 25);

  assert.deepEqual(
    report.comparisons.map((comparison) => comparison.metric),
    [
      "small.bytes.stream",
      "small.bytes.sync",
      "small.stream.totalMs",
      "small.stream.ttfbMs",
      "small.sync.totalMs",
    ],
    "spread tidak masuk perbandingan",
  );
  assert.equal(report.breached, true, "ttfb +50% melewati toleransi 25%");
});

test("bench SSR: dalam toleransi → tidak breach; halaman hilang di satu sisi dilewati", () => {
  const dalam = compareSsrArtifacts(artifact(2, 3), artifact(2.4, 3.6), 25);
  assert.equal(dalam.breached, false);

  const parsial = compareSsrArtifacts(
    { pages: { small: { sync: { totalMs: 1 } } } },
    artifact(2, 3),
    25,
  );
  assert.deepEqual(
    parsial.comparisons.map((comparison) => comparison.metric),
    ["small.sync.totalMs"],
    "metrik yang hanya ada di satu sisi dilewati",
  );
});

test("formatSsrReport: header khas SSR + catatan report-only", () => {
  const teks = formatSsrReport(compareSsrArtifacts(artifact(2, 3), artifact(3, 3), 25));
  assert.ok(teks.includes("perbandingan bench SSR"));
  assert.ok(teks.includes("report-only"));
});

test("bench SSR: lantai delta absolut diteruskan ke perbandingan", () => {
  const kecil = compareSsrArtifacts(artifact(0.88, 3), artifact(1.2, 3), 25, {
    minAbsoluteDelta: 0.5,
  });
  assert.equal(kecil.breached, false, "ttfb +36% tapi delta 0.32 ms < lantai");

  const besar = compareSsrArtifacts(artifact(0.88, 3), artifact(1.6, 3), 25, {
    minAbsoluteDelta: 0.5,
  });
  assert.equal(besar.breached, true, "delta 0.72 ms > lantai → tetap breach");
});
