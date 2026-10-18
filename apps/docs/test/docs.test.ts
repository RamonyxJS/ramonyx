import assert from "node:assert/strict";
import { test } from "node:test";

import { createApp } from "../src/app.ts";
import { listDocs, readDoc } from "../src/docs.ts";
import { extractTitle, renderMarkdown } from "../src/markdown.ts";

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

test("app: index, halaman dokumen, 404, traversal, API", async () => {
  const app = createApp();

  const index = await app(new Request("http://uji/"));
  assert.equal(index.status, 200);
  assert.equal(index.headers.get("x-content-type-options"), "nosniff");
  assert.match(index.headers.get("content-security-policy") ?? "", /nonce-[0-9a-f]{32}/);
  const html = await index.text();
  assert.match(html, /Dokumentasi Ramonyx/);
  assert.match(html, /\/dokumen\/BLUEPRINT/);

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
});
