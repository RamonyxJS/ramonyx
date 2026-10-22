import { DevErrorOverlay, type ErrorPageProps } from "@ramonyx/react";

export default function RootErrorPage({ error }: ErrorPageProps) {
  return (
    <>
      <h1>{error.status}</h1>
      <p>{error.message}</p>
      <p>
        <a href="/">Kembali ke beranda</a>
      </p>
      {error.details === undefined ? null : <DevErrorOverlay details={error.details} />}
    </>
  );
}
