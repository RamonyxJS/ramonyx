// Generator api.json — mengekstrak NAMA EKSPOR dari `packages/*/src/index.ts` (ADR-0054).
// Bukan tanda tangan tipe: sumber tipe tetap kode + .d.ts hasil rilis. Divalidasi
// `pnpm docs:validate` (kesegaran: regenerate == berkas ter-commit).
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));

export interface PackageApi {
  name: string;
  version: string;
  source: string;
  values: string[];
  types: string[];
  reexports: string[];
}

function parseExports(source: string): Pick<PackageApi, "values" | "types" | "reexports"> {
  const values = new Set<string>();
  const types = new Set<string>();
  const reexports = new Set<string>();

  const blockPattern = /export\s+(type\s+)?\{([\s\S]*?)\}\s+from\s+"([^"]+)"/g;
  for (const match of source.matchAll(blockPattern)) {
    const isType = Boolean(match[1]);
    const names = (match[2] ?? "")
      .split(",")
      .map((name) => name.trim().replace(/^type\s+/, ""))
      .filter((name) => name.length > 0);
    for (const name of names) {
      (isType ? types : values).add(name);
    }
  }

  const inlinePattern = /export\s+(?:async\s+)?(?:function|const|let|class)\s+([A-Za-z_$][\w$]*)/g;
  for (const match of source.matchAll(inlinePattern)) {
    if (match[1]) {
      values.add(match[1]);
    }
  }

  const starPattern = /export\s+\*\s+from\s+"([^"]+)"/g;
  for (const match of source.matchAll(starPattern)) {
    if (match[1]) {
      reexports.add(match[1]);
    }
  }

  return {
    values: [...values].sort(),
    types: [...types].sort(),
    reexports: [...reexports].sort(),
  };
}

export function generateApi(): { schemaVersion: 1; generatedAt: string; packages: PackageApi[] } {
  const packages: PackageApi[] = [];
  for (const entry of readdirSync(`${ROOT}packages`).sort()) {
    const pkg = JSON.parse(
      readFileSync(`${ROOT}packages/${entry}/package.json`, "utf8"),
    ) as { name: string; version: string };
    const sourcePath = `packages/${entry}/src/index.ts`;
    const source = readFileSync(`${ROOT}${sourcePath}`, "utf8");
    packages.push({
      name: pkg.name,
      version: pkg.version,
      source: sourcePath,
      ...parseExports(source),
    });
  }
  return { schemaVersion: 1, generatedAt: new Date().toISOString(), packages };
}
