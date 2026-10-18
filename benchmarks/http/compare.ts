// Perbandingan artefak benchmark HTTP (report-only) — ADR-0045.
//
// Fungsi murni (tanpa I/O) supaya perilaku threshold dapat diuji unit; pemakaian ada di
// `bench.ts` (`--compare`). Default: **tidak** menggagalkan apa pun kecuali `--strict`.

export interface LatencyMetrics {
  readonly p50: number;
  readonly p90: number;
  readonly p97_5?: number;
  readonly p99?: number;
  readonly max?: number;
}

export interface BenchArtifact {
  readonly scenario?: string;
  readonly environment?: Record<string, unknown>;
  readonly result: {
    readonly requestsPerSecond: number;
    readonly latency?: LatencyMetrics;
    readonly [key: string]: unknown;
  };
}

export interface MetricComparison {
  readonly metric: string;
  readonly baseline: number;
  readonly current: number;
  readonly deltaPercent: number;
  readonly worseWhen: "naik" | "turun";
  readonly breach: boolean;
}

export interface CompareReport {
  readonly tolerancePercent: number;
  readonly comparisons: readonly MetricComparison[];
  readonly breached: boolean;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Bandingkan `current` terhadap `baseline`:
 * - latency naik melebihi toleransi → regresi;
 * - requests/detik turun melebihi toleransi → regresi;
 * - baseline 0/tidak valid → metrik dilewati (tidak ada pembagian nol).
 */
export function compareArtifacts(
  baseline: BenchArtifact,
  current: BenchArtifact,
  tolerancePercent: number,
): CompareReport {
  const comparisons: MetricComparison[] = [];

  const push = (metric: string, base: number, cur: number, worseWhen: "naik" | "turun"): void => {
    if (!Number.isFinite(base) || !Number.isFinite(cur) || base === 0) {
      return;
    }
    const deltaPercent = round2(((cur - base) / base) * 100);
    const breach =
      worseWhen === "naik" ? deltaPercent > tolerancePercent : deltaPercent < -tolerancePercent;
    comparisons.push({ metric, baseline: base, current: cur, deltaPercent, worseWhen, breach });
  };

  const baselineLatency = baseline.result.latency;
  const currentLatency = current.result.latency;
  if (baselineLatency !== undefined && currentLatency !== undefined) {
    push("latency p50 (ms)", baselineLatency.p50, currentLatency.p50, "naik");
    push("latency p90 (ms)", baselineLatency.p90, currentLatency.p90, "naik");
    if (baselineLatency.p99 !== undefined && currentLatency.p99 !== undefined) {
      push("latency p99 (ms)", baselineLatency.p99, currentLatency.p99, "naik");
    }
  }

  push(
    "requests/detik",
    baseline.result.requestsPerSecond,
    current.result.requestsPerSecond,
    "turun",
  );

  return {
    tolerancePercent,
    comparisons,
    breached: comparisons.some((comparison) => comparison.breach),
  };
}

/** Laporan teks ringkas untuk log/CI. */
export function formatReport(report: CompareReport): string {
  const baris = report.comparisons.map((comparison) => {
    const tanda = comparison.breach ? "⚠" : "✓";
    const arah = comparison.deltaPercent >= 0 ? "+" : "";
    return `  ${tanda} ${comparison.metric}: ${comparison.baseline} → ${comparison.current} (${arah}${comparison.deltaPercent}%)`;
  });

  const header = `perbandingan benchmark (toleransi ${report.tolerancePercent}%, report-only):`;
  const catatan = report.breached
    ? "  catatan: ada metrik melewati toleransi — regresi perlu ditinjau (gate belum memblokir)."
    : "  catatan: semua metrik dalam toleransi.";
  return [header, ...baris, catatan].join("\n");
}
