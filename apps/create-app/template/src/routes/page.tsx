import type { PageProps } from "@ramonyx/react";
import type { PageActionContext } from "ramonyx";
import { useState } from "react";

export const metadata = {
  title: "__APP_NAME__",
  description: "Aplikasi Ramonyx — SSR React, file routing, dan server actions.",
};
/** Cache data loader 60 dtk (ADR-0066) — hapus atau sesuaikan bila data harus selalu segar. */
export const revalidate = 60;

export async function loader() {
  return { pesan: "Halo dari SSR Ramonyx", fitur: ["SSR React", "hydration", "route API"] };
}

/** Mutasi form: POST ke path yang sama (progressive enhancement — ADR-0057). */
export function action({ formData }: PageActionContext) {
  const nama = String(formData.get("nama") ?? "").trim();
  if (nama.length < 2) {
    return { errors: { nama: "Nama minimal 2 karakter" } };
  }
  return { message: `Halo, ${nama}!` };
}

/** Komponen interaktif: server merender 0, klik menambah setelah hydration. */
function Counter() {
  const [hitungan, setHitungan] = useState(0);
  return (
    <p>
      <button type="button" onClick={() => setHitungan((nilai) => nilai + 1)}>
        Klik saya: {hitungan}
      </button>
    </p>
  );
}

export default function Beranda({ data, action }: PageProps<{ pesan: string; fitur: string[] }>) {
  return (
    <main>
      <h1>{data.pesan}</h1>
      <ul>
        {data.fitur.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      <Counter />
      <h2>Form dengan action</h2>
      <form method="post">
        <label>
          Nama: <input name="nama" />
        </label>
        <button type="submit">Kirim</button>
      </form>
      {action?.errors?.nama !== undefined ? <p role="alert">{action.errors.nama}</p> : null}
      {action?.message !== undefined ? <p role="status">{action.message}</p> : null}
      <p>
        Coba API dinamis: <a href="/api/halo/dunia">/api/halo/dunia</a>
      </p>
    </main>
  );
}
