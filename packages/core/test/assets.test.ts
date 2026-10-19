// Test resolusi aset dari peta (ADR-0079): URL, srcSet per format, urutan sources, fallback.

import assert from "node:assert/strict";
import { test } from "node:test";
import { type AssetInfo, createAssetResolverFromMap } from "../src/index.ts";

const map: Record<string, AssetInfo> = {
  "img/hero.png": {
    url: "/assets/img/hero-aa11.png",
    width: 800,
    height: 600,
    variants: [
      { url: "/assets/img/hero-320-bb22.webp", width: 320, height: 240, format: "webp" },
      { url: "/assets/img/hero-800-cc33.webp", width: 800, height: 600, format: "webp" },
      { url: "/assets/img/hero-320-dd44.avif", width: 320, height: 240, format: "avif" },
      { url: "/assets/img/hero-800-ee55.avif", width: 800, height: 600, format: "avif" },
    ],
  },
  "img/polos.png": { url: "/assets/img/polos-ff66.png", width: 200, height: 100 },
  "img/asli.png": {
    url: "/assets/img/asli-99aa.png",
    width: 400,
    height: 200,
    variants: [{ url: "/assets/img/asli-200-bb77.png", width: 200, height: 100, format: "png" }],
  },
};

test("url: normalisasi leading slash + path tak dikenal", () => {
  const resolver = createAssetResolverFromMap(map);
  assert.equal(resolver.url("img/hero.png"), "/assets/img/hero-aa11.png");
  assert.equal(resolver.url("/img/hero.png"), "/assets/img/hero-aa11.png");
  assert.equal(resolver.url("tidak/ada.png"), undefined);
});

test("image: srcSet terurut per lebar + sources avif → webp", () => {
  const resolver = createAssetResolverFromMap(map);
  const image = resolver.image("img/hero.png");
  assert.ok(image !== undefined);
  assert.equal(image.src, "/assets/img/hero-aa11.png");
  assert.equal(image.width, 800);
  assert.equal(image.height, 600);
  assert.equal(
    image.srcSet,
    "/assets/img/hero-320-bb22.webp 320w, /assets/img/hero-800-cc33.webp 800w",
    "srcset = format modern fallback (webp), terurut lebar",
  );
  assert.deepEqual(image.sources, [
    {
      type: "image/avif",
      srcSet: "/assets/img/hero-320-dd44.avif 320w, /assets/img/hero-800-ee55.avif 800w",
    },
    {
      type: "image/webp",
      srcSet: "/assets/img/hero-320-bb22.webp 320w, /assets/img/hero-800-cc33.webp 800w",
    },
  ]);
});

test("image: tanpa varian → src + dimensi; varian format asli → srcset tanpa sources", () => {
  const resolver = createAssetResolverFromMap(map);
  const polos = resolver.image("img/polos.png");
  assert.deepEqual(polos, { src: "/assets/img/polos-ff66.png", width: 200, height: 100 });

  const asli = resolver.image("img/asli.png");
  assert.ok(asli !== undefined);
  assert.equal(asli.srcSet, "/assets/img/asli-200-bb77.png 200w");
  assert.equal(asli.sources, undefined, "tanpa format modern → tanpa <source>");
});

test("image: path tak dikenal → undefined", () => {
  const resolver = createAssetResolverFromMap(map);
  assert.equal(resolver.image("tidak/ada.png"), undefined);
  assert.equal(createAssetResolverFromMap({}).image("x.png"), undefined);
});
