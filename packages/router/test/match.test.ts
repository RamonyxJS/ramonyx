import assert from "node:assert/strict";
import { test } from "node:test";
import type { RouteEntry } from "@ramonyx/core";
import { createRouteTable, matchRoute } from "../src/index.ts";

function entry(method: string, path: string): RouteEntry {
  return { method, path, definition: { handler: () => new Response("ok") } };
}

test("match statis", () => {
  const table = createRouteTable([entry("GET", "/api/hello")]);
  const result = matchRoute(table, "GET", "/api/hello");
  assert.equal(result.kind, "match");
  if (result.kind === "match") {
    assert.deepEqual(result.params, {});
    assert.equal(result.entry.path, "/api/hello");
  }
});

test("match parameter + decoding", () => {
  const table = createRouteTable([entry("GET", "/api/users/[id]")]);
  const result = matchRoute(table, "GET", "/api/users/a%20b");
  assert.equal(result.kind, "match");
  if (result.kind === "match") {
    assert.deepEqual(result.params, { id: "a b" });
  }
});

test("decoding gagal → pakai nilai apa adanya", () => {
  const table = createRouteTable([entry("GET", "/api/users/[id]")]);
  const result = matchRoute(table, "GET", "/api/users/%E0%A4%A");
  assert.equal(result.kind, "match");
  if (result.kind === "match") {
    assert.equal(result.params.id, "%E0%A4%A");
  }
});

test("route statis menang atas parameter", () => {
  const table = createRouteTable([entry("GET", "/api/users/[id]"), entry("GET", "/api/users/me")]);
  const result = matchRoute(table, "GET", "/api/users/me");
  assert.equal(result.kind, "match");
  if (result.kind === "match") {
    assert.equal(result.entry.path, "/api/users/me");
  }
});

test("parameter bertingkat", () => {
  const table = createRouteTable([entry("GET", "/files/[dir]/[file]")]);
  const result = matchRoute(table, "GET", "/files/docs/readme.md");
  assert.equal(result.kind, "match");
  if (result.kind === "match") {
    assert.deepEqual(result.params, { dir: "docs", file: "readme.md" });
  }
});

test("method case-insensitive", () => {
  const table = createRouteTable([entry("get", "/api/hello")]);
  assert.equal(matchRoute(table, "GET", "/api/hello").kind, "match");
  assert.equal(matchRoute(table, "get", "/api/hello").kind, "match");
});

test("trailing slash dinormalisasi", () => {
  const table = createRouteTable([entry("GET", "/api/hello")]);
  assert.equal(matchRoute(table, "GET", "/api/hello/").kind, "match");
});

test("route root", () => {
  const table = createRouteTable([entry("GET", "/")]);
  const result = matchRoute(table, "GET", "/");
  assert.equal(result.kind, "match");
});

test("404 untuk path tak dikenal", () => {
  const table = createRouteTable([entry("GET", "/api/hello")]);
  assert.deepEqual(matchRoute(table, "GET", "/api/nope"), { kind: "not-found" });
});

test("405 dengan daftar Allow terurut", () => {
  const table = createRouteTable([
    entry("GET", "/api/hello"),
    entry("POST", "/api/hello"),
    entry("PUT", "/api/hello"),
  ]);
  const result = matchRoute(table, "DELETE", "/api/hello");
  assert.deepEqual(result, { kind: "method-not-allowed", allow: ["GET", "POST", "PUT"] });
});

test("catch-all [...name]: menyerap sisa segmen (minimal satu)", () => {
  const table = createRouteTable([entry("GET", "/[...notFound]")]);

  const match = matchRoute(table, "GET", "/a/b/c");
  assert.equal(match.kind, "match");
  if (match.kind === "match") {
    assert.deepEqual(match.params, { notFound: "a/b/c" });
  }

  assert.deepEqual(matchRoute(table, "GET", "/"), { kind: "not-found" });
});

test("catch-all kalah dari statis/parameter; 405 ikut; decoding per segmen", () => {
  const table = createRouteTable([
    entry("GET", "/[...notFound]"),
    entry("GET", "/api/hello"),
    entry("GET", "/users/[id]"),
    entry("POST", "/internal/[...sisa]"),
  ]);

  const hello = matchRoute(table, "GET", "/api/hello");
  assert.equal(hello.kind, "match");
  if (hello.kind === "match") assert.equal(hello.entry.path, "/api/hello");

  const user = matchRoute(table, "GET", "/users/42");
  assert.equal(user.kind, "match");
  if (user.kind === "match") assert.equal(user.entry.path, "/users/[id]");

  const fallback = matchRoute(table, "GET", "/apa/saja/disini");
  assert.equal(fallback.kind, "match");
  if (fallback.kind === "match") assert.equal(fallback.entry.path, "/[...notFound]");

  const internalOnly = createRouteTable([entry("POST", "/internal/[...sisa]")]);
  assert.deepEqual(matchRoute(internalOnly, "GET", "/internal/x"), {
    kind: "method-not-allowed",
    allow: ["POST"],
  });

  const decoded = matchRoute(table, "GET", "/hal%20o/%2Fz");
  assert.equal(decoded.kind, "match");
  if (decoded.kind === "match") assert.deepEqual(decoded.params, { notFound: "hal o//z" });
});
