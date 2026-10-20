import type { PageProps } from "@ramonyx/react";

import { listCatalog } from "../../catalog.ts";
import { DocsShell } from "../../components/docs-shell.tsx";
import { NAV } from "../../nav.ts";

export const metadata = {
  title: "Documentation",
  description: "Ramonyx documentation: getting started, routing, SSR, security, deployment, API.",
};

export async function loader() {
  return { entries: listCatalog() };
}

export default function DocsIndexPage({
  data,
}: PageProps<{ entries: { slug: string; title: string }[] }>) {
  const tersedia = new Set(data.entries.map((entry) => entry.slug));
  return (
    <DocsShell slug="">
      <div className="docs-intro">
        <h1>Documentation</h1>
        <p>
          Start with the one-file app, then follow the request through routing, rendering, data, and
          deployment. Every page is written from the public documentation set.
        </p>
        <p className="dim">
          Machine-readable facts live in <a href="machine/features.json">features.json</a> and{" "}
          <a href="machine/llms.txt">llms.txt</a>. Agents can use the{" "}
          <a href="docs/for-agents">MCP docs server</a>.
        </p>
      </div>
      <div className="katalog">
        {NAV.map((section) => {
          const items = section.items.filter((item) => tersedia.has(item.slug));
          if (items.length === 0) {
            return null;
          }
          return (
            <section key={section.title} className="katalog-bagian">
              <h2>{section.title}</h2>
              <ul>
                {items.map((item) => (
                  <li key={item.slug}>
                    <a href={`docs/${item.slug}`}>{item.label}</a>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </DocsShell>
  );
}
