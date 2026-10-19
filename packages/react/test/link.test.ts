import assert from "node:assert/strict";
import { test } from "node:test";
import { Link } from "../src/link.ts";

test("Link: elemen a dengan href + children + atribut passthrough", () => {
  const element = Link({ href: "/users/42", children: "Rina", className: "tautan" });
  assert.equal(element.type, "a");
  const props = element.props as Record<string, unknown>;
  assert.equal(props.href, "/users/42");
  assert.equal(props.children, "Rina");
  assert.equal(props.className, "tautan");
});
