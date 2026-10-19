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
      <h1>Documentation</h1>
      <p className="dim" style={{ maxWidth: "62ch" }}>
        Everything here is written from the public documentation set. For machine-readable facts,
        start with <a href="machine/features.json">features.json</a> and{" "}
        <a href="machine/llms.txt">llms.txt</a>; for agents, use the{" "}
        <a href="docs/for-agents">MCP server</a>.
      </p>
      {NAV.map((section) => {
        const items = section.items.filter((item) => tersedia.has(item.slug));
        if (items.length === 0) {
          return null;
        }
        return (
          <section key={section.title} style={{ marginTop: "34px" }}>
            <h2
              style={{ fontSize: "22px", borderTop: "1px solid var(--line)", paddingTop: "16px" }}
            >
              {section.title}
            </h2>
            <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: "6px" }}>
              {items.map((item) => (
                <li key={item.slug}>
                  <a href={`docs/${item.slug}`}>{item.label}</a>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </DocsShell>
  );
}
