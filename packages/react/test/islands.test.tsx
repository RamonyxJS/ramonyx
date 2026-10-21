import assert from "node:assert/strict";
import { test } from "node:test";
import { useId } from "react";
import { renderToStaticMarkup } from "react-dom/server.edge";
import { defineIsland, Island } from "../src/islands.ts";
import { createReactRenderer } from "../src/renderer.ts";

function Counter({ start }: { start: number }) {
  return <button type="button">Island counter: {start}</button>;
}

defineIsland("test-counter", Counter);

test("Island: server merender marker + props JSON + komponen", () => {
  const html = renderToStaticMarkup(<Island id="test-counter" props={{ start: 2 }} />);

  assert.match(html, /^<span /);
  assert.match(html, /data-ramonyx-island="test-counter"/);
  assert.match(html, /data-props="\{&quot;start&quot;:2\}"/);
  assert.match(html, /display:contents/);
  assert.match(html, /Island counter: 2/);
});

test("Island: ID tidak terdaftar dan props tidak serializable menghasilkan error jelas", () => {
  assert.throws(
    () => renderToStaticMarkup(<Island id="missing" props={{}} />),
    /belum diregistrasi/,
  );

  const circular: Record<string, unknown> = {};
  circular.self = circular;
  defineIsland("circular", Counter);
  assert.throws(
    () => renderToStaticMarkup(<Island id="circular" props={circular} />),
    /harus JSON-serializable/,
  );
});

test("Island: SSR adapter memakai prefix useId yang sama dengan root client", async () => {
  function IdIsland() {
    return <span data-island-id={useId()}>x</span>;
  }
  defineIsland("id-island", IdIsland);

  const html = await createReactRenderer().render({
    type: function Page() {
      return <Island id="id-island" props={{}} />;
    },
    props: {},
    children: [],
  });

  assert.match(html, /data-island-id="[^"]*ramonyx-island-id-island-/);
});
