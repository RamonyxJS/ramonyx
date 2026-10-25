import type { PageProps } from "@ramonyx/react";
import { Image } from "@ramonyx/react/assets";
import { type AssetResolver, createTranslator, type Messages } from "ramonyx";
import { useState } from "react";

// Katalog i18n (ADR-0081): objek bersarang JSON-friendly — pola yang sama berlaku untuk katalog
// dari file/DB (dimuat di loader, diteruskan sebagai data halaman).
const katalog: Record<string, Messages> = {
  id: { greeting: "Halo dari loader SSR", heroAlt: "Ilustrasi hero" },
  en: { greeting: "Hello from the SSR loader", heroAlt: "Hero illustration" },
};

export const metadata = { title: "Beranda — Ramonyx Playground" };
/** Cache data loader 60 dtk (ADR-0066) — GET tanpa query/cookie memakai cache + SWR. */
export const revalidate = 60;

let hitunganLoader = 0;

export async function loader({ assets, locale }: { assets: AssetResolver; locale?: string }) {
  hitunganLoader += 1;
  const aktif = locale ?? "id";
  const { t } = createTranslator({ locale: aktif, messages: katalog[aktif] ?? katalog.id ?? {} });
  return {
    greeting: t("greeting"),
    heroAlt: t("heroAlt"),
    locale: aktif,
    links: [
      "/users",
      "/form",
      "/sesi",
      "/catatan",
      "/tentang",
      "/deferred",
      "/islands",
      "/api/hello",
    ],
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
  heroAlt: string;
  locale: string;
}>) {
  return (
    <>
      <h1>{data.greeting}</h1>
      <p data-locale>{data.locale}</p>
      <Image {...data.hero} alt={data.heroAlt} sizes="(max-width: 768px) 100vw, 640px" />
      <p data-loader-run>Loader dijalankan: {data.loaderRun}× (cache 60 dtk)</p>
      <Counter />
      <ul>
        {data.links.map((href) => (
          <li key={href}>
            <a href={href}>{href}</a>
          </li>
        ))}
      </ul>
      <section id="hash-target" style={{ marginTop: "1600px" }}>
        <h2>Hash target</h2>
        <p>Target untuk menguji scroll hash setelah navigasi.</p>
      </section>
      <div id="hash-target-spacer" style={{ height: "1200px" }} />
    </>
  );
}
