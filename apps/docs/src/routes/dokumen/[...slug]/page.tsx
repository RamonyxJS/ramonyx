import type { PageProps } from "@ramonyx/react";
import { HttpError } from "ramonyx";

import { getCatalogDoc } from "../../../catalog.ts";

export const metadata = { title: "Dokumen" };

export async function loader({ params }: { params: Record<string, string> }) {
  const slug = params.slug ?? "";
  const doc = getCatalogDoc(slug);
  if (doc === null) {
    throw new HttpError(404, `Dokumen tidak ditemukan: ${slug}`);
  }
  return { slug, title: doc.title, html: doc.html };
}

export default function DokumenPage({
  data,
}: PageProps<{ slug: string; title: string; html: string }>) {
  return (
    <main className="utama">
      <p className="remah">
        <a href=".">← Semua dokumen</a> <code>{data.slug}</code>
      </p>
      {/* biome-ignore lint/security/noDangerouslySetInnerHtml: HTML dari markdown repo sendiri (tepercaya); lihat markdown.ts */}
      <article className="dokumen" dangerouslySetInnerHTML={{ __html: data.html }} />
    </main>
  );
}
