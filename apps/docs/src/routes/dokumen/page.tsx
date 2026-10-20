export const metadata = { title: "Documentation moved" };

export default function DokumenIndex() {
  return (
    <main className="galat" id="isi">
      <div className="wrap">
        <p className="kicker">
          <span className="kicker-tanda" aria-hidden="true" />
          Moved
        </p>
        <h1>Documentation has moved</h1>
        <p className="dim">
          The docs now live under <a href="docs">/docs</a>. This legacy path is kept for old links.
        </p>
        <div className="aksi-baris">
          <a className="tombol utama" href="docs">
            Go to documentation
          </a>
        </div>
      </div>
    </main>
  );
}
