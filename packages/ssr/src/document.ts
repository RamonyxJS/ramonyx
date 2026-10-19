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

/** Dokumen HTML default; aplikasi boleh mengganti lewat opsi `document`. */
export const defaultDocument: DocumentRenderer = ({
  title,
  body,
  head = "",
  scripts = "",
  lang,
  dir,
}) => {
  const extraHead = head.length > 0 ? `\n${head}` : "";
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
