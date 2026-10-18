// Perbandingan angka generik untuk laporan benchmark (report-only): flatten nilai numerik
// (opsional menykip kunci statistik bantu), hitung delta %, tandai pelanggaran toleransi.
// Fungsi murni supaya perilaku threshold dapat diuji unit; dipakai bench SSR (`ssr/compare.ts`)
// dan laporan Web Vitals (`vitals/compare.ts`) — ADR-0048.

export interface NumberComparison {
  readonly metric: string;
  readonly baseline: number;
  readonly current: number;
  readonly deltaPercent: number;
  readonly breach: boolean;
}

export interface NumberReport {
  readonly tolerancePercent: number;
  readonly comparisons: readonly NumberComparison[];
  readonly breached: boolean;
}

export interface FlattenOptions {
  /** Kunci objek yang dilewati, mis. statistik bantu `spread`/`perRun`. */
  readonly skipKeys?: readonly string[];
}

export interface CompareOptions {
  /**
   * Ambang lantai: breach butuh **kedua** syarat — delta persen > toleransi DAN delta mutlak
   * > lantai. Meredam noise metrik bernilai sangat kecil (mis. TTFB sub-milidetik).
   */
  readonly minAbsoluteDelta?: number;
}

/** Kumpulkan semua daun numerik (finite) sebagai peta `path → nilai`. */
export function flattenNumbers(
  value: unknown,
  options: FlattenOptions = {},
  prefix = "",
): Map<string, number> {
  const skip = new Set(options.skipKeys ?? []);
  const out = new Map<string, number>();

  const walk = (node: unknown, path: string): void => {
    if (typeof node === "number") {
      if (Number.isFinite(node)) {
        out.set(path, node);
      }
      return;
    }
    if (typeof node !== "object" || node === null) {
      return;
    }
    for (const [key, child] of Object.entries(node as Record<string, unknown>)) {
      if (skip.has(key)) {
        continue;
      }
      walk(child, path === "" ? key : `${path}.${key}`);
    }
  };

  walk(value, prefix);
  return out;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Bandingkan dua peta angka: **naik melebihi toleransi = regresi** (semua metrik di sini
 * "naik = memburuk": waktu, ukuran output, latensi). Baseline 0/tidak valid atau metrik yang
 * hanya ada di satu sisi dilewati (tanpa pembagian nol).
 */
export function compareNumberMaps(
  baseline: Map<string, number>,
  current: Map<string, number>,
  tolerancePercent: number,
  options: CompareOptions = {},
): NumberReport {
  const minAbsoluteDelta = options.minAbsoluteDelta ?? 0;
  const comparisons: NumberComparison[] = [];
  for (const [metric, base] of baseline) {
    const cur = current.get(metric);
    if (cur === undefined || base === 0) {
      continue;
    }
    const deltaPercent = round2(((cur - base) / base) * 100);
    comparisons.push({
      metric,
      baseline: base,
      current: cur,
      deltaPercent,
      breach: deltaPercent > tolerancePercent && cur - base > minAbsoluteDelta,
    });
  }
  comparisons.sort((a, b) => a.metric.localeCompare(b.metric));
  return {
    tolerancePercent,
    comparisons,
    breached: comparisons.some((comparison) => comparison.breach),
  };
}

/** Laporan teks ringkas untuk log/CI (`footer` opsional menggantikan catatan bawaan). */
export function formatNumberReport(report: NumberReport, header: string, footer?: string): string {
  const baris = report.comparisons.map((comparison) => {
    const tanda = comparison.breach ? "⚠" : "✓";
    const arah = comparison.deltaPercent >= 0 ? "+" : "";
    return `  ${tanda} ${comparison.metric}: ${comparison.baseline} → ${comparison.current} (${arah}${comparison.deltaPercent}%)`;
  });
  const catatan =
    footer ??
    (report.breached
      ? "  catatan: ada metrik melewati toleransi — tinjau (belum memblokir)."
      : "  catatan: semua metrik dalam toleransi.");
  return [
    `${header} (toleransi ${report.tolerancePercent}%, report-only):`,
    ...baris,
    catatan,
  ].join("\n");
}
