import { posix } from "node:path";

import { marked } from "marked";

/**
 * Render markdown → HTML. Konten berasal dari `docs/**` repo ini (tepercaya);
 * karena itu HTML dimasukkan apa adanya ke halaman (bukan input pengguna).
 *
 * Bila `slug` diberikan, tautan dokumen ditulis ulang agar benar dari halaman mana pun:
 * - `foo.md` relatif → `dokumen/<slug-relatif>` (dengan fragmen `#...` dipertahankan);
 * - `#frag` (anchor) → `dokumen/<slug saat ini>#frag`.
 *
 * Ditulis ulang sebagai **relatif** (bukan `/dokumen/...`) supaya menghormati
 * `<base href>` saat situs di-host di subpath (mis. GitHub Pages `/ramonyx/`) — ADR-0052.
 */
export function renderMarkdown(source: string, options: { slug?: string } = {}): string {
  const denganTautan = options.slug === undefined ? source : rewriteDocLinks(source, options.slug);
  return marked.parse(denganTautan, { async: false, gfm: true }) as string;
}

function rewriteDocLinks(markdown: string, slug: string): string {
  const baseDir = slug.includes("/") ? slug.slice(0, slug.lastIndexOf("/")) : "";

  return markdown.replace(
    /\]\(([^()\s#]*)(#[^()\s]*)?\)/g,
    (match, target: string, hash: string | undefined) => {
      // Anchor murni `#bagian` → tautan dokumen yang sama (base href mengubah perilaku anchor).
      if (target.length === 0) {
        return hash === undefined ? match : `](dokumen/${slug}${hash})`;
      }
      // Absolut / protokol / mailto dst → biarkan.
      if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith("/")) {
        return match;
      }
      if (!target.endsWith(".md")) {
        return match;
      }
      const resolved = posix.normalize(posix.join(baseDir, target));
      if (resolved.startsWith("..")) {
        return match; // keluar dari docs/ — biarkan apa adanya
      }
      return `](dokumen/${resolved.slice(0, -3)}${hash ?? ""})`;
    },
  );
}

/** Judul dokumen: heading `# ` pertama, fallback ke nama berkas. */
export function extractTitle(source: string, fallback: string): string {
  for (const line of source.split("\n")) {
    if (line.startsWith("# ")) {
      return line.slice(2).trim();
    }
  }
  return fallback;
}
