import type { PageProps } from "@ramonyx/react";
import { HttpError } from "ramonyx";

import { type CatalogDoc, getCatalogDoc } from "../../../catalog.ts";
import { DocsShell } from "../../../components/docs-shell.tsx";

export const metadata = { title: "Documentation" };

export async function loader({ params }: { params: Record<string, string> }) {
  const slug = params.slug ?? "";
  const doc: CatalogDoc | null = getCatalogDoc(slug);
  if (doc === null) {
    throw new HttpError(404, `Document not found: ${slug}`);
  }
  return { slug, title: doc.title, html: doc.html };
}

/** Alias lama (`/dokumen/<slug>`) → konten sama; canonical URL baru: `/docs/<slug>`. */
export default function LegacyDocPage({
  data,
}: PageProps<{ slug: string; title: string; html: string }>) {
  return (
    <DocsShell slug={data.slug}>
      <p className="dim" style={{ fontFamily: "var(--font-mono)", fontSize: "12px" }}>
        Canonical: <a href={`docs/${data.slug}`}>/docs/{data.slug}</a>
      </p>
      {/* biome-ignore lint/security/noDangerouslySetInnerHtml: HTML dari markdown publik repo sendiri */}
      <article className="dokumen" dangerouslySetInnerHTML={{ __html: data.html }} />
    </DocsShell>
  );
}
