import { marked } from "marked";

/**
 * Render markdown → HTML. Konten berasal dari `docs/**` repo ini (tepercaya);
 * karena itu HTML dimasukkan apa adanya ke halaman (bukan input pengguna).
 */
export function renderMarkdown(source: string): string {
  return marked.parse(source, { async: false, gfm: true }) as string;
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
