import assert from "node:assert/strict";
import { test } from "node:test";
import type { ElementDescriptor } from "@ramonyx/ssr";
import type { ReactNode } from "react";
import { createReactRenderer } from "../src/index.ts";

test("JSX automatic runtime + escaping React", async () => {
  const html = await createReactRenderer().render({
    type: function Greeting({ name }: { name: string }) {
      return <p>{`Halo ${name}`}</p>;
    },
    props: { name: "<b>" },
    children: [],
  });

  assert.equal(html, "<p>Halo &lt;b&gt;</p>");
});

test("children descriptor menjadi elemen bersarang (layout)", async () => {
  const html = await createReactRenderer().render({
    type: function Layout({ children }: { children?: ReactNode }) {
      return (
        <section>
          <h2>Judul</h2>
          {children}
        </section>
      );
    },
    props: {},
    children: [{ type: "p", props: { children: "isi" }, children: [] }],
  });

  assert.equal(html, "<section><h2>Judul</h2><p>isi</p></section>");
});

test("renderStream: paritas byte-per-byte dengan render sinkron", async () => {
  const renderer = createReactRenderer();
  const descriptor: ElementDescriptor = {
    type: function Page() {
      return (
        <main>
          <h1>Streaming</h1>
          <p>{"teks & <markah>"}</p>
        </main>
      );
    },
    props: {},
    children: [],
  };

  const sync = await renderer.render(descriptor);
  const renderStream = renderer.renderStream;
  assert.ok(renderStream !== undefined, "react renderer menyediakan renderStream");

  const streamed = await new Response(await renderStream(descriptor)).text();
  assert.equal(streamed, sync);
});
