// Statistik benchmark HTTP (protokol §8): warm-up + beberapa ulangan → distribusi (median +
// min/max), bukan sekali jalan. Fungsi murni supaya dapat diuji unit (ADR-0045); helper
// median/spread dibagi di `benchmarks/stats.ts`.

import { median, type Spread, spread } from "../stats.ts";

export interface LatencyMetrics {
  readonly p50: number;
  readonly p90: number;
  readonly p97_5: number;
  readonly p99: number;
  readonly max: number;
}

export interface RunMetrics {
  readonly latency: LatencyMetrics;
  readonly requestsPerSecond: number;
  readonly throughputBytesPerSecond: number;
  readonly errors: number;
  readonly non2xx: number;
}

export interface AggregatedMetrics extends RunMetrics {
  readonly spread: {
    readonly latency: Record<keyof LatencyMetrics, Spread>;
    readonly requestsPerSecond: Spread;
    readonly throughputBytesPerSecond: Spread;
  };
}

function medianOf(values: (runs: RunMetrics) => number, runs: readonly RunMetrics[]): number {
  return median(runs.map(values));
}

/**
 * Agregasi ulangan: setiap metrik = **median** antar-run; `spread` = min/max;
 * `errors`/`non2xx` = jumlah total (harus 0 pada workload sehat).
 */
export function summarizeRuns(runs: readonly RunMetrics[]): AggregatedMetrics {
  if (runs.length === 0) {
    throw new Error("summarizeRuns butuh minimal satu run");
  }
  const latencyKeys = ["p50", "p90", "p97_5", "p99", "max"] as const;

  const latency = {
    p50: medianOf((run) => run.latency.p50, runs),
    p90: medianOf((run) => run.latency.p90, runs),
    p97_5: medianOf((run) => run.latency.p97_5, runs),
    p99: medianOf((run) => run.latency.p99, runs),
    max: medianOf((run) => run.latency.max, runs),
  };

  const latencySpread = {} as Record<(typeof latencyKeys)[number], Spread>;
  for (const key of latencyKeys) {
    latencySpread[key] = spread(runs.map((run) => run.latency[key]));
  }

  return {
    latency,
    requestsPerSecond: medianOf((run) => run.requestsPerSecond, runs),
    throughputBytesPerSecond: medianOf((run) => run.throughputBytesPerSecond, runs),
    errors: runs.reduce((total, run) => total + run.errors, 0),
    non2xx: runs.reduce((total, run) => total + run.non2xx, 0),
    spread: {
      latency: latencySpread,
      requestsPerSecond: spread(runs.map((run) => run.requestsPerSecond)),
      throughputBytesPerSecond: spread(runs.map((run) => run.throughputBytesPerSecond)),
    },
  };
}
