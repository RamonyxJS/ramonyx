import assert from "node:assert/strict";
import { test } from "node:test";
import { hashPassword, verifyPassword } from "../src/index.ts";

test("password: hash/verify, salt acak, dan password salah ditolak", async () => {
  const hash = await hashPassword("rahasia-uji", { iterations: 1_000 });
  assert.match(hash, /^pbkdf2-sha256\$1000\$[A-Za-z0-9_-]+\$[A-Za-z0-9_-]+$/);
  assert.equal(await verifyPassword("rahasia-uji", hash), true);
  assert.equal(await verifyPassword("salah", hash), false);

  const hash2 = await hashPassword("rahasia-uji", { iterations: 1_000 });
  assert.notEqual(hash, hash2, "salt acak menghasilkan hash berbeda");
});

test("password: hash malformed dan opsi tidak valid ditolak", async () => {
  for (const stored of ["", "plain", "pbkdf2-sha256$0$a$b", "pbkdf2-sha256$1$%%%$x"]) {
    assert.equal(await verifyPassword("x", stored), false);
  }
  await assert.rejects(() => hashPassword("x", { iterations: 0 }), /iterations/);
  await assert.rejects(() => hashPassword("x", { saltBytes: 4 }), /saltBytes/);
});
