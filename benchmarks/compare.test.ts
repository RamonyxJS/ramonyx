import assert from "node:assert/strict";
import { test } from "node:test";

import { compareNumberMaps, flattenNumbers, formatNumberReport } from "./compare.ts";

test("flattenNumbers: hanya daun numerik finite, menykip kunci bantu", () => {
  const values = flattenNumbers(
    {
      sync: { totalMs: 1.5 },
      stream: { ttfbMs: 2, totalMs: 3 },
      parity: true,
      note: "teks",
      kosong: null,
      nan: Number.NaN,
      spread: { "sync.totalMs": { min: 1, max: 2 } },
    },
    { skipKeys: ["spread"] },
  );

  assert.deepEqual([...values.entries()].sort(), [
    ["stream.totalMs", 3],
    ["stream.ttfbMs", 2],
    ["sync.totalMs", 1.5],
  ]);
});

test("compareNumberMaps: naik melewati toleransi = breach; baseline 0 & metrik hilang dilewati", () => {
  const baseline = new Map([
    ["a.ms", 100],
    ["b.bytes", 0],
    ["c.cls", 0.05],
  ]);
  const current = new Map([
    ["a.ms", 130],
    ["b.bytes", 999],
    ["c.cls", 0.4],
  ]);

  const report = compareNumberMaps(baseline, current, 25);
  assert.deepEqual(
    report.comparisons.map((comparison) => [comparison.metric, comparison.breach]),
    [
      ["a.ms", true],
      ["c.cls", true],
    ],
    "urutan alfabetis; baseline 0 dilewati tanpa pembagian nol",
  );
  assert.equal(report.breached, true);

  const dalam = compareNumberMaps(new Map([["a.ms", 100]]), new Map([["a.ms", 120]]), 25);
  assert.equal(dalam.breached, false);
});

test("formatNumberReport: memuat tanda ✓/⚠ dan catatan report-only", () => {
  const report = compareNumberMaps(new Map([["a.ms", 100]]), new Map([["a.ms", 200]]), 25);
  const teks = formatNumberReport(report, "perbandingan uji");
  assert.ok(teks.includes("perbandingan uji (toleransi 25%, report-only):"));
  assert.ok(teks.includes("⚠ a.ms: 100 → 200 (+100%)"));
  assert.ok(teks.includes("belum memblokir"));
});

test("compareNumberMaps: lantai delta absolut meredam noise metrik sub-milidetik", () => {
  const baseline = new Map([["ttfb", 0.88]]);
  const current = new Map([["ttfb", 1.2]]);

  assert.equal(
    compareNumberMaps(baseline, current, 25).breached,
    true,
    "tanpa lantai: persen murni (+36%) → breach",
  );
  assert.equal(
    compareNumberMaps(baseline, current, 25, { minAbsoluteDelta: 0.5 }).breached,
    false,
    "delta 0.32 ms < lantai 0.5 ms",
  );
});
