import type { PageProps } from "@ramonyx/react";

export const metadata = { title: "Tidak ditemukan", status: 404 };
/** Halaman 404 catch-all — tidak diprerender (rutenya tak terbatas). */
export const prerender = false;

export default function TidakDitemukan({ params }: PageProps<unknown>) {
  return (
    <main className="utama">
      <h1>404 — Tidak ditemukan</h1>
      <p>
        Halaman <code>/{params.slug}</code> tidak ada di dokumentasi ini.
      </p>
      <p>
        <a href=".">Kembali ke indeks dokumentasi</a>
      </p>
    </main>
  );
}
