import assert from "node:assert/strict";
import { test } from "node:test";
import type { LoadedPage } from "@ramonyx/core";
import { createHandler } from "@ramonyx/server";
import { createSeoRoutes, robotsTxt, sitemapXml } from "../src/index.ts";

function page(path: string, module: LoadedPage["page"]): LoadedPage {
  return { path, page: module, layouts: [], directory: "" };
}

test("sitemapXml: URL absolut + escaping + opsi entri", () => {
  const xml = sitemapXml(
    ["/", { path: "/promo", lastmod: "2026-10-18", priority: 0.8, changefreq: "weekly" }],
    { origin: "https://contoh.dev/" },
  );
  assert.ok(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>'));
  assert.ok(xml.includes("<loc>https://contoh.dev/</loc>"));
  assert.ok(xml.includes("<loc>https://contoh.dev/promo</loc>"));
  assert.ok(xml.includes("<lastmod>2026-10-18</lastmod>"));
  assert.ok(xml.includes("<priority>0.8</priority>"));
  assert.ok(xml.includes("<changefreq>weekly</changefreq>"));
  assert.ok(xml.includes('xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"'));
});

test("robotsTxt: user-agent, allow/disallow, sitemap", () => {
  const txt = robotsTxt({
    sitemap: "https://contoh.dev/sitemap.xml",
    disallow: ["/api/", "/rahasia"],
    allow: ["/"],
  });
  assert.equal(
    txt,
    "User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /rahasia\nSitemap: https://contoh.dev/sitemap.xml\n",
  );
});

test("createSeoRoutes: rute statis + getStaticPaths, tanpa noindex/error/dinamis-tanpa-paths", async () => {
  const pages = [
    page("/", { default: () => null }),
    page("/promo", { default: () => null, metadata: { robots: "noindex" } }),
    page("/rahasia", { default: () => null, metadata: { status: 404 } }),
    page("/blog/[slug]", {
      default: () => null,
      getStaticPaths: () => [{ slug: "satu" }, { slug: "dua" }],
    }),
    page("/lain/[slug]", { default: () => null }),
  ];

  const routes = await createSeoRoutes({ pages });
  const handler = createHandler({ routes });

  const sitemap = await handler(new Request("https://contoh.dev/sitemap.xml"));
  assert.equal(sitemap.status, 200);
  assert.match(sitemap.headers.get("content-type") ?? "", /application\/xml/);
  const xml = await sitemap.text();
  assert.ok(xml.includes("<loc>https://contoh.dev/</loc>"));
  assert.ok(xml.includes("<loc>https://contoh.dev/blog/satu</loc>"));
  assert.ok(xml.includes("<loc>https://contoh.dev/blog/dua</loc>"));
  assert.ok(!xml.includes("/promo"), "noindex dikecualikan");
  assert.ok(!xml.includes("/rahasia"), "halaman error dikecualikan");
  assert.ok(!xml.includes("/lain/"), "dinamis tanpa getStaticPaths dikecualikan");

  const robots = await handler(new Request("https://contoh.dev/robots.txt"));
  assert.equal(robots.status, 200);
  const txt = await robots.text();
  assert.ok(txt.includes("User-agent: *"));
  assert.ok(txt.includes("Sitemap: https://contoh.dev/sitemap.xml"));
});
