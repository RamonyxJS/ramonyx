import type { PageProps } from "@ramonyx/react";

import { FAVICON } from "../../favicon.ts";

export const metadata = {
  title: "Tidak ditemukan",
  status: 404,
  head: `<link rel="icon" href="${FAVICON}" type="image/svg+xml" />`,
};
/** Halaman 404 catch-all — tidak diprerender (rutenya tak terbatas). */
export const prerender = false;

export default function TidakDitemukan({ params }: PageProps<unknown>) {
  return (
    <main className="rw-main rw-notfound">
      <p className="rw-kicker">404 · route not found</p>
      <h1>Halaman tidak ditemukan.</h1>
      <p>
        Tidak ada rute untuk <code>/{params.slug}</code>.
      </p>
      <p>
        <a className="rw-button" href="/">
          Kembali ke beranda
        </a>
      </p>
    </main>
  );
}
