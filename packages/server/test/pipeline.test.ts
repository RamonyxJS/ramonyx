import assert from "node:assert/strict";
import { test } from "node:test";
import { HttpError, type Logger, type Middleware, type RouteEntry, route } from "@ramonyx/core";
import { z } from "zod";
import { createHandler, parseQuery, withMiddleware } from "../src/index.ts";

function capturingLogger(): {
  logger: Logger;
  lines: { level: string; message: string; data?: Record<string, unknown> }[];
} {
  const lines: { level: string; message: string; data?: Record<string, unknown> }[] = [];
  const push = (level: string) => (message: string, data?: Record<string, unknown>) => {
    lines.push(data === undefined ? { level, message } : { level, message, data });
  };
  return {
    logger: { debug: push("debug"), info: push("info"), warn: push("warn"), error: push("error") },
    lines,
  };
}

const routes: RouteEntry[] = [
  {
    method: "GET",
    path: "/api/hello",
    definition: route({ handler: ({ json }) => json({ ok: true }) }),
  },
  {
    method: "GET",
    path: "/api/users/[id]",
    definition: route({
      params: z.object({ id: z.string().regex(/^\d+$/) }),
      handler: ({ params, json }) => json({ id: params.id }),
    }),
  },
  {
    method: "GET",
    path: "/api/search",
    definition: route({
      query: z.object({
        q: z.string().min(2),
        tag: z.union([z.string(), z.array(z.string())]).optional(),
      }),
      handler: ({ query, json }) => json({ query }),
    }),
  },
  {
    method: "POST",
    path: "/api/echo",
    definition: route({
      body: z.object({ message: z.string() }),
      handler: ({ body, json }) => json({ message: body.message }),
    }),
  },
  {
    method: "GET",
    path: "/api/output-ok",
    definition: route({
      output: z.object({ count: z.number() }),
      handler: ({ json }) => json({ count: 1 }),
    }),
  },
  {
    method: "GET",
    path: "/api/output-bad",
    definition: route({
      output: z.object({ count: z.number() }),
      handler: ({ json }) => json({ count: "salah" }),
    }),
  },
  {
    method: "GET",
    path: "/api/boom",
    definition: route({
      handler: () => {
        throw new HttpError(403, "Forbidden");
      },
    }),
  },
  {
    method: "GET",
    path: "/api/crash",
    definition: route({
      handler: () => {
        throw new Error("rahasia: kredensial database");
      },
    }),
  },
  {
    method: "GET",
    path: "/api/text",
    definition: route({ handler: ({ text }) => text("hai", 201) }),
  },
];

test("GET statis → 200", async () => {
  const handler = createHandler({ routes });
  const response = await handler(new Request("http://test.local/api/hello"));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
});

test("parameter valid → 200; tidak valid → 400 dengan issues berpath", async () => {
  const handler = createHandler({ routes });

  const ok = await handler(new Request("http://test.local/api/users/42"));
  assert.deepEqual(await ok.json(), { id: "42" });

  const bad = await handler(new Request("http://test.local/api/users/abc"));
  assert.equal(bad.status, 400);
  const body = (await bad.json()) as { error: string; issues: { path: unknown[] }[] };
  assert.equal(body.error, "Validation failed");
  assert.deepEqual(body.issues[0]?.path, ["id"]);
});

test("query divalidasi + query berulang menjadi array; key tak dikenal di-strip schema", async () => {
  const handler = createHandler({ routes });

  const missing = await handler(new Request("http://test.local/api/search"));
  assert.equal(missing.status, 400);

  const ok = await handler(
    new Request("http://test.local/api/search?q=hai&tag=a&tag=b&extra=diabaikan"),
  );
  assert.equal(ok.status, 200);
  assert.deepEqual(await ok.json(), { query: { q: "hai", tag: ["a", "b"] } });
});

test("body JSON divalidasi; JSON rusak → 400", async () => {
  const handler = createHandler({ routes });
  const headers = { "content-type": "application/json" };

  const ok = await handler(
    new Request("http://test.local/api/echo", {
      method: "POST",
      headers,
      body: JSON.stringify({ message: "hai" }),
    }),
  );
  assert.deepEqual(await ok.json(), { message: "hai" });

  const invalid = await handler(
    new Request("http://test.local/api/echo", { method: "POST", headers, body: '{"message":1}' }),
  );
  assert.equal(invalid.status, 400);

  const malformed = await handler(
    new Request("http://test.local/api/echo", { method: "POST", headers, body: "{bukan json" }),
  );
  assert.equal(malformed.status, 400);
  const malformedBody = (await malformed.json()) as { issues: { message: string }[] };
  assert.match(malformedBody.issues[0]?.message ?? "", /JSON/);
});

test("output valid lolos; output tidak valid → 500 + log", async () => {
  const { logger, lines } = capturingLogger();
  const handler = createHandler({ routes, logger });

  const ok = await handler(new Request("http://test.local/api/output-ok"));
  assert.equal(ok.status, 200);

  const bad = await handler(new Request("http://test.local/api/output-bad"));
  assert.equal(bad.status, 500);
  assert.deepEqual(await bad.json(), { error: "Internal Server Error" });
  assert.ok(
    lines.some((line) => line.level === "error" && line.message === "Validasi output gagal"),
  );
});

test("strictValidation=false melonggarkan output, bukan input", async () => {
  const { logger, lines } = capturingLogger();
  const handler = createHandler({ routes, logger, strictValidation: false });

  const loose = await handler(new Request("http://test.local/api/output-bad"));
  assert.equal(loose.status, 200);
  assert.ok(lines.some((line) => line.level === "warn"));

  const invalidInput = await handler(new Request("http://test.local/api/users/abc"));
  assert.equal(invalidInput.status, 400);
});

test("HttpError → status + pesan; error tak dikenal → 500 tanpa bocor", async () => {
  const { logger, lines } = capturingLogger();
  const handler = createHandler({ routes, logger });

  const boom = await handler(new Request("http://test.local/api/boom"));
  assert.equal(boom.status, 403);
  assert.deepEqual(await boom.json(), { error: "Forbidden" });

  const crash = await handler(new Request("http://test.local/api/crash"));
  assert.equal(crash.status, 500);
  const crashBody = await crash.text();
  assert.ok(!crashBody.includes("rahasia"));
  assert.ok(lines.some((line) => line.level === "error"));
});

test("404 dan 405 (dengan Allow)", async () => {
  const handler = createHandler({ routes });

  const notFound = await handler(new Request("http://test.local/api/nope"));
  assert.equal(notFound.status, 404);

  const notAllowed = await handler(new Request("http://test.local/api/hello", { method: "POST" }));
  assert.equal(notAllowed.status, 405);
  assert.equal(notAllowed.headers.get("allow"), "GET");
});

test("urutan middleware deterministik dan bisa short-circuit", async () => {
  const order: string[] = [];
  let handlerCalled = false;
  const tracing = (name: string): Middleware => {
    return async (_context, next) => {
      order.push(`${name}:before`);
      const response = await next();
      order.push(`${name}:after`);
      return response;
    };
  };

  const handler = createHandler({
    routes: [
      {
        method: "GET",
        path: "/api/hello",
        definition: route({
          handler: ({ json }) => {
            handlerCalled = true;
            return json({ ok: true });
          },
        }),
      },
    ],
    middleware: [tracing("a"), tracing("b")],
  });

  await handler(new Request("http://test.local/api/hello"));
  assert.deepEqual(order, ["a:before", "b:before", "b:after", "a:after"]);
  assert.equal(handlerCalled, true);

  order.length = 0;
  handlerCalled = false;
  const blocking = createHandler({
    routes: [
      {
        method: "GET",
        path: "/api/hello",
        definition: route({
          handler: ({ json }) => {
            handlerCalled = true;
            return json({ ok: true });
          },
        }),
      },
    ],
    middleware: [async () => new Response("diblokir", { status: 401 })],
  });

  const blocked = await blocking(new Request("http://test.local/api/hello"));
  assert.equal(blocked.status, 401);
  assert.equal(handlerCalled, false);
});

test("next() dipanggil dua kali → 500", async () => {
  const handler = createHandler({
    routes,
    middleware: [
      async (_context, next) => {
        await next();
        return next();
      },
    ],
  });

  const response = await handler(new Request("http://test.local/api/hello"));
  assert.equal(response.status, 500);
});

test("env diteruskan ke handler", async () => {
  const handler = createHandler({
    routes: [
      {
        method: "GET",
        path: "/api/env",
        definition: route({ handler: ({ env, json }) => json({ key: env.get("KEY") ?? null }) }),
      },
    ],
    env: { get: (name) => (name === "KEY" ? "nilai" : undefined) },
  });

  const response = await handler(new Request("http://test.local/api/env"));
  assert.deepEqual(await response.json(), { key: "nilai" });
});

test("parseQuery: key tunggal dan berulang", () => {
  const parsed = parseQuery(new URLSearchParams("a=1&b=2&a=3&kosong="));
  assert.deepEqual(parsed, { a: ["1", "3"], b: "2", kosong: "" });
});

test("middleware dapat mengganti request untuk handler downstream", async () => {
  const handler = createHandler({
    routes: [
      {
        method: "GET",
        path: "/",
        definition: {
          handler: ({ request, json }) => json({ nonce: request.headers.get("x-test-nonce") }),
        },
      },
    ],
    middleware: [
      async (context, next) => {
        const headers = new Headers(context.request.headers);
        headers.set("x-test-nonce", "abc");
        return next(new Request(context.request, { headers }));
      },
    ],
  });

  const response = await handler(new Request("http://test.local/"));
  assert.deepEqual(await response.json(), { nonce: "abc" });
});

test("middleware per-rute berjalan SEBELUM body di-parse (penggantian request aman)", async () => {
  // Regresi: middleware yang mengganti request (mis. cspNonce) gagal bila body sudah dikonsumsi.
  const replaceRequest: Middleware = async (context, next) => {
    const headers = new Headers(context.request.headers);
    headers.set("x-uji", "1");
    return next(new Request(context.request, { headers, signal: context.request.signal }));
  };

  const routes: RouteEntry[] = [
    {
      method: "POST",
      path: "/api/echo",
      middlewares: [replaceRequest],
      definition: route({
        body: z.object({ pesan: z.string() }),
        handler: ({ body, request, json }) =>
          json({ pesan: body.pesan, xUji: request.headers.get("x-uji") }),
      }),
    },
  ];
  const handler = createHandler({ routes });

  const response = await handler(
    new Request("http://uji/api/echo", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pesan: "halo" }),
    }),
  );
  assert.equal(response.status, 200, "middleware mengganti request + body tetap terbaca");
  assert.deepEqual(await response.json(), { pesan: "halo", xUji: "1" });
});

test("hooks: onRequestStart/onRequestEnd terukur untuk sukses maupun 404 — ADR-0065", async () => {
  const starts: string[] = [];
  const ends: { path: string; status: number; durationMs: number }[] = [];
  const handler = createHandler({
    hooks: {
      onRequestStart: (event) => starts.push(event.path),
      onRequestEnd: (event) => ends.push(event),
    },
    routes: [
      {
        method: "GET",
        path: "/ok",
        definition: route({ handler: ({ json }) => json({ ok: true }) }),
      },
    ],
  });

  const ok = await handler(new Request("http://uji/ok"));
  assert.equal(ok.status, 200);
  const missing = await handler(new Request("http://uji/tidak-ada"));
  assert.equal(missing.status, 404);

  assert.deepEqual(starts, ["/ok", "/tidak-ada"]);
  assert.deepEqual(
    ends.map((event) => ({ path: event.path, status: event.status })),
    [
      { path: "/ok", status: 200 },
      { path: "/tidak-ada", status: 404 },
    ],
  );
  for (const event of ends) {
    assert.ok(event.durationMs >= 0, "durasi terukur");
  }
});

test("withMiddleware: membungkus handler apa pun (pre-routing) — ADR-0067", async () => {
  const base = async (request: Request): Promise<Response> =>
    Response.json({ path: new URL(request.url).pathname, xUji: request.headers.get("x-uji") });

  const wrapped = withMiddleware(base, [
    async (context, next) => {
      const headers = new Headers(context.request.headers);
      headers.set("x-uji", "1");
      return next(new Request(context.request, { headers, signal: context.request.signal }));
    },
    async (context, next) => {
      if (new URL(context.request.url).pathname === "/blokir") {
        return new Response("diblokir", { status: 403 });
      }
      return next();
    },
  ]);

  const ok = await wrapped(new Request("http://uji/halo"));
  assert.equal(ok.status, 200);
  assert.deepEqual(await ok.json(), { path: "/halo", xUji: "1" });

  const blocked = await wrapped(new Request("http://uji/blokir"));
  assert.equal(blocked.status, 403, "middleware dapat short-circuit");

  // Tanpa middleware → handler asli (identitas).
  assert.equal(withMiddleware(base, []), base);
});

test("envFromRequest: env per request (binding platform edge) — ADR-0068", async () => {
  const handler = createHandler({
    env: { get: () => "statis" },
    envFromRequest: (request) => {
      const nilai = request.headers.get("x-env");
      if (nilai === null) {
        return undefined; // fallback ke env statis
      }
      return {
        get: (name) => (name === "RAHASIA" ? nilai : undefined),
        getRaw: (name) => (name === "KV" ? { namespace: nilai } : undefined),
      };
    },
    routes: [
      {
        method: "GET",
        path: "/env",
        definition: route({
          handler: ({ env, json }) =>
            json({ rahasia: env.get("RAHASIA") ?? null, raw: env.getRaw?.("KV") ?? null }),
        }),
      },
    ],
  });

  const statis = await handler(new Request("http://uji/env"));
  assert.deepEqual(await statis.json(), { rahasia: "statis", raw: null }, "fallback env statis");

  const dinamis = await handler(
    new Request("http://uji/env", { headers: { "x-env": "dari-binding" } }),
  );
  assert.deepEqual(
    await dinamis.json(),
    { rahasia: "dari-binding", raw: { namespace: "dari-binding" } },
    "env per request dipakai (get + getRaw)",
  );
});
