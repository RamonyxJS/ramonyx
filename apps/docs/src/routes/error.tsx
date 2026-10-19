import type { ErrorPageProps } from "@ramonyx/react";

export default function ErrorPage({ error }: ErrorPageProps) {
  return (
    <main className="wrap" style={{ padding: "80px 0" }}>
      <p className="eyebrow">Error {error.status}</p>
      <h1>{error.status}</h1>
      <p className="dim">{error.message}</p>
      <p>
        <a className="tombol" href="docs">
          Browse the docs
        </a>{" "}
        <a className="tombol" href=".">
          Back home
        </a>
      </p>
    </main>
  );
}
