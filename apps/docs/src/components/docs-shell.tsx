// Shell halaman docs: sidebar (nav publik) + konten. Server component (tanpa hook).
import type { ReactNode } from "react";

import { NAV, navLabel, sectionOf } from "../nav.ts";

export function DocsShell({
  slug,
  children,
}: {
  readonly slug: string;
  readonly children: ReactNode;
}) {
  const bagian = sectionOf(slug);
  return (
    <div className="docs">
      <aside className="sidebar" aria-label="Documentation">
        {NAV.map((section) => (
          <div key={section.title} className="sidebar-seksi">
            <div className="sidebar-judul">{section.title}</div>
            <ul>
              {section.items.map((item) => (
                <li key={item.slug}>
                  <a
                    href={`docs/${item.slug}`}
                    {...(item.slug === slug ? { "aria-current": "page" as const } : {})}
                  >
                    {item.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </aside>
      <main className="docs-utama">
        <p className="remah">
          <a href="docs">Docs</a> <span aria-hidden="true">/</span>{" "}
          {bagian === undefined ? null : (
            <>
              <span>{bagian}</span> <span aria-hidden="true">/</span>{" "}
            </>
          )}
          <span>{navLabel(slug)}</span>
        </p>
        {children}
      </main>
    </div>
  );
}
