// Statistik benchmark bersama (protokol §8): median + rentang min/max dari beberapa ulangan.
// Fungsi murni supaya perilakunya dapat diuji unit; dipakai bench HTTP (`http/stats.ts`) dan
// bench SSR (`ssr/`) — ADR-0045/0048.

export interface Spread {
  readonly min: number;
  readonly max: number;
}

/** Median; array kosong → error (pemanggil harus menjaga minimal satu nilai). */
export function median(values: readonly number[]): number {
  if (values.length === 0) {
    throw new Error("median butuh minimal satu nilai");
  }
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[middle] ?? 0;
  }
  return ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

/** Rentang min–max; array kosong → error. */
export function spread(values: readonly number[]): Spread {
  if (values.length === 0) {
    throw new Error("spread butuh minimal satu nilai");
  }
  return { min: Math.min(...values), max: Math.max(...values) };
}
