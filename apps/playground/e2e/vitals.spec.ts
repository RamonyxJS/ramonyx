import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";

interface Vitals {
  lcp: number;
  cls: number;
  fcp: number;
  ttfb: number;
}

test("baseline Web Vitals beranda (artefak; threshold menyusul, protokol §8)", async ({ page }) => {
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

  await page.goto("/");
  await page.waitForLoadState("load");
  await page.waitForTimeout(1200);

  const vitals = await page.evaluate(
    () => (globalThis as unknown as { __ramonyxVitals: Vitals }).__ramonyxVitals,
  );

  expect(vitals.lcp).toBeGreaterThan(0);
  expect(vitals.fcp).toBeGreaterThan(0);
  expect(vitals.ttfb).toBeGreaterThan(0);

  const payload = `${JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      scenario: "GET / (build produksi, Chromium)",
      viewport: page.viewportSize(),
      note: "Baseline artefak — bukan klaim; threshold per workload menyusul (protokol benchmark §8)",
      vitals,
    },
    null,
    2,
  )}\n`;

  // Baseline ter-commit hanya diperbarui saat diminta / belum ada; run biasa menulis ke test-results/
  // agar tidak menimbulkan churn git setiap e2e dijalankan.
  const baselinePath = "benchmarks/results/phase2-web-vitals.json";
  const updateBaseline = process.env.UPDATE_BASELINE_VITALS === "1" || !existsSync(baselinePath);
  const targetPath = updateBaseline ? baselinePath : "test-results/web-vitals-latest.json";

  await mkdir("benchmarks/results", { recursive: true });
  await mkdir("test-results", { recursive: true });
  await writeFile(targetPath, payload);
  if (updateBaseline) {
    console.log(`[vitals] baseline diperbarui: ${targetPath}`);
  } else {
    console.log(`[vitals] hasil run ini: ${targetPath} (baseline tidak diubah)`);
  }
});
