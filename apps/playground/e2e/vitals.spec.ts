import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { type CDPSession, expect, test } from "@playwright/test";
import { median } from "../../../benchmarks/stats.ts";
import {
  compareVitals,
  formatVitalsReport,
  type VitalsArtifact,
} from "../../../benchmarks/vitals/compare.ts";

interface Vitals {
  lcp: number;
  cls: number;
  fcp: number;
  ttfb: number;
}

test("baseline Web Vitals beranda (artefak + perbandingan report-only, protokol §8)", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const vitals = { lcp: 0, cls: 0, fcp: 0, ttfb: 0 };
    (globalThis as unknown as Record<string, unknown>).__ramonyxVitals = vitals;

    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        vitals.lcp = entry.startTime;
      }
    }).observe({ type: "largest-contentful-paint", buffered: true });

    new PerformanceObserver((list) => {
      const shifts = list.getEntries() as (PerformanceEntry & {
        value: number;
        hadRecentInput: boolean;
      })[];
      for (const entry of shifts) {
        if (!entry.hadRecentInput) {
          vitals.cls += entry.value;
        }
      }
    }).observe({ type: "layout-shift", buffered: true });

    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.name === "first-contentful-paint") {
          vitals.fcp = entry.startTime;
        }
      }
    }).observe({ type: "paint", buffered: true });

    new PerformanceObserver((list) => {
      const nav = list.getEntries()[0] as
        | (PerformanceEntry & { responseStart: number })
        | undefined;
      if (nav !== undefined) {
        vitals.ttfb = nav.responseStart;
      }
    }).observe({ type: "navigation", buffered: true });
  });

  // `VITALS_THROTTLE=slow` (dipakai benchmarks/vitals/image-pipeline.mjs): perlambat jaringan +
  // CPU via CDP **dan** kosongkan cache per load (aset build `immutable` — tanpa ini load ke-2+
  // selalu dari cache sehingga CLS gambar selalu 0).
  let cdp: CDPSession | undefined;
  if (process.env.VITALS_THROTTLE === "slow") {
    cdp = await page.context().newCDPSession(page);
    await cdp.send("Network.enable");
    await cdp.send("Network.emulateNetworkConditions", {
      // Profil ala "Slow 3G": RTT tinggi + bandwidth rendah → aset (gambar) termuat setelah
      // first paint, sehingga CLS/anti-CLS terukur (localhost tanpa throttle selalu CLS 0).
      offline: false,
      latency: 400,
      downloadThroughput: 50 * 1024,
      uploadThroughput: 20 * 1024,
    });
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  }

  // 1 load pemanasan (server JIT + cache) dibuang, lalu median dari 3 load — TTFB/LCP satu
  // load terlalu berisik untuk dijadikan pembanding (ADR-0048).
  const loads: Vitals[] = [];
  for (let index = 0; index < 4; index += 1) {
    if (cdp !== undefined) {
      await cdp.send("Network.clearBrowserCache");
    }
    await page.goto("/");
    await page.waitForLoadState("load");
    await page.waitForTimeout(1200);

    const vitals = await page.evaluate(
      () => (globalThis as unknown as { __ramonyxVitals: Vitals }).__ramonyxVitals,
    );

    expect(vitals.lcp).toBeGreaterThan(0);
    expect(vitals.fcp).toBeGreaterThan(0);
    expect(vitals.ttfb).toBeGreaterThan(0);

    if (index > 0) {
      loads.push(vitals);
    }
  }

  const vitals: Vitals = {
    lcp: median(loads.map((load) => load.lcp)),
    cls: median(loads.map((load) => load.cls)),
    fcp: median(loads.map((load) => load.fcp)),
    ttfb: median(loads.map((load) => load.ttfb)),
  };

  const artifact = {
    generatedAt: new Date().toISOString(),
    scenario: "GET / (build produksi, Chromium, React produksi + SSR streaming)",
    viewport: page.viewportSize(),
    note: "Baseline artefak — bukan klaim; vitals = median 3 load (1 load pemanasan dibuang); perbandingan report-only vs baseline (protokol benchmark §8, ADR-0048)",
    runs: loads.length,
    vitals,
    perRun: loads,
  };
  const payload = `${JSON.stringify(artifact, null, 2)}\n`;

  // Baseline ter-commit hanya diperbarui saat diminta / belum ada; run biasa menulis ke test-results/
  // agar tidak menimbulkan churn git setiap e2e dijalankan.
  // `VITALS_OUT` (dipakai benchmarks/vitals/image-pipeline.mjs) menulis artefak ke path eksplisit
  // tanpa menyentuh baseline.
  const baselinePath = "benchmarks/results/phase2-web-vitals.json";
  const vitalsOut = process.env.VITALS_OUT;
  const updateBaseline =
    vitalsOut === undefined &&
    (process.env.UPDATE_BASELINE_VITALS === "1" || !existsSync(baselinePath));
  const targetPath =
    vitalsOut ?? (updateBaseline ? baselinePath : "test-results/web-vitals-latest.json");

  await mkdir("benchmarks/results", { recursive: true });
  await mkdir("test-results", { recursive: true });
  await writeFile(targetPath, payload);

  if (updateBaseline) {
    console.log(`[vitals] baseline diperbarui: ${targetPath}`);
    return;
  }

  if (vitalsOut !== undefined) {
    console.log(`[vitals] artefak ditulis: ${targetPath}`);
    return;
  }

  console.log(`[vitals] hasil run ini: ${targetPath} (baseline tidak diubah)`);

  const baseline = JSON.parse(await readFile(baselinePath, "utf8")) as VitalsArtifact;
  const report = compareVitals(
    baseline,
    artifact,
    Number(process.env.VITALS_TOLERANCE_PCT ?? "25"),
  );
  console.log(`[vitals]\n${formatVitalsReport(report)}`);

  if (process.env.VITALS_STRICT === "1") {
    expect(report.comparison.breached, "regresi Web Vitals vs baseline (VITALS_STRICT=1)").toBe(
      false,
    );
  }
  if (process.env.VITALS_BUDGET_STRICT === "1") {
    const breached = report.budgets.filter((budget) => !budget.ok);
    expect(breached, `Web Vitals melewati budget absolut (VITALS_BUDGET_STRICT=1)`).toEqual([]);
  }
});
