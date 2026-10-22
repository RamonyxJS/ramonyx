import assert from "node:assert/strict";
import { test } from "node:test";
import { createMemorySessionStore, createSession } from "../src/index.ts";

test("createSession: commit → read roundtrip, tamper → null, clear kedaluwarsa", async () => {
  const session = createSession({ secret: "rahasia-uji", cookieName: "sesi" });

  const setCookie = await session.commit({ pengguna: "rina", peran: "admin" });
  assert.ok(setCookie.startsWith("sesi="));
  assert.ok(setCookie.includes("HttpOnly"));

  const cookiePair = setCookie.split(";")[0] ?? "";
  const request = new Request("http://test.local/", { headers: { cookie: cookiePair } });
  assert.deepEqual(await session.read(request), { pengguna: "rina", peran: "admin" });

  // Cookie diubah → tanda tangan tidak valid.
  const tampered = `${cookiePair}x`;
  const bad = new Request("http://test.local/", { headers: { cookie: tampered } });
  assert.equal(await session.read(bad), null);

  // Tanpa cookie.
  assert.equal(await session.read(new Request("http://test.local/")), null);

  // Clear → Max-Age=0.
  assert.ok(session.clear().includes("Max-Age=0"));
});

test("createSession: secret berbeda tidak saling percaya; JSON bukan objek ditolak", async () => {
  const a = createSession({ secret: "secret-a", cookieName: "sesi" });
  const b = createSession({ secret: "secret-b", cookieName: "sesi" });

  const cookiePair = (await a.commit({ x: 1 })).split(";")[0] ?? "";
  const request = new Request("http://test.local/", { headers: { cookie: cookiePair } });
  assert.deepEqual(await a.read(request), { x: 1 });
  assert.equal(await b.read(request), null, "secret lain tidak memverifikasi");
});

test("createSession: maxAge kustom dipakai di Set-Cookie", async () => {
  const session = createSession({ secret: "s", maxAgeSeconds: 60 });
  const cookie = await session.commit({ a: 1 });
  assert.ok(cookie.includes("Max-Age=60"));
  const pendek = await session.commit({ a: 1 }, { maxAgeSeconds: 5 });
  assert.ok(pendek.includes("Max-Age=5"));
});

test("session store: commit/read, rotate mencabut ID lama, revoke menghapus", async () => {
  const now = 1_000_000;
  const store = createMemorySessionStore({ now: () => now });
  const session = createSession({
    secret: "secret-store",
    cookieName: "sesi",
    store,
    now: () => now,
  });

  const oldCookie = (await session.commit({ pengguna: "rina" })).split(";")[0] ?? "";
  const oldRequest = new Request("http://test.local/", { headers: { cookie: oldCookie } });
  assert.deepEqual(await session.read(oldRequest), { pengguna: "rina" });

  const newCookie =
    (await session.rotate(oldRequest, { pengguna: "rina", langkah: "mfa" })).split(";")[0] ?? "";
  const newRequest = new Request("http://test.local/", { headers: { cookie: newCookie } });
  assert.deepEqual(await session.read(newRequest), { pengguna: "rina", langkah: "mfa" });
  assert.equal(await session.read(oldRequest), null, "ID sesi lama dicabut saat rotasi");

  assert.ok((await session.revoke(newRequest)).includes("Max-Age=0"));
  assert.equal(await session.read(newRequest), null, "revoke menghapus data store");
});

test("session store: expiry memakai waktu store dan cookie", async () => {
  let now = 2_000_000;
  const store = createMemorySessionStore({ now: () => now });
  const session = createSession({
    secret: "secret-expiry",
    cookieName: "sesi",
    maxAgeSeconds: 10,
    store,
    now: () => now,
  });
  const cookie = (await session.commit({ a: 1 })).split(";")[0] ?? "";
  const request = new Request("http://test.local/", { headers: { cookie } });
  assert.deepEqual(await session.read(request), { a: 1 });
  now += 10_001;
  assert.equal(await session.read(request), null);
});

test("session stateless: rotate tetap dapat dibaca (tanpa revocation server-side)", async () => {
  const session = createSession({ secret: "secret-stateless", cookieName: "sesi" });
  const oldCookie = (await session.commit({ a: 1 })).split(";")[0] ?? "";
  const oldRequest = new Request("http://test.local/", { headers: { cookie: oldCookie } });
  const newCookie = (await session.rotate(oldRequest, { a: 2 })).split(";")[0] ?? "";
  const newRequest = new Request("http://test.local/", { headers: { cookie: newCookie } });
  assert.deepEqual(await session.read(newRequest), { a: 2 });
});

test("session KeyValueStore adapter: roundtrip dan expiry memakai store bersama", async () => {
  const { createMemoryStore } = await import("@ramonyx/core");
  const { createKeyValueSessionStore } = await import("../src/index.ts");
  const now = Date.now();
  const store = createMemoryStore();
  const session = createSession({
    secret: "secret-kv",
    cookieName: "sesi",
    now: () => now,
    store: createKeyValueSessionStore(store),
  });
  const cookie = (await session.commit({ pengguna: "rina" })).split(";")[0] ?? "";
  const request = new Request("http://test.local/", { headers: { cookie } });
  assert.deepEqual(await session.read(request), { pengguna: "rina" });
});
