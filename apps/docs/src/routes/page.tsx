import type { PageProps } from "@ramonyx/react";
import { useState } from "react";

import { listCatalog } from "../catalog.ts";

export const metadata = {
  title: "Dokumentasi",
  description:
    "Blueprint, arsitektur, kontrak API, ADR, dan roadmap Ramonyx — dirender dari markdown di repo.",
};

export async function loader() {
  return { entries: listCatalog() };
}

export default function IndexPage({
  data,
}: PageProps<{ entries: { slug: string; title: string }[] }>) {
  const [filter, setFilter] = useState("");

  const needle = filter.trim().toLowerCase();
  const terlihat =
    needle.length === 0
      ? data.entries
      : data.entries.filter(
          (entry) =>
            entry.title.toLowerCase().includes(needle) || entry.slug.toLowerCase().includes(needle),
        );

  return (
    <main className="utama">
      <h1>Dokumentasi Ramonyx</h1>
      <p className="pengantar">
        Blueprint, arsitektur, kontrak API, ADR, dan roadmap — dirender langsung dari berkas
        markdown di repo.
      </p>
      <p className="pengantar">
        Untuk agen AI: <a href="llms.txt">llms.txt</a> · <a href="llms-full.txt">llms-full.txt</a> ·{" "}
        <a href="machine/features.json">machine/features.json</a> (status fitur + bukti) ·{" "}
        <a href="sitemap.md">sitemap.md</a>
      </p>

      <input
        className="cari"
        type="search"
        placeholder="Cari dokumen… (judul atau slug)"
        aria-label="Cari dokumen"
        value={filter}
        onChange={(event) => setFilter(event.target.value)}
      />

      {terlihat.length === 0 ? (
        <p className="pengantar">
          Tidak ada dokumen yang cocok. Untuk pencarian <em>isi</em>, Pakai API{" "}
          <code>/api/cari?q=…</code>.
        </p>
      ) : (
        <ul className="daftar">
          {terlihat.map((entry) => (
            <li key={entry.slug}>
              <a href={`dokumen/${entry.slug}`}>{entry.title}</a>
              <code className="slug">{entry.slug}</code>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
