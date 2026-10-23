import type { DocumentRenderer } from "./types.ts";

/** Id container tempat React hydrate (dipakai server maupun client). */
export const RAMONYX_MOUNT_ID = "ramonyx-root";

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/**
 * Ikon default agar browser tidak meminta `/favicon.ico` dan menghasilkan 404 di console.
 * Aplikasi dapat menggantinya lewat `metadata.head` (`<link rel="icon" …>`).
 */
const DEFAULT_ICON =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='7' fill='%230f1115'/%3E%3Cpath d='M16 5l11 11-11 11L5 16z' fill='%237cc4ff'/%3E%3C/svg%3E";

/** Dokumen HTML default; aplikasi boleh mengganti lewat opsi `document`. */
export const defaultDocument: DocumentRenderer = ({
  title,
  body,
  head = "",
  scripts = "",
  lang,
  dir,
}) => {
  const icon = /rel=["']icon["']/i.test(head)
    ? ""
    : `\n<link rel="icon" href="${DEFAULT_ICON}" type="image/svg+xml" />`;
  const extraHead = `${icon}${head.length > 0 ? `\n${head}` : ""}`;
  const extraScripts = scripts.length > 0 ? `\n${scripts}` : "";
  const atributLang = ` lang="${escapeHtml(lang ?? "en")}"`;
  const atributDir = dir !== undefined ? ` dir="${dir}"` : "";
  return `<!doctype html>
<html${atributLang}${atributDir}>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)}</title>${extraHead}
</head>
<body>
<div id="${RAMONYX_MOUNT_ID}">${body}</div>${extraScripts}
</body>
</html>
`;
};
