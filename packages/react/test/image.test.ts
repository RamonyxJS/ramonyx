import assert from "node:assert/strict";
import { test } from "node:test";
import type { ReactElement } from "react";
import { Image } from "../src/assets.ts";

function propsOf(element: ReactElement | null): Record<string, unknown> {
  return (element?.props ?? {}) as Record<string, unknown>;
}

test("Image: elemen img dengan default aman; src kosong → null", () => {
  const element = Image({ src: "/assets/logo-abc.svg", alt: "Logo", width: 32, height: 32 });
  assert.ok(element !== null);
  assert.equal(element.type, "img");
  const props = propsOf(element);
  assert.equal(props.src, "/assets/logo-abc.svg");
  assert.equal(props.alt, "Logo");
  assert.equal(props.width, 32);
  assert.equal(props.height, 32);
  assert.equal(props.loading, "lazy", "default lazy");
  assert.equal(props.decoding, "async");

  assert.equal(Image({ src: undefined, alt: "x" }), null, "aset belum dibangun → tidak dirender");

  const eager = Image({
    src: "/a.png",
    alt: "a",
    loading: "eager",
    fetchPriority: "high",
    srcSet: "/a@2x.png 2x",
  });
  const eagerProps = propsOf(eager);
  assert.equal(eagerProps.loading, "eager");
  assert.equal(eagerProps.fetchpriority, "high");
  assert.equal(eagerProps.srcSet, "/a@2x.png 2x");
});

test("Image: sources → <picture> dengan <source> per format + sizes diteruskan", () => {
  const element = Image({
    src: "/assets/hero-aa11.png",
    alt: "Hero",
    width: 800,
    height: 600,
    srcSet: "/assets/hero-320-bb22.webp 320w",
    sources: [
      { type: "image/avif", srcSet: "/assets/hero-320-dd44.avif 320w" },
      { type: "image/webp", srcSet: "/assets/hero-320-bb22.webp 320w" },
    ],
    sizes: "(max-width: 768px) 100vw, 50vw",
  });
  assert.ok(element !== null);
  assert.equal(element.type, "picture");

  const children = (element.props as { children: ReactElement[] }).children;
  assert.equal(children.length, 3, "2 <source> + <img>");
  const avif = propsOf(children[0] ?? null);
  assert.equal(children[0]?.type, "source");
  assert.equal(avif.type, "image/avif");
  assert.equal(avif.srcSet, "/assets/hero-320-dd44.avif 320w");
  assert.equal(avif.sizes, "(max-width: 768px) 100vw, 50vw", "sizes diteruskan ke source");
  assert.equal(propsOf(children[1] ?? null).type, "image/webp");

  const img = children[2];
  assert.equal(img?.type, "img");
  const imgProps = propsOf(img ?? null);
  assert.equal(imgProps.src, "/assets/hero-aa11.png");
  assert.equal(imgProps.srcSet, "/assets/hero-320-bb22.webp 320w");
  assert.equal(imgProps.sizes, "(max-width: 768px) 100vw, 50vw");
  assert.equal(imgProps.width, 800);
});
