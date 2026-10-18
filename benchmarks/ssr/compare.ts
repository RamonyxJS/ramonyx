// Perbandingan artefak bench SSR (report-only) — ADR-0048. Numerik di subtree `pages`
// dibandingkan lewat utilitas generik; `spread` (statistik bantu) dilewati.

import {
  type CompareOptions,
  compareNumberMaps,
  flattenNumbers,
  formatNumberReport,
  type NumberReport,
} from "../compare.ts";

export interface SsrArtifact {
  readonly scenario?: string;
  readonly pages?: Record<string, unknown>;
  readonly [key: string]: unknown;
}

/** Bandingkan `current` terhadap `baseline`; semua metrik "naik = memburuk" (waktu/ukuran). */
export function compareSsrArtifacts(
  baseline: SsrArtifact,
  current: SsrArtifact,
  tolerancePercent: number,
  options: CompareOptions = {},
): NumberReport {
  const baselineNumbers = flattenNumbers(baseline.pages ?? {}, { skipKeys: ["spread"] });
  const currentNumbers = flattenNumbers(current.pages ?? {}, { skipKeys: ["spread"] });
  return compareNumberMaps(baselineNumbers, currentNumbers, tolerancePercent, options);
}

export function formatSsrReport(report: NumberReport): string {
  return formatNumberReport(report, "perbandingan bench SSR");
}
