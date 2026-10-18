import assert from "node:assert/strict";
import { test } from "node:test";
import { createSession } from "../src/index.ts";

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
