import assert from "node:assert/strict";
import { test } from "node:test";
import type { LoadedPage } from "@ramonyx/core";
import { createHandler } from "@ramonyx/server";
import { createPageRoutes, type ElementDescriptor, type Renderer } from "../src/index.ts";

function Page(props: unknown) {
  return props;
}

function fakeRenderer(): Renderer {
  return {
    name: "fake",
    render: async (element: ElementDescriptor) => `<x>${JSON.stringify(element.props)}</x>`,
  };
}

function page(action: () => { message: string }): LoadedPage {
  return {
    path: "/unggah",
    page: { default: Page, action },
    layouts: [],
    directory: "/tmp",
  };
}

function streamedBody(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
}

test("action: body multipart streaming melewati maxBodyBytes → 413", async () => {
  let dipanggil = 0;
  const handler = createHandler({
    routes: createPageRoutes({
      pages: [
        page(() => {
          dipanggil += 1;
          return { message: "ok" };
        }),
      ],
      renderer: fakeRenderer(),
      maxBodyBytes: 32,
    }),
  });
  const boundary = "----ramonyx-test";
  const request = new Request("http://test.local/unggah", {
    method: "POST",
    headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
    body: streamedBody([
      `--${boundary}\r\nContent-Disposition: form-data; name="teks"\r\n\r\n`,
      "x".repeat(64),
      `\r\n--${boundary}--\r\n`,
    ]),
    duplex: "half",
  } as RequestInit);
  const response = await handler(request);
  assert.equal(response.status, 413);
  assert.equal(dipanggil, 0, "action tidak dijalankan");
});

test("action: body form normal di bawah batas tetap diproses", async () => {
  const handler = createHandler({
    routes: createPageRoutes({
      pages: [page(() => ({ message: "ok" }))],
      renderer: fakeRenderer(),
      maxBodyBytes: 1_024,
    }),
  });
  const body = new FormData();
  body.set("teks", "halo");
  const response = await handler(new Request("http://test.local/unggah", { method: "POST", body }));
  assert.equal(response.status, 200);
});
