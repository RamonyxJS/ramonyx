// Fixture compatibility suite: SSR **streaming** React di runtime Rust (ADR-0030).
// Membuktikan ReadableStream (byte stream pull-based, `highWaterMark: 0`) cukup untuk
// `renderToReadableStream` react-dom, plus TextDecoder mode stream untuk chunking UTF-8.
//
// Dipakai oleh runtime/crates/js-engine/tests/compat_stream_ssr.rs.

import { createElement } from "react";
import { renderToReadableStream } from "react-dom/server.browser";

const elemen = createElement(
  "html",
  { lang: "id" },
  createElement("head", null, createElement("title", null, "SSR streaming")),
  createElement(
    "body",
    null,
    createElement(
      "main",
      { "data-app": "ramonyx" },
      createElement("h1", null, "Halo streaming"),
      createElement("p", null, "SSR streaming di V8"),
    ),
  ),
);

const stream = await renderToReadableStream(elemen);
let html = "";
let potongan = 0;
for await (const chunk of stream) {
  potongan += 1;
  html += new TextDecoder().decode(chunk, { stream: true });
}
html += new TextDecoder().decode();

if (!html.includes("Halo streaming")) {
  throw new Error(`HTML streaming tidak sesuai: ${html.slice(0, 200)}`);
}
if (!html.startsWith("<!DOCTYPE html>")) {
  throw new Error(`DOCTYPE hilang: ${html.slice(0, 80)}`);
}
if (potongan < 1) {
  throw new Error("tidak ada chunk yang diterima");
}

globalThis.__compat_stream = { ok: true, html, potongan };
