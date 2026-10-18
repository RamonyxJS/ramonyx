import type { PageProps } from "@ramonyx/react";
import { useState } from "react";

export const metadata = { title: "__APP_NAME__" };

export async function loader() {
  return { pesan: "Halo dari SSR Ramonyx", fitur: ["SSR React", "hydration", "route API"] };
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

export default function Beranda({ data }: PageProps<{ pesan: string; fitur: string[] }>) {
  return (
    <main>
      <h1>{data.pesan}</h1>
      <ul>
        {data.fitur.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      <Counter />
      <p>
        Coba API dinamis: <a href="/api/halo/dunia">/api/halo/dunia</a>
      </p>
    </main>
  );
}
