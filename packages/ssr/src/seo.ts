// SEO helpers (ADR-0059): `sitemap.xml` + `robots.txt` dari manifest rute — tanpa konfigurasi
// origin (URL absolut dibangun dari request), dan halaman `noindex`/error otomatis dikecualikan.

import { fillRouteParams, type LoadedPage, type RouteEntry, route } from "@ramonyx/core";
import { escapeHtml } from "./document.ts";

export interface SitemapEntry {
  readonly path: string;
  readonly lastmod?: string;
  readonly changefreq?: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
  readonly priority?: number;
}

/** Bangun `sitemap.xml` dari daftar path/entri (URL absolut memakai `origin`). */
export function sitemapXml(
  entries: readonly (string | SitemapEntry)[],
  options: { origin: string },
): string {
  const origin = options.origin.replace(/\/$/, "");
  const urls = entries.map((entry) => {
    const item: SitemapEntry = typeof entry === "string" ? { path: entry } : entry;
    const loc = `${origin}${item.path.startsWith("/") ? "" : "/"}${item.path}`;
    const parts = [`    <loc>${escapeHtml(loc)}</loc>`];
    if (item.lastmod !== undefined) {
      parts.push(`    <lastmod>${escapeHtml(item.lastmod)}</lastmod>`);
    }
    if (item.changefreq !== undefined) {
      parts.push(`    <changefreq>${item.changefreq}</changefreq>`);
    }
    if (item.priority !== undefined) {
      parts.push(`    <priority>${item.priority.toFixed(1)}</priority>`);
    }
    return `  <url>\n${parts.join("\n")}\n  </url>`;
  });
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls,
    "</urlset>",
    "",
  ].join("\n");
}

export interface RobotsOptions {
  readonly sitemap?: string;
  readonly allow?: readonly string[];
  readonly disallow?: readonly string[];
  readonly userAgent?: string;
}

/** Bangun `robots.txt`. */
export function robotsTxt(options: RobotsOptions = {}): string {
  const lines = [`User-agent: ${options.userAgent ?? "*"}`];
  for (const path of options.allow ?? []) {
    lines.push(`Allow: ${path}`);
  }
  for (const path of options.disallow ?? []) {
    lines.push(`Disallow: ${path}`);
  }
  if (options.sitemap !== undefined) {
    lines.push(`Sitemap: ${options.sitemap}`);
  }
  return `${lines.join("\n")}\n`;
}

export interface CreateSeoRoutesOptions {
  readonly pages: readonly LoadedPage[];
  /** Path tambahan (mis. halaman dari sumber lain). */
  readonly extraPaths?: readonly string[];
  readonly robots?: { readonly allow?: readonly string[]; readonly disallow?: readonly string[] };
}

/**
 * Route `GET /sitemap.xml` + `GET /robots.txt` dari manifest halaman.
 *
 * - Rute statis ikut; rute dinamis dienumerasi lewat `getStaticPaths`.
 * - Halaman `metadata.robots === "noindex"` dan halaman error (status ≥ 400) dikecualikan.
 * - Origin dibaca dari request (URL absolut benar di domain apa pun).
 */
export async function createSeoRoutes(options: CreateSeoRoutesOptions): Promise<RouteEntry[]> {
  const paths = new Set<string>(options.extraPaths ?? []);

  for (const page of options.pages) {
    const metadata = page.page.metadata;
    if (metadata?.robots === "noindex") {
      continue;
    }
    if (metadata?.status !== undefined && metadata.status >= 400) {
      continue;
    }
    if (!page.path.includes("[")) {
      paths.add(page.path);
      continue;
    }
    const enumerate = page.page.getStaticPaths;
    if (enumerate === undefined) {
      continue;
    }
    for (const params of await enumerate()) {
      const filled = fillRouteParams(page.path, params);
      if (filled !== null) {
        paths.add(filled);
      }
    }
  }

  const sitemapPaths = [...paths].sort();
  const sitemapRoute = route({
    handler: (context) => {
      const origin = new URL(context.request.url).origin;
      return new Response(sitemapXml(sitemapPaths, { origin }), {
        headers: { "content-type": "application/xml; charset=utf-8" },
      });
    },
  });
  const robotsRoute = route({
    handler: (context) => {
      const origin = new URL(context.request.url).origin;
      return new Response(
        robotsTxt({
          sitemap: `${origin}/sitemap.xml`,
          allow: options.robots?.allow,
          disallow: options.robots?.disallow,
        }),
        { headers: { "content-type": "text/plain; charset=utf-8" } },
      );
    },
  });

  return [
    { method: "GET", path: "/sitemap.xml", definition: sitemapRoute },
    { method: "GET", path: "/robots.txt", definition: robotsRoute },
  ];
}
