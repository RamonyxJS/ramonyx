import type { ErrorPageProps } from "@ramonyx/react";

export default function ErrorPage({ error }: ErrorPageProps) {
  return (
    <main className="galat" id="isi">
      <div className="wrap">
        <p className="kicker">
          <span className="kicker-tanda" aria-hidden="true" />
          Error {error.status}
        </p>
        <p className="galat-kode">{error.status}</p>
        <h1>{error.status === 404 ? "Page not found" : "Something went wrong"}</h1>
        <p className="dim">{error.message}</p>
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
