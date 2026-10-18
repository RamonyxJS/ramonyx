// Katalog dokumen yang sudah dirender — **browser-safe** (tanpa impor `node:*`).
//
// Dipakai loader halaman (SSR) dan soft navigation; katalog diisi sekali oleh `app.ts`
// (server) dari pemindaian berkas. Dengan begitu modul halaman tetap bersih untuk bundel
// klien (tidak menarik `node:fs`).

export interface CatalogEntry {
  readonly slug: string;
  readonly title: string;
}

export interface CatalogDoc extends CatalogEntry {
  /** HTML hasil render markdown (dihitung di server). */
  readonly html: string;
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
