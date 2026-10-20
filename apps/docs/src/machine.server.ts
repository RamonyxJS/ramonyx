// Baca machine layer PUBLIK (server-only; modul `*.server.ts` distub di bundle klien).
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

export interface PublicStats {
  readonly version: string;
  readonly packages: { readonly npm: number; readonly names: readonly string[] };
  readonly adrs: number;
  readonly docs: number;
  readonly tests: { readonly node: number; readonly rust: number; readonly e2eSpecFiles: number };
}

export function readPublicStats(): PublicStats {
  const raw = readFileSync(join(repoRoot, "docs/public/machine/stats.json"), "utf8");
  return JSON.parse(raw) as PublicStats;
}
