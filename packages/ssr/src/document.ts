import type { DocumentRenderer } from "./types.ts";

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/** Dokumen HTML default; aplikasi boleh mengganti lewat opsi `document`. */
export const defaultDocument: DocumentRenderer = ({ title, body, head = "" }) => {
  const extraHead = head.length > 0 ? `\n${head}` : "";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)}</title>${extraHead}
</head>
<body>
${body}
</body>
</html>
`;
};
