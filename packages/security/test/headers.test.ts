import assert from "node:assert/strict";
import { test } from "node:test";
import { type MiddlewareContext, silentLogger } from "@ramonyx/core";
import { securityHeaders } from "../src/index.ts";

function context(request: Request): MiddlewareContext {
  return { request, env: { get: () => undefined }, log: silentLogger };
}

const nextOk = async () => new Response("ok");

test("default: nosniff + referrer-policy + frame-options; CSP nonaktif", async () => {
  const response = await securityHeaders()(context(new Request("http://t/")), nextOk);

  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("referrer-policy"), "strict-origin-when-cross-origin");
  assert.equal(response.headers.get("x-frame-options"), "DENY");
  assert.equal(response.headers.get("content-security-policy"), null);
  assert.equal(await response.text(), "ok", "body tetap utuh");
});

test("opsi: CSP & permissions-policy aktif; frame-options/nosniff bisa dimatikan", async () => {
  const middleware = securityHeaders({
    contentSecurityPolicy: "default-src 'self'",
    permissionsPolicy: "geolocation=()",
    frameOptions: null,
    nosniff: false,
  });
  const response = await middleware(context(new Request("http://t/")), nextOk);

  assert.equal(response.headers.get("content-security-policy"), "default-src 'self'");
  assert.equal(response.headers.get("permissions-policy"), "geolocation=()");
  assert.equal(response.headers.get("x-frame-options"), null);
  assert.equal(response.headers.get("x-content-type-options"), null);
});

test("status & header lain dipertahankan", async () => {
  const response = await securityHeaders()(
    context(new Request("http://t/")),
    async () => new Response("nope", { status: 404, headers: { "x-custom": "1" } }),
  );

  assert.equal(response.status, 404);
  assert.equal(response.headers.get("x-custom"), "1");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
});
