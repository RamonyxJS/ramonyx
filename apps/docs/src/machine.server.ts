// Machine layer PUBLIK — modul `*.server.ts` distub di bundle klien.
// Angka berasal dari modul generated (edge-safe, tanpa `node:fs`).
import { PUBLIC_STATS, type PublicStats } from "./public-stats.ts";

export type { PublicStats };

export function readPublicStats(): PublicStats {
  return PUBLIC_STATS;
}
