// Plugin Vite: modul `*.server.ts` diganti **stub** di bundle klien (ADR-0063).
//
// Pola "server-only": halaman boleh mengimpor modul server (dipakai `loader`/`action` yang
// berjalan di server), tetapi bundle klien menerima stub yang melempar bila dipanggil dari
// kode klien — bukan kebocoran implementasi/API server.

import { readFile } from "node:fs/promises";
import type { Plugin } from "vite";

const SERVER_MODULE = /\.server\.(ts|tsx|js|mjs)$/;
const VIRTUAL_PREFIX = "\0ramonyx-server-stub:";

/** Nama ekspor dari sumber server (regex ringan — tipe/interface diabaikan). */
function exportedNames(source: string): string[] {
  const names = new Set<string>();
  for (const match of source.matchAll(
    /export\s+(?:async\s+)?(?:function|const|let|var|class)\s+([A-Za-z_$][\w$]*)/g,
  )) {
    if (match[1] !== undefined) {
      names.add(match[1]);
    }
  }
  for (const match of source.matchAll(/export\s*\{([^}]*)\}/g)) {
    for (const part of (match[1] ?? "").split(",")) {
      const cleaned = part.trim().replace(/^type\s+/, "");
      if (cleaned.length === 0) {
        continue;
      }
      const alias = cleaned.split(/\s+as\s+/);
      const name = (alias[1] ?? alias[0] ?? "").trim();
      if (name.length > 0 && name !== "default") {
        names.add(name);
      }
    }
  }
  return [...names].sort();
}

function stubSource(file: string, names: readonly string[]): string {
  const poison = (name: string): string =>
    `(() => { throw new Error(${JSON.stringify(
      `"${name}" dari ${file} hanya tersedia di server — impor modul ini dari loader/action/route API, bukan kode klien (ADR-0063).`,
    )}); })`;
  const lines = [
    "// Stub server-only (digenerate @ramonyx/bundler — ADR-0063).",
    ...names.map((name) => `export const ${name} = ${poison(name)};`),
    `export default ${poison("default")};`,
  ];
  return `${lines.join("\n")}\n`;
}

/**
 * Plugin untuk `buildClient`: setiap impor `*.server.ts` diresolusi ke stub yang melempar
 * bila dipanggil di browser.
 */
export function serverOnlyPlugin(): Plugin {
  return {
    name: "ramonyx-server-only",
    enforce: "pre",
    async resolveId(source, importer) {
      if (!SERVER_MODULE.test(source) || importer === undefined) {
        return null;
      }
      const resolved = await this.resolve(source, importer, { skipSelf: true });
      if (resolved === null) {
        return null;
      }
      return `${VIRTUAL_PREFIX}${resolved.id}`;
    },
    async load(id) {
      if (!id.startsWith(VIRTUAL_PREFIX)) {
        return null;
      }
      const file = id.slice(VIRTUAL_PREFIX.length);
      const source = await readFile(file, "utf8");
      return stubSource(file, exportedNames(source));
    },
  };
}
