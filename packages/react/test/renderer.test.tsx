import assert from "node:assert/strict";
import { test } from "node:test";
import { defer } from "@ramonyx/core";
import type { ElementDescriptor } from "@ramonyx/ssr";
import { type ReactNode, Suspense, use } from "react";
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

test("renderStream: deferred Suspense fallback + konten akhir memakai nonce CSP", async () => {
  const renderer = createReactRenderer();
  const slow = defer(
    () => new Promise<string>((resolve) => setTimeout(() => resolve("selesai"), 25)),
  );

  function Value() {
    return <p data-value>{use(slow)}</p>;
  }

  const descriptor: ElementDescriptor = {
    type: function Page() {
      return (
        <main>
          <h1>Shell</h1>
          <Suspense fallback={<p data-fallback>memuat</p>}>
            <Value />
          </Suspense>
        </main>
      );
    },
    props: {},
    children: [],
  };

  const stream = await renderer.renderStream?.(descriptor, { nonce: "nonce-stream" });
  assert.ok(stream !== undefined);
  const html = await new Response(stream).text();
  assert.match(html, /data-fallback/);
  assert.match(html, /data-value/);
  assert.match(html, /selesai/);
  assert.match(html, /nonce="nonce-stream"/);
});

test("renderStream: rejection deferred dilaporkan onError dan fallback tetap terkirim", async () => {
  const failing = defer(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
    throw new Error("deferred gagal");
  });
  const errors: unknown[] = [];
  function Value() {
    return <p>{use(failing)}</p>;
  }
  const descriptor: ElementDescriptor = {
    type: function Page() {
      return (
        <main>
          <Suspense fallback={<p data-fallback>fallback</p>}>
            <Value />
          </Suspense>
        </main>
      );
    },
    props: {},
    children: [],
  };
  const renderer = createReactRenderer();
  const stream = await renderer.renderStream?.(descriptor, {
    onError: (error) => {
      errors.push(error);
    },
  });
  assert.ok(stream !== undefined);
  const html = await new Response(stream).text();
  assert.match(html, /data-fallback/);
  assert.match(html, /Switched to client rendering/);
  assert.ok(errors.some((error) => String(error).includes("deferred gagal")));
});
