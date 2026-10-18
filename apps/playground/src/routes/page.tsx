import type { PageProps } from "@ramonyx/react";
import { useState } from "react";

export const metadata = { title: "Beranda — Ramonyx Playground" };

export async function loader() {
  return {
    greeting: "Halo dari loader SSR",
    links: ["/users", "/api/hello"],
  };
}

/** Komponen interaktif: membuktikan hydration (server render 0, klik menambah). */
function Counter() {
  const [count, setCount] = useState(0);
  return (
    <p>
      <button type="button" onClick={() => setCount((value) => value + 1)}>
        Klik saya: {count}
      </button>
    </p>
  );
}

export default function HomePage({ data }: PageProps<{ greeting: string; links: string[] }>) {
  return (
    <>
      <h1>{data.greeting}</h1>
      <Counter />
      <ul>
        {data.links.map((href) => (
          <li key={href}>
            <a href={href}>{href}</a>
          </li>
        ))}
      </ul>
    </>
  );
}
