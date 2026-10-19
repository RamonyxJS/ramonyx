// Test primitif i18n (ADR-0081): negosiasi Accept-Language, pembangun path ber-locale,
// dan penerjemah katalog (interpolasi, plural, format Intl, fallback).

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createTranslator,
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
