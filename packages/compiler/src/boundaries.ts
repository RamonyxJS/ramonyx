// Lint statis batas client/server (ADR-0063): modul halaman/layout/error ikut bundle klien,
// jadi impor `node:*` atau penanda `server-only` dari sana adalah pelanggaran. Impor `*.server.ts`
// tetap diizinkan karena bundler memberi stub khusus di build klien (ADR-0063).

import { readFile } from "node:fs/promises";
import type { LoadedPage } from "@ramonyx/core";

export interface BoundaryViolation {
  readonly file: string;
  readonly specifier: string;
  readonly reason: "node-builtin" | "server-only";
}

const IMPORT_PATTERN = /(?:from\s+|import\s*\(\s*|require\s*\(\s*|import\s+)["']([^"']+)["']/g;

function classify(specifier: string): BoundaryViolation["reason"] | null {
  if (specifier.startsWith("node:")) {
    return "node-builtin";
  }
  if (specifier === "server-only") {
    return "server-only";
  }
  return null;
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "$1");
}

/**
 * Periksa impor statis/dinamis pada semua modul yang masuk bundle klien. Tidak menggantikan
 * guard bundle Vite (impor transitif), tetapi memberi pesan awal yang menunjuk file+baris.
 */
export async function lintClientBoundaries(
  pages: readonly LoadedPage[],
): Promise<BoundaryViolation[]> {
  const files = new Set<string>();
  for (const page of pages) {
    if (page.pageFile !== undefined) files.add(page.pageFile);
    for (const file of page.layoutFiles ?? []) files.add(file);
    if (page.errorFile !== undefined) files.add(page.errorFile);
  }

  const violations: BoundaryViolation[] = [];
  for (const file of files) {
    let source: string;
    try {
      source = await readFile(file, "utf8");
    } catch {
      continue;
    }
    for (const match of stripComments(source).matchAll(IMPORT_PATTERN)) {
      const specifier = match[1];
      if (specifier === undefined) {
        continue;
      }
      const reason = classify(specifier);
      if (reason !== null) {
        violations.push({ file, specifier, reason });
      }
    }
  }
  return violations;
}
