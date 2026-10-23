// Generator llms.txt + llms-full.txt (spesifikasi llmstxt.org) — **hanya dari konten publik**
// (`docs/public/`), ADR-0054/0082. Deterministik (tanpa timestamp) agar kesegaran bisa divalidasi.
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { CONTEXT7_SEARCH_SECTION } from "../../apps/docs/src/context7.ts";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const SITE = "https://ramonyx.devmoon.net";
const PUBLIC = "docs/public";

// Machine layer publik — security.json sengaja TIDAK ada (internal).
const MACHINE_FILES = [
  "features.json",
  "adrs.json",
  "rules.json",
  "glossary.json",
  "api.json",
  "cli.json",
  "recipes.json",
  "stats.json",
  "config.schema.json",
] as const;

function read(relativePath: string): string {
  return readFileSync(`${ROOT}${relativePath}`, "utf8");
}

function collectDocs(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "machine" || entry.name === "engineering" || entry.name.startsWith(".")) {
      continue;
    }
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      collectDocs(path, found);
    } else if (entry.name.endsWith(".md")) {
      found.push(path);
    }
  }
  return found;
}

function slugFor(file: string): string {
  return relative(join(ROOT, PUBLIC), file).split(sep).join("/").replace(/\.md$/, "");
}

function titleOf(markdown: string): string {
  for (const line of markdown.split("\n")) {
    if (line.startsWith("# ")) {
      return line.slice(2).trim();
    }
  }
  return "Untitled";
}

export function generateLlms(): { llms: string; llmsFull: string } {
  const stats = JSON.parse(read("docs/public/machine/stats.json")) as {
    adrs: number;
    version: string;
  };
  const docs = collectDocs(join(ROOT, PUBLIC)).sort((a, b) => slugFor(a).localeCompare(slugFor(b)));

  const llms = `# Ramonyx

> Full-stack TypeScript framework (Node.js ≥ 24) with file routing, SSR React + hydration, soft
> navigation, secure defaults, server actions, edge/static targets, and an experimental Rust/V8 runtime.

Documentation: ${SITE}/ . Structured facts: ${SITE}/machine/ .

${CONTEXT7_SEARCH_SECTION}

## Machine-readable (public only)

- [features.json](${SITE}/machine/features.json): feature status (implemented/partial/experimental/planned), packages, evidence, limitations
- [adrs.json](${SITE}/machine/adrs.json): ${stats.adrs} public architecture decisions (one-line decision + relations)
- [rules.json](${SITE}/machine/rules.json): rules for writing apps, with good/bad examples
- [glossary.json](${SITE}/machine/glossary.json): terms and concept map
- [stats.json](${SITE}/machine/stats.json): version, packages, public ADR count, test counts
- [api.json](${SITE}/machine/api.json) and [cli.json](${SITE}/machine/cli.json): extracted API/CLI reference
- [recipes.json](${SITE}/machine/recipes.json): task recipes (page/loader, actions, APIs, auth, cache, testing, deploy)
- [config.schema.json](${SITE}/machine/config.schema.json): ramonyx.config.ts shape (verified by tests)

## Documentation

${docs.map((file) => `- [${titleOf(readFileSync(file, "utf8"))}](${SITE}/docs/${slugFor(file)}/)`).join("\n")}

## For agents

- [llms-full.txt](${SITE}/machine/llms-full.txt): public machine layer + all public docs in one file
- Markdown per page: append \`.md\` to a docs URL (e.g. ${SITE}/docs/getting-started.md)
- MCP server: \`npx -y @ramonyx/mcp-docs-server\` (stdio; public docs snapshot)
- [Context7](https://context7.com/websites/ramonyx_devmoon_net): searchable docs index + Ask endpoint
`;

  const parts: string[] = [
    `# Ramonyx — llms-full (public)`,
    ``,
    `> Full public corpus for agents: public machine layer (JSON) + public documentation.`,
    `> Source: repo RamonyxJS/ramonyx (${SITE}). Internal docs are never included.`,
    ``,
    CONTEXT7_SEARCH_SECTION,
    ``,
    `Context7 library: https://context7.com/websites/ramonyx_devmoon_net`,
    ``,
  ];
  for (const file of MACHINE_FILES) {
    parts.push(
      `## docs/public/machine/${file}`,
      "",
      "```json",
      read(`docs/public/machine/${file}`).trimEnd(),
      "```",
      "",
    );
  }
  for (const file of docs) {
    parts.push(`## docs/public/${slugFor(file)}.md`, "", readFileSync(file, "utf8").trimEnd(), "");
  }
  return { llms, llmsFull: `${parts.join("\n")}\n` };
}
