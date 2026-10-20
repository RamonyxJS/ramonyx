import type { PageProps } from "@ramonyx/react";

export const metadata = { title: "Not found", status: 404 };
export const prerender = false;

export default function TidakDitemukan({ params }: PageProps<unknown>) {
  return (
    <main className="galat" id="isi">
      <div className="wrap">
        <p className="kicker">
          <span className="kicker-tanda" aria-hidden="true" />
          Not found
        </p>
        <p className="galat-kode">404</p>
        <h1>Page not found</h1>
        <p className="dim">
          <code>/{params.slug}</code> is not part of the public documentation.
        </p>
        <div className="aksi-baris">
          <a className="tombol utama" href="docs">
            Browse the docs
          </a>
          <a className="tombol" href=".">
            Back home
          </a>
        </div>
      </div>
    </main>
  );
}
