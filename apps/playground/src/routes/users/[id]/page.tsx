import type { PageProps } from "@ramonyx/react";
import { HttpError } from "ramonyx";
import { findUser, uuidPattern } from "../../../data/users.ts";

export const metadata = { title: "Detail Pengguna — Ramonyx Playground" };

export async function loader({ params }: { params: Record<string, string> }) {
  const id = params.id ?? "";
  if (!uuidPattern.test(id)) {
    throw new HttpError(400, "ID pengguna tidak valid");
  }
  const user = findUser(id);
  if (user === undefined) {
    throw new HttpError(404, "Pengguna tidak ditemukan");
  }
  return { user };
}

export default function UserPage({
  data,
  params,
}: PageProps<{ user: { id: string; name: string } }>) {
  return (
    <>
      <h1>{data.user.name}</h1>
      <p>ID: {data.user.id}</p>
      <p>Parameter route: {params.id}</p>
      <p>
        <a href="/users">Kembali ke daftar</a>
      </p>
    </>
  );
}
