// Lint statis batas client/server (ADR-0063): modul halaman/layout/error beserta impor relatif
// transitifnya ikut bundle klien, jadi impor `node:*` atau penanda `server-only` dari graph itu
// adalah pelanggaran. Impor `*.server.ts` tetap diizinkan karena bundler memberi stub khusus di
// build klien (ADR-0063); isi modul server tidak ditelusuri.

import { readFile } from "node:fs/promises";
import { dirname, extname, join, resolve } from "node:path";
import type { LoadedPage } from "@ramonyx/core";

export interface BoundaryViolation {
  readonly file: string;
  readonly specifier: string;
  readonly reason: "node-builtin" | "server-only";
}

const IMPORT_PATTERN = /(?:from\s+|import\s*\(\s*|require\s*\(\s*|import\s+)["']([^"']+)["']/g;
const SERVER_MODULE = /\.server\.[cm]?[jt]sx?$/;
const CANDIDATE_EXTENSIONS = ["", ".ts", ".tsx", ".js", ".jsx", ".mjs", ".mts", ".cts"] as const;

function classify(specifier: string): BoundaryViolation["reason"] | null {
  if (specifier.startsWith("node:")) {
    return "node-builtin";
  }
  if (specifier === "server-only") {
    return "server-only";
  }
  return null;
}

async function readFirst(
  paths: readonly string[],
): Promise<{ file: string; source: string } | null> {
  for (const path of paths) {
    try {
      return { file: path, source: await readFile(path, "utf8") };
    } catch {
      // Coba kandidat ekstensi/index berikutnya.
    }
  }
  return null;
}

/**
 * Resolusi impor relatif untuk graph klien. Modul `*.server.*` dilewati: bundler menggantinya
 * dengan stub (ADR-0063), jadi isi server-nya tidak pernah masuk bundel klien.
 */
async function resolveLocalImport(
  fromFile: string,
  specifier: string,
): Promise<{ file: string; source: string } | null> {
  if (!specifier.startsWith(".") || SERVER_MODULE.test(specifier)) {
    return null;
  }
  const base = resolve(dirname(fromFile), specifier);
  if (extname(specifier).length > 0) {
    return readFirst([base]);
  }
  const candidates = CANDIDATE_EXTENSIONS.map((extension) => `${base}${extension}`);
  for (const extension of CANDIDATE_EXTENSIONS.slice(1)) {
    candidates.push(join(base, `index${extension}`));
  }
  return readFirst(candidates);
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "$1");
}

/**
 * Periksa impor statis/dinamis pada semua modul yang masuk bundle klien, termasuk impor relatif
 * transitif (mis. `page.tsx` → `card.tsx` → `node:fs`). Modul `*.server.*` tidak ditelusuri karena
 * bundler memberinya stub di bundle klien (ADR-0063). Tidak menggantikan guard bundle Vite untuk
 * impor lewat package/alias, tetapi memberi pesan awal yang menunjuk file penyebab.
 */
export async function lintClientBoundaries(
  pages: readonly LoadedPage[],
): Promise<BoundaryViolation[]> {
  const entries = new Set<string>();
  for (const page of pages) {
    if (page.pageFile !== undefined) entries.add(page.pageFile);
    for (const file of page.layoutFiles ?? []) entries.add(file);
    if (page.errorFile !== undefined) entries.add(page.errorFile);
  }

  const violations: BoundaryViolation[] = [];
  const visited = new Set<string>();
  const queue: Array<{ file: string; source?: string }> = [...entries].map((file) => ({ file }));
  while (queue.length > 0) {
    const current = queue.shift();
    if (current === undefined || visited.has(current.file)) {
      continue;
    }
    visited.add(current.file);
    let source = current.source;
    if (source === undefined) {
      try {
        source = await readFile(current.file, "utf8");
      } catch {
        continue;
      }
    }
    for (const match of stripComments(source).matchAll(IMPORT_PATTERN)) {
      const specifier = match[1];
      if (specifier === undefined) {
        continue;
      }
      const reason = classify(specifier);
      if (reason !== null) {
        violations.push({ file: current.file, specifier, reason });
        continue;
      }
      const imported = await resolveLocalImport(current.file, specifier);
      if (imported !== null && !visited.has(imported.file)) {
        queue.push(imported);
      }
    }
  }
  return violations;
}
