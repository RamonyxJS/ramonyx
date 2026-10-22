import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DevErrorOverlay } from "../src/dev-overlay.ts";

test("DevErrorOverlay: stack + link vscode, hanya dirender jika dipilih error page", () => {
  const html = renderToStaticMarkup(
    createElement(DevErrorOverlay, {
      details: { stack: "Error: boom\n  at page.tsx:1", source: "/app/src/routes/page.tsx" },
    }),
  );
  assert.match(html, /data-ramonyx-error-overlay/);
  assert.match(html, /vscode:\/\/file\/\/app\/src\/routes\/page\.tsx/);
  assert.match(html, /Error: boom/);
  assert.match(html, /Buka \/app\/src\/routes\/page\.tsx/);
});
