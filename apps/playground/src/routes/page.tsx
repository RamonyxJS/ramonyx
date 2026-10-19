import type { PageProps } from "@ramonyx/react";
import { useState } from "react";

export const metadata = { title: "Beranda — Ramonyx Playground" };
/** Cache data loader 60 dtk (ADR-0066) — GET tanpa query/cookie memakai cache + SWR. */
export const revalidate = 60;

let hitunganLoader = 0;

export async function loader() {
  hitunganLoader += 1;
  return {
    greeting: "Halo dari loader SSR",
    links: ["/users", "/form", "/sesi", "/tentang", "/api/hello"],
    loaderRun: hitunganLoader,
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

export default function HomePage({
  data,
}: PageProps<{ greeting: string; links: string[]; loaderRun: number }>) {
  return (
    <>
      <h1>{data.greeting}</h1>
      <p data-loader-run>Loader dijalankan: {data.loaderRun}× (cache 60 dtk)</p>
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
