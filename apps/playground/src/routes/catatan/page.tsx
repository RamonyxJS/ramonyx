import type { PageProps } from "@ramonyx/react";
import { PendingButton } from "@ramonyx/react";
import type { PageActionContext } from "ramonyx";

export const metadata = { title: "Catatan — Ramonyx Playground" };
export const revalidate = 60;
export const cacheTags = ["catatan"] as const;
/** Revalidasi deklaratif: cache loader diinvalidasi setelah action sukses. */
export const actionRevalidate = { tags: ["catatan"] } as const;

const catatan: string[] = ["Belajar Ramonyx"];

export function loader() {
  return { catatan: [...catatan] };
}

export function action({ formData }: PageActionContext) {
  const teks = String(formData.get("teks") ?? "").trim();
  if (teks.length < 2) {
    return { errors: { teks: "Catatan minimal 2 karakter" } };
  }
  catatan.push(teks);
  return { message: `Ditambahkan: ${teks}` };
}

export default function CatatanPage({ data, action }: PageProps<{ catatan: string[] }>) {
  return (
    <section>
      <h1>Catatan</h1>
      <form method="post">
        <label>
          Catatan baru: <input name="teks" />
        </label>
        <PendingButton>Tambah</PendingButton>
      </form>
      {action?.errors?.teks !== undefined ? <p role="alert">{action.errors.teks}</p> : null}
      {action?.message !== undefined ? <p role="status">{action.message}</p> : null}
      <ul aria-label="Daftar catatan">
        {data.catatan.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </section>
  );
}
