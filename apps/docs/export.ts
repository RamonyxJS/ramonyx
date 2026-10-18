// Ekspor statis situs dokumentasi (hosting GitHub Pages) — ADR-0052 + ADR-0054.
//
// Merender **semua** halaman (indeks + setiap dokumen) lewat handler SSR yang sama dengan
// server (dogfood penuh), menulis HTML per rute + aset klien + halaman 404. Tautan relatif
// + `<base href>` membuat hasilnya benar di subpath (`/ramonyx/`) maupun di root.
//
// Untuk agen AI (ADR-0054): menulis markdown mentah per halaman (`dokumen/<slug>.md`),
// `sitemap.md`, `llms.txt` + `llms-full.txt`, seluruh berkas `docs/machine/*.json` ke
// `machine/`, serta `<link rel="alternate" type="text/markdown">` + `rel="describedby"`
// di `<head>` setiap halaman.
//
// Jalankan: `pnpm docs:export` (default base "" → root) atau
// `node --import ./tools/register.mjs apps/docs/export.ts --base /ramonyx --out <dir>`.

import { cp, mkdir, readdir, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildClient } from "@ramonyx/bundler";
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

// 1. Bundel klien (hydration + soft navigation) ke dist/client.
const pages = await loadPageRoutes({ dir: join(appDir, "src/routes") });
const build = await buildClient({ appDir, pages });
console.log(`✓ bundel klien: ${build.scriptPath}`);

// 2. Render semua rute lewat handler yang sama dengan server (paritas 100%).
const handler = await createApp({ basePath });
const catalog = loadCatalog();
const routes = ["", ...catalog.map((doc) => `dokumen/${doc.slug}`)];

/** Sisipkan tautan discovery agen ke `<head>` (ADR-0054; spec llmstxt.org v2). */
function withAgentLinks(html: string, markdownHref: string | null): string {
  const links = [
    markdownHref === null
      ? null
      : `<link rel="alternate" type="text/markdown" href="${markdownHref}" />`,
    `<link rel="describedby" href="llms.txt" />`,
  ].filter((link): link is string => link !== null);
  return html.replace("</head>", `${links.join("\n")}\n</head>`);
}

for (const route of routes) {
  const response = await handler(new Request(`http://export.local/${route}`));
  const tipe = response.headers.get("content-type") ?? "";
  if (response.status !== 200 || !tipe.includes("text/html")) {
    throw new Error(`ekspor ${route === "" ? "/" : route}: status ${response.status}`);
  }
  const html = await response.text();
  const markdownHref = route === "" ? null : `${route}.md`;
  const target = route === "" ? join(outDir, "index.html") : join(outDir, route, "index.html");
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, withAgentLinks(html, markdownHref));
}
console.log(`✓ ${routes.length} halaman dirender (dengan link discovery agen)`);

// 2b. Markdown mentah per halaman (tautan dokumen ditulis ulang agar benar).
for (const doc of catalog) {
  const target = join(outDir, `dokumen/${doc.slug}.md`);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, `${rewriteDocLinks(doc.text, doc.slug).trimEnd()}\n`);
}
console.log(`✓ ${catalog.length} markdown per halaman (dokumen/<slug>.md)`);

// 2c. sitemap.md — indeks semua halaman untuk agen (pola Nuxt).
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

// 2d. Machine layer + llms.txt (ADR-0054) — diterbitkan apa adanya.
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

// 3. Halaman 404 (GitHub Pages memakainya otomatis untuk rute tak dikenal).
const notFound = await handler(new Request("http://export.local/__tidak-ada__"));
await writeFile(join(outDir, "404.html"), await notFound.text());

// 4. Aset klien + `.nojekyll` (berkas berawalan `_` tidak diproses Jekyll).
await cp(join(appDir, "dist/client"), join(outDir, "assets"), { recursive: true });
await writeFile(join(outDir, ".nojekyll"), "");

console.log("✓ 404.html + aset + .nojekyll");
console.log(`ekspor selesai: ${relative(process.cwd(), outDir)}`);
