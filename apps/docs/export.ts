// Ekspor statis situs dokumentasi (hosting GitHub Pages) — ADR-0052 + ADR-0054 + ADR-0056.
//
// Halaman HTML + 404 + aset kini lewat **fitur framework** (`prerenderRoutes`, ADR-0056) —
// dogfood SSG: request sintetis ke handler SSR yang sama (paritas penuh), bukan renderer kedua.
// Ekspor ini menambahkan artefak khusus situs docs untuk agen AI (ADR-0054): markdown per
// halaman, `sitemap.md`, `llms.txt`/`llms-full.txt`, dan `machine/*.json`.
//
// Jalankan: `pnpm docs:export` (default base "" → root) atau
// `node --import ./tools/register.mjs apps/docs/export.ts --base /ramonyx --out <dir>`.

import { cp, mkdir, readdir, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildClient, prerenderRoutes } from "@ramonyx/bundler";
import { loadPageRoutes } from "@ramonyx/compiler";
import { createApp } from "./src/app.ts";
import { loadCatalog } from "./src/docs.ts";
import { rewriteDocLinks } from "./src/markdown.ts";

const args = process.argv.slice(2);
const argValue = (name: string): string | undefined => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};

const appDir = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = resolve(appDir, "..", "..");
const basePath = (argValue("--base") ?? "").replace(/\/$/, "");
const outArg = argValue("--out");
const outDir = outArg === undefined ? join(appDir, "dist/static") : resolve(process.cwd(), outArg);

console.log(`ekspor docs: base "${basePath || "/"}" → ${relative(process.cwd(), outDir)}`);
if (process.env.NODE_ENV !== "production") {
  console.warn(
    "peringatan: NODE_ENV bukan production — HTML diekspor dengan React dev build (ADR-0048/0056).",
  );
}

// 1. Bundel klien (hydration + soft navigation) ke dist/client.
const pages = await loadPageRoutes({ dir: join(appDir, "src/routes") });
const build = await buildClient({ appDir, pages });
console.log(`✓ bundel klien: ${build.scriptPath}`);

// 2. Render semua halaman lewat prerender framework (request sintetis ke handler yang sama).
const handler = await createApp({ basePath });
const catalog = loadCatalog();
// Indeks "/" datang dari manifest halaman; di sini cukup rute dokumen (rute dinamis).
const routes = catalog.map((doc) => `dokumen/${doc.slug}`);

/** Sisipkan tautan discovery agen ke `<head>` (ADR-0054; spec llmstxt.org v2). */
function withAgentLinks(html: string, routePath: string): string {
  const clean = routePath.replace(/^\//, "");
  const markdownHref = clean.startsWith("dokumen/") ? `${clean}.md` : null;
  const links = [
    markdownHref === null
      ? null
      : `<link rel="alternate" type="text/markdown" href="${markdownHref}" />`,
    `<link rel="describedby" href="llms.txt" />`,
  ].filter((link): link is string => link !== null);
  return html.replace("</head>", `${links.join("\n")}\n</head>`);
}

const result = await prerenderRoutes({
  handler,
  pages,
  outDir,
  paths: routes,
  notFoundPath: "/__tidak-ada__",
  clientDir: join(appDir, "dist/client"),
  nojekyll: true,
  transformHtml: withAgentLinks,
});
console.log(
  `✓ ${result.routes.length} halaman dirender (dengan link discovery agen) + 404 + aset + .nojekyll`,
);

// 3. Markdown mentah per halaman (tautan dokumen ditulis ulang agar benar).
for (const doc of catalog) {
  const target = join(outDir, `dokumen/${doc.slug}.md`);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, `${rewriteDocLinks(doc.text, doc.slug).trimEnd()}\n`);
}
console.log(`✓ ${catalog.length} markdown per halaman (dokumen/<slug>.md)`);

// 4. sitemap.md — indeks semua halaman untuk agen (pola Nuxt).
const sitemapLines = [
  "# Sitemap",
  "",
  "> Indeks semua halaman situs dokumentasi Ramonyx (markdown).",
  "",
  "- [Dokumentasi Ramonyx](.): daftar seluruh dokumen",
  ...catalog.map((doc) => `- [${doc.title}](dokumen/${doc.slug}/): \`dokumen/${doc.slug}\``),
  "",
];
await writeFile(join(outDir, "sitemap.md"), sitemapLines.join("\n"));

// 5. Machine layer + llms.txt (ADR-0054) — diterbitkan apa adanya.
const machineDir = join(repoRoot, "docs/machine");
const machineFiles = (await readdir(machineDir)).filter(
  (file) => file.endsWith(".json") || file.endsWith(".schema.json"),
);
await mkdir(join(outDir, "machine"), { recursive: true });
for (const file of machineFiles) {
  await cp(join(machineDir, file), join(outDir, "machine", file));
}
await cp(join(machineDir, "llms.txt"), join(outDir, "llms.txt"));
await cp(join(machineDir, "llms-full.txt"), join(outDir, "llms-full.txt"));
await cp(join(repoRoot, "TODO.json"), join(outDir, "machine", "todo.json"));
console.log(`✓ machine/ (${machineFiles.length} berkas) + llms.txt + llms-full.txt + sitemap.md`);

console.log(`ekspor selesai: ${relative(process.cwd(), outDir)}`);
