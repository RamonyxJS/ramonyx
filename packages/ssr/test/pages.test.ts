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
    // Produksi: detail dev tidak disertakan (ADR-0072).
    routes: createPageRoutes({ pages: [page], renderer: fakeRenderer(), errorDetails: false }),
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

test("errorDetails (dev): stack + sumber pada error page & fallback — ADR-0072", async () => {
  const page = basePage(
    "/gagal",
    {
      default: Page,
      loader: () => {
        throw new Error("gagal di loader");
      },
    },
    { error: { default: ErrorPage }, pageFile: "/app/src/routes/gagal/page.tsx" },
  );
  const handler = createHandler({
    routes: createPageRoutes({ pages: [page], renderer: fakeRenderer(), errorDetails: true }),
  });

  const denganErrorPage = await handler(new Request("http://test.local/gagal"));
  const html = await denganErrorPage.text();
  assert.ok(html.includes("gagal di loader"), "stack tampil di dev (overlay)");
  assert.ok(html.includes('"source"'), "file sumber disertakan");
  assert.ok(html.includes("routes/gagal/page.tsx"), "sumber menunjuk berkas halaman");

  // Fallback tanpa error module → stack juga tampil di dev.
  const pageTanpaError = basePage("/gagal2", {
    default: Page,
    loader: () => {
      throw new Error("gagal tanpa error.tsx");
    },
  });
  const fallbackHandler = createHandler({
    routes: createPageRoutes({
      pages: [pageTanpaError],
      renderer: fakeRenderer(),
      errorDetails: true,
    }),
  });
  const fallbackHtml = await (
    await fallbackHandler(new Request("http://test.local/gagal2"))
  ).text();
  assert.ok(fallbackHtml.includes("data-error-stack"), "fallback dev memuat stack");
  assert.ok(fallbackHtml.includes("gagal tanpa error.tsx"));

  // Produksi: tidak ada detail.
  const prodHandler = createHandler({
    routes: createPageRoutes({ pages: [page], renderer: fakeRenderer(), errorDetails: false }),
  });
  const prodHtml = await (await prodHandler(new Request("http://test.local/gagal"))).text();
  assert.ok(!prodHtml.includes("gagal di loader"), "produksi tidak membocorkan detail");
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
    routes: createPageRoutes({ pages: [page], renderer, streaming: true, errorDetails: false }),
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

test("action: POST merender ulang halaman dengan hasil action (progressive enhancement)", async () => {
  const page = basePage("/form", {
    default: Page,
    loader: async () => ({ awal: true }),
    action: ({ formData }) => {
      const nama = String(formData.get("nama") ?? "");
      return nama.length < 2 ? { errors: { nama: "terlalu pendek" } } : { message: `Halo ${nama}` };
    },
  });
  const handler = createHandler({
    routes: createPageRoutes({
      pages: [page],
      renderer: fakeRenderer(),
      client: { script: "/assets/client.js" },
    }),
  });

  // Sukses: status 200, loader jalan lagi, hasil action masuk props + payload hydration.
  const sukses = new FormData();
  sukses.set("nama", "Rina");
  const response = await handler(
    new Request("http://test.local/form", { method: "POST", body: sukses }),
  );
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.ok(html.includes('"message":"Halo Rina"'), "hasil action ada di props");
  assert.ok(html.includes('"action":{"ok":true'), "payload hydration memuat action");
  assert.ok(html.includes('"awal":true'), "loader dijalankan lagi setelah action");

  // Validasi gagal: status 400 + errors terstruktur (tanpa melempar).
  const gagal = new FormData();
  gagal.set("nama", "A");
  const invalid = await handler(
    new Request("http://test.local/form", { method: "POST", body: gagal }),
  );
  assert.equal(invalid.status, 400);
  const invalidHtml = await invalid.text();
  assert.ok(invalidHtml.includes('"errors":{"nama":"terlalu pendek"}'));
  assert.ok(invalidHtml.includes('"action":{"ok":false'));
});

test("action: redirect → 303 See Other (PRG)", async () => {
  const page = basePage("/kirim", {
    default: Page,
    action: () => ({ redirect: "/sukses" }),
  });
  const handler = createHandler({
    routes: createPageRoutes({ pages: [page], renderer: fakeRenderer() }),
  });

  const response = await handler(
    new Request("http://test.local/kirim", { method: "POST", body: new FormData() }),
  );
  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), "/sukses");
  assert.equal(await response.text(), "");
});

test("actionSchema: validasi FormData sebelum action dijalankan (Standard Schema)", async () => {
  let actionDipanggil = 0;
  const schema = {
    "~standard": {
      version: 1 as const,
      vendor: "uji",
      validate: (value: unknown) => {
        const record = value as Record<string, unknown>;
        const nama = record.nama;
        if (typeof nama === "string" && nama.length >= 2) {
          return { value: record };
        }
        return { issues: [{ message: "Nama wajib (≥2 karakter)", path: ["nama"] }] };
      },
    },
  };
  const page = basePage("/daftar", {
    default: Page,
    actionSchema: schema,
    action: () => {
      actionDipanggil += 1;
      return { message: "terdaftar" };
    },
  });
  const handler = createHandler({
    routes: createPageRoutes({ pages: [page], renderer: fakeRenderer() }),
  });

  const pendek = new FormData();
  pendek.set("nama", "A");
  const invalid = await handler(
    new Request("http://test.local/daftar", { method: "POST", body: pendek }),
  );
  assert.equal(invalid.status, 400);
  assert.ok((await invalid.text()).includes('"nama":"Nama wajib (≥2 karakter)"'));
  assert.equal(actionDipanggil, 0, "action tidak dijalankan saat schema gagal");

  const valid = new FormData();
  valid.set("nama", "Rina");
  const ok = await handler(
    new Request("http://test.local/daftar", { method: "POST", body: valid }),
  );
  assert.equal(ok.status, 200);
  assert.equal(actionDipanggil, 1);
});

test("metadata: description/canonical/OG/Twitter/robots disuntikkan ke <head>", async () => {
  const page = basePage("/promo", {
    default: Page,
    metadata: {
      title: "Promo",
      description: "Promo spesial <Ramonyx>",
      canonical: "https://ramonyxjs.github.io/promo",
      image: "/og.png",
      type: "article",
      robots: "noindex",
    },
  });
  const handler = createHandler({
    routes: createPageRoutes({ pages: [page], renderer: fakeRenderer() }),
  });

  const response = await handler(new Request("https://contoh.dev/promo?utm=1"));
  const html = await response.text();

  assert.ok(html.includes('<meta name="description" content="Promo spesial &lt;Ramonyx&gt;" />'));
  assert.ok(html.includes('<meta name="robots" content="noindex" />'));
  assert.ok(html.includes('<link rel="canonical" href="https://ramonyxjs.github.io/promo" />'));
  assert.ok(html.includes('<meta property="og:title" content="Promo" />'));
  assert.ok(html.includes('<meta property="og:type" content="article" />'));
  assert.ok(html.includes('<meta property="og:url" content="https://contoh.dev/promo?utm=1" />'));
  assert.ok(html.includes('<meta property="og:image" content="https://contoh.dev/og.png" />'));
  assert.ok(html.includes('<meta name="twitter:card" content="summary_large_image" />'));
});

test("metadata: tanpa metadata tidak menambah tag head", async () => {
  const page = basePage("/polos", { default: Page });
  const handler = createHandler({
    routes: createPageRoutes({ pages: [page], renderer: fakeRenderer() }),
  });
  const html = await (await handler(new Request("http://test.local/polos"))).text();
  assert.ok(!html.includes("og:title"));
  assert.ok(!html.includes('name="description"'));
});

test("halaman tanpa action: POST → 405 Method Not Allowed", async () => {
  const page = basePage("/", { default: Page });
  const handler = createHandler({
    routes: createPageRoutes({ pages: [page], renderer: fakeRenderer() }),
  });

  const response = await handler(
    new Request("http://test.local/", { method: "POST", body: new FormData() }),
  );
  assert.equal(response.status, 405);
  assert.equal(response.headers.get("allow"), "GET");
});

test("hooks: onLoaderEnd & onRenderEnd (termasuk flag streaming) — ADR-0065", async () => {
  const loaders: { path: string; durationMs: number; cached: boolean }[] = [];
  const renders: { path: string; status: number; streaming: boolean }[] = [];
  const hooks = {
    onLoaderEnd: (event: { path: string; durationMs: number; cached: boolean }) =>
      loaders.push(event),
    onRenderEnd: (event: { path: string; status: number; streaming: boolean }) =>
      renders.push(event),
  };

  const page = basePage("/uji", {
    default: Page,
    loader: async () => ({ angka: 1 }),
  });

  // Sinkron: streaming false.
  const handler = createHandler({
    routes: createPageRoutes({ pages: [page], renderer: fakeRenderer(), hooks }),
  });
  await handler(new Request("http://test.local/uji"));
  assert.equal(loaders.length, 1);
  assert.equal(loaders[0]?.path, "/uji");
  assert.equal(loaders[0]?.cached, false);
  assert.ok((loaders[0]?.durationMs ?? -1) >= 0);
  assert.deepEqual(
    renders.map((event) => ({
      path: event.path,
      status: event.status,
      streaming: event.streaming,
    })),
    [{ path: "/uji", status: 200, streaming: false }],
  );

  // Streaming: flag true (respons memakai jalur aliran).
  const streamingRenderer: Renderer = {
    ...fakeRenderer(),
    renderStream: async (element) => {
      const bytes = new TextEncoder().encode(describeElement(element));
      return new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(bytes);
          controller.close();
        },
      });
    },
  };
  const streamHandler = createHandler({
    routes: createPageRoutes({
      pages: [page],
      renderer: streamingRenderer,
      streaming: true,
      hooks,
    }),
  });
  await streamHandler(new Request("http://test.local/uji"));
  assert.equal(renders.length, 2);
  assert.equal(renders[1]?.streaming, true, "onRenderEnd menandai jalur streaming");
});

test("assets: resolver diteruskan ke konteks loader (ADR-0069)", async () => {
  let diterima: unknown;
  const page = basePage("/aset", {
    default: Page,
    loader: async ({ assets }) => {
      diterima = assets;
      return { logo: assets?.url("logo.svg") };
    },
  });
  const handler = createHandler({
    routes: createPageRoutes({
      pages: [page],
      renderer: fakeRenderer(),
      assets: {
        url: (path) => (path === "logo.svg" ? "/assets/logo-abc.svg" : undefined),
        image: (path) =>
          path === "logo.svg" ? { src: "/assets/logo-abc.svg", width: 32, height: 32 } : undefined,
      },
    }),
  });

  const html = await (await handler(new Request("http://test.local/aset"))).text();
  assert.ok(diterima !== undefined, "loader menerima resolver aset");
  assert.ok(html.includes("/assets/logo-abc.svg"), "URL aset masuk ke data halaman");
});
