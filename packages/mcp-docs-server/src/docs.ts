// Indeks dokumen untuk MCP docs server (ADR-0078) — Node-only, tanpa dependency eksternal.
//
// Membaca `docs/**/*.md` + machine layer (`docs/machine/*.json|txt`, snapshot publik) dan menyediakan pencarian,
// pembacaan halaman, dan akses data terstruktur (features/rules/adrs/stats) untuk tools MCP.
// Semua pembacaan lewat indeks in-memory — tidak ada join path dari input klien (tanpa traversal).

import { type Dirent, existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export interface DocEntry {
  readonly slug: string;
  readonly title: string;
  readonly text: string;
}

export interface DocHit {
  readonly slug: string;
  readonly title: string;
  readonly excerpt: string;
}

/** Berkas machine layer yang diekspos sebagai resource MCP (nama → berkas). */
export const MACHINE_FILES = {
  stats: "stats.json",
  features: "features.json",
  adrs: "adrs.json",
  rules: "rules.json",
  glossary: "glossary.json",
  api: "api.json",
  cli: "cli.json",
  recipes: "recipes.json",
  "config-schema": "config.schema.json",
  llms: "llms.txt",
  "llms-full": "llms-full.txt",
} as const;

export type MachineName = keyof typeof MACHINE_FILES;

export interface ResolveDocsOptions {
  /** Path eksplisit (CLI `--docs` / env `RAMONYX_DOCS_DIR`): root repo atau direktori docs. */
  readonly explicit?: string;
  /** Direktori awal untuk pencarian naik (default: `process.cwd()`). */
  readonly cwd?: string;
  /** `import.meta.url` pemanggil (untuk pencarian dari lokasi paket terpasang). */
  readonly moduleUrl?: string;
}

function isDocsDir(dir: string): boolean {
  return existsSync(join(dir, "machine", "stats.json"));
}

function isRepoRoot(dir: string): boolean {
  // Repo: docs publik ada di `docs/public` (docs/internal tidak pernah dibaca — ADR-0082).
  return isDocsDir(join(dir, "docs", "public")) || isDocsDir(join(dir, "docs"));
}

function walkUp(start: string): string | null {
  let dir = resolve(start);
  for (;;) {
    if (isRepoRoot(dir)) {
      const publik = join(dir, "docs", "public");
      return isDocsDir(publik) ? publik : join(dir, "docs");
    }
    if (isDocsDir(dir)) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) {
      return null;
    }
    dir = parent;
  }
}

/**
 * Cari direktori docs: `--docs` eksplisit → naik dari `cwd` → naik dari lokasi modul (snapshot
 * yang dibundel di paket npm). Gagal dengan pesan jelas bila tidak ada.
 */
export function resolveDocsRoot(options: ResolveDocsOptions = {}): string {
  if (options.explicit !== undefined && options.explicit.length > 0) {
    const eksplisit = resolve(options.cwd ?? process.cwd(), options.explicit);
    // Root repo → docs/public (karantina docs/internal, ADR-0082).
    if (isRepoRoot(eksplisit)) {
      const publik = join(eksplisit, "docs", "public");
      return isDocsDir(publik) ? publik : join(eksplisit, "docs");
    }
    // Direktori `docs/` (berisi public/ + internal/) → hanya public.
    const publikLangsung = join(eksplisit, "public");
    if (isDocsDir(publikLangsung)) {
      return publikLangsung;
    }
    if (isDocsDir(eksplisit)) {
      return eksplisit;
    }
    throw new Error(
      `--docs ${options.explicit}: tidak menemukan machine/stats.json (berikan root repo, docs/public, atau direktori docs Ramonyx).`,
    );
  }

  const dariCwd = walkUp(options.cwd ?? process.cwd());
  if (dariCwd !== null) {
    return dariCwd;
  }

  const modulDir = fileURLToPath(new URL(".", options.moduleUrl ?? import.meta.url));
  const dariModul = walkUp(modulDir);
  if (dariModul !== null) {
    return dariModul;
  }

  throw new Error(
    "Tidak menemukan machine/stats.json — jalankan dari root repo Ramonyx (docs/public), atau set `--docs <dir>` / RAMONYX_DOCS_DIR.",
  );
}

export interface DocsIndex {
  readonly root: string;
  listDocs(): readonly DocEntry[];
  getDoc(slug: string): DocEntry | null;
  searchDocs(query: string, limit?: number): DocHit[];
  machineNames(): readonly MachineName[];
  readMachine(
    name: string,
  ): { readonly name: string; readonly file: string; readonly text: string } | null;
  features(): readonly Record<string, unknown>[];
  rules(): readonly Record<string, unknown>[];
  adrs(): readonly Record<string, unknown>[];
  stats(): Record<string, unknown> | null;
}

function titleFromMarkdown(text: string, fallback: string): string {
  const match = /^#\s+(.+)$/m.exec(text);
  return match?.[1]?.trim() ?? fallback;
}

function scanMarkdown(dir: string, base: string, keluar: DocEntry[]): void {
  let entries: Dirent[];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const absolute = join(dir, entry.name);
    if (entry.isDirectory()) {
      scanMarkdown(absolute, base, keluar);
      continue;
    }
    if (!entry.name.endsWith(".md")) {
      continue;
    }
    const slug = relative(base, absolute).split("\\").join("/").replace(/\.md$/, "");
    let text: string;
    try {
      text = readFileSync(absolute, "utf8");
    } catch {
      continue;
    }
    keluar.push({ slug, title: titleFromMarkdown(text, slug), text });
  }
}

function excerptAround(text: string, index: number): string {
  const awal = Math.max(0, index - 60);
  const potongan = text
    .slice(awal, index + 140)
    .replace(/\s+/g, " ")
    .trim();
  return `${awal > 0 ? "…" : ""}${potongan}${index + 140 < text.length ? "…" : ""}`;
}

function readJson(absolute: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(readFileSync(absolute, "utf8")) as unknown;
    return typeof parsed === "object" && parsed !== null
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function asArray(value: unknown): readonly Record<string, unknown>[] {
  return Array.isArray(value) ? (value as Record<string, unknown>[]) : [];
}

/** Bangun indeks dari direktori docs (dibaca sekali; konten kecil ±1 MB). */
export function createDocsIndex(root: string): DocsIndex {
  const docs: DocEntry[] = [];
  scanMarkdown(root, root, docs);
  docs.sort((a, b) => a.slug.localeCompare(b.slug));
  const bySlug = new Map(docs.map((doc) => [doc.slug, doc]));

  return {
    root,
    listDocs() {
      return docs;
    },
    getDoc(slug) {
      return bySlug.get(slug.replace(/^\/+|\/+$/g, "")) ?? null;
    },
    searchDocs(query, limit = 10) {
      const q = query.trim().toLowerCase();
      if (q.length === 0) {
        return [];
      }
      const hits: (DocHit & { skor: number })[] = [];
      for (const doc of docs) {
        const judul = doc.title.toLowerCase();
        const slug = doc.slug.toLowerCase();
        const isi = doc.text.toLowerCase();
        const idx = isi.indexOf(q);
        let skor = 0;
        if (judul.includes(q)) {
          skor += 100;
        }
        if (slug.includes(q)) {
          skor += 50;
        }
        if (idx >= 0) {
          skor += 10;
        }
        if (skor === 0) {
          continue;
        }
        const excerpt =
          idx >= 0
            ? excerptAround(doc.text, idx)
            : doc.text.slice(0, 160).replace(/\s+/g, " ").trim();
        hits.push({ slug: doc.slug, title: doc.title, excerpt, skor });
      }
      hits.sort((a, b) => b.skor - a.skor || a.slug.localeCompare(b.slug));
      return hits.slice(0, Math.max(1, limit)).map(({ slug, title, excerpt }) => ({
        slug,
        title,
        excerpt,
      }));
    },
    machineNames() {
      return Object.keys(MACHINE_FILES) as MachineName[];
    },
    readMachine(name) {
      const file = (MACHINE_FILES as Record<string, string | undefined>)[name];
      if (file === undefined) {
        return null;
      }
      const absolute = join(root, "machine", file);
      try {
        return { name, file, text: readFileSync(absolute, "utf8") };
      } catch {
        return null;
      }
    },
    features() {
      return asArray(readJson(join(root, "machine", "features.json"))?.features);
    },
    rules() {
      return asArray(readJson(join(root, "machine", "rules.json"))?.rules);
    },
    adrs() {
      return asArray(readJson(join(root, "machine", "adrs.json"))?.adrs);
    },
    stats() {
      return readJson(join(root, "machine", "stats.json"));
    },
  };
}
