import assert from "node:assert/strict";
import { test } from "node:test";
import { HttpError, type LoadedPage, type Logger, type PageModule } from "@ramonyx/core";
import { createHandler } from "@ramonyx/server";
import { createPageRoutes, type ElementDescriptor, type Renderer } from "../src/index.ts";

function Page(props: unknown) {
  return props;
}
function Layout(props: unknown) {
  return props;
}
function ErrorPage(props: unknown) {
  return props;
}

function describeElement(element: ElementDescriptor): string {
  const name =
    typeof element.type === "function"
      ? (element.type as { name: string }).name
      : String(element.type);
  const children = element.children.map(describeElement).join("");
  return `<${name} ${JSON.stringify(element.props)}>${children}</${name}>`;
}

function fakeRenderer(): Renderer {
  return { name: "fake", render: async (element) => describeElement(element) };
}

function makingLogger(): {
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

const basePage = (
  path: string,
  module: PageModule,
  extras: Partial<LoadedPage> = {},
): LoadedPage => ({
  path,
  page: module,
  layouts: [],
  error: undefined,
  directory: "/tmp",
  ...extras,
});

test("loader → render: layout membungkus halaman, data masuk, title dokumen", async () => {
  const page = basePage(
    "/users/[id]",
    {
      default: Page,
      metadata: { title: "Halaman Uji" },
      loader: async ({ params }) => ({ id: params.id }),
    },
    { layouts: [{ default: Layout }] },
  );

  const handler = createHandler({
    routes: createPageRoutes({ pages: [page], renderer: fakeRenderer() }),
  });
  const response = await handler(new Request("http://test.local/users/42"));

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /text\/html/);

  const html = await response.text();
  assert.match(html, /<title>Halaman Uji<\/title>/);
  assert.ok(html.includes("<Layout "));
  assert.ok(html.includes("<Page "));
  assert.ok(html.includes('"id":"42"'));
  assert.ok(html.indexOf("<Layout ") < html.indexOf("<Page "), "layout membungkus halaman");
});

test("layout berantai: terluar → terdalam → halaman", async () => {
  const page = basePage(
    "/",
    { default: Page },
    {
      layouts: [{ default: Layout }, { default: Layout }],
    },
  );

  const handler = createHandler({
    routes: createPageRoutes({ pages: [page], renderer: fakeRenderer() }),
  });
  const html = await (await handler(new Request("http://test.local/"))).text();

  const outer = html.indexOf("<Layout ");
  const inner = html.lastIndexOf("<Layout ");
  const pageIndex = html.indexOf("<Page ");
  assert.ok(outer < inner && inner < pageIndex);
});

test("HttpError dari loader → status + pesan tampil di error page", async () => {
  const page = basePage(
    "/users/[id]",
    {
      default: Page,
      loader: () => {
        throw new HttpError(404, "Pengguna tidak ditemukan");
      },
    },
    { error: { default: ErrorPage } },
  );

  const handler = createHandler({
    routes: createPageRoutes({ pages: [page], renderer: fakeRenderer() }),
  });
  const response = await handler(new Request("http://test.local/users/xyz"));

  assert.equal(response.status, 404);
  const html = await response.text();
  assert.ok(html.includes("<ErrorPage "));
  assert.ok(html.includes("Pengguna tidak ditemukan"));
});

test("error tak dikenal → 500 generik, pesan asli tidak bocor, tercatat di log", async () => {
  const { logger, lines } = makingLogger();
  const page = basePage(
    "/",
    {
      default: Page,
      loader: () => {
        throw new Error("rahasia: kredensial database");
      },
    },
    { error: { default: ErrorPage } },
  );

  const handler = createHandler({
    routes: createPageRoutes({ pages: [page], renderer: fakeRenderer() }),
    logger,
  });
  const response = await handler(new Request("http://test.local/"));

  assert.equal(response.status, 500);
  const html = await response.text();
  assert.ok(!html.includes("rahasia"));
  assert.ok(html.includes("Internal Server Error"));
  assert.ok(
    lines.some((line) => line.level === "error" && line.message === "Render halaman gagal"),
  );
});

test("tanpa error module → halaman fallback bawaan", async () => {
  const page = basePage("/", {
    default: Page,
    loader: () => {
      throw new HttpError(404, "Halaman hilang");
    },
  });

  const handler = createHandler({
    routes: createPageRoutes({ pages: [page], renderer: fakeRenderer() }),
  });
  const response = await handler(new Request("http://test.local/"));

  assert.equal(response.status, 404);
  const html = await response.text();
  assert.ok(html.includes("404"));
  assert.ok(html.includes("Halaman hilang"));
});

test("renderer melempar saat render halaman & error page → fallback 500", async () => {
  const exploding: Renderer = {
    name: "exploding",
    render: async () => {
      throw new Error("boom");
    },
  };

  const page = basePage("/", { default: Page }, { error: { default: ErrorPage } });

  const handler = createHandler({
    routes: createPageRoutes({ pages: [page], renderer: exploding }),
  });
  const response = await handler(new Request("http://test.local/"));

  assert.equal(response.status, 500);
  const html = await response.text();
  assert.ok(html.includes("Internal Server Error"));
});

test("client option: payload hydration + script module + container", async () => {
  const page = basePage("/users/[id]", {
    default: Page,
    metadata: { title: "H" },
    loader: async ({ params }) => ({ id: params.id }),
  });

  const handler = createHandler({
    routes: createPageRoutes({
      pages: [page],
      renderer: fakeRenderer(),
      client: { script: "/assets/client.js" },
    }),
  });
  const html = await (await handler(new Request("http://test.local/users/42"))).text();

  assert.ok(
    html.includes(
      'window.__RAMONYX__={"path":"/users/[id]","params":{"id":"42"},"data":{"id":"42"}}',
    ),
  );
  assert.ok(html.includes('<script type="module" src="/assets/client.js"></script>'));
  assert.ok(html.includes('<div id="ramonyx-root">'));
});

test("payload meng-escape `<` agar tidak bisa keluar dari <script>", async () => {
  const page = basePage("/", {
    default: Page,
    loader: async () => ({ text: "</script><script>alert(1)</script>" }),
  });

  const handler = createHandler({
    routes: createPageRoutes({
      pages: [page],
      renderer: fakeRenderer(),
      client: { script: "/assets/client.js" },
    }),
  });
  const html = await (await handler(new Request("http://test.local/"))).text();

  // Catatan: fake renderer menulis props mentah ke body; yang diuji di sini adalah payload.
  const payloadMatch = /window\.__RAMONYX__=(.*?)<\/script>/.exec(html);
  assert.ok(payloadMatch, "payload script ada");
  const payload = payloadMatch[1] ?? "";
  assert.ok(!payload.includes("</script><script>alert(1)"));
  assert.ok(payload.includes("\\u003c/script"));
});

test("tanpa client option: tidak ada payload/script hydration", async () => {
  const page = basePage("/", { default: Page });
  const handler = createHandler({
    routes: createPageRoutes({ pages: [page], renderer: fakeRenderer() }),
  });
  const html = await (await handler(new Request("http://test.local/"))).text();

  assert.ok(!html.includes("window.__RAMONYX__"));
  assert.ok(!html.includes('type="module"'));
});
