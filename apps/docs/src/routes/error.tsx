import type { ErrorPageProps } from "@ramonyx/react";

export default function ErrorPage({ error }: ErrorPageProps) {
  return (
    <main className="utama">
      <h1>{error.status}</h1>
      <p>{error.message}</p>
      <p>
        <a href="/">← Semua dokumen</a>
      </p>
    </main>
  );
}
