import type { PageProps } from "@ramonyx/react";

import { listCatalog } from "../catalog.ts";

export const metadata = { title: "Dokumentasi" };

export async function loader() {
  return { entries: listCatalog() };
}

export default function IndexPage({
  data,
}: PageProps<{ entries: { slug: string; title: string }[] }>) {
  return (
    <main className="utama">
      <h1>Dokumentasi Ramonyx</h1>
      <p className="pengantar">
        Blueprint, arsitektur, kontrak API, ADR, dan roadmap — dirender langsung dari berkas
        markdown di repo.
      </p>
      <ul className="daftar">
        {data.entries.map((entry) => (
          <li key={entry.slug}>
            <a href={`/dokumen/${entry.slug}`}>{entry.title}</a>
            <code className="slug">{entry.slug}</code>
          </li>
        ))}
      </ul>
    </main>
  );
}
