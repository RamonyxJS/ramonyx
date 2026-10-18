// Katalog dokumen yang sudah dirender — **browser-safe** (tanpa impor `node:*`).
//
// Dipakai loader halaman (SSR), pencarian, dan soft navigation; katalog diisi sekali oleh
// `app.ts` (server) dari pemindaian berkas. Dengan begitu modul halaman tetap bersih untuk
// bundel klien (tidak menarik `node:fs`; data juga tidak ikut ke bundel — hanya tipe/kodenya).

export interface CatalogEntry {
  readonly slug: string;
  readonly title: string;
}

export interface CatalogDoc extends CatalogEntry {
  /** HTML hasil render markdown (dihitung di server). */
  readonly html: string;
  /** Markdown mentah (untuk pencarian isi di server). */
  readonly text: string;
}

export interface CatalogHit extends CatalogEntry {
  readonly excerpt: string;
}

let entries: CatalogEntry[] = [];
let docs = new Map<string, CatalogDoc>();

/** Isi katalog (dipanggil `app.ts` saat server dimulai). */
export function setCatalog(records: readonly CatalogDoc[]): void {
  entries = records.map(({ slug, title }) => ({ slug, title }));
  docs = new Map(records.map((record) => [record.slug, record]));
}

/** Daftar dokumen terurut untuk indeks/API. */
export function listCatalog(): CatalogEntry[] {
  return entries;
}

/** Satu dokumen (dengan HTML) atau `null`. */
export function getCatalogDoc(slug: string): CatalogDoc | null {
  return docs.get(slug) ?? null;
}

function excerptAround(text: string, index: number): string {
  const awal = Math.max(0, index - 60);
  const potongan = text
    .slice(awal, index + 140)
    .replace(/\s+/g, " ")
    .trim();
  return `${awal > 0 ? "…" : ""}${potongan}${index + 140 < text.length ? "…" : ""}`;
}

/**
 * Pencarian isi (judul, slug, lalu markdown) — case-insensitive, dibatasi `limit` hasil.
 * Dokumen yang cocok judul/slug diberi prioritas.
 */
export function searchCatalog(query: string, limit: number): CatalogHit[] {
  const needle = query.trim().toLowerCase();
  if (needle.length === 0) {
    return [];
  }

  const hasil: CatalogHit[] = [];
  for (const record of docs.values()) {
    const judul = record.title.toLowerCase();
    const slug = record.slug.toLowerCase();
    if (judul.includes(needle) || slug.includes(needle)) {
      hasil.unshift({ slug: record.slug, title: record.title, excerpt: record.title });
      continue;
    }
    const index = record.text.toLowerCase().indexOf(needle);
    if (index >= 0) {
      hasil.push({
        slug: record.slug,
        title: record.title,
        excerpt: excerptAround(record.text, index),
      });
    }
  }
  return hasil.slice(0, limit);
}
