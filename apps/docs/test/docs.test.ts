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

test("markdown: frontmatter dibuang, heading ber-id, blok kode ber-nama berkas", () => {
  const rendered = renderMarkdown(
    '---\nadr: 0007\nvisibility: public\n---\n\n# Judul\n\n## Bagian\n\n```ts title="src/app.ts"\nconst x = 1;\n```\n\n| a | b |\n| - | - |\n| 1 | 2 |\n',
  );
  const html = rendered.html;
  assert.doesNotMatch(html, /visibility: public/, "frontmatter tidak dirender");
  assert.match(html, /<h1 id="judul"/);
  assert.match(html, /<h2 id="bagian"/);
  assert.ok(
    rendered.toc.some((item) => item.id === "bagian"),
    "ToC memuat h2",
  );
  assert.match(html, /class="code-file">src\/app\.ts</, "nama berkas dari metadata fence");
  assert.match(html, /data-copy/, "tombol copy ada");
  assert.match(html, /<table>/);
  assert.equal(extractTitle("# Halo\nisi", "fallback"), "Halo");
  assert.equal(extractTitle("---\nx: 1\n---\n\n# Judul\n", "fallback"), "Judul");
});

test("katalog publik: hanya docs/public; slug internal tidak ada", () => {
  const entries = listDocs();
  assert.ok(entries.length >= 10, `jumlah dokumen publik: ${entries.length}`);
  assert.ok(entries.some((entry) => entry.slug === "getting-started"));
  assert.ok(!entries.some((entry) => entry.slug.startsWith("adr/")), "ADR bukan halaman docs");
  assert.ok(
    !entries.some((entry) => entry.slug.startsWith("engineering/")),
    "engineering bukan docs",
  );
  assert.ok(
    entries.every((entry) => entry.title.length > 0),
    "semua berjudul",
  );

  // Dokumen internal tidak boleh terdaftar/terbaca.
  for (const internal of [
    "BLUEPRINT",
    "PRD",
    "IMPLEMENTATION_STATUS",
    "architecture",
    "tutorial",
    "security/threat-model",
  ]) {
    assert.equal(readDoc(internal), null, `internal tidak terbaca: ${internal}`);
  }
  assert.equal(readDoc("../package"), null, "traversal ditolak");
  assert.equal(readDoc("../../etc/passwd"), null, "traversal ditolak");

  assert.equal(readDoc("engineering/adr/0007-hydration"), null, "engineering tidak terbaca situs");
  assert.equal(readDoc("engineering/frontend-stack"), null, "engineering tidak terbaca situs");

  const doc = readDoc("ssr-hydration");
  assert.ok(doc);
  assert.match(doc.markdown, /Hydration/);
});

test("pencarian katalog: judul diprioritaskan, excerpt isi, limit", () => {
  setCatalog([
    {
      slug: "a/pertama",
      title: "Panduan Alpha",
      html: "",
      text: "isi tentang topik khusus",
      toc: [],
    },
    {
      slug: "b/kedua",
      title: "Panduan Beta",
      html: "",
      text: "panduan alpha juga ada di isi",
      toc: [],
    },
    { slug: "c/ketiga", title: "Lain", html: "", text: "tidak ada", toc: [] },
  ]);

  const hasil = searchCatalog("alpha", 10);
  assert.equal(hasil[0]?.slug, "a/pertama", "judul diprioritaskan");
  assert.equal(hasil[1]?.slug, "b/kedua", "cocok isi ikut");
  assert.ok(hasil[1]?.excerpt.toLowerCase().includes("alpha"), "excerpt memuat kata kunci");
  assert.equal(searchCatalog("tidak-ada-kata", 10).length, 0);
  assert.equal(searchCatalog("alpha", 1).length, 1, "limit dihormati");
});

test("app publik: landing, docs, legacy alias, machine publik, pencarian, 404", async () => {
  const app = await createApp();

  // Landing (English, angka dari machine layer publik).
  const landing = await app(new Request("http://uji/"));
  assert.equal(landing.status, 200);
  assert.equal(landing.headers.get("x-content-type-options"), "nosniff");
  assert.match(landing.headers.get("content-security-policy") ?? "", /nonce-[0-9a-f]{32}/);
  const html = await landing.text();
  assert.match(html, /<html lang="en">/);
  assert.match(html, /Full-stack TypeScript/);
  assert.match(html, /Secure by default/);
  assert.match(html, /id="ramonyx-payload"/, "payload hydration ada");

  // Halaman docs publik.
  const page = await app(new Request("http://uji/docs/getting-started"));
  assert.equal(page.status, 200);
  const pageHtml = await page.text();
  assert.match(pageHtml, /Getting Started/);
  assert.match(pageHtml, /<article class="dokumen"/);
  assert.match(pageHtml, /Edit this page on GitHub/);

  // Alias lama tetap melayani dokumen publik.
  const legacy = await app(new Request("http://uji/dokumen/getting-started"));
  assert.equal(legacy.status, 200);

  // Dokumen internal → 404 (tidak ada halaman, bukan konten).
  const internal = await app(new Request("http://uji/docs/security/threat-model"));
  assert.equal(internal.status, 404);
  const prd = await app(new Request("http://uji/docs/PRD"));
  assert.equal(prd.status, 404);
  // Catatan rekayasa (ADR/engineering) tidak dirender sebagai dokumentasi pengguna.
  assert.equal((await app(new Request("http://uji/docs/adr/0007-hydration"))).status, 404);
  assert.equal((await app(new Request("http://uji/docs/engineering/frontend-stack"))).status, 404);

  // Machine layer: publik dilayani, internal tidak.
  const features = await app(new Request("http://uji/machine/features.json"));
  assert.equal(features.status, 200);
  assert.equal(features.headers.get("content-type"), "application/json; charset=utf-8");
  const stats = await app(new Request("http://uji/machine/stats.json"));
  assert.equal(stats.status, 200);
  const security = await app(new Request("http://uji/machine/security.json"));
  assert.equal(security.status, 404, "security.json internal tidak disajikan");
  const llms = await app(new Request("http://uji/machine/llms.txt"));
  assert.equal(llms.status, 200);

  // Indeks pencarian publik + pencarian isi.
  const indeks = await app(new Request("http://uji/api/indeks"));
  assert.equal(indeks.status, 200);
  const data = (await indeks.json()) as Array<{ slug: string }>;
  assert.ok(data.some((entry) => entry.slug === "getting-started"));
  assert.ok(!data.some((entry) => entry.slug.includes("threat-model")), "slug internal tidak ada");
  assert.ok(!data.some((entry) => entry.slug.startsWith("adr/")), "ADR tidak di indeks pencarian");

  const cari = await app(new Request("http://uji/api/cari?q=hydration"));
  assert.equal(cari.status, 200);
  const hasil = (await cari.json()) as { hasil: { slug: string }[] };
  assert.ok(hasil.hasil.some((hit) => hit.slug === "ssr-hydration"));

  for (const query of ["threat-model", "IMPLEMENTATION_STATUS", "asvs-mapping"]) {
    const kosong = await app(new Request(`http://uji/api/cari?q=${query}`));
    assert.deepEqual(
      ((await kosong.json()) as { hasil: unknown[] }).hasil,
      [],
      `pencarian internal tidak menghasilkan: ${query}`,
    );
  }

  const tanpaQ = await app(new Request("http://uji/api/cari"));
  assert.equal(tanpaQ.status, 400, "q wajib");
});

test("build klien: bundel hydrate + soft navigation disajikan sebagai aset", async () => {
  rmSync(join(appDir, "dist"), { recursive: true, force: true });

  const devtoolsCli = join(appDir, "..", "..", "packages", "devtools", "src", "cli.ts");
  const output = execFileSync(
    process.execPath,
    ["--import", loader, devtoolsCli, "build", "--app", appDir],
    {
      cwd: appDir,
      encoding: "utf8",
      env: { ...process.env, NODE_ENV: "production" },
    },
  );
  assert.match(output, /client bundle/);

  const manifest = JSON.parse(
    readFileSync(join(appDir, "dist", "client", "ramonyx.assets.json"), "utf8"),
  ) as { client: string };
  assert.match(manifest.client, /^client-.*\.js$/, "nama bundle ber-hash (ADR-0055)");

  const bundlePath = join(appDir, "dist", "client", manifest.client);
  assert.ok(existsSync(bundlePath), "bundle ter-build");
  const bundle = readFileSync(bundlePath, "utf8");
  assert.match(bundle, /hydrate/, "bundel memuat hydration");
  assert.doesNotMatch(
    bundle,
    /threat-model|IMPLEMENTATION_STATUS|PRD\.md/,
    "bundle bebas konten internal",
  );

  const app = await createApp();
  const aset = await app(new Request(`http://uji/assets/${manifest.client}`));
  assert.equal(aset.status, 200);
  assert.equal(aset.headers.get("content-type"), "text/javascript; charset=utf-8");
  assert.equal(aset.headers.get("cache-control"), "public, max-age=31536000, immutable");
  const traversal = await app(new Request("http://uji/assets/..%2F..%2Fpackage.json"));
  assert.equal(traversal.status, 404, "traversal aset ditolak");
});

test("markdown: tautan .md relatif ditulis ulang ke /docs (relatif terhadap base)", () => {
  const rendered = renderMarkdown(
    "[a](routing.md) [b](security/overview.md#decision) [c](#bagian) " +
      "[d](https://x.example/y.md) [e](/absolut.md) [f](../luar/..md)",
    { slug: "getting-started" },
  );
  const html = rendered.html;
  assert.ok(html.includes('href="docs/routing"'), "tautan .md relatif → docs/");
  assert.ok(html.includes('href="docs/security/overview#decision"'), "fragmen ikut");
  assert.ok(
    html.includes('href="docs/getting-started#bagian"'),
    "anchor murni → halaman yang sama",
  );
  assert.ok(html.includes('href="https://x.example/y.md"'), "tautan absolut dibiarkan");
  assert.ok(html.includes('href="/absolut.md"'), "path absolut dibiarkan");
});

test("export statis: halaman publik + artefak agen + nol konten internal", async () => {
  const out = join(appDir, "dist", "static-test");
  rmSync(out, { recursive: true, force: true });

  const output = execFileSync(
    process.execPath,
    [
      "--import",
      loader,
      "export.ts",
      "--base",
      "/ramonyx",
      "--origin",
      "https://docs.example",
      "--out",
      out,
    ],
    {
      cwd: appDir,
      encoding: "utf8",
      timeout: 300_000,
      env: { ...process.env, NODE_ENV: "production" },
    },
  );
  assert.match(output, /halaman dirender/);
  assert.match(output, /ekspor selesai/);

  const index = readFileSync(join(out, "index.html"), "utf8");
  assert.ok(index.includes('<base href="/ramonyx/" />'), "base href subpath");
  assert.ok(index.includes("Full-stack TypeScript"), "landing diekspor");

  const doc = readFileSync(join(out, "docs", "getting-started", "index.html"), "utf8");
  assert.ok(doc.includes('href="docs/'), "tautan dokumen relatif");
  assert.ok(
    doc.includes('<link rel="alternate" type="text/markdown" href="docs/getting-started.md" />'),
    "link markdown per halaman",
  );

  // Artefak agen publik.
  assert.ok(existsSync(join(out, "machine", "llms.txt")), "machine/llms.txt diekspor");
  assert.ok(existsSync(join(out, "machine", "llms-full.txt")), "machine/llms-full.txt diekspor");
  assert.ok(existsSync(join(out, "machine", "features.json")), "features.json diekspor");
  assert.ok(existsSync(join(out, "api", "indeks")), "indeks pencarian diekspor");
  assert.ok(existsSync(join(out, "sitemap.md")), "sitemap.md diekspor");
  assert.ok(existsSync(join(out, "docs", "getting-started.md")), "markdown per halaman");
  assert.ok(existsSync(join(out, "404.html")), "404.html diekspor");
  assert.ok(existsSync(join(out, ".nojekyll")), ".nojekyll ditulis");

  // Tidak ada artefak internal di ekspor.
  assert.ok(!existsSync(join(out, "machine", "security.json")), "security.json tidak diekspor");
  assert.ok(!existsSync(join(out, "machine", "todo.json")), "todo.json tidak diekspor");
  assert.ok(!existsSync(join(out, "docs", "PRD", "index.html")), "PRD tidak diekspor");
  assert.ok(!existsSync(join(out, "docs", "adr")), "ADR tidak diekspor sebagai dokumentasi");
  const semuaHtml = readdirSync(out, { recursive: true })
    .filter((file): file is string => typeof file === "string" && file.endsWith(".html"))
    .map((file) => readFileSync(join(out, file), "utf8"))
    .join("\n");
  for (const penanda of [
    "IMPLEMENTATION_STATUS",
    "PLAN-docs",
    "threat-model",
    "asvs-mapping",
    "plugin-isolation-assessment",
  ]) {
    assert.ok(!semuaHtml.includes(penanda), `penanda internal tidak ada di HTML: ${penanda}`);
  }

  // sitemap.xml hanya URL kanonis publik.
  const sitemap = readFileSync(join(out, "sitemap.xml"), "utf8");
  assert.ok(sitemap.includes("<loc>https://docs.example/ramonyx/</loc>"));
  assert.ok(sitemap.includes("<loc>https://docs.example/ramonyx/docs/getting-started</loc>"));
  assert.ok(!sitemap.includes("/dokumen/"), "alias legacy tidak di sitemap");
  assert.ok(existsSync(join(out, "robots.txt")), "robots.txt diekspor");

  rmSync(out, { recursive: true, force: true });
});
