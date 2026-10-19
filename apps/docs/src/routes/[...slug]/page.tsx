import type { PageProps } from "@ramonyx/react";

export const metadata = { title: "Not found", status: 404 };
export const prerender = false;

export default function TidakDitemukan({ params }: PageProps<unknown>) {
  return (
    <main className="wrap" style={{ padding: "80px 0" }}>
      <p className="eyebrow">404</p>
      <h1>Page not found</h1>
      <p className="dim">
        <code>/{params.slug}</code> is not part of the public documentation.
      </p>
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
