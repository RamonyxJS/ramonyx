// Context7 Ask — satu sumber endpoint untuk verification, note, llms, markdown, dan header.
export const CONTEXT7_ASK_ENDPOINT =
  "https://context7.com/api/v2/ask?siteKey=ask_89339fd8bad939f239a589fa";
export const CONTEXT7_SITE_KEY = new URL(CONTEXT7_ASK_ENDPOINT).searchParams.get("siteKey") ?? "";
export const CONTEXT7_LLMS_URL = "https://ramonyx.devmoon.net/machine/llms.txt";
export const CONTEXT7_LINK = `<${CONTEXT7_ASK_ENDPOINT}>; rel="search"; type="text/plain"; title="Search ramonyx.devmoon.net"`;

const SEARCH_SENTENCE = `This site has a search endpoint: ${CONTEXT7_ASK_ENDPOINT}&query=<URL-encoded question>. It returns documentation that answers the question, with a source link for each part. No API key is needed. If nothing matches, it says so.`;
const PAGE_INDEX_SENTENCE = `Page index: ${CONTEXT7_LLMS_URL}. Add .md to any page URL for its Markdown.`;

export const CONTEXT7_SEARCH_SECTION = `## Search\n\n${SEARCH_SENTENCE}`;
export const CONTEXT7_MARKDOWN_SEARCH = `## Search\n\n${PAGE_INDEX_SENTENCE}\n\n${SEARCH_SENTENCE}`;

/** Path yang mendapat meta/note/header Context7 (docs + alias legacy). */
export function isContext7DocsPath(path: string): boolean {
  const clean = path.replace(/\/+$/, "") || "/";
  return (
    clean === "/docs" ||
    clean.startsWith("/docs/") ||
    clean === "/dokumen" ||
    clean.startsWith("/dokumen/")
  );
}
