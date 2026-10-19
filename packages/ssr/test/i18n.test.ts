// Test routing locale di `createPageRoutes({ i18n })` (ADR-0081): prefix per locale, redirect
// default, locale di konteks loader/action + prop halaman, `<html lang>`/`dir`, hreflang,
// dan isolasi cache antar-locale.

import assert from "node:assert/strict";
import { test } from "node:test";
import { createCache, type LoadedPage, type Logger, type PageModule } from "@ramonyx/core";
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

const logger: Logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

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

const i18n = { locales: ["id", "en"], defaultLocale: "id" } as const;

function buatHandler(
  pages: readonly LoadedPage[],
  options: Parameters<typeof createPageRoutes>[0] extends infer T ? Partial<T> : never = {},
) {
  return createHandler({
    routes: createPageRoutes({ pages, renderer: fakeRenderer(), i18n, ...options }),
    logger,
  });
}

test("i18n: default tanpa prefix, locale lain berprefix; locale di loader + prop halaman", async () => {
  const dilhat: string[] = [];
  const halaman = basePage("/tentang", {
    default: Page,
    loader: ({ locale }) => {
      dilhat.push(locale ?? "?");
      return { dari: locale };
    },
  });
  const handler = buatHandler([halaman]);

  const id = await handler(new Request("http://uji/tentang"));
  const idHtml = await id.text();
  assert.equal(id.status, 200);
  assert.match(idHtml, /lang="id"/, "html lang = locale default");
  assert.match(idHtml, /"dari":"id"/, "loader menerima locale default");
  assert.match(idHtml, /hreflang="en"/, "hreflang alternatif ada");

  const en = await handler(new Request("http://uji/en/tentang"));
  const enHtml = await en.text();
  assert.equal(en.status, 200);
  assert.match(enHtml, /lang="en"/);
  assert.match(enHtml, /"dari":"en"/, "loader menerima locale dari prefix");
  assert.match(enHtml, /"locale":"en"/, "prop halaman memuat locale");
  assert.deepEqual(dilhat, ["id", "en"]);
});

test("i18n: prefix default locale → redirect 308 (exact + catch-all, query dipertahankan)", async () => {
  const handler = buatHandler([basePage("/tentang", { default: Page })], {
    i18n: { locales: ["id", "en"], defaultLocale: "id" },
  });

  const akar = await handler(new Request("http://uji/id"));
  assert.equal(akar.status, 308);
  assert.equal(akar.headers.get("location"), "/");

  const dalam = await handler(new Request("http://uji/id/tentang?x=1"));
  assert.equal(dalam.status, 308);
  assert.equal(dalam.headers.get("location"), "/tentang?x=1", "query string ikut");

  const halaman = await handler(new Request("http://uji/en/tentang"));
  assert.equal(halaman.status, 200, "locale non-default tetap dilayani");
});

test("i18n: prefixDefaultLocale true → semua berprefix, tanpa prefix di-redirect", async () => {
  const handler = buatHandler([basePage("/tentang", { default: Page })], {
    i18n: { locales: ["id", "en"], defaultLocale: "id", prefixDefaultLocale: true },
  });

  const tanpaPrefix = await handler(new Request("http://uji/tentang"));
  assert.equal(tanpaPrefix.status, 308);
  assert.equal(tanpaPrefix.headers.get("location"), "/id/tentang");

  const akar = await handler(new Request("http://uji/"));
  assert.equal(akar.status, 308);
  assert.equal(akar.headers.get("location"), "/id");

  const id = await handler(new Request("http://uji/id/tentang"));
  assert.equal(id.status, 200);
  assert.match(await id.text(), /lang="id"/);

  const en = await handler(new Request("http://uji/en/tentang"));
  assert.equal(en.status, 200);
  assert.match(await en.text(), /lang="en"/);
});

test("i18n: <html dir> dari directions; hreflang berisi semua locale + x-default", async () => {
  const handler = buatHandler([basePage("/", { default: Page })], {
    i18n: {
      locales: ["id", "ar", "en"],
      defaultLocale: "id",
      directions: { ar: "rtl" },
    },
  });

  const ar = await handler(new Request("http://uji/ar"));
  const html = await ar.text();
  assert.equal(ar.status, 200);
  assert.match(html, /lang="ar"/);
  assert.match(html, /dir="rtl"/);
  assert.match(html, /hreflang="ar"/);
  assert.match(html, /hreflang="x-default" href="http:\/\/uji\/"/);

  const id = await handler(new Request("http://uji/"));
  assert.doesNotMatch(await id.text(), /dir=/, "locale tanpa directions tanpa atribut dir");
});

test("i18n: cache tidak bocor antar-locale (revalidate + locale di key)", async () => {
  let panggilan = 0;
  const halaman = basePage("/waktu", {
    default: Page,
    revalidate: 60,
    loader: ({ locale }) => {
      panggilan += 1;
      return { locale, nomor: panggilan };
    },
  });
  const handler = buatHandler([halaman], { cache: createCache() });

  const id = await handler(new Request("http://uji/waktu"));
  const en = await handler(new Request("http://uji/en/waktu"));
  const idLagi = await handler(new Request("http://uji/waktu"));

  assert.match(await id.text(), /"locale":"id"/);
  assert.match(await en.text(), /"locale":"en"/, "locale en tidak menerima data id");
  assert.match(await idLagi.text(), /"locale":"id"/);
  assert.equal(panggilan, 2, "loader id dipanggil sekali (cache), en sekali");
});

test("i18n: action POST berprefix menerima locale + loader render ulang", async () => {
  const halaman = basePage("/kirim", {
    default: Page,
    loader: ({ locale }) => ({ locale }),
    action: async ({ locale, formData }) => ({
      message: `${locale}:${String(formData.get("nama"))}`,
    }),
  });
  const handler = buatHandler([halaman]);

  const form = new FormData();
  form.set("nama", "Rina");
  const respons = await handler(new Request("http://uji/en/kirim", { method: "POST", body: form }));
  const html = await respons.text();
  assert.equal(respons.status, 200);
  assert.match(html, /"message":"en:Rina"/, "action menerima locale dari prefix");
  assert.match(html, /lang="en"/);
});

test("i18n: catch-all per-locale (notFound) + page tanpa i18n tetap normal", async () => {
  const handler = buatHandler(
    [
      basePage("/", { default: Page }),
      basePage("/[...notFound]", { default: Page, metadata: { status: 404 } }),
    ],
    { i18n },
  );

  const en404 = await handler(new Request("http://uji/en/tidak-ada"));
  assert.equal(en404.status, 404, "catch-all berprefix cocok");
  assert.match(await en404.text(), /lang="en"/);

  const tanpaI18n = createHandler({
    routes: createPageRoutes({
      pages: [basePage("/", { default: Page, loader: () => ({ ok: true }) })],
      renderer: fakeRenderer(),
    }),
    logger,
  });
  const biasa = await tanpaI18n(new Request("http://uji/"));
  assert.equal(biasa.status, 200);
  assert.match(await biasa.text(), /lang="en"/, "tanpa i18n → lang default dokumen");
});
