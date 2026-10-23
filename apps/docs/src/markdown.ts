// Render markdown publik → HTML + ToC. Konten berasal dari `docs/public/**` (tepercaya).
// - Frontmatter YAML dibuang (tidak dirender).
// - Tautan `.md` ditulis ulang menjadi URL docs relatif terhadap `<base href>`.
// - Heading mendapat id + masuk ToC.
// - Code fence: bahasa + `title="..."`/`file="..."` → blok dengan nama berkas + tombol copy.
import { posix } from "node:path";
import { marked, type Tokens } from "marked";

import { highlightCode } from "./highlight.ts";

export interface TocItem {
  readonly id: string;
  readonly text: string;
  readonly depth: number;
}

export interface RenderedDoc {
  readonly html: string;
  readonly toc: readonly TocItem[];
}

const DOC_BASE = "docs/";

/** Buang frontmatter YAML (`--- ... ---`) di awal berkas. */
export function stripFrontmatter(source: string): string {
  return source.replace(/^---\n[\s\S]*?\n---\n+/, "");
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/&[a-z]+;/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 80);
}

function plainText(html: string): string {
  return html
    .replace(/<[^>]+>/g, "")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .trim();
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/**
 * Tulis ulang tautan dokumen relatif agar benar dari halaman mana pun. URL hasil bersifat
 * relatif terhadap `<base href>` (mis. `/ramonyx/`) — lihat ADR-0052.
 */
export function rewriteDocLinks(markdown: string, slug: string, baseDir?: string): string {
  const sourceDir = baseDir ?? (slug.includes("/") ? slug.slice(0, slug.lastIndexOf("/")) : "");
  return markdown.replace(
    /\]\(([^()\s#]*)(#[^()\s]*)?\)/g,
    (match, target: string, hash: string | undefined) => {
      if (target.length === 0) {
        return hash === undefined ? match : `](${DOC_BASE}${slug}${hash})`;
      }
      if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith("/")) {
        return match;
      }
      if (!target.endsWith(".md")) {
        return match;
      }
      const resolved = posix.normalize(posix.join(sourceDir, target));
      if (resolved.startsWith("..")) {
        return match;
      }
      const tanpaExt = resolved.slice(0, -3).replace(/\/index$/, "");
      return `](${DOC_BASE}${tanpaExt === "README" ? "" : tanpaExt}${hash ?? ""})`;
    },
  );
}

/** Judul dokumen (H1 pertama), fallback slug. */
export function extractTitle(source: string, fallback: string): string {
  for (const line of stripFrontmatter(source).split("\n")) {
    if (line.startsWith("# ")) {
      return line.slice(2).trim();
    }
  }
  return fallback;
}

export function renderMarkdown(
  source: string,
  options: { slug?: string; baseDir?: string } = {},
): RenderedDoc {
  const tanpaFrontmatter = stripFrontmatter(source);
  const denganTautan =
    options.slug === undefined
      ? tanpaFrontmatter
      : rewriteDocLinks(tanpaFrontmatter, options.slug, options.baseDir);

  const toc: TocItem[] = [];
  const dipakai = new Set<string>();
  const halaman = options.slug === undefined ? "" : `${DOC_BASE}${options.slug}`;

  const renderer = new marked.Renderer();
  renderer.heading = function ({ tokens, depth }: Tokens.Heading) {
    const html = this.parser.parseInline(tokens);
    const text = plainText(html);
    let id = slugify(text) || "bagian";
    let unik = id;
    let index = 2;
    while (dipakai.has(unik)) {
      unik = `${id}-${index}`;
      index += 1;
    }
    id = unik;
    dipakai.add(id);
    if (depth === 2 || depth === 3) {
      toc.push({ id, text, depth });
    }
    return `<h${depth} id="${id}"><a class="jangkar" href="${halaman}#${id}" aria-hidden="true" tabindex="-1">#</a>${html}</h${depth}>`;
  };

  renderer.code = ({ text, lang }: Tokens.Code) => {
    const info = (lang ?? "").trim();
    const bagian = info.split(/\s+/).filter((entry) => entry.length > 0);
    const bahasa = bagian[0] ?? "text";
    const judul = /(?:title|file)="([^"]+)"/.exec(info)?.[1];

    const kataLang = escapeHtml(bahasa);
    const namaBerkas =
      judul === undefined
        ? `<span class="code-lang">${kataLang}</span>`
        : `<span class="code-file">${escapeHtml(judul)}</span><span class="code-lang">${kataLang}</span>`;
    const disorot = highlightCode(text, bahasa);
    const isi =
      disorot === null
        ? `<pre class="shiki" tabindex="0"><code>${escapeHtml(text)}</code></pre>`
        : disorot.replace("<pre", '<pre tabindex="0"');
    return [
      `<figure class="code" data-lang="${kataLang}">`,
      `<figcaption class="code-head">${namaBerkas}<button class="copy" type="button" data-copy aria-label="Copy code">Copy</button></figcaption>`,
      `<div class="code-body">${isi}</div>`,
      `</figure>`,
    ].join("");
  };

  const html = marked.parse(denganTautan, {
    async: false,
    gfm: true,
    renderer,
  }) as string;

  return { html, toc };
}
