import type { PageProps } from "@ramonyx/react";
import { HttpError } from "ramonyx";

import { type CatalogDoc, getCatalogDoc } from "../../../catalog.ts";
import { DocsShell } from "../../../components/docs-shell.tsx";
import { prevNext } from "../../../nav.ts";

export const metadata = { title: "Documentation" };

interface NavRef {
  readonly slug: string;
  readonly label: string;
}

export async function loader({ params }: { params: Record<string, string> }) {
  const slug = params.slug ?? "";
  const doc: CatalogDoc | null = getCatalogDoc(slug);
  if (doc === null) {
    throw new HttpError(404, `Document not found: ${slug}`);
  }
  const { prev, next } = prevNext(slug);
  return {
    slug,
    title: doc.title,
    html: doc.html,
    toc: doc.toc,
    prev: prev ?? null,
    next: next ?? null,
  };
}

export default function DokumenPage({
  data,
}: PageProps<{
  slug: string;
  title: string;
  html: string;
  toc: readonly { id: string; text: string; depth: number }[];
  prev: NavRef | null;
  next: NavRef | null;
}>) {
  return (
    <DocsShell slug={data.slug}>
      <div className="docs-tata">
        <div>
          {/* biome-ignore lint/security/noDangerouslySetInnerHtml: HTML dari markdown publik repo sendiri */}
          <article className="dokumen" dangerouslySetInnerHTML={{ __html: data.html }} />
          <a
            className="sunting"
            href={`https://github.com/RamonyxJS/ramonyx/edit/main/docs/public/${data.slug}.md`}
          >
            Edit this page on GitHub ↗
          </a>
          <nav className="docs-kaki" aria-label="Previous and next">
            <span>
              {data.prev === null ? null : (
                <>
                  <span className="label">Previous</span>
                  <a href={`docs/${data.prev.slug}`}>← {data.prev.label}</a>
                </>
              )}
            </span>
            <span style={{ textAlign: "right" }}>
              {data.next === null ? null : (
                <>
                  <span className="label">Next</span>
                  <a href={`docs/${data.next.slug}`}>{data.next.label} →</a>
                </>
              )}
            </span>
          </nav>
        </div>
        {data.toc.length === 0 ? null : (
          <aside className="toc" aria-label="On this page">
            <div className="toc-judul">On this page</div>
            <ul>
              {data.toc.map((item) => (
                <li key={item.id} className={item.depth === 3 ? "kedalaman-3" : undefined}>
                  <a href={`#${item.id}`}>{item.text}</a>
                </li>
              ))}
            </ul>
          </aside>
        )}
      </div>
    </DocsShell>
  );
}
