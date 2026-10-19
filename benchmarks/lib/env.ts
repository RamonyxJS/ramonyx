// Lingkungan benchmark + baseline per-lingkungan (ADR-0074).
//
// Baseline benchmark hanya bermakna di lingkungan yang sama (CPU/platform/Node). Helper ini
// menjadi satu-satunya tempat: menangkap lingkungan, membuat kunci stabil, membandingkan, dan
// menentukan path baseline per-lingkungan.

import { cpus } from "node:os";

export interface BenchEnvironment {
  readonly platform: string;
  readonly arch: string;
  readonly node: string;
  readonly nodeMajor: number;
  readonly cpus: number;
  readonly cpuModel: string;
}

/** Direktori baseline per-lingkungan (ter-commit). */
export const BASELINE_DIR = "benchmarks/results/baselines";

/** Baseline lama (satu berkas, pra-ADR-0074) — dipertahankan sebagai fallback pembanding. */
export const LEGACY_HTTP_BASELINE = "benchmarks/results/phase1-baseline.json";
export const LEGACY_SSR_BASELINE = "benchmarks/results/ssr-baseline.json";

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export function captureEnvironment(): BenchEnvironment {
  const info = cpus();
  return {
    platform: process.platform,
    arch: process.arch,
    node: process.version,
    nodeMajor: Number.parseInt(process.versions.node.split(".")[0] ?? "0", 10),
    cpus: info.length,
    cpuModel: info[0]?.model ?? "unknown",
  };
}

/** Kunci lingkungan stabil, mis. `linux-x64-node24-amd-ryzen-7-5800h`. */
export function envKey(env: BenchEnvironment): string {
  return `${slug(env.platform)}-${slug(env.arch)}-node${env.nodeMajor}-${slug(env.cpuModel)}`;
}

/**
 * Path baseline per-lingkungan (relatif terhadap root repo), mis.
 * `benchmarks/results/baselines/http-linux-x64-node24-<cpu>.json`. Prefiks nama bench
 * memisahkan artefak HTTP vs SSR (tanpa ini, kunci lingkungan yang sama akan bertabrakan).
 */
export function baselinePathFor(
  env: BenchEnvironment,
  options: { readonly name?: string; readonly dir?: string } = {},
): string {
  return `${options.dir ?? BASELINE_DIR}/${options.name ?? "http"}-${envKey(env)}.json`;
}

/**
 * Lingkungan cocok untuk pembandingan ketat: platform + arch + Node major + model CPU sama.
 * (Jumlah core tidak dibandingkan — bisa berubah tanpa mengubah karakter CPU.)
 */
export function environmentsMatch(
  baseline: Partial<BenchEnvironment> | undefined,
  current: BenchEnvironment,
): boolean {
  if (baseline === undefined) {
    return false;
  }
  return (
    baseline.platform === current.platform &&
    baseline.arch === current.arch &&
    baseline.nodeMajor === current.nodeMajor &&
    baseline.cpuModel === current.cpuModel
  );
}

/** Catatan perbedaan lingkungan (untuk laporan); `undefined` bila cocok. */
export function envMismatchNote(
  baseline: Partial<BenchEnvironment> | undefined,
  current: BenchEnvironment,
): string | undefined {
  if (baseline === undefined) {
    return "baseline tidak memuat informasi lingkungan";
  }
  const beda: string[] = [];
  if (baseline.platform !== current.platform) {
    beda.push(`platform ${String(baseline.platform)} → ${current.platform}`);
  }
  if (baseline.arch !== current.arch) {
    beda.push(`arch ${String(baseline.arch)} → ${current.arch}`);
  }
  if (baseline.nodeMajor !== current.nodeMajor) {
    beda.push(`node ${String(baseline.nodeMajor)} → ${current.nodeMajor}`);
  }
  if (baseline.cpuModel !== current.cpuModel) {
    beda.push(`cpu "${String(baseline.cpuModel)}" → "${current.cpuModel}"`);
  }
  return beda.length === 0 ? undefined : beda.join("; ");
}
