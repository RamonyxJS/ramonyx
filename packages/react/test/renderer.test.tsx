import assert from "node:assert/strict";
import { test } from "node:test";
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
