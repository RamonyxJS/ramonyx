import type { PageProps } from "@ramonyx/react";
import { createSession } from "@ramonyx/security";
import type { PageActionContext, PageLoaderContext } from "ramonyx";

export const metadata = { title: "Sesi — Ramonyx Playground", robots: "noindex" };

// Uji lokal: secret tetap + secure:false (HTTP dev). Produksi: secret dari env/binding,
// cookie Secure (default) — lihat docs/security/sessions.md.
const session = createSession({
  secret: "playground-secret-untuk-uji",
  cookieName: "sesi_playground",
  cookie: { secure: false },
});

export async function loader({ request }: PageLoaderContext) {
  const data = await session.read(request);
  return { pengguna: typeof data?.pengguna === "string" ? data.pengguna : null };
}

export async function action({ formData }: PageActionContext) {
  const intent = String(formData.get("intent") ?? "masuk");
  if (intent === "keluar") {
    return { message: "Sesi dihapus.", headers: { "set-cookie": session.clear() } };
  }
  const nama = String(formData.get("nama") ?? "").trim();
  if (nama.length < 2) {
    return { errors: { nama: "Nama minimal 2 karakter" } };
  }
  return {
    message: `Sesi dibuat untuk ${nama}.`,
    headers: { "set-cookie": await session.commit({ pengguna: nama }) },
  };
}

export default function Sesi({ data, action }: PageProps<{ pengguna: string | null }>) {
  return (
    <section>
      <h1>Sesi (cookie bertanda tangan)</h1>
      <p data-status-sesi>
        Status: {data.pengguna === null ? "belum masuk" : `masuk sebagai ${data.pengguna}`}
      </p>
      <form method="post">
        <label>
          Nama: <input name="nama" />
        </label>
        <button type="submit" name="intent" value="masuk">
          Masuk
        </button>
        <button type="submit" name="intent" value="keluar">
          Keluar
        </button>
      </form>
      {action?.errors?.nama !== undefined ? <p role="alert">{action.errors.nama}</p> : null}
      {action?.message !== undefined ? <p role="status">{action.message}</p> : null}
    </section>
  );
}
