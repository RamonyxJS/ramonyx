// Test primitif i18n (ADR-0081): negosiasi Accept-Language, pembangun path ber-locale,
// dan penerjemah katalog (interpolasi, plural, format Intl, fallback).

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createTranslator,
  formatMessage,
  localeDetection,
  localePath,
  negotiateLocale,
  parseAcceptLanguage,
} from "../src/index.ts";

const routing = {
  locales: ["id", "en"],
  defaultLocale: "id",
} as const;

test("parseAcceptLanguage: urut kualitas, q=0 dibuang, wildcard/invalid dilewati", () => {
  const hasil = parseAcceptLanguage("en-US;q=0.8, id;q=1, *;q=0.5, fr;q=0");
  assert.deepEqual(hasil, [
    { tag: "id", quality: 1 },
    { tag: "en-US", quality: 0.8 },
  ]);
  assert.deepEqual(parseAcceptLanguage(null), []);
  assert.deepEqual(parseAcceptLanguage(""), []);
  assert.deepEqual(parseAcceptLanguage(" ;q=0.5, , "), []);
});

test("negotiateLocale: exact → bahasa dasar → default", () => {
  assert.equal(negotiateLocale("en", routing), "en");
  assert.equal(negotiateLocale("EN-us", routing), "en", "case-insensitive + prefix bahasa");
  assert.equal(negotiateLocale("id-ID, en;q=0.5", routing), "id");
  assert.equal(negotiateLocale("fr-FR, de;q=0.8", routing), "id", "tak ada yang cocok → default");
  assert.equal(negotiateLocale(undefined, routing), "id");
  assert.equal(negotiateLocale("en;q=0.9, id;q=0.1", routing), "en", "urutan kualitas dihormati");
});

test("localePath: default tanpa prefix, locale lain berprefix, bisa ganti bahasa", () => {
  assert.equal(localePath("/tentang", "id", routing), "/tentang");
  assert.equal(localePath("/tentang", "en", routing), "/en/tentang");
  assert.equal(localePath("/", "en", routing), "/en");
  assert.equal(localePath("/en/tentang", "id", routing), "/tentang", "prefix lama dilepas");
  assert.equal(
    localePath("/tentang", "en", { ...routing, prefixDefaultLocale: true }),
    "/en/tentang",
  );
  assert.equal(localePath("/en", "id", { ...routing, prefixDefaultLocale: true }), "/id");
  assert.equal(localePath("tentang", "en", routing), "/en/tentang", "tanpa leading slash");
});

test("createTranslator: dot-path, interpolasi, fallback, onMissing, format Intl", () => {
  const hilang: string[] = [];
  const t = createTranslator({
    locale: "id",
    messages: {
      beranda: { judul: "Halo {nama}!", pesan: "Selamat datang" },
      item: { one: "{count} item", other: "{count} item" },
      inggris: { one: "{count} item", other: "{count} items" },
    },
    fallbackMessages: { cadangan: "dari fallback" },
    onMissing: (key) => hilang.push(key),
  });

  assert.equal(t.t("beranda.judul", { nama: "Rina" }), "Halo Rina!");
  assert.equal(t.t("beranda.pesan"), "Selamat datang");
  assert.equal(t.t("cadangan"), "dari fallback", "katalog fallback dipakai");
  assert.equal(t.t("tidak.ada"), "tidak.ada", "key hilang → key itu sendiri");
  assert.deepEqual(hilang, ["tidak.ada"], "onMissing dipanggil sekali per key hilang");
  assert.equal(t.t("beranda.judul", {}), "Halo {nama}!", "param hilang dibiarkan apa adanya");

  // Plural: kategori diambil dari Intl.PluralRules (id: other; en: one/other).
  assert.equal(t.t("item", { count: 1 }), "1 item");
  assert.equal(t.t("item", { count: 5 }), "5 item");
  const en = createTranslator({
    locale: "en",
    messages: { inggris: { one: "{count} item", other: "{count} items" } },
  });
  assert.equal(en.t("inggris", { count: 1 }), "1 item");
  assert.equal(en.t("inggris", { count: 3 }), "3 items");
  assert.equal(en.t("inggris"), "{count} items", "tanpa count → bentuk `other` (param dibiarkan)");

  // Format Intl.
  assert.equal(t.formatNumber(1234.5), new Intl.NumberFormat("id").format(1234.5));
  assert.equal(
    t.formatDate(new Date("2026-10-19T00:00:00Z"), { timeZone: "UTC", dateStyle: "long" }),
    new Intl.DateTimeFormat("id", { timeZone: "UTC", dateStyle: "long" }).format(
      new Date("2026-10-19T00:00:00Z"),
    ),
  );
  assert.equal(t.locale, "id");
});

test("createTranslator: locale tak dikenal tetap aman (plural & format)", () => {
  const t = createTranslator({
    locale: "xx-YY",
    messages: { item: { one: "{count}!", other: "{count}!!" } },
  });
  assert.equal(typeof t.t("item", { count: 2 }), "string");
  assert.equal(typeof t.formatNumber(10), "string");
});

test("formatMessage: plural/exact/#, select, apostrophe, dan param hilang", () => {
  assert.equal(
    formatMessage("{count, plural, =0 {tidak ada} one {# item} other {# item}}", "en", {
      count: 0,
    }),
    "tidak ada",
  );
  assert.equal(
    formatMessage("{count, plural, =0 {none} one {# item} other {# items}}", "en", { count: 1 }),
    "1 item",
  );
  assert.equal(
    formatMessage("{count, plural, =0 {none} one {# item} other {# items}}", "en", { count: 3 }),
    "3 items",
  );
  assert.equal(
    formatMessage("{gender, select, female {Dia} male {Dia} other {Mereka}}", "id", {
      gender: "female",
    }),
    "Dia",
  );
  assert.equal(formatMessage("Halo {nama}!", "id", { nama: "Rina" }), "Halo Rina!");
  assert.equal(
    formatMessage("Halo {nama}!", "id", {}),
    "Halo {nama}!",
    "param hilang dipertahankan",
  );
  assert.equal(formatMessage("It''s {nama}", "en", { nama: "Rina" }), "It's Rina");
  assert.equal(formatMessage("'{literal}'", "en"), "{literal}");
});

test("formatMessage: number, percent, currency, date/time", () => {
  assert.equal(formatMessage("{n, number}", "en", { n: 1234.5 }), "1,234.5");
  assert.match(formatMessage("{n, number, percent}", "en", { n: 0.25 }), /25%/);
  assert.match(formatMessage("{n, number, currency}", "en", { n: 12, currency: "USD" }), /\$12/);
  assert.ok(formatMessage("{d, date, short}", "en", { d: "2026-10-22T00:00:00Z" }).length > 0);
  assert.ok(formatMessage("{d, time, short}", "en", { d: "2026-10-22T12:30:00Z" }).length > 0);
  assert.equal(formatMessage("{n, number", "en", { n: 1 }), "{n, number", "malformed tetap aman");
});

test("createTranslator: nilai string memakai ICU MessageFormat", () => {
  const t = createTranslator({
    locale: "en",
    messages: {
      item: "{count, plural, one {# item} other {# items}}",
      pilih: "{gender, select, female {Dia} other {Mereka}}",
    },
  });
  assert.equal(t.t("item", { count: 1 }), "1 item");
  assert.equal(t.t("item", { count: 4 }), "4 items");
  assert.equal(t.t("pilih", { gender: "female" }), "Dia");
  assert.equal(t.t("pilih", { gender: "other" }), "Mereka");
});

test("localeDetection: cookie → Accept-Language → default, skip API/aset", async () => {
  const middleware = localeDetection(routing);
  const context = (request: Request) => ({
    request,
    env: { get: () => undefined },
    log: { debug() {}, info() {}, warn() {}, error() {} },
  });
  const next = async () => new Response("next");

  const accept = await middleware(
    context(new Request("http://x/", { headers: { "accept-language": "en-US,en;q=0.9" } })),
    next,
  );
  assert.equal(accept.status, 302);
  assert.equal(accept.headers.get("location"), "/en");
  assert.match(accept.headers.get("set-cookie") ?? "", /locale=en/);

  const cookie = await middleware(
    context(
      new Request("http://x/", {
        headers: { cookie: "locale=en", "accept-language": "id" },
      }),
    ),
    next,
  );
  assert.equal(cookie.headers.get("location"), "/en", "cookie menang atas Accept-Language");

  const defaultLocale = await middleware(
    context(new Request("http://x/", { headers: { "accept-language": "id-ID" } })),
    next,
  );
  assert.equal(await defaultLocale.text(), "next", "default tanpa prefix tidak redirect");

  const prefixed = await middleware(
    context(new Request("http://x/en/tentang", { headers: { "accept-language": "id" } })),
    next,
  );
  assert.equal(await prefixed.text(), "next", "path sudah ber-locale");

  const api = await middleware(
    context(new Request("http://x/api/halo", { headers: { "accept-language": "en" } })),
    next,
  );
  assert.equal(await api.text(), "next", "API dilewati");

  const all = localeDetection({ ...routing, strategy: "all", persistCookie: false });
  const otherPath = await all(
    context(new Request("http://x/tentang?q=1", { headers: { "accept-language": "en" } })),
    next,
  );
  assert.equal(otherPath.headers.get("location"), "/en/tentang?q=1");
  assert.equal(otherPath.headers.get("set-cookie"), null);
});
