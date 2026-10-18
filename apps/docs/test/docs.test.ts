import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { createApp } from "../src/app.ts";
import { searchCatalog, setCatalog } from "../src/catalog.ts";
import { listDocs, readDoc } from "../src/docs.ts";
import { extractTitle, renderMarkdown } from "../src/markdown.ts";

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const loader = join(appDir, "..", "..", "tools", "register.mjs");

test("markdown: heading, blok kode, tabel, judul", () => {
  const html = renderMarkdown(
    "# Judul\n\n```ts\nconst x = 1;\n```\n\n| a | b |\n| - | - |\n| 1 | 2 |\n",
  );
  assert.match(html, /<h1[^>]*>Judul<\/h1>/);
  assert.match(html, /<pre><code[^>]*>/);
  assert.match(html, /<table>/);
  assert.equal(extractTitle("# Halo\nisi", "fallback"), "Halo");
  assert.equal(extractTitle("tanpa heading", "fallback"), "fallback");
});

test("katalog: slug, judul, dan guard traversal", () => {
  const entries = listDocs();
  assert.ok(entries.length >= 20, `jumlah dokumen: ${entries.length}`);
  const blueprint = entries.find((entry) => entry.slug === "BLUEPRINT");
  assert.ok(blueprint, "BLUEPRINT terdaftar");
  assert.ok(blueprint.title.length > 0, "judul BLUEPRINT terisi");
  assert.ok(
    entries.some((entry) => entry.slug === "adr/0040-plugin-process-isolation"),
    "ADR-0040 terdaftar",
  );

  assert.equal(readDoc("../package"), null, "traversal ditolak");
  assert.equal(readDoc("../../etc/passwd"), null, "traversal ditolak");
  const doc = readDoc("adr/0029-commonjs-interop");
  assert.ok(doc, "ADR-0029 terbaca");
  assert.match(doc.markdown, /Interop CommonJS/);
});

test("pencarian katalog: judul diprioritaskan, excerpt isi, limit", () => {
  setCatalog([
    { slug: "a/pertama", title: "Panduan Alpha", html: "", text: "isi tentang topik khusus" },
    { slug: "b/kedua", title: "Panduan Beta", html: "", text: "panduan alpha juga ada di isi" },
    { slug: "c/ketiga", title: "Lain", html: "", text: "tidak ada" },
  ]);

  const hasil = searchCatalog("alpha", 10);
  assert.equal(hasil[0]?.slug, "a/pertama", "judul diprioritaskan");
  assert.equal(hasil[1]?.slug, "b/kedua", "cocok isi ikut");
  assert.ok(hasil[1]?.excerpt.toLowerCase().includes("alpha"), "excerpt memuat kata kunci");
  assert.equal(searchCatalog("tidak-ada-kata", 10).length, 0);
  assert.equal(searchCatalog("alpha", 1).length, 1, "limit dihormati");
});

test("app: index, halaman dokumen, hydration, 404, traversal, API", async () => {
  const app = await createApp();

  const index = await app(new Request("http://uji/"));
  assert.equal(index.status, 200);
  assert.equal(index.headers.get("x-content-type-options"), "nosniff");
  assert.match(index.headers.get("content-security-policy") ?? "", /nonce-[0-9a-f]{32}/);
  const html = await index.text();
  assert.match(html, /Dokumentasi Ramonyx/);
  assert.match(html, /dokumen\/BLUEPRINT/);
  assert.match(html, /id="ramonyx-payload"/, "payload hydration ada");
  // Nama bundle bisa ber-hash (manifest build) atau fallback tanpa build (ADR-0055).
  assert.match(html, /src="\/assets\/client[^"]*\.js"/, "script klien ada");
  assert.match(html, /window\.__RAMONYX__/, "payload di-inline");
  assert.match(html, /aria-label="Cari dokumen"/, "kotak pencarian ada");

  const page = await app(new Request("http://uji/dokumen/adr/0029-commonjs-interop"));
  assert.equal(page.status, 200);
  const pageHtml = await page.text();
  assert.match(pageHtml, /Interop CommonJS/);
  assert.match(pageHtml, /<h1/);

  const hilang = await app(new Request("http://uji/dokumen/tidak-ada"));
  assert.equal(hilang.status, 404);

  const traversal = await app(new Request("http://uji/dokumen/..%2Fpackage"));
  assert.equal(traversal.status, 404, "traversal lewat URL ditolak");

  const api = await app(new Request("http://uji/api/dokumen"));
  assert.equal(api.status, 200);
  const data = (await api.json()) as { dokumen: { slug: string; title: string }[] };
  assert.ok(data.dokumen.length >= 20);
  assert.ok(data.dokumen.every((entry) => entry.slug.length > 0 && entry.title.length > 0));

  // Pencarian isi: `GET /api/cari?q=...`.
  const cari = await app(new Request("http://uji/api/cari?q=interop"));
  assert.equal(cari.status, 200);
  const hasil = (await cari.json()) as { hasil: { slug: string; excerpt: string }[] };
  assert.ok(
    hasil.hasil.some((hit) => hit.slug === "adr/0029-commonjs-interop"),
    "ADR-0029 ditemukan lewat pencarian",
  );

  const isi = await app(new Request("http://uji/api/cari?q=kredensial"));
  const hasilIsi = (await isi.json()) as { hasil: { excerpt: string }[] };
  assert.ok(hasilIsi.hasil.length >= 1, "cocok isi ditemukan");
  assert.match(hasilIsi.hasil[0]?.excerpt.toLowerCase() ?? "", /kredensial/);

  const kosong = await app(new Request("http://uji/api/cari?q=zzz-tidak-ada"));
  assert.deepEqual(((await kosong.json()) as { hasil: unknown[] }).hasil, []);

  const tanpaQ = await app(new Request("http://uji/api/cari"));
  assert.equal(tanpaQ.status, 400, "q wajib");

  const pendek = await app(new Request("http://uji/api/cari?q=a"));
  assert.equal(pendek.status, 400, "q minimal 2 karakter");
});

test("build klien: bundel hydrate + soft navigation disajikan sebagai aset", async () => {
  rmSync(join(appDir, "dist"), { recursive: true, force: true });

  const output = execFileSync(process.execPath, ["--import", loader, "build.ts"], {
    cwd: appDir,
    encoding: "utf8",
    env: { ...process.env, NODE_ENV: "production" },
  });
  assert.match(output, /client bundle/);

  const manifest = JSON.parse(
    readFileSync(join(appDir, "dist", "client", "ramonyx.assets.json"), "utf8"),
  ) as { client: string };
  assert.match(manifest.client, /^client-.*\.js$/, "nama bundle ber-hash (ADR-0055)");

  const bundlePath = join(appDir, "dist", "client", manifest.client);
  assert.ok(existsSync(bundlePath), "bundle ter-build");
  const bundle = readFileSync(bundlePath, "utf8");
  assert.match(bundle, /hydrate/, "bundel memuat hydration");
  assert.match(bundle, /enableClientNavigation|popstate/, "bundel memuat soft navigation");

  // Source map produksi (ADR-0046).
  const peta = JSON.parse(readFileSync(`${bundlePath}.map`, "utf8")) as {
    sourcesContent?: string[];
  };
  assert.ok((peta.sourcesContent?.length ?? 0) > 0, "source map memuat sourcesContent");

  const app = await createApp();
  const aset = await app(new Request(`http://uji/assets/${manifest.client}`));
  assert.equal(aset.status, 200);
  assert.equal(aset.headers.get("content-type"), "text/javascript; charset=utf-8");
  assert.equal(
    aset.headers.get("cache-control"),
    "public, max-age=31536000, immutable",
    "aset ber-fingerprint di-cache immutable (ADR-0055)",
  );

  const etag = aset.headers.get("etag");
  assert.ok(etag !== null, "ETag ada");
  const notModified = await app(
    new Request(`http://uji/assets/${manifest.client}`, {
      headers: { "if-none-match": etag },
    }),
  );
  assert.equal(notModified.status, 304, "revalidasi ETag → 304");

  const traversal = await app(new Request("http://uji/assets/..%2F..%2Fpackage.json"));
  assert.equal(traversal.status, 404, "traversal aset ditolak");
});

test("markdown: tautan .md relatif & anchor ditulis ulang ke rute dokumen", () => {
  const html = renderMarkdown(
    "[a](../BLUEPRINT.md) [b](0051-plugin-sandbox-landlock.md#isi) [c](#bagian) " +
      "[d](https://x.example/y.md) [e](/absolut.md) [f](../luar/..md)",
    { slug: "adr/README" },
  );
  assert.ok(html.includes('href="dokumen/BLUEPRINT"'), "relatif naik satu tingkat");
  assert.ok(html.includes('href="dokumen/adr/0051-plugin-sandbox-landlock#isi"'), "fragmen ikut");
  assert.ok(html.includes('href="dokumen/adr/README#bagian"'), "anchor murni → dokumen yang sama");
  assert.ok(html.includes('href="https://x.example/y.md"'), "tautan absolut dibiarkan");
  assert.ok(html.includes('href="/absolut.md"'), "path absolut dibiarkan");
});

test("export statis: halaman + tautan relatif + aset + 404 (base subpath)", async () => {
  const out = join(appDir, "dist", "static-test");
  rmSync(out, { recursive: true, force: true });

  const output = execFileSync(
    process.execPath,
    ["--import", loader, "export.ts", "--base", "/ramonyx", "--out", out],
    {
      cwd: appDir,
      encoding: "utf8",
      timeout: 240_000,
      env: { ...process.env, NODE_ENV: "production" },
    },
  );
  assert.match(output, /halaman dirender/);
  assert.match(output, /ekspor selesai/);

  const index = readFileSync(join(out, "index.html"), "utf8");
  assert.ok(index.includes('<base href="/ramonyx/" />'), "base href subpath");
  assert.ok(index.includes('href="dokumen/'), "tautan dokumen relatif");
  assert.ok(index.includes("window.__RAMONYX__"), "payload hydration ada");

  // Bundle ber-hash + prefix subpath (ADR-0055) + link discovery agen (ADR-0054).
  const asetKlien = readdirSync(join(out, "assets")).find((file) => /^client-.*\.js$/.test(file));
  assert.ok(asetKlien !== undefined, "aset klien ber-hash disalin");
  assert.ok(
    index.includes(`src="/ramonyx/assets/${asetKlien}"`),
    "script klien ber-prefix + ber-hash",
  );
  assert.ok(
    index.includes('<link rel="describedby" href="llms.txt" />'),
    "link llms.txt ada di index",
  );
  const architectureHtml = readFileSync(join(out, "dokumen", "architecture", "index.html"), "utf8");
  assert.ok(
    architectureHtml.includes(
      '<link rel="alternate" type="text/markdown" href="dokumen/architecture.md" />',
    ),
    "link markdown per halaman ada di halaman dokumen",
  );

  // Artefak agen (ADR-0054).
  assert.ok(existsSync(join(out, "llms.txt")), "llms.txt diekspor");
  assert.ok(existsSync(join(out, "llms-full.txt")), "llms-full.txt diekspor");
  assert.ok(existsSync(join(out, "sitemap.md")), "sitemap.md diekspor");
  assert.ok(existsSync(join(out, "machine", "features.json")), "machine layer diekspor");
  assert.ok(existsSync(join(out, "machine", "todo.json")), "todo.json diekspor");
  assert.ok(existsSync(join(out, "dokumen", "architecture.md")), "markdown per halaman diekspor");

  const adrReadme = readFileSync(join(out, "dokumen", "adr", "README", "index.html"), "utf8");
  assert.ok(
    adrReadme.includes('href="dokumen/adr/0051-plugin-sandbox-landlock"'),
    "tautan .md ditulis ulang ke rute dokumen",
  );

  assert.ok(existsSync(join(out, "404.html")), "404.html diekspor");
  assert.ok(existsSync(join(out, ".nojekyll")), ".nojekyll ditulis");

  rmSync(out, { recursive: true, force: true });
});
