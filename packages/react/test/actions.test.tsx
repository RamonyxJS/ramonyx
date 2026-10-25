import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PendingButton } from "../src/actions.ts";

test("PendingButton: output server default submit + atribut diteruskan", () => {
  const html = renderToStaticMarkup(
    createElement(PendingButton, { className: "kirim", name: "aksi" }, "Kirim"),
  );
  assert.match(html, /<button/);
  assert.match(html, /type="submit"/);
  assert.match(html, /class="kirim"/);
  assert.match(html, /name="aksi"/);
  assert.match(html, />Kirim<\/button>/);
  assert.doesNotMatch(html, /aria-busy/);
});

test("PendingButton: formId adalah opsi client, bukan atribut DOM", () => {
  const html = renderToStaticMarkup(
    createElement(PendingButton, { formId: "delete-form" }, "Hapus"),
  );
  assert.doesNotMatch(html, /formId|formid/);
  assert.match(html, /type="submit"/);
});
