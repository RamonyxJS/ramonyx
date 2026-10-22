// Shell halaman docs: rail "field manual" (nav publik) + konten. Server component (tanpa hook).
import type { ReactNode } from "react";

import { NAV, navLabel, sectionNumber, sectionOf } from "../nav.ts";
import { PUBLIC_STATS } from "../public-stats.ts";

function DaftarNav({ slug }: { readonly slug: string }) {
  return (
    <nav className="sidebar-nav" aria-label="Documentation">
      {NAV.map((section, index) => (
        <div key={section.title} className="sidebar-seksi">
          <div className="sidebar-judul">
            <span className="sidebar-nomor">{String(index + 1).padStart(2, "0")}</span>
            <span>{section.title}</span>
          </div>
          <ul>
            {section.items.map((item) => (
              <li key={item.slug}>
                <a
                  href={`docs/${item.slug}`}
                  {...(item.slug === slug ? { "aria-current": "page" as const } : {})}
                >
                  <span>{item.label}</span>
                  <span className="sidebar-tanda" aria-hidden="true">
                    {item.slug === slug ? "◆" : "→"}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function RailBrand() {
  return (
    <div className="sidebar-brand">
      <span className="sidebar-brand-kicker">Ramonyx field manual</span>
      <span className="sidebar-brand-title">Read the system.</span>
      <span className="sidebar-brand-meta">{`v${PUBLIC_STATS.version} · public contract`}</span>
    </div>
  );
}

function RailFoot() {
  return (
    <div className="sidebar-foot">
      <span className="sidebar-foot-label">Machine layer</span>
      <a href="machine/features.json">features.json</a>
      <a href="machine/llms.txt">llms.txt</a>
      <a href="docs/for-agents">MCP server</a>
    </div>
  );
}

export function DocsShell({
  slug,
  children,
}: {
  readonly slug: string;
  readonly children: ReactNode;
}) {
  const bagian = sectionOf(slug);
  const nomor = slug === "" ? "00" : sectionNumber(slug);
  return (
    <div className="docs">
      <aside className="sidebar" aria-label="Documentation">
        <RailBrand />
        <DaftarNav slug={slug} />
        <RailFoot />
      </aside>
      <details className="sidebar-mobile">
        <summary>
          <span className="sidebar-mobile-kicker">Documentation</span>
          <span className="sidebar-mobile-current">{slug === "" ? "Index" : navLabel(slug)}</span>
          <span className="sidebar-mobile-action">
            Browse <span aria-hidden="true">+</span>
          </span>
        </summary>
        <div className="sidebar-mobile-body">
          <RailBrand />
          <DaftarNav slug={slug} />
          <RailFoot />
        </div>
      </details>
      <a className="lewati" href={`docs${slug === "" ? "" : `/${slug}`}#isi`}>
        Skip to content
      </a>
      <main className="docs-utama" id="isi">
        <div className="remah">
          <span className="remah-nomor">{nomor}</span>
          {slug === "" ? (
            <span>Documentation index</span>
          ) : (
            <>
              <a href="docs">Docs</a>
              <span className="pemisah" aria-hidden="true">
                /
              </span>
              {bagian === undefined ? null : (
                <>
                  <span>{bagian}</span>
                  <span className="pemisah" aria-hidden="true">
                    /
                  </span>
                </>
              )}
              <span className="remah-aktif">{navLabel(slug)}</span>
            </>
          )}
          <span className="remah-garis" aria-hidden="true" />
          {slug === "" ? (
            <span className="remah-doc">PUBLIC DOCS</span>
          ) : (
            <a className="remah-markdown" href={`docs/${slug}.md`}>
              Markdown
            </a>
          )}
        </div>
        {children}
      </main>
    </div>
  );
}
