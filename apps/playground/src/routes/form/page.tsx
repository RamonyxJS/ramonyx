import type { PageProps } from "@ramonyx/react";
import type { PageActionContext } from "ramonyx";

export const metadata = { title: "Form — Ramonyx Playground" };

/** Mutasi form: POST ke path yang sama (ADR-0057) — progressive enhancement. */
export function action({ formData }: PageActionContext) {
  const nama = String(formData.get("nama") ?? "").trim();
  if (nama.length < 2) {
    return { errors: { nama: "Nama minimal 2 karakter" } };
  }
  return { message: `Halo, ${nama}!` };
}

export default function FormPage({ action }: PageProps<unknown>) {
  return (
    <section>
      <h1>Form dengan action</h1>
      <p>Kirim tanpa JavaScript pun berfungsi (POST native → HTML dirender ulang oleh server).</p>
      <form method="post">
        <label>
          Nama: <input name="nama" defaultValue="" />
        </label>
        <button type="submit">Kirim</button>
      </form>
      {action?.errors?.nama !== undefined ? (
        <p role="alert" style={{ color: "crimson" }}>
          {action.errors.nama}
        </p>
      ) : null}
      {action?.message !== undefined ? <p role="status">{action.message}</p> : null}
    </section>
  );
}
