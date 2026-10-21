import assert from "node:assert/strict";
import { test } from "node:test";

import { CONTEXT7_ASK_ENDPOINT, CONTEXT7_SITE_KEY } from "../apps/docs/src/context7.ts";

test("Context7 Ask: Node docs response membawa meta, note, dan Link header", async () => {
  const { createApp } = await import("../apps/docs/src/app.ts");
  const app = await createApp();
  const response = await app(new Request("http://localhost/docs"));
  assert.equal(response.status, 200);
  assert.match(response.headers.get("link") ?? "", /rel="search"/);
  assert.match(
    response.headers.get("link") ?? "",
    new RegExp(CONTEXT7_ASK_ENDPOINT.replace(/[?&]/g, "\\$&")),
  );
  const html = await response.text();
  assert.ok(html.includes(`content="${CONTEXT7_SITE_KEY}"`), "meta verification");
  assert.ok(html.includes('data-context7-ask="true"'), "hidden note");
  assert.ok(html.includes("This site has a search endpoint:"), "search note");
});
