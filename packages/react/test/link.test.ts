import assert from "node:assert/strict";
import { test } from "node:test";
import { createLink, Link } from "../src/link.ts";

test("Link: elemen a dengan href + children + atribut passthrough", () => {
  const element = Link({ href: "/users/42", children: "Rina", className: "tautan" });
  assert.equal(element.type, "a");
  const props = element.props as Record<string, unknown>;
  assert.equal(props.href, "/users/42");
  assert.equal(props.children, "Rina");
  assert.equal(props.className, "tautan");
});

test("createLink: mengisi params dinamis dan menolak params kurang", () => {
  const TypedLink = createLink<{
    "/": undefined;
    "/users/[id]": { id: string };
  }>();
  const element = TypedLink({ href: "/users/[id]", params: { id: "42" }, children: "Rina" });
  assert.equal(element.type, "a");
  assert.equal((element.props as { href: string }).href, "/users/42");
  assert.throws(
    () => TypedLink({ href: "/users/[id]", params: {} as { id: string }, children: "x" }),
    /param kurang/,
  );
});
