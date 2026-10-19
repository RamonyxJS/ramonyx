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
