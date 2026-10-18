import type { PageProps } from "@ramonyx/react";

export const metadata = { title: "Beranda — Ramonyx Playground" };

export async function loader() {
  return {
    greeting: "Halo dari loader SSR",
    links: ["/users", "/api/hello"],
  };
}

export default function HomePage({ data }: PageProps<{ greeting: string; links: string[] }>) {
  return (
    <>
      <h1>{data.greeting}</h1>
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
