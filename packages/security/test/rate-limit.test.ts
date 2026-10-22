import assert from "node:assert/strict";
import { test } from "node:test";
import { type MiddlewareContext, REMOTE_ADDRESS_HEADER, silentLogger } from "@ramonyx/core";
import { rateLimit } from "../src/index.ts";

function context(request: Request): MiddlewareContext {
  return { request, env: { get: () => undefined }, log: silentLogger };
}

const nextOk = async () => new Response("ok");

function requestFrom(address: string, forwarded?: string): Request {
  const headers: Record<string, string> = { [REMOTE_ADDRESS_HEADER]: address };
  if (forwarded !== undefined) {
    headers["x-forwarded-for"] = forwarded;
  }
  return new Request("http://t/", { headers });
}

test("mengizinkan sampai limit, lalu 429 + Retry-After + x-ratelimit-limit", async () => {
  let clock = 0;
  const middleware = rateLimit({ limit: 2, windowMs: 1000, now: () => clock });
  const request = () => requestFrom("203.0.113.7");

  assert.equal((await middleware(context(request()), nextOk)).status, 200);
  assert.equal((await middleware(context(request()), nextOk)).status, 200);

  clock = 250;
  const blocked = await middleware(context(request()), nextOk);
  assert.equal(blocked.status, 429);
  assert.deepEqual(await blocked.json(), { error: "Too Many Requests" });
  assert.equal(blocked.headers.get("retry-after"), "1");
  assert.equal(blocked.headers.get("x-ratelimit-limit"), "2");
});

test("window direset setelah windowMs; klien berbeda punya bucket sendiri", async () => {
  let clock = 0;
  const middleware = rateLimit({ limit: 1, windowMs: 1000, now: () => clock });

  assert.equal((await middleware(context(requestFrom("10.0.0.1")), nextOk)).status, 200);
  assert.equal((await middleware(context(requestFrom("10.0.0.1")), nextOk)).status, 429);
  assert.equal((await middleware(context(requestFrom("10.0.0.2")), nextOk)).status, 200);

  clock = 1000;
  assert.equal((await middleware(context(requestFrom("10.0.0.1")), nextOk)).status, 200);
});

test("default tidak memercayai x-forwarded-for; trustProxy: true memakainya", async () => {
  let clock = 0;
  const strict = rateLimit({ limit: 1, now: () => clock });
  assert.equal((await strict(context(requestFrom("10.0.0.1", "1.1.1.1")), nextOk)).status, 200);
  // XFF berbeda tapi alamat adapter sama → tetap bucket yang sama.
  assert.equal((await strict(context(requestFrom("10.0.0.1", "2.2.2.2")), nextOk)).status, 429);

  clock = 0;
  const trusting = rateLimit({ limit: 1, trustProxy: true, now: () => clock });
  assert.equal((await trusting(context(requestFrom("10.0.0.1", "1.1.1.1")), nextOk)).status, 200);
  assert.equal((await trusting(context(requestFrom("10.0.0.1", "2.2.2.2")), nextOk)).status, 200);
});

test("kunci kustom dipakai bila diberikan", async () => {
  const middleware = rateLimit({
    limit: 1,
    key: (request) => request.headers.get("x-user") ?? "?",
  });
  const request = (user: string) =>
    new Request("http://t/", { headers: { [REMOTE_ADDRESS_HEADER]: "10.0.0.1", "x-user": user } });

  assert.equal((await middleware(context(request("a")), nextOk)).status, 200);
  assert.equal((await middleware(context(request("a")), nextOk)).status, 429);
  assert.equal((await middleware(context(request("b")), nextOk)).status, 200);
});

test("maxKeys: key tertua dibuang agar memori terbatas", async () => {
  let clock = 0;
  const middleware = rateLimit({ limit: 1, maxKeys: 2, windowMs: 100_000, now: () => clock });

  assert.equal((await middleware(context(requestFrom("10.0.0.1")), nextOk)).status, 200);
  assert.equal((await middleware(context(requestFrom("10.0.0.2")), nextOk)).status, 200);

  // Key ke-3 memicu eviksi key tertua (10.0.0.1).
  assert.equal((await middleware(context(requestFrom("10.0.0.3")), nextOk)).status, 200);

  // Karena window 10.0.0.1 sudah dibuang, klien itu dapat window baru.
  assert.equal((await middleware(context(requestFrom("10.0.0.1")), nextOk)).status, 200);
  // 10.0.0.3 masih tercatat → langsung kena limit.
  assert.equal((await middleware(context(requestFrom("10.0.0.3")), nextOk)).status, 429);

  clock = 0; // memastikan tidak ada dependensi waktu tersembunyi
});

test("rate limit: store bersama membatasi dua instance secara konsisten", async () => {
  const { createMemoryStore, REMOTE_ADDRESS_HEADER } = await import("@ramonyx/core");
  const { rateLimit } = await import("../src/index.ts");
  const store = createMemoryStore();
  const make = () => rateLimit({ limit: 2, windowMs: 60_000, store });
  const request = new Request("http://test.local/", {
    headers: { [REMOTE_ADDRESS_HEADER]: "1.2.3.4" },
  });
  const context = {
    request,
    env: { get: () => undefined },
    log: { debug() {}, info() {}, warn() {}, error() {} },
  };
  assert.equal((await make()(context, async () => new Response("ok"))).status, 200);
  assert.equal((await make()(context, async () => new Response("ok"))).status, 200);
  assert.equal((await make()(context, async () => new Response("ok"))).status, 429);
});
