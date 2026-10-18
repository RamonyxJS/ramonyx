import type { PageProps } from "@ramonyx/react";

export const metadata = { title: "404 — Ramonyx Playground", status: 404 };

export default function NotFoundPage({ params }: PageProps<unknown>) {
  return (
    <>
      <h1>404</h1>
      <p>Halaman tidak ditemukan: /{params.notFound}</p>
      <p>
        <a href="/">Kembali ke beranda</a>
      </p>
    </>
  );
}
