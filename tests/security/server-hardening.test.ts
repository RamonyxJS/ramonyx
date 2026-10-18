import assert from "node:assert/strict";
import { test } from "node:test";
import type { StandardSchema } from "@ramonyx/schema";
import { createHandler } from "@ramonyx/server";

// Suite keamanan (Phase 3): batas ukuran body, timeout, dan prototype pollution.
// Dijalankan lewat `createHandler` tanpa port; schema memakai Standard Schema sederhana.

const objectSchema: StandardSchema<unknown, unknown> = {
  "~standard": {
    version: 1,
    vendor: "security-suite",
    validate: (value) =>
      typeof value === "object" && value !== null
        ? { value }
        : { issues: [{ message: "harus object" }] },
  },
};

function echoHandler(maxBodyBytes?: number) {
  return createHandler({
    ...(maxBodyBytes === undefined ? {} : { maxBodyBytes }),
    routes: [
      {
        method: "POST",
        path: "/echo",
        definition: {
          body: objectSchema,
          handler: ({ json }) => json({ ok: true }),
        },
      },
    ],
  });
}

test("body melebihi batas (content-length) → 413", async () => {
  const response = await echoHandler(100)(
    new Request("http://test.local/echo", {
      method: "POST",
      body: JSON.stringify({ data: "x".repeat(1000) }),
    }),
  );

  assert.equal(response.status, 413);
  assert.deepEqual(await response.json(), { error: "Payload Too Large" });
});

test("body streaming melebihi batas tanpa content-length → 413", async () => {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (let index = 0; index < 50; index += 1) {
        controller.enqueue(new TextEncoder().encode("x".repeat(100)));
      }
      controller.close();
    },
  });

  const request = new Request("http://test.local/echo", {
    method: "POST",
    body: stream,
    duplex: "half",
  } as RequestInit);

  const response = await echoHandler(100)(request);
  assert.equal(response.status, 413);
});

test("content-length bohong (kecil, isi besar) → 413", async () => {
  const request = new Request("http://test.local/echo", {
    method: "POST",
    headers: { "content-length": "10" },
    body: JSON.stringify({ data: "x".repeat(500) }),
  });

  const response = await echoHandler(100)(request);
  assert.equal(response.status, 413);
});

test("body dalam batas → 200", async () => {
  const response = await echoHandler(1000)(
    new Request("http://test.local/echo", {
      method: "POST",
      body: JSON.stringify({ data: "x".repeat(100) }),
    }),
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
});

test("default limit 1 MiB: payload 200KB lolos", async () => {
  const response = await echoHandler()(
    new Request("http://test.local/echo", {
      method: "POST",
      body: JSON.stringify({ data: "x".repeat(200_000) }),
    }),
  );

  assert.equal(response.status, 200);
});

test("timeout → 503 dan request.signal di-abort", async () => {
  let aborted = false;
  const handler = createHandler({
    timeoutMs: 50,
    routes: [
      {
        method: "GET",
        path: "/slow",
        definition: {
          handler: async (context) => {
            await new Promise<void>((resolve) => {
              context.request.signal.addEventListener(
                "abort",
                () => {
                  aborted = true;
                  resolve();
                },
                { once: true },
              );
            });
            return new Response("terlambat");
          },
        },
      },
    ],
  });

  const started = Date.now();
  const response = await handler(new Request("http://test.local/slow"));

  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: "Service Unavailable" });
  assert.ok(Date.now() - started < 1000, "timeout ditegakkan cepat");

  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(aborted, true, "handler menerima abort lewat request.signal");
});

test("query berbahaya tidak mencemari prototype (end-to-end)", async () => {
  const handler = createHandler({
    routes: [
      {
        method: "GET",
        path: "/",
        definition: { handler: ({ query, json }) => json({ query }) },
      },
    ],
  });

  const response = await handler(
    new Request("http://test.local/?__proto__=polluted&constructor=evil&normal=1"),
  );
  assert.equal(response.status, 200);

  const body = (await response.json()) as { query: Record<string, unknown> };
  assert.equal(body.query.normal, "1");
  assert.ok(Object.hasOwn(body.query, "__proto__"), "__proto__ menjadi milik sendiri");
  assert.equal(Object.getPrototypeOf(body.query), Object.prototype);
  assert.equal(({} as Record<string, unknown>).polluted, undefined, "tidak ada polusi global");
});

test("concurrency limit: kelebihan → 503 + Retry-After, slot pulih setelah selesai", async () => {
  let release: (() => void) | undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let started = 0;

  const handler = createHandler({
    maxConcurrent: 2,
    routes: [
      {
        method: "GET",
        path: "/",
        definition: {
          handler: async () => {
            started += 1;
            await gate;
            return new Response("ok");
          },
        },
      },
    ],
  });

  const first = handler(new Request("http://test.local/"));
  const second = handler(new Request("http://test.local/"));
  await new Promise((resolve) => setTimeout(resolve, 10));

  const third = await handler(new Request("http://test.local/"));
  assert.equal(third.status, 503);
  assert.equal(third.headers.get("retry-after"), "1");
  assert.deepEqual(await third.json(), { error: "Service Unavailable" });

  release?.();
  const [firstResponse, secondResponse] = await Promise.all([first, second]);
  assert.equal(firstResponse.status, 200);
  assert.equal(secondResponse.status, 200);
  assert.equal(started, 2, "hanya dua handler yang mulai");

  const after = await handler(new Request("http://test.local/"));
  assert.equal(after.status, 200, "slot pulih setelah request selesai");
});
