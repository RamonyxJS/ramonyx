import assert from "node:assert/strict";
import { test } from "node:test";
import { createCache, type LoadedPage, type PageModule } from "@ramonyx/core";
import { createHandler } from "@ramonyx/server";
import { createPageRoutes, type ElementDescriptor, type Renderer } from "../src/index.ts";

function Page(props: unknown) {
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

function basePage(path: string, module: PageModule): LoadedPage {
  return { path, page: module, layouts: [], directory: "/tmp" };
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

test("revalidate: dua GET → loader sekali (cache hit), onLoaderEnd cached", async () => {
  let panggilan = 0;
  const loaders: boolean[] = [];
  const page = basePage("/uji", {
    default: Page,
    revalidate: 60,
    loader: async () => {
      panggilan += 1;
      return { nomor: panggilan };
    },
  });
  const handler = createHandler({
    routes: createPageRoutes({
      pages: [page],
      renderer: fakeRenderer(),
      cache: createCache(),
      hooks: { onLoaderEnd: (event) => loaders.push(event.cached) },
    }),
  });

  const pertama = await handler(new Request("http://test.local/uji"));
  assert.match(await pertama.text(), /"nomor":1/);
  const kedua = await handler(new Request("http://test.local/uji"));
  assert.match(await kedua.text(), /"nomor":1/, "data dari cache");

  assert.equal(panggilan, 1, "loader hanya sekali");
  assert.deepEqual(loaders, [false, true]);
});

test("revalidate: stale-while-revalidate — sajikan lama, refresh di belakang", async () => {
  let panggilan = 0;
  const page = basePage("/swr", {
    default: Page,
    // Jendela lebar (1 dtk fresh / 2 dtk stale) — margin 0,8 dtk agar tahan jitter scheduler
    // di mesin sibuk (flaky: TTL 50 ms → margin 20 ms; 0,5 dtk → margin 0,4 dtk masih bisa lewat).
    revalidate: 1,
    loader: async () => {
      panggilan += 1;
      return { nomor: panggilan };
    },
  });
  const handler = createHandler({
    routes: createPageRoutes({ pages: [page], renderer: fakeRenderer(), cache: createCache() }),
  });

  await handler(new Request("http://test.local/swr"));
  await sleep(1200); // fresh (1 dtk) lewat → jendela stale (margin 0,8 dtk)

  const stale = await handler(new Request("http://test.local/swr"));
  assert.match(await stale.text(), /"nomor":1/, "nilai lama langsung disajikan (stale)");

  // Refresh berjalan di belakang — tunggu *hasil tulis* cache, bukan hanya loader dipanggil
  // (race: `panggilan` bertambah sebelum `store.set` refresh selesai → pembacaan bisa masih lama).
  let segarText = "";
  for (let i = 0; i < 100; i += 1) {
    segarText = await (await handler(new Request("http://test.local/swr"))).text();
    if (segarText.includes('"nomor":2')) {
      break;
    }
    await sleep(10);
  }
  assert.equal(panggilan, 2, "refresh latar belakang menjalankan loader");
  assert.match(segarText, /"nomor":2/, "data ter-refresh dipakai");
});

test("revalidate: query atau cookie → tidak di-cache (keamanan sesi)", async () => {
  let panggilan = 0;
  const page = basePage("/aman", {
    default: Page,
    revalidate: 60,
    loader: async () => {
      panggilan += 1;
      return { nomor: panggilan };
    },
  });
  const handler = createHandler({
    routes: createPageRoutes({ pages: [page], renderer: fakeRenderer(), cache: createCache() }),
  });

  await handler(new Request("http://test.local/aman?filter=1"));
  await handler(new Request("http://test.local/aman?filter=1"));
  assert.equal(panggilan, 2, "query → selalu loader");

  await handler(new Request("http://test.local/aman", { headers: { cookie: "sesi=abc" } }));
  await handler(new Request("http://test.local/aman", { headers: { cookie: "sesi=abc" } }));
  assert.equal(panggilan, 4, "cookie → selalu loader");
});

test("revalidate: action memanggil context.revalidate → cache invalid + onInvalidate", async () => {
  let panggilan = 0;
  const invalidations: { paths?: readonly string[]; reason: string }[] = [];
  const page = basePage("/aksi", {
    default: Page,
    revalidate: 60,
    loader: async () => {
      panggilan += 1;
      return { nomor: panggilan };
    },
    action: async (context) => {
      const removed = (await context.revalidate?.({ paths: ["/aksi"] })) ?? -1;
      return { message: `terhapus:${removed}` };
    },
  });
  const handler = createHandler({
    routes: createPageRoutes({
      pages: [page],
      renderer: fakeRenderer(),
      cache: createCache(),
      hooks: {
        onInvalidate: (event) => invalidations.push({ paths: event.paths, reason: event.reason }),
      },
    }),
  });

  await handler(new Request("http://test.local/aksi"));
  assert.equal(panggilan, 1);

  const post = await handler(
    new Request("http://test.local/aksi", { method: "POST", body: new FormData() }),
  );
  assert.equal(post.status, 200);
  assert.match(await post.text(), /terhapus:1/, "action melaporkan 1 entri terhapus");
  assert.deepEqual(invalidations, [{ paths: ["/aksi"], reason: "action" }]);
  // Render ulang action adalah POST → tidak cacheable → loader berjalan (nomor 2).
  assert.equal(panggilan, 2, "render ulang action menjalankan loader");

  await handler(new Request("http://test.local/aksi"));
  assert.equal(panggilan, 3, "setelah invalidasi, GET berikutnya menjalankan loader lagi");
});

test("revalidate: tag kustom (cacheTags) diinvalidasi lewat cache.revalidate({ tags })", async () => {
  let panggilan = 0;
  const cache = createCache();
  const page = basePage("/produk/[id]", {
    default: Page,
    revalidate: 60,
    cacheTags: ["produk"],
    loader: async ({ params }) => {
      panggilan += 1;
      return { id: params.id, nomor: panggilan };
    },
  });
  const handler = createHandler({
    routes: createPageRoutes({ pages: [page], renderer: fakeRenderer(), cache }),
  });

  await handler(new Request("http://test.local/produk/1"));
  await handler(new Request("http://test.local/produk/2"));
  assert.equal(panggilan, 2);

  // Simulasi API route: invalidasi semua entri bertag "produk".
  assert.equal(await cache.revalidate({ tags: ["produk"] }), 2);

  await handler(new Request("http://test.local/produk/1"));
  assert.equal(panggilan, 3, "entri bertag diinvalidasi");
});

test("revalidate: tanpa opsi cache → perilaku lama (loader selalu jalan)", async () => {
  let panggilan = 0;
  const page = basePage("/polos", {
    default: Page,
    revalidate: 60,
    loader: async () => {
      panggilan += 1;
      return { nomor: panggilan };
    },
  });
  const handler = createHandler({
    routes: createPageRoutes({ pages: [page], renderer: fakeRenderer() }),
  });
  await handler(new Request("http://test.local/polos"));
  await handler(new Request("http://test.local/polos"));
  assert.equal(panggilan, 2);
});
