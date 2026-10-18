import assert from "node:assert/strict";
import { test } from "node:test";
import {
  expireCookie,
  parseCookies,
  serializeCookie,
  signValue,
  verifyValue,
} from "../src/index.ts";

test("parseCookies: beberapa cookie, decode, first-wins, toleran", () => {
  assert.deepEqual(parseCookies("a=1; b=dua%20kata; c=3"), { a: "1", b: "dua kata", c: "3" });
  assert.deepEqual(parseCookies("a=1; a=2"), { a: "1" });
  assert.deepEqual(parseCookies(""), {});
  assert.deepEqual(parseCookies(undefined), {});
  assert.deepEqual(parseCookies("tanpa-nilai; b=2"), { b: "2" });
  assert.deepEqual(parseCookies("rusak=%E0%A4%A"), { rusak: "%E0%A4%A" });
});

test("serializeCookie: default aman (HttpOnly, Secure, SameSite=Lax, Path=/)", () => {
  const cookie = serializeCookie("sesi", "nilai");
  assert.ok(cookie.startsWith("sesi=nilai; Path=/"));
  assert.ok(cookie.includes("HttpOnly"));
  assert.ok(cookie.includes("Secure"));
  assert.ok(cookie.includes("SameSite=Lax"));

  const dev = serializeCookie("sesi", "nilai", { secure: false, maxAge: 60, domain: "contoh.dev" });
  assert.ok(!dev.includes("Secure"));
  assert.ok(dev.includes("Max-Age=60"));
  assert.ok(dev.includes("Domain=contoh.dev"));

  const ketat = serializeCookie("s", "v", { sameSite: "strict", httpOnly: false });
  assert.ok(ketat.includes("SameSite=Strict"));
  assert.ok(!ketat.includes("HttpOnly"));

  assert.ok(expireCookie("sesi").includes("Max-Age=0"));
});

test("signValue/verifyValue: roundtrip, tamper, secret salah, format salah", async () => {
  const signed = await signValue("halo.dunia", "rahasia");
  assert.ok(signed.startsWith("halo.dunia."));
  assert.equal(await verifyValue(signed, "rahasia"), "halo.dunia");

  const tampered = `${signed.slice(0, -1)}x`;
  assert.equal(await verifyValue(tampered, "rahasia"), null, "tanda tangan diubah → null");
  assert.equal(await verifyValue(signed, "rahasia-lain"), null, "secret salah → null");
  assert.equal(await verifyValue("tanpa-titik", "rahasia"), null);
  assert.equal(await verifyValue("nilai.", "rahasia"), null);
  assert.equal(await verifyValue(null, "rahasia"), null);
  assert.equal(await verifyValue("nilai.%%%", "rahasia"), null, "base64 rusak → null");
});
