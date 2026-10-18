// Perbandingan Web Vitals (report-only) + ambang absolut "good" yang lazim dipakai
// (LCP/CLS = Core Web Vitals; FCP/TTFB = panduan umum web vitals) — ADR-0048.
// Dipakai e2e `apps/playground/e2e/vitals.spec.ts`; `VITALS_STRICT=1` mengaktifkan kegagalan.

import {
  compareNumberMaps,
  flattenNumbers,
  formatNumberReport,
  type NumberReport,
} from "../compare.ts";

export interface Vitals {
  readonly lcp: number;
  readonly cls: number;
  readonly fcp: number;
  readonly ttfb: number;
}

export interface VitalsArtifact {
  readonly vitals: Vitals;
  readonly [key: string]: unknown;
}

export interface BudgetRow {
  readonly metric: string;
  readonly value: number;
  readonly budget: number;
  readonly ok: boolean;
}

export interface VitalsReport {
  readonly comparison: NumberReport;
  readonly budgets: readonly BudgetRow[];
}

/** Ambang absolut (ms untuk waktu; CLS tanpa satuan). */
export const VITALS_BUDGETS: Readonly<Record<keyof Vitals, number>> = {
  lcp: 2500,
  fcp: 1800,
  ttfb: 800,
  cls: 0.1,
};

export function compareVitals(
  baseline: VitalsArtifact,
  current: VitalsArtifact,
  tolerancePercent: number,
): VitalsReport {
  const comparison = compareNumberMaps(
    flattenNumbers(baseline.vitals),
    flattenNumbers(current.vitals),
    tolerancePercent,
  );

  const values = current.vitals as unknown as Record<string, number>;
  const budgets = Object.entries(VITALS_BUDGETS).map(([metric, budget]) => {
    const value = values[metric] ?? Number.NaN;
    return { metric, value, budget, ok: Number.isFinite(value) && value <= budget };
  });

  return { comparison, budgets };
}

/** Laporan teks: perbandingan vs baseline + pemeriksaan ambang absolut. */
export function formatVitalsReport(report: VitalsReport): string {
  const ambang = report.budgets.map(
    (row) => `  ${row.ok ? "✓" : "⚠"} ${row.metric} ≤ ${row.budget}: ${row.value}`,
  );
  return [
    formatNumberReport(report.comparison, "perbandingan Web Vitals"),
    "  ambang absolut (report-only):",
    ...ambang,
  ].join("\n");
}
