// Syntax highlighting (Shiki) — **server-only**; tidak pernah masuk bundle klien.
// Dual theme: CSS variables (`--shiki-light`/`--shiki-dark`) dipilih lewat `data-theme`.
import { createHighlighter, type Highlighter } from "shiki";

const LANGS = [
  "ts",
  "tsx",
  "js",
  "jsx",
  "json",
  "bash",
  "shell",
  "html",
  "css",
  "md",
  "yaml",
  "diff",
  "text",
] as const;

let highlighter: Highlighter | null = null;
let inisialisasi: Promise<void> | null = null;

/** Inisialisasi sekali (dipanggil `loadCatalog` saat server/ekspor mulai). */
export async function initHighlighter(): Promise<void> {
  if (highlighter !== null) {
    return;
  }
  inisialisasi ??= (async () => {
    highlighter = await createHighlighter({
      themes: ["github-dark-high-contrast", "github-light-high-contrast"],
      langs: [...LANGS],
    });
  })();
  await inisialisasi;
}

/** Highlight sinkron (setelah init); `null` bila bahasa tak didukung → fallback `<pre>`. */
export function highlightCode(code: string, lang: string): string | null {
  if (highlighter === null) {
    return null;
  }
  const bahasa = (LANGS as readonly string[]).includes(lang) ? lang : "text";
  try {
    return highlighter.codeToHtml(code, {
      lang: bahasa,
      themes: { dark: "github-dark-high-contrast", light: "github-light-high-contrast" },
      defaultColor: false,
    });
  } catch {
    return null;
  }
}
