import assert from "node:assert/strict";
import { type ChildProcess, spawn } from "node:child_process";
import { createServer } from "node:net";
import { test } from "node:test";

import { REMOTE_ADDRESS_HEADER } from "@ramonyx/core";
import {
  createAuthTokens,
  createKeyValueSessionStore,
  createSession,
  rateLimit,
} from "@ramonyx/security";
import { connectRedisStore, createRedisStore } from "../src/index.ts";

async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address !== null ? address.port : 0;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
}

async function startRedis(): Promise<{ process: ChildProcess; port: number } | null> {
  const port = await freePort();
  const child = spawn(
    "redis-server",
    ["--port", String(port), "--save", "", "--appendonly", "no"],
    {
      stdio: "ignore",
    },
  );
  const failed = await new Promise<boolean>((resolve) => {
    child.once("error", () => resolve(true));
    setTimeout(() => resolve(false), 150);
  });
  if (failed) {
    return null;
  }
  return { process: child, port };
}

test("Redis adapter: dua instance berbagi session, rate limit, token, dan invalidasi", async (t) => {
  const redis = await startRedis();
  if (redis === null) {
    t.skip("redis-server tidak tersedia");
    return;
  }
  const url = `redis://127.0.0.1:${redis.port}`;
  let a: Awaited<ReturnType<typeof connectRedisStore>> | undefined;
  let b: Awaited<ReturnType<typeof connectRedisStore>> | undefined;
  try {
    for (let attempt = 0; attempt < 20 && a === undefined; attempt += 1) {
      try {
        a = await connectRedisStore({ url, prefix: "test:" });
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
    assert.ok(a !== undefined, "Redis siap");
    b = await connectRedisStore({ url, prefix: "test:" });

    await a.store.set("shared", { nilai: 1 }, { ttlSeconds: 60, tags: ["produk"] });
    assert.deepEqual((await b.store.get("shared"))?.value, { nilai: 1 });

    // Session yang ditulis instance A dibaca instance B.
    const sessionA = createSession({
      secret: "redis-secret",
      cookieName: "sesi",
      store: createKeyValueSessionStore(a.store),
    });
    const sessionB = createSession({
      secret: "redis-secret",
      cookieName: "sesi",
      store: createKeyValueSessionStore(b.store),
    });
    const cookie = (await sessionA.commit({ pengguna: "rina" })).split(";")[0] ?? "";
    const request = new Request("http://test.local/", { headers: { cookie } });
    assert.deepEqual(await sessionB.read(request), { pengguna: "rina" });

    // Rate limit memakai counter Redis atomik lintas instance.
    const makeLimiter = () => rateLimit({ limit: 2, windowMs: 60_000, store: a?.store });
    const context = {
      request: new Request("http://test.local/", {
        headers: { [REMOTE_ADDRESS_HEADER]: "203.0.113.9" },
      }),
      env: { get: () => undefined },
      log: { debug() {}, info() {}, warn() {}, error() {} },
    };
    assert.equal((await makeLimiter()(context, async () => new Response("ok"))).status, 200);
    assert.equal(
      (
        await rateLimit({ limit: 2, windowMs: 60_000, store: b.store })(
          context,
          async () => new Response("ok"),
        )
      ).status,
      200,
    );
    assert.equal((await makeLimiter()(context, async () => new Response("ok"))).status, 429);

    // Token one-time memakai Lua take; dua consumer tidak sama-sama sukses.
    const tokens = createAuthTokens({ store: a.store });
    const token = await tokens.issue("user-redis", "reset", 60);
    const [first, second] = await Promise.all([
      tokens.consume(token, "reset"),
      tokens.consume(token, "reset"),
    ]);
    assert.deepEqual([first, second].sort(), [null, "user-redis"]);

    assert.equal(await b.store.invalidateTags(["produk"]), 1);
    assert.equal(await a.store.get("shared"), undefined);

    await a.store.set("pendek", "nilai", { ttlSeconds: 1 });
    await new Promise((resolve) => setTimeout(resolve, 1_100));
    assert.equal(await b.store.get("pendek"), undefined, "TTL Redis dihormati");
  } finally {
    await a?.close().catch(() => {});
    await b?.close().catch(() => {});
    redis.process.kill("SIGTERM");
    await new Promise<void>((resolve) => {
      redis.process.once("exit", () => resolve());
      setTimeout(resolve, 1_000);
    });
  }
});

test("Redis adapter: error client diteruskan (tidak fallback lokal)", async () => {
  const store = createRedisStore({
    get: async () => {
      throw new Error("redis down");
    },
    set: async () => {
      throw new Error("redis down");
    },
    del: async () => 0,
    sAdd: async () => 0,
    sRem: async () => 0,
    sMembers: async () => [],
    incr: async () => 0,
    eval: async () => null,
  });
  await assert.rejects(() => store.get("x"), /redis down/);
  await assert.rejects(() => store.set("x", 1), /redis down/);
});
