// Gaya + dokumen HTML kustom untuk situs docs (dipakai `createPageRoutes`).

import type { DocumentRenderer } from "@ramonyx/ssr";

const GAYA = `
  :root { --bg: #0f1115; --fg: #e6e8ee; --redup: #9aa2b1; --aksen: #7cc4ff; --garis: #262b36; }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--fg);
    font: 16px/1.65 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; }
  code, pre { font-family: ui-monospace, SFMono-Regular, "Cascadia Mono", Menlo, monospace; }
  .shell { max-width: 960px; margin: 0 auto; padding: 24px 20px 64px; }
  .topbar { display: flex; justify-content: space-between; align-items: baseline;
    border-bottom: 1px solid var(--garis); padding-bottom: 12px; margin-bottom: 28px; }
  .merek { color: var(--fg); text-decoration: none; font-weight: 700; letter-spacing: 0.02em; }
  .merek .tag { color: var(--aksen); font-weight: 400; }
  .meta { color: var(--redup); font-size: 13px; }
  a { color: var(--aksen); }
  h1 { font-size: 30px; line-height: 1.25; margin: 0 0 12px; }
  h2 { margin-top: 36px; border-bottom: 1px solid var(--garis); padding-bottom: 6px; }
  h3 { margin-top: 28px; }
  .pengantar { color: var(--redup); }
  .daftar { list-style: none; padding: 0; display: grid; gap: 6px; }
  .daftar li { display: flex; justify-content: space-between; gap: 16px; align-items: baseline;
    border: 1px solid var(--garis); border-radius: 8px; padding: 10px 14px; }
  .slug { color: var(--redup); font-size: 12px; }
  .remah { color: var(--redup); font-size: 14px; }
  .dokumen pre { background: #161a22; border: 1px solid var(--garis); border-radius: 8px;
    padding: 14px 16px; overflow-x: auto; }
  .dokumen code { background: #1b202b; border-radius: 4px; padding: 1px 5px; font-size: 0.92em; }
  .dokumen pre code { background: none; padding: 0; }
  .dokumen table { border-collapse: collapse; width: 100%; margin: 12px 0; }
  .dokumen th, .dokumen td { border: 1px solid var(--garis); padding: 6px 10px; text-align: left; }
  .dokumen blockquote { border-left: 3px solid var(--aksen); margin-left: 0; padding-left: 14px;
    color: var(--redup); }
  .kaki { margin-top: 56px; padding-top: 16px; border-top: 1px solid var(--garis);
    color: var(--redup); font-size: 13px; }
`;

/** Dokumen HTML kustom (judul + gaya + script hydration) untuk `createPageRoutes`. */
export const document: DocumentRenderer = ({
  title,
  body,
  head = "",
  scripts = "",
}) => `<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title.length > 0 ? `${title} · Ramonyx Docs` : "Ramonyx Docs"}</title>
<style>${GAYA}</style>${head.length > 0 ? `\n${head}` : ""}
</head>
<body>
<div id="ramonyx-root">${body}</div>${scripts.length > 0 ? `\n${scripts}` : ""}
</body>
</html>
`;
