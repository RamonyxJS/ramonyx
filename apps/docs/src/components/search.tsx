// Pencarian Cmd+K (klien): indeks publik diambil sekali dari `api/indeks` (dibangun dari
// docs/public saja). Filter dilakukan di browser. Panah/Enter + focus trap + kembalikan fokus.
import {
  type KeyboardEvent as ReactKeyboardEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

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

/** Buang penanda markdown agar potongan hasil pencarian enak dibaca. */
function bersihkan(teks: string): string {
  return teks
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s*>\s?/gm, " ")
    .replace(/^\s*\|?[\s:|-]{3,}\|?\s*$/gm, " ")
    .replace(/\*{1,3}([^*]+)\*{1,3}/g, "$1")
    .replace(/<([^>\s]+)>/g, "$1")
    .replace(/[*_|]{1,}/g, " ")
    .replace(/-{3,}/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cari(indeks: Entri[], query: string): Hasil[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) {
    return [];
  }
  const hasil: Array<Hasil & { skor: number }> = [];
  for (const entri of indeks) {
    const judul = entri.title.toLowerCase();
    const bersih = bersihkan(entri.text);
    const isi = bersih.toLowerCase();
    const idx = isi.indexOf(q);
    if (!judul.includes(q) && idx < 0 && !entri.slug.toLowerCase().includes(q)) {
      continue;
    }
    const awal = idx >= 0 ? Math.max(0, idx - 40) : 0;
    const potongan = bersih.slice(awal, awal + 160).trim();
    hasil.push({
      slug: entri.slug,
      title: entri.title,
      potongan: `${awal > 0 ? "…" : ""}${potongan}…`,
      skor: (judul.includes(q) ? 100 : 0) + (idx >= 0 ? 10 : 0) + (entri.slug.includes(q) ? 5 : 0),
    });
  }
  return hasil.sort((a, b) => b.skor - a.skor || a.title.localeCompare(b.title)).slice(0, 8);
}

function hrefHasil(slug: string): string {
  return `docs/${slug === "README" ? "" : slug}`;
}

export function Search() {
  const [buka, setBuka] = useState(false);
  const [query, setQuery] = useState("");
  const [indeks, setIndeks] = useState<Entri[] | null>(null);
  const [galat, setGalat] = useState(false);
  const [pilihan, setPilihan] = useState(0);
  const pemicu = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const tautan = useRef<Array<HTMLAnchorElement | null>>([]);

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

  useEffect(() => {
    if (!buka) {
      return;
    }
    const sebelumnya = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = sebelumnya;
      pemicu.current?.focus();
    };
  }, [buka]);

  const hasil = useMemo(() => (indeks === null ? [] : cari(indeks, query)), [indeks, query]);

  const tutup = (): void => setBuka(false);

  const onKeyDownPanel = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setPilihan((nilai) => (hasil.length === 0 ? 0 : (nilai + 1) % hasil.length));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setPilihan((nilai) => (hasil.length === 0 ? 0 : (nilai - 1 + hasil.length) % hasil.length));
    } else if (event.key === "Enter") {
      const target = tautan.current[pilihan];
      if (target !== null && target !== undefined) {
        event.preventDefault();
        target.click();
      }
    } else if (event.key === "Tab") {
      const fokus = panel.current?.querySelectorAll<HTMLElement>(
        'input, a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (fokus === undefined || fokus.length === 0) {
        return;
      }
      const pertama = fokus[0];
      const terakhir = fokus[fokus.length - 1];
      if (event.shiftKey && document.activeElement === pertama) {
        event.preventDefault();
        terakhir?.focus();
      } else if (!event.shiftKey && document.activeElement === terakhir) {
        event.preventDefault();
        pertama?.focus();
      }
    }
  };

  return (
    <>
      <button
        ref={pemicu}
        type="button"
        className="cari-pemicu"
        onClick={() => setBuka(true)}
        aria-haspopup="dialog"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="6.5" />
          <path d="m16 16 4.5 4.5" />
        </svg>
        <span>Search docs</span>
        <kbd>⌘K</kbd>
      </button>
      {buka ? (
        <div className="cari-lapis">
          <button
            type="button"
            className="cari-tutup"
            tabIndex={-1}
            aria-label="Close search"
            onClick={tutup}
          />
          <div
            ref={panel}
            className="cari-panel"
            role="dialog"
            aria-modal="true"
            aria-label="Search documentation"
            onKeyDown={onKeyDownPanel}
          >
            <div className="cari-kepala">
              <span>Search the public docs</span>
              <kbd>esc</kbd>
            </div>
            <input
              className="cari-input"
              // biome-ignore lint/a11y/noAutofocus: dialog pencarian dibuka lewat aksi pengguna
              autoFocus
              type="search"
              placeholder="Search documentation…"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPilihan(0);
              }}
              aria-label="Search documentation"
            />
            <div className="cari-hasil">
              {galat ? <p>Search index failed to load.</p> : null}
              {query.trim().length < 2 ? (
                <p>Type at least two characters.</p>
              ) : hasil.length === 0 ? (
                <p>No results for “{query}”.</p>
              ) : (
                hasil.map((entri, index) => (
                  <a
                    key={entri.slug}
                    ref={(element) => {
                      tautan.current[index] = element;
                    }}
                    href={hrefHasil(entri.slug)}
                    className="cari-entri"
                    data-selected={index === pilihan}
                    onMouseEnter={() => setPilihan(index)}
                  >
                    <span className="cari-judul">{entri.title}</span>
                    <span className="cari-potongan">{entri.potongan}</span>
                  </a>
                ))
              )}
            </div>
            <div className="cari-kaki">↑↓ to move · ↵ to open · only public pages are indexed</div>
          </div>
        </div>
      ) : null}
    </>
  );
}
