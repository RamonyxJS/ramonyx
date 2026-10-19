// Katalog dokumentasi **publik**: hanya memindai `docs/public/**` (ADR-0082).
// `docs/internal/` tidak pernah dibaca oleh build/situs/pencarian/ekspor.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import type { CatalogDoc } from "./catalog.ts";
import { initHighlighter } from "./highlight.ts";
import { extractTitle, renderMarkdown } from "./markdown.ts";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const docsDir = join(repoRoot, "docs", "public");
const machineDir = join(docsDir, "machine");

export interface DocEntry {
  readonly slug: string;
  readonly title: string;
}

export interface LoadedDoc {
  readonly entry: DocEntry;
  readonly markdown: string;
  readonly file: string;
}

function collect(directory: string, found: string[] = []): string[] {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === "machine" || entry.name.startsWith(".")) {
      continue;
    }
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      collect(path, found);
    } else if (entry.name.endsWith(".md")) {
      found.push(path);
    }
  }
  return found;
}

function slugFor(file: string): string {
  return relative(docsDir, file).split(sep).join("/").replace(/\.md$/, "");
}

/** Daftar dokumen publik terurut (judul dari heading pertama). */
export function listDocs(): DocEntry[] {
  return collect(docsDir)
    .map((file) => {
      const source = readFileSync(file, "utf8");
      const slug = slugFor(file);
      return { slug, title: extractTitle(source, slug) };
    })
    .sort((a, b) => a.slug.localeCompare(b.slug));
}

/** Baca dokumen publik berdasarkan slug; `null` bila tidak ada atau keluar dari docs/public. */
export function readDoc(slug: string): LoadedDoc | null {
  if (slug.length === 0 || slug.includes("\0")) {
    return null;
  }
  const candidate = resolve(docsDir, `${slug}.md`);
  if (!candidate.startsWith(docsDir + sep)) {
    return null;
  }
  if (!existsSync(candidate) || !statSync(candidate).isFile()) {
    return null;
  }
  const markdown = readFileSync(candidate, "utf8");
  return {
    entry: { slug, title: extractTitle(markdown, slug) },
    markdown,
    file: candidate,
  };
}

/** Katalog lengkap (judul + HTML ter-render + teks mentah) untuk `setCatalog` di `app.ts`. */
export async function loadCatalog(): Promise<CatalogDoc[]> {
  await initHighlighter();
  return listDocs().map((entry) => {
    const doc = readDoc(entry.slug);
    const text = doc?.markdown ?? "";
    const rendered = renderMarkdown(text, { slug: entry.slug });
    return {
      slug: entry.slug,
      title: entry.title,
      html: rendered.html,
      text,
      toc: rendered.toc,
    };
  });
}

/** Indeks pencarian publik (slug + judul + teks) — dipakai klien (Cmd+K) & `/api/cari`. */
export function searchIndex(): Array<{ slug: string; title: string; text: string }> {
  return listDocs().map((entry) => {
    const doc = readDoc(entry.slug);
    return { slug: entry.slug, title: entry.title, text: doc?.markdown ?? "" };
  });
}

/** JSON machine layer publik (disajikan apa adanya; tidak pernah membaca docs/internal). */
export function readPublicMachine(name: string): string | null {
  if (!/^[a-z0-9.-]+$/i.test(name)) {
    return null;
  }
  const file = join(machineDir, name);
  try {
    return readFileSync(file, "utf8");
  } catch {
    return null;
  }
}

export function publicMachineDir(): string {
  return machineDir;
}
