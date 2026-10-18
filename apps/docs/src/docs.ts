// Katalog dokumen: memindai `docs/**/*.md` di root repo dan memetakan slug ↔ berkas.
// Slug aman: hanya berkas di dalam `docs/` yang dapat dibaca (guard traversal).

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import type { CatalogDoc } from "./catalog.ts";
import { extractTitle, renderMarkdown } from "./markdown.ts";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const docsDir = join(repoRoot, "docs");

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

/** Daftar dokumen terurut (judul dari heading pertama). */
export function listDocs(): DocEntry[] {
  return collect(docsDir)
    .map((file) => {
      const source = readFileSync(file, "utf8");
      const slug = slugFor(file);
      return { slug, title: extractTitle(source, slug) };
    })
    .sort((a, b) => a.slug.localeCompare(b.slug));
}

/** Baca dokumen berdasarkan slug; `null` bila tidak ada atau keluar dari `docs/`. */
export function readDoc(slug: string): LoadedDoc | null {
  if (slug.length === 0 || slug.includes("\0")) {
    return null;
  }
  const candidate = resolve(docsDir, `${slug}.md`);
  // Guard traversal: hasil resolve wajib berada di dalam docsDir.
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

/** Katalog lengkap (judul + HTML ter-render) untuk `setCatalog` di `app.ts`. */
export function loadCatalog(): CatalogDoc[] {
  return listDocs().map((entry) => {
    const doc = readDoc(entry.slug);
    return {
      slug: entry.slug,
      title: entry.title,
      html: renderMarkdown(doc?.markdown ?? ""),
    };
  });
}
