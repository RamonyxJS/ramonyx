import type { PageProps } from "@ramonyx/react";

export const metadata = { title: "Tentang — Ramonyx Playground" };

/** Folder `(publik)` adalah route group: tidak muncul di URL (ADR-0061) — rute ini `/tentang`. */
export default function Tentang({ params }: PageProps<unknown>) {
  return (
    <section>
      <h1>Tentang</h1>
      <p>
        Halaman ini berada di folder <code>(publik)</code> — route group yang tidak muncul di URL.
      </p>
      <p>
        <code>params</code> kosong: {JSON.stringify(params)}
      </p>
    </section>
  );
}
