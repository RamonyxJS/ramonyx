// Pencarian Cmd+K (klien): indeks publik diambil sekali dari `api/indeks` (dibangun dari
// docs/public saja). Filter dilakukan di browser.
import { useEffect, useMemo, useState } from "react";

interface Entri {
  slug: string;
  title: string;
  text: string;
}

interface Hasil {
  slug: string;
  title: string;
  potongan: string;
}

function cari(indeks: Entri[], query: string): Hasil[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) {
    return [];
  }
  const hasil: Array<Hasil & { skor: number }> = [];
  for (const entri of indeks) {
    const judul = entri.title.toLowerCase();
    const isi = entri.text.toLowerCase();
    const idx = isi.indexOf(q);
    if (!judul.includes(q) && idx < 0 && !entri.slug.toLowerCase().includes(q)) {
      continue;
    }
    const awal = idx >= 0 ? Math.max(0, idx - 40) : 0;
    const potongan = entri.text
      .slice(awal, awal + 160)
      .replace(/\s+/g, " ")
      .trim();
    hasil.push({
      slug: entri.slug,
      title: entri.title,
      potongan: `${awal > 0 ? "…" : ""}${potongan}…`,
      skor: (judul.includes(q) ? 100 : 0) + (idx >= 0 ? 10 : 0) + (entri.slug.includes(q) ? 5 : 0),
    });
  }
  return hasil.sort((a, b) => b.skor - a.skor || a.title.localeCompare(b.title)).slice(0, 8);
}

export function Search() {
  const [buka, setBuka] = useState(false);
  const [query, setQuery] = useState("");
  const [indeks, setIndeks] = useState<Entri[] | null>(null);
  const [galat, setGalat] = useState(false);

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setBuka((nilai) => !nilai);
      }
      if (event.key === "Escape") {
        setBuka(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!buka || indeks !== null) {
      return;
    }
    fetch("api/indeks")
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("indeks"))))
      .then((data: Entri[]) => setIndeks(data))
      .catch(() => setGalat(true));
  }, [buka, indeks]);

  const hasil = useMemo(() => (indeks === null ? [] : cari(indeks, query)), [indeks, query]);

  return (
    <>
      <button type="button" className="cari-pemicu" onClick={() => setBuka(true)}>
        <span>Search docs</span>
        <kbd>⌘K</kbd>
      </button>
      {buka ? (
        <div className="cari-lapis">
          <button
            type="button"
            className="cari-tutup"
            aria-label="Close search"
            onClick={() => setBuka(false)}
          />
          <div
            className="cari-panel"
            role="dialog"
            aria-modal="true"
            aria-label="Search documentation"
          >
            <input
              className="cari-input"
              // biome-ignore lint/a11y/noAutofocus: dialog pencarian dibuka lewat aksi pengguna
              autoFocus
              type="search"
              placeholder="Search documentation…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              aria-label="Search documentation"
            />
            <div className="cari-hasil">
              {galat ? <p className="dim">Search index failed to load.</p> : null}
              {query.trim().length < 2 ? (
                <p className="dim">Type at least two characters.</p>
              ) : hasil.length === 0 ? (
                <p className="dim">No results for “{query}”.</p>
              ) : (
                hasil.map((entri) => (
                  <a
                    key={entri.slug}
                    href={`docs/${entri.slug === "README" ? "" : entri.slug}`}
                    className="cari-entri"
                  >
                    <span className="cari-judul">{entri.title}</span>
                    <span className="cari-potongan">{entri.potongan}</span>
                  </a>
                ))
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
