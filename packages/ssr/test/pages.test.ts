import assert from "node:assert/strict";
import { test } from "node:test";
import {
  HttpError,
  type LoadedPage,
  type Logger,
  NONCE_HEADER,
  type PageModule,
} from "@ramonyx/core";
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
      'id="ramonyx-payload">window.__RAMONYX__={"path":"/users/[id]","params":{"id":"42"},"data":{"id":"42"}}',
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

test("metadata.status menetapkan status respons (halaman 404 kustom)", async () => {
  const page = basePage("/[...notFound]", {
    default: Page,
    metadata: { title: "Tidak ditemukan", status: 404 },
  });
  const handler = createHandler({
    routes: createPageRoutes({ pages: [page], renderer: fakeRenderer() }),
  });

  const response = await handler(new Request("http://test.local/apa/saja"));
  assert.equal(response.status, 404);
  assert.match(await response.text(), /<title>Tidak ditemukan<\/title>/);

  const root = createHandler({
    routes: createPageRoutes({
      pages: [basePage("/", { default: Page, metadata: { status: 999 } })],
      renderer: fakeRenderer(),
    }),
  });
  assert.equal(
    (await root(new Request("http://test.local/"))).status,
    200,
    "status tidak valid → 200",
  );
});

test("output limit: dokumen melebihi batas → 500 + log", async () => {
  const { logger, lines } = makingLogger();
  const page = basePage("/", {
    default: Page,
    loader: async () => ({ big: "x".repeat(1000) }),
  });

  const handler = createHandler({
    routes: createPageRoutes({ pages: [page], renderer: fakeRenderer(), maxDocumentBytes: 200 }),
    logger,
  });
  const response = await handler(new Request("http://test.local/"));

  assert.equal(response.status, 500);
  assert.ok(
    lines.some(
      (line) => line.level === "error" && line.message === "Output halaman melebihi batas",
    ),
  );
});

test("header nonce → atribut nonce pada payload script (CSP)", async () => {
  const page = basePage("/", { default: Page, loader: async () => ({ ok: true }) });
  const handler = createHandler({
    routes: createPageRoutes({
      pages: [page],
      renderer: fakeRenderer(),
      client: { script: "/assets/client.js" },
    }),
  });

  const html = await (
    await handler(new Request("http://test.local/", { headers: { [NONCE_HEADER]: "abc123" } }))
  ).text();

  assert.ok(html.includes('id="ramonyx-payload" nonce="abc123"'));
});

test("client extraModules dimuat sebelum entry (untuk HMR client dev)", async () => {
  const page = basePage("/", { default: Page });
  const handler = createHandler({
    routes: createPageRoutes({
      pages: [page],
      renderer: fakeRenderer(),
      client: { script: "/.ramonyx/client-entry.ts", extraModules: ["/@vite/client"] },
    }),
  });
  const html = await (await handler(new Request("http://test.local/"))).text();

  const viteClient = html.indexOf('src="/@vite/client"');
  const entry = html.indexOf('src="/.ramonyx/client-entry.ts"');
  assert.ok(viteClient !== -1, "modul tambahan ada");
  assert.ok(entry !== -1, "entry ada");
  assert.ok(viteClient < entry, "modul tambahan dimuat sebelum entry");
});

test("streaming: isi dokumen identik dengan jalur sinkron (paritas, termasuk hydration)", async () => {
  const page = basePage(
    "/users/[id]",
    {
      default: Page,
      metadata: { title: "S" },
      loader: async ({ params }) => ({ id: params.id }),
    },
    { layouts: [{ default: Layout }] },
  );

  const syncHandler = createHandler({
    routes: createPageRoutes({
      pages: [page],
      renderer: fakeRenderer(),
      client: { script: "/assets/client.js" },
    }),
  });

  const streamingRenderer: Renderer = {
    ...fakeRenderer(),
    renderStream: async (element) => {
      const bytes = new TextEncoder().encode(describeElement(element));
      const middle = Math.floor(bytes.length / 2);
      return new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(bytes.slice(0, middle));
          controller.enqueue(bytes.slice(middle));
          controller.close();
        },
      });
    },
  };
  const streamingHandler = createHandler({
    routes: createPageRoutes({
      pages: [page],
      renderer: streamingRenderer,
      client: { script: "/assets/client.js" },
      streaming: true,
    }),
  });

  const syncHtml = await (await syncHandler(new Request("http://test.local/users/7"))).text();
  const streamedHtml = await (
    await streamingHandler(new Request("http://test.local/users/7"))
  ).text();

  assert.equal(streamedHtml, syncHtml);
});

test("streaming: prefix + body pertama terkirim sebelum body selesai (aliran sungguhan)", async () => {
  const encoder = new TextEncoder();
  let release = (): void => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const renderer: Renderer = {
    name: "gated",
    render: async (element) => describeElement(element),
    renderStream: async () =>
      new ReadableStream<Uint8Array>({
        async start(controller) {
          controller.enqueue(encoder.encode("BAGIAN-1"));
          await gate;
          controller.enqueue(encoder.encode("BAGIAN-2"));
          controller.close();
        },
      }),
  };

  const page = basePage("/", { default: Page, loader: async () => ({ ok: true }) });
  const handler = createHandler({
    routes: createPageRoutes({
      pages: [page],
      renderer,
      client: { script: "/assets/client.js" },
      streaming: true,
    }),
  });
  const response = await handler(new Request("http://test.local/"));
  assert.equal(response.status, 200);

  const reader = response.body?.getReader();
  assert.ok(reader !== undefined, "respons punya body aliran");
  const decoder = new TextDecoder();

  const first = decoder.decode((await reader.read()).value);
  assert.ok(first.includes('id="ramonyx-root"'), "prefix dokumen (container) terkirim duluan");
  assert.ok(!first.includes("window.__RAMONYX__"), "script hydration belum terkirim");

  const second = decoder.decode((await reader.read()).value);
  assert.ok(second.includes("BAGIAN-1"));
  assert.ok(!second.includes("BAGIAN-2"), "BAGIAN-2 masih tertahan gate");

  release();
  let rest = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    rest += decoder.decode(value);
  }
  assert.ok(rest.includes("BAGIAN-2"), "sisa body terkirim setelah gate dibuka");
  assert.ok(rest.includes("window.__RAMONYX__"), "script hydration di akhir dokumen");
});

test("streaming tanpa renderStream → fallback sinkron", async () => {
  const page = basePage("/", { default: Page });
  const handler = createHandler({
    routes: createPageRoutes({ pages: [page], renderer: fakeRenderer(), streaming: true }),
  });
  const response = await handler(new Request("http://test.local/"));

  assert.equal(response.status, 200);
  assert.match(await response.text(), /<Page /);
});

test("streaming: dokumen kustom tanpa penanda body → fallback sinkron", async () => {
  let renderCalls = 0;
  let streamCalls = 0;
  const renderer: Renderer = {
    name: "spy",
    render: async (element) => {
      renderCalls += 1;
      return describeElement(element);
    },
    renderStream: async () => {
      streamCalls += 1;
      return new ReadableStream<Uint8Array>({
        start(controller) {
          controller.close();
        },
      });
    },
  };
  const page = basePage("/", { default: Page });
  const handler = createHandler({
    routes: createPageRoutes({
      pages: [page],
      renderer,
      streaming: true,
      document: () => "<html><body>statis</body></html>",
    }),
  });

  const html = await (await handler(new Request("http://test.local/"))).text();
  assert.equal(html, "<html><body>statis</body></html>");
  assert.equal(streamCalls, 0, "renderStream tidak dipakai bila dokumen mengabaikan body");
  assert.equal(renderCalls, 1, "fallback sinkron dipakai");
});

test("streaming: melebihi batas dokumen → aliran diputus + log", async () => {
  const { logger, lines } = makingLogger();
  const chunk = "x".repeat(400);
  const renderer: Renderer = {
    name: "big",
    render: async (element) => describeElement(element),
    renderStream: async () =>
      new ReadableStream<Uint8Array>({
        start(controller) {
          const encoder = new TextEncoder();
          controller.enqueue(encoder.encode(chunk));
          controller.enqueue(encoder.encode(chunk));
          controller.close();
        },
      }),
  };
  const page = basePage("/", { default: Page });
  const handler = createHandler({
    routes: createPageRoutes({
      pages: [page],
      renderer,
      streaming: true,
      maxDocumentBytes: 500,
    }),
    logger,
  });

  const response = await handler(new Request("http://test.local/"));
  assert.equal(response.status, 200, "status sudah terkirim sebelum batas terlampaui");
  await assert.rejects(
    async () => {
      await response.arrayBuffer();
    },
    /melebihi batas/,
    "aliran diputus saat melewati batas",
  );
  assert.ok(
    lines.some(
      (line) =>
        line.level === "error" &&
        line.message === "Output halaman (streaming) melebihi batas — aliran diputus",
    ),
  );
});

test("streaming: renderStream menolak → halaman error sinkron + log", async () => {
  const { logger, lines } = makingLogger();
  const renderer: Renderer = {
    name: "reject",
    render: async (element) => describeElement(element),
    renderStream: async () => {
      throw new Error("mesin streaming gagal");
    },
  };
  const page = basePage("/", { default: Page }, { error: { default: ErrorPage } });
  const handler = createHandler({
    routes: createPageRoutes({ pages: [page], renderer, streaming: true }),
    logger,
  });

  const response = await handler(new Request("http://test.local/"));
  assert.equal(response.status, 500);
  const html = await response.text();
  assert.ok(html.includes("<ErrorPage "), "error module dirender sinkron");
  assert.ok(!html.includes("mesin streaming gagal"), "pesan internal tidak bocor");
  assert.ok(
    lines.some((line) => line.level === "error" && line.message === "Render halaman gagal"),
  );
});
