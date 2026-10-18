// Ekspor statis situs dokumentasi (hosting GitHub Pages) — ADR-0052.
//
// Merender **semua** halaman (indeks + setiap dokumen) lewat handler SSR yang sama dengan
// server (dogfood penuh), menulis HTML per rute + aset klien + halaman 404. Tautan relatif
// + `<base href>` membuat hasilnya benar di subpath (`/ramonyx/`) maupun di root.
//
// Jalankan: `pnpm docs:export` (default base "" → root) atau
// `node --import ./tools/register.mjs apps/docs/export.ts --base /ramonyx --out <dir>`.

import { cp, mkdir, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildClient } from "@ramonyx/bundler";
import { loadPageRoutes } from "@ramonyx/compiler";
import { createApp } from "./src/app.ts";
import { loadCatalog } from "./src/docs.ts";

const args = process.argv.slice(2);
const argValue = (name: string): string | undefined => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};

const appDir = fileURLToPath(new URL(".", import.meta.url));
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

for (const route of routes) {
  const response = await handler(new Request(`http://export.local/${route}`));
  const tipe = response.headers.get("content-type") ?? "";
  if (response.status !== 200 || !tipe.includes("text/html")) {
    throw new Error(`ekspor ${route === "" ? "/" : route}: status ${response.status}`);
  }
  const target = route === "" ? join(outDir, "index.html") : join(outDir, route, "index.html");
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, await response.text());
}
console.log(`✓ ${routes.length} halaman dirender`);

// 3. Halaman 404 (GitHub Pages memakainya otomatis untuk rute tak dikenal).
const notFound = await handler(new Request("http://export.local/__tidak-ada__"));
await writeFile(join(outDir, "404.html"), await notFound.text());

// 4. Aset klien + `.nojekyll` (berkas berawalan `_` tidak diproses Jekyll).
await cp(join(appDir, "dist/client"), join(outDir, "assets"), { recursive: true });
await writeFile(join(outDir, ".nojekyll"), "");

console.log("✓ 404.html + aset + .nojekyll");
console.log(`ekspor selesai: ${relative(process.cwd(), outDir)}`);
