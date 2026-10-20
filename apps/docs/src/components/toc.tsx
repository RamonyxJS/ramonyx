// Daftar isi: aside sticky + scroll-spy di desktop, <details> di mobile.
import { useEffect, useState } from "react";

export interface TocItem {
  readonly id: string;
  readonly text: string;
  readonly depth: number;
}

function Daftar({ items, aktif }: { readonly items: readonly TocItem[]; readonly aktif?: string }) {
  return (
    <ul>
      {items.map((item) => (
        <li key={item.id} className={item.depth === 3 ? "kedalaman-3" : undefined}>
          <a
            href={`#${item.id}`}
            {...(aktif === item.id ? { "aria-current": "location" as const } : {})}
          >
            {item.text}
          </a>
        </li>
      ))}
    </ul>
  );
}

/** ToC desktop dengan penanda bagian aktif (scroll). */
export function Toc({ items }: { readonly items: readonly TocItem[] }) {
  const [aktif, setAktif] = useState<string>(items[0]?.id ?? "");

  useEffect(() => {
    if (items.length === 0) {
      return;
    }
    let frame = 0;
    const perbarui = (): void => {
      if (frame !== 0) {
        return;
      }
      frame = requestAnimationFrame(() => {
        frame = 0;
        let sekarang = items[0]?.id ?? "";
        for (const item of items) {
          const element = document.getElementById(item.id);
          if (element !== null && element.getBoundingClientRect().top <= 120) {
            sekarang = item.id;
          }
        }
        setAktif(sekarang);
      });
    };
    perbarui();
    window.addEventListener("scroll", perbarui, { passive: true });
    window.addEventListener("resize", perbarui);
    return () => {
      if (frame !== 0) {
        cancelAnimationFrame(frame);
      }
      window.removeEventListener("scroll", perbarui);
      window.removeEventListener("resize", perbarui);
    };
  }, [items]);

  if (items.length === 0) {
    return null;
  }

  return (
    <aside className="toc" aria-label="On this page">
      <div className="toc-judul">On this page</div>
      <Daftar items={items} aktif={aktif} />
    </aside>
  );
}

/** ToC mobile (details) — diletakkan di atas artikel. */
export function TocMobile({ items }: { readonly items: readonly TocItem[] }) {
  if (items.length === 0) {
    return null;
  }
  return (
    <details className="toc-mobile">
      <summary>On this page</summary>
      <Daftar items={items} />
    </details>
  );
}
