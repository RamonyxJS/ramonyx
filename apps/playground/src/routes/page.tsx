import type { PageProps } from "@ramonyx/react";
import { Image } from "@ramonyx/react/assets";
import type { AssetResolver } from "ramonyx";
import { useState } from "react";

export const metadata = { title: "Beranda — Ramonyx Playground" };
/** Cache data loader 60 dtk (ADR-0066) — GET tanpa query/cookie memakai cache + SWR. */
export const revalidate = 60;

let hitunganLoader = 0;

export async function loader({ assets }: { assets: AssetResolver }) {
  hitunganLoader += 1;
  return {
    greeting: "Halo dari loader SSR",
    links: ["/users", "/form", "/sesi", "/tentang", "/api/hello"],
    loaderRun: hitunganLoader,
    // Varian gambar dari plugin image (ADR-0079): src + srcset + <source> webp + dimensi.
    hero: assets.image("img/hero.png"),
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
}: PageProps<{
  greeting: string;
  links: string[];
  loaderRun: number;
  hero: import("ramonyx").ResolvedImage;
}>) {
  return (
    <>
      <h1>{data.greeting}</h1>
      <Image {...data.hero} alt="Ilustrasi hero" sizes="(max-width: 768px) 100vw, 640px" />
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
