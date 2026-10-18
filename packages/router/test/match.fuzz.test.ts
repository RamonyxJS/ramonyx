import assert from "node:assert/strict";
import { test } from "node:test";
import type { RouteEntry } from "@ramonyx/core";
import fc from "fast-check";
import { createRouteTable, matchRoute } from "../src/index.ts";

const segmentArb = fc.constantFrom("a", "b", "users", "files", "[id]", "[slug]");
const pathArb = fc.array(segmentArb, { maxLength: 4 }).map((parts) => `/${parts.join("/")}`);
const methodArb = fc.constantFrom("GET", "POST", "PUT");
const entryArb: fc.Arbitrary<RouteEntry> = fc
  .record({ method: methodArb, path: pathArb })
  .map(({ method, path }) => ({
    method,
    path,
    definition: { handler: () => new Response("ok") },
  }));

test("fuzz: matchRoute tidak melempar, deterministik, params konsisten", () => {
  fc.assert(
    fc.property(
      fc.array(entryArb, { maxLength: 8 }),
      pathArb,
      fc.constantFrom("GET", "POST", "DELETE"),
      (entries, path, method) => {
        const table = createRouteTable(entries);

        const first = matchRoute(table, method, path);
        const second = matchRoute(table, method, path);
        assert.deepEqual(first, second, "hasil harus deterministik");

        if (first.kind === "match") {
          const patternSegments = first.entry.path.split("/").filter(Boolean).length;
          const params = Object.entries(first.params);
          assert.ok(params.length <= patternSegments);
          for (const [name, value] of params) {
            assert.ok(name.length > 0);
            assert.equal(typeof value, "string");
          }
        }

        if (first.kind === "method-not-allowed") {
          for (const allowed of first.allow) {
            assert.ok(["GET", "POST", "PUT"].includes(allowed));
          }
        }
      },
    ),
    { numRuns: 100 },
  );
});

test("fuzz: path/method sembarang tidak pernah melempar", () => {
  const table = createRouteTable([
    { method: "GET", path: "/a/[id]", definition: { handler: () => new Response("ok") } },
    { method: "POST", path: "/", definition: { handler: () => new Response("ok") } },
  ]);

  fc.assert(
    fc.property(fc.string(), fc.string(), (path, method) => {
      const result = matchRoute(table, method, path);
      assert.ok(["match", "not-found", "method-not-allowed"].includes(result.kind));
    }),
    { numRuns: 200 },
  );
});
