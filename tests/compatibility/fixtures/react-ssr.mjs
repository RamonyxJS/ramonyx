// Fixture compatibility suite: SSR React di runtime Rust (interop CommonJS, ADR-0029).
// react & react-dom adalah paket CommonJS produksi — jalur ini membuktikan graf CJS
// nyata (react-dom/server.browser → legacy + browser bundle → react → react-dom) berjalan.
//
// Dipakai oleh runtime/crates/js-engine/tests/compat_ssr.rs.

import { createElement } from "react";
import { renderToStaticMarkup, renderToString } from "react-dom/server.browser";

const elemen = createElement(
  "main",
  { "data-app": "ramonyx" },
  createElement("h1", null, "Halo dari runtime"),
  createElement("p", null, "SSR React di V8"),
);

const html = renderToString(elemen);
if (typeof html !== "string" || !html.includes("Halo dari runtime")) {
  throw new Error(`HTML SSR tidak sesuai: ${html}`);
}
if (!html.includes("data-app")) {
  throw new Error(`atribut data-app hilang: ${html}`);
}

const statis = renderToStaticMarkup(elemen);
if (!statis.startsWith("<main") || !statis.includes("SSR React di V8")) {
  throw new Error(`markup statis tidak sesuai: ${statis}`);
}

globalThis.__compat_ssr = {
  ok: true,
  html,
  statis,
};
