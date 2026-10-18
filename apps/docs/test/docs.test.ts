import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
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
  assert.match(html, /\/dokumen\/BLUEPRINT/);
  assert.match(html, /id="ramonyx-payload"/, "payload hydration ada");
  assert.match(html, /window\.__RAMONYX__/, "payload di-inline");
  assert.match(html, /src="\/assets\/client\.js"/, "script klien ada");
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
  });
  assert.match(output, /client bundle/);

  const bundlePath = join(appDir, "dist", "client", "client.js");
  assert.ok(existsSync(bundlePath), "client.js ter-build");
  const bundle = readFileSync(bundlePath, "utf8");
  assert.match(bundle, /hydrate/, "bundel memuat hydration");
  assert.match(bundle, /enableClientNavigation|popstate/, "bundel memuat soft navigation");

  const app = await createApp();
  const aset = await app(new Request("http://uji/assets/client.js"));
  assert.equal(aset.status, 200);
  assert.equal(aset.headers.get("content-type"), "text/javascript; charset=utf-8");

  const traversal = await app(new Request("http://uji/assets/..%2F..%2Fpackage.json"));
  assert.equal(traversal.status, 404, "traversal aset ditolak");
});
