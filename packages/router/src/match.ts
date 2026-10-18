import type { RouteEntry } from "@ramonyx/core";

export type RouteMatch =
  | {
      readonly kind: "match";
      readonly entry: RouteEntry;
      readonly params: Readonly<Record<string, string>>;
    }
  | { readonly kind: "method-not-allowed"; readonly allow: readonly string[] }
  | { readonly kind: "not-found" };

interface CompiledEntry {
  readonly entry: RouteEntry;
  readonly segments: readonly string[];
  readonly method: string;
}

/** Segmen pola catch-all `[...name]` — hanya valid di posisi terakhir. */
const CATCH_ALL = /^\[\.\.\.([A-Za-z0-9_]+)\]$/;

export interface RouteTable {
  readonly entries: readonly RouteEntry[];
  readonly compiled: readonly CompiledEntry[];
}

function splitPath(path: string): readonly string[] {
  const normalized = path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
  if (normalized === "/" || normalized === "") {
    return [];
  }
  return normalized.split("/").filter((segment) => segment.length > 0);
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    // Nilai URL tidak valid; pakai apa adanya.
    return value;
  }
}

export function createRouteTable(entries: readonly RouteEntry[]): RouteTable {
  const compiled = entries.map((entry) => ({
    entry,
    segments: splitPath(entry.path),
    method: entry.method.toUpperCase(),
  }));
  return { entries, compiled };
}

/**
 * Matching sederhana untuk Phase 1: statis + parameter (`[name]`).
 * Route statis menang atas parameter; trailing slash dinormalisasi.
 */
export function matchRoute(table: RouteTable, method: string, pathname: string): RouteMatch {
  const segments = splitPath(pathname);
  const upperMethod = method.toUpperCase();
  const allow = new Set<string>();
  let best: { entry: RouteEntry; params: Record<string, string>; score: number } | undefined;

  for (const candidate of table.compiled) {
    const lastPattern = candidate.segments.at(-1);
    const catchAll = lastPattern === undefined ? null : CATCH_ALL.exec(lastPattern);
    const fixedLength = candidate.segments.length - (catchAll === null ? 0 : 1);

    // Tanpa catch-all: panjang harus sama. Dengan catch-all `[...name]`: minimal 1 segmen sisa.
    if (
      catchAll === null
        ? candidate.segments.length !== segments.length
        : segments.length < fixedLength + 1
    ) {
      continue;
    }

    const params: Record<string, string> = {};
    let score = 0;
    let matched = true;

    for (let index = 0; index < fixedLength; index += 1) {
      const pattern = candidate.segments[index];
      const value = segments[index];
      if (pattern === undefined || value === undefined) {
        matched = false;
        break;
      }
      if (pattern.startsWith("[") && pattern.endsWith("]") && pattern.length > 2) {
        params[pattern.slice(1, -1)] = safeDecode(value);
        score += 1;
      } else if (pattern === value) {
        score += 2;
      } else {
        matched = false;
        break;
      }
    }

    if (matched && catchAll?.[1] !== undefined) {
      // Catch-all menambah skor 0 → selalu kalah dari pola statis/parameter yang cocok.
      params[catchAll[1]] = segments.slice(fixedLength).map(safeDecode).join("/");
    }

    if (!matched) {
      continue;
    }

    if (candidate.method !== upperMethod) {
      allow.add(candidate.method);
      continue;
    }

    if (best === undefined || score > best.score) {
      best = { entry: candidate.entry, params, score };
    }
  }

  if (best !== undefined) {
    return { kind: "match", entry: best.entry, params: best.params };
  }
  if (allow.size > 0) {
    return { kind: "method-not-allowed", allow: [...allow].sort() };
  }
  return { kind: "not-found" };
}
