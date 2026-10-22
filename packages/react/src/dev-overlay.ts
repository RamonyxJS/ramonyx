// Overlay error dev-only (ADR-0072). Framework tidak memasangnya otomatis: error.tsx memilih
// merender komponen ini hanya bila `error.details` tersedia (SSR dev), sehingga build produksi
// tidak pernah menampilkan stack/sumber.

import { createElement, type ReactElement } from "react";

export interface DevErrorOverlayProps {
  readonly details: {
    readonly stack?: string;
    readonly source?: string;
  };
  readonly title?: string;
}

function fileUrl(source: string): string {
  const normalized = source.replaceAll("\\", "/");
  return `vscode://file/${encodeURI(normalized)}`;
}

export function DevErrorOverlay({
  details,
  title = "Runtime error",
}: DevErrorOverlayProps): ReactElement {
  return createElement(
    "aside",
    {
      "data-ramonyx-error-overlay": "",
      role: "alert",
      style: {
        position: "fixed",
        inset: "16px",
        zIndex: 9999,
        overflow: "auto",
        padding: "16px",
        borderRadius: "10px",
        background: "#1b1f27",
        color: "#f4f6fb",
        font: "13px/1.5 ui-monospace, monospace",
        boxShadow: "0 20px 60px rgba(0,0,0,.45)",
      },
    },
    createElement("strong", null, title),
    details.source === undefined
      ? null
      : createElement(
          "p",
          null,
          createElement(
            "a",
            {
              href: fileUrl(details.source),
              style: { color: "#7cc4ff" },
              target: "_blank",
              rel: "noreferrer",
            },
            `Buka ${details.source}`,
          ),
        ),
    details.stack === undefined
      ? null
      : createElement("pre", { style: { whiteSpace: "pre-wrap" } }, details.stack),
  );
}
