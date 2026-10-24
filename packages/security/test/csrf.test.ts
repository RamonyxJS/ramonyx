import assert from "node:assert/strict";
import { test } from "node:test";
import { type MiddlewareContext, silentLogger } from "@ramonyx/core";
import { CSRF_REQUEST_HEADER, csrfProtection } from "../src/index.ts";

function context(request: Request): MiddlewareContext {
  return { request, env: { get: () => undefined }, log: silentLogger };
}

const nextOk = async () => new Response("ok");

test("GET tanpa cookie → set cookie token (SameSite=Lax, bukan HttpOnly)", async () => {
  const response = await csrfProtection()(context(new Request("http://t/")), nextOk);

  const setCookies = response.headers.getSetCookie();
  assert.equal(setCookies.length, 1);
  const cookie = setCookies[0] ?? "";
  assert.match(cookie, /^ramonyx-csrf=[0-9a-f]{64}; Path=\/; SameSite=Lax$/);
  assert.ok(!cookie.includes("HttpOnly"), "double-submit butuh bisa dibaca JS");
});

test("GET dengan cookie yang sudah ada → tidak set ulang", async () => {
  const request = new Request("http://t/", { headers: { cookie: "ramonyx-csrf=existing" } });
  const response = await csrfProtection()(context(request), nextOk);

  assert.equal(response.headers.getSetCookie().length, 0);
});

test("POST tanpa cookie → 403, handler tidak dipanggil", async () => {
  let called = false;
  const response = await csrfProtection()(
    context(new Request("http://t/", { method: "POST" })),
    async () => {
      called = true;
      return new Response("ok");
    },
  );

  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { error: "CSRF token tidak valid" });
  assert.equal(called, false);
});

test("POST dengan cookie + header cocok → lolos", async () => {
  const token = "a".repeat(64);
  const request = new Request("http://t/", {
    method: "POST",
    headers: { cookie: `ramonyx-csrf=${token}`, "x-csrf-token": token },
  });
  const response = await csrfProtection()(context(request), nextOk);

  assert.equal(response.status, 200);
  assert.equal(await response.text(), "ok");
});

test("POST token tidak cocok / kosong → 403", async () => {
  const token = "a".repeat(64);
  const mismatched = new Request("http://t/", {
    method: "POST",
    headers: { cookie: `ramonyx-csrf=${token}`, "x-csrf-token": "b".repeat(64) },
  });
  assert.equal((await csrfProtection()(context(mismatched), nextOk)).status, 403);

  const empty = new Request("http://t/", {
    method: "POST",
    headers: { cookie: `ramonyx-csrf=${token}` },
  });
  assert.equal((await csrfProtection()(context(empty), nextOk)).status, 403);
});

test("opsi secure → cookie memuat Secure; nama cookie/header bisa dikustom", async () => {
  const middleware = csrfProtection({
    secure: true,
    cookieName: "xsrf",
    headerName: "x-xsrf-token",
  });

  const getResponse = await middleware(context(new Request("http://t/")), nextOk);
  assert.match(getResponse.headers.getSetCookie()[0] ?? "", /; Secure$/);

  const token = "c".repeat(64);
  const postRequest = new Request("http://t/", {
    method: "POST",
    headers: { cookie: `xsrf=${token}`, "x-xsrf-token": token },
  });
  assert.equal((await middleware(context(postRequest), nextOk)).status, 200);
});

test("GET menyediakan token aktif ke loader SSR tanpa membocorkan header klien", async () => {
  const token = "d".repeat(64);
  const request = new Request("http://t/", {
    headers: { cookie: `ramonyx-csrf=${token}`, "x-ramonyx-csrf-token": "palsu" },
  });
  const response = await csrfProtection()(context(request), async (nextRequest) => {
    assert.equal(nextRequest?.headers.get(CSRF_REQUEST_HEADER), token);
    return new Response("ok");
  });
  assert.equal(response.status, 200);
});

test("POST form tanpa JS memakai field _csrf; body tetap dapat dibaca handler", async () => {
  const token = "e".repeat(64);
  const body = new URLSearchParams({ _csrf: token, nama: "Rina" });
  const request = new Request("http://t/", {
    method: "POST",
    headers: {
      cookie: `ramonyx-csrf=${token}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body,
  });
  const response = await csrfProtection()(context(request), async (nextRequest) => {
    const form = await (nextRequest ?? request).formData();
    assert.equal(form.get("nama"), "Rina");
    return new Response("ok");
  });
  assert.equal(response.status, 200);
  assert.equal(await response.text(), "ok");
});

test("POST form dengan token salah tetap 403", async () => {
  const token = "f".repeat(64);
  const request = new Request("http://t/", {
    method: "POST",
    headers: {
      cookie: `ramonyx-csrf=${token}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ _csrf: "salah" }),
  });
  assert.equal((await csrfProtection()(context(request), nextOk)).status, 403);
});

test("POST form melebihi maxFormBytes → 413 sebelum body diproses handler", async () => {
  const token = "a".repeat(64);
  let called = false;
  const request = new Request("http://t/", {
    method: "POST",
    headers: {
      cookie: `ramonyx-csrf=${token}`,
      "content-type": "application/x-www-form-urlencoded",
      "content-length": "1024",
    },
    body: `_csrf=${token}&data=${"x".repeat(1024)}`,
  });
  const response = await csrfProtection({ maxFormBytes: 64 })(context(request), async () => {
    called = true;
    return new Response("ok");
  });
  assert.equal(response.status, 413);
  assert.equal(called, false);
});

test("POST form streaming tanpa content-length melebihi batas → 413", async () => {
  const token = "a".repeat(64);
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(`_csrf=${token}&data=`));
      controller.enqueue(new TextEncoder().encode("x".repeat(512)));
      controller.close();
    },
  });
  const request = new Request("http://t/", {
    method: "POST",
    headers: {
      cookie: `ramonyx-csrf=${token}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: stream,
    duplex: "half",
  } as RequestInit);
  assert.equal((await csrfProtection({ maxFormBytes: 64 })(context(request), nextOk)).status, 413);
});

test("POST multipart memakai boundary asli (tidak boleh di-lowercase)", async () => {
  const token = "b".repeat(64);
  const form = new FormData();
  form.set("_csrf", token);
  form.set("nama", "Rina");
  const request = new Request("http://t/", {
    method: "POST",
    headers: { cookie: `ramonyx-csrf=${token}` },
    body: form,
  });
  assert.match(request.headers.get("content-type") ?? "", /boundary=----formdata-/);
  const response = await csrfProtection()(context(request), async (nextRequest) => {
    assert.equal((await (nextRequest ?? request).formData()).get("nama"), "Rina");
    return new Response("ok");
  });
  assert.equal(response.status, 200);
});
