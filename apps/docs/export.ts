// Ekspor statis situs publik (custom domain GitHub Pages) — ADR-0052/0054/0056/0082.
//
// Hanya **docs/public/** yang dipublikasikan: halaman, markdown per halaman, sitemap, llms,
// machine layer publik. `docs/internal/` tidak pernah dibaca.
//
// Domain kustom disajikan di **root** (bukan subpath `/ramonyx`). Jalankan:
// `pnpm docs:export` (default base "" → root), atau
// `node --import ./tools/register.mjs apps/docs/export.ts --cname ramonyx.devmoon.net --out <dir>`.

import { cp, mkdir, readdir, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildClient, prerenderRoutes } from "@ramonyx/bundler";
import { loadPageRoutes } from "@ramonyx/compiler";
import { sitemapXml } from "@ramonyx/ssr";
import { createApp } from "./src/app.ts";
import { loadCatalog, publicMachineDir, searchIndex } from "./src/docs.ts";
import { rewriteDocLinks } from "./src/markdown.ts";

const args = process.argv.slice(2);
const argValue = (name: string): string | undefined => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};

const appDir = fileURLToPath(new URL(".", import.meta.url));
const basePath = (argValue("--base") ?? "").replace(/\/$/, "");
const originArg = argValue("--origin");
const cnameArg = argValue("--cname");
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

// 2. Render halaman lewat prerender framework (request sintetis → handler yang sama).
const handler = await createApp({ basePath });
const catalog = await loadCatalog();
const ruteDocs = catalog.map((doc) => `docs/${doc.slug}`);
const ruteLegacy = catalog.map((doc) => `dokumen/${doc.slug}`);

/** Sisipkan tautan discovery agen ke `<head>` (ADR-0054; spec llmstxt.org). */
function withAgentLinks(html: string, routePath: string): string {
  const clean = routePath.replace(/^\//, "");
  const slug = clean.startsWith("docs/") ? clean.slice("docs/".length) : null;
  const links = [
    slug === null ? null : `<link rel="alternate" type="text/markdown" href="docs/${slug}.md" />`,
    `<link rel="describedby" href="machine/llms.txt" />`,
  ].filter((link): link is string => link !== null);
  return html.replace("</head>", `${links.join("\n")}\n</head>`);
}

const result = await prerenderRoutes({
  handler,
  pages,
  outDir,
  paths: ["", "docs", ...ruteDocs, "dokumen", ...ruteLegacy],
  notFoundPath: "/__tidak-ada__",
  clientDir: join(appDir, "dist/client"),
  nojekyll: true,
  transformHtml: withAgentLinks,
});
console.log(`✓ ${result.routes.length} halaman dirender + 404 + aset + .nojekyll`);

// 3. Markdown mentah per halaman publik (tautan dokumen ditulis ulang).
for (const doc of catalog) {
  const target = join(outDir, `docs/${doc.slug}.md`);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, `${rewriteDocLinks(doc.text, doc.slug).trimEnd()}\n`);
}
console.log(`✓ ${catalog.length} markdown per halaman (docs/<slug>.md)`);

// 3b. Indeks pencarian (Cmd+K statis) — hanya slug publik.
await mkdir(join(outDir, "api"), { recursive: true });
await writeFile(join(outDir, "api", "indeks"), `${JSON.stringify(searchIndex())}\n`);
console.log("✓ api/indeks (indeks pencarian publik)");

// 4. sitemap.md — indeks halaman untuk agen.
const sitemapLines = [
  "# Sitemap",
  "",
  "> Public documentation index (markdown).",
  "",
  "- [Ramonyx](.): landing page",
  "- [Documentation](docs/): all public pages",
  ...catalog.map((doc) => `- [${doc.title}](docs/${doc.slug}/): \`docs/${doc.slug}\``),
  "",
];
await writeFile(join(outDir, "sitemap.md"), sitemapLines.join("\n"));

// 4b. sitemap.xml + robots.txt (SEO) — hanya URL kanonis publik.
if (originArg !== undefined) {
  const paths = ["", "docs", ...ruteDocs].map((path) =>
    path === "" ? `${basePath}/` : `${basePath}/${path}`,
  );
  await writeFile(join(outDir, "sitemap.xml"), sitemapXml(paths, { origin: originArg }));
  await writeFile(
    join(outDir, "robots.txt"),
    `User-agent: *\nAllow: /\nSitemap: ${originArg}${basePath}/sitemap.xml\n`,
  );
  console.log("✓ sitemap.xml + robots.txt");
}

// 5. Machine layer publik + llms (ADR-0054/0082) — tidak ada berkas internal.
const machineDir = publicMachineDir();
const machineFiles = (await readdir(machineDir)).filter(
  (file) => file.endsWith(".json") || file.endsWith(".txt"),
);
await mkdir(join(outDir, "machine"), { recursive: true });
for (const file of machineFiles) {
  await cp(join(machineDir, file), join(outDir, "machine", file));
}
console.log(`✓ machine/ (${machineFiles.length} berkas publik, termasuk llms.txt)`);

// 6. CNAME untuk GitHub Pages (domain kustom) — ditulis ke artefak agar pengaturan
// domain tidak bergantung pada UI/aksi manual.
if (cnameArg !== undefined) {
  if (!/^[a-z0-9.-]+$/i.test(cnameArg) || cnameArg.includes("..")) {
    throw new Error(`--cname tidak valid: "${cnameArg}" (hostname tanpa skema/path)`);
  }
  await writeFile(join(outDir, "CNAME"), `${cnameArg}\n`);
  console.log(`✓ CNAME: ${cnameArg}`);
}

console.log(`ekspor selesai: ${relative(process.cwd(), outDir)}`);
