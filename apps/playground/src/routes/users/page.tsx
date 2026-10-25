import type { PageProps } from "@ramonyx/react";
import { users } from "../../data/users.ts";

export const metadata = { title: "Pengguna — Ramonyx Playground" };

export async function loader() {
  return { users: users.map((user) => ({ id: user.id, name: user.name })) };
}

export default function UsersPage({ data }: PageProps<{ users: { id: string; name: string }[] }>) {
  return (
    <>
      <h1>Pengguna</h1>
      <ul>
        {data.users.map((user) => (
          <li key={user.id}>
            <a href={`/users/${user.id}`}>{user.name}</a>
          </li>
        ))}
      </ul>
      <p>
        <a href="/">Kembali</a>
        {" · "}
        <a href="/#hash-target">Lompat ke hash target</a>
      </p>
    </>
  );
}
