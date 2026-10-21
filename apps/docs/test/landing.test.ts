import assert from "node:assert/strict";
import { test } from "node:test";

import { subscribe, waitlistConfigured } from "../src/landing.server.ts";

function request(ip: string): Request {
  return new Request("https://ramonyx.devmoon.net/", {
    method: "POST",
    headers: { "cf-connecting-ip": ip, "content-type": "application/x-www-form-urlencoded" },
  });
}

test("waitlist: validasi email + simpan ke KV tanpa menyimpan email di key", async () => {
  const writes: Array<{ key: string; value: string }> = [];
  const store = {
    async put(key: string, value: string): Promise<void> {
      writes.push({ key, value });
    },
  };
  const env = {
    get: (): undefined => undefined,
    getRaw: (name: string): unknown => (name === "WAITLIST" ? store : undefined),
  };

  assert.equal(waitlistConfigured(env), true);
  assert.equal(
    waitlistConfigured({ get: (): undefined => undefined }),
    false,
    "tanpa binding KV waitlist nonaktif",
  );

  const invalid = await subscribe("bukan-email", request("10.0.0.1"), env);
  assert.equal(invalid.ok, false);
  assert.equal(invalid.errors?.email, "Enter a valid email address.");

  const valid = await subscribe("  Person+Release@Example.com ", request("10.0.0.2"), env);
  assert.equal(valid.ok, true);
  assert.equal(writes.length, 1);
  const entry = writes[0];
  assert.ok(entry);
  assert.match(entry.key, /^waitlist:[a-f0-9]{64}$/);
  assert.ok(!entry.key.includes("person"), "key tidak memuat email mentah");
  const payload = JSON.parse(entry.value) as { email: string; at: string };
  assert.equal(payload.email, "person+release@example.com");
  assert.ok(!Number.isNaN(Date.parse(payload.at)));
});

test("waitlist: tanpa binding dan tanpa webhook menolak dengan pesan jelas", async () => {
  const env = { get: (): undefined => undefined };
  const result = await subscribe("test@example.com", request("10.0.0.3"), env);
  assert.equal(result.ok, false);
  assert.match(result.errors?.email ?? "", /not configured/);
});
