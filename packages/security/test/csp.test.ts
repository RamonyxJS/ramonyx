import assert from "node:assert/strict";
import { test } from "node:test";
import { type MiddlewareContext, NONCE_HEADER, silentLogger } from "@ramonyx/core";
import { cspNonce, defaultContentSecurityPolicy } from "../src/index.ts";

function context(request: Request): MiddlewareContext {
  return { request, env: { get: () => undefined }, log: silentLogger };
}

test("nonce dititipkan ke downstream + CSP di-set pada respons", async () => {
  const middleware = cspNonce();
  const downstream: { nonce: string | null } = { nonce: null };

  const response = await middleware(context(new Request("http://t/")), async (request) => {
    downstream.nonce = (request ?? new Request("http://t/")).headers.get(NONCE_HEADER);
    return new Response("ok");
  });

  const csp = response.headers.get("content-security-policy") ?? "";
  assert.match(csp, /script-src 'self' 'nonce-[0-9a-f]{32}'/);
  assert.ok(downstream.nonce !== null && downstream.nonce.length === 32);
  assert.ok(csp.includes(`'nonce-${downstream.nonce}'`), "nonce header dan CSP harus sama");
});

test("nonce berbeda tiap request", async () => {
  const middleware = cspNonce();
  const nonces: (string | null)[] = [];
  const next = async (request?: Request) => {
    nonces.push((request ?? new Request("http://t/")).headers.get(NONCE_HEADER));
    return new Response("ok");
  };

  await middleware(context(new Request("http://t/")), next);
  await middleware(context(new Request("http://t/")), next);
  assert.notEqual(nonces[0], nonces[1]);
});

test("template CSP kustom dipakai; signal request diteruskan", async () => {
  const controller = new AbortController();
  const middleware = cspNonce({
    contentSecurityPolicy: (nonce) => `default-src 'none'; script-src 'nonce-${nonce}'`,
    nonceBytes: 8,
  });
  const captured: { signal: AbortSignal | null } = { signal: null };

  const response = await middleware(
    context(new Request("http://t/", { signal: controller.signal })),
    async (request) => {
      captured.signal = (request ?? new Request("http://t/")).signal;
      return new Response("ok");
    },
  );

  assert.equal(captured.signal?.aborted, false, "belum aborted");
  controller.abort();
  assert.equal(captured.signal?.aborted, true, "abort diteruskan ke request pengganti");

  assert.match(
    response.headers.get("content-security-policy") ?? "",
    /^default-src 'none'; script-src 'nonce-[0-9a-f]{16}'$/,
  );
});

test("defaultContentSecurityPolicy memuat nonce & frame-ancestors", () => {
  const policy = defaultContentSecurityPolicy("abc");
  assert.ok(policy.includes("'nonce-abc'"));
  assert.ok(policy.includes("frame-ancestors 'none'"));
  assert.ok(policy.includes("object-src 'none'"));
});
