// Integrasi Better Auth (contoh resmi).
//
// Test memakai memory adapter agar tidak butuh database eksternal. Produksi memakai
// drizzleAdapter(db, { provider: "sqlite" }) dengan D1/Postgres/MySQL sesuai aplikasi.

import assert from "node:assert/strict";
import { test } from "node:test";
import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";

const SECRET = "ramonyx-integration-test-secret-0123456789abcdef0123456789abcdef0123456789abcdef";

function createAuth() {
  return betterAuth({
    baseURL: "http://localhost:3000",
    secret: SECRET,
    emailAndPassword: { enabled: true },
    database: memoryAdapter({ user: [], session: [], account: [], verification: [] }),
  });
}

test("Better Auth: sign-up, session, dan penolakan password salah", async () => {
  const auth = createAuth();
  const signUp = await auth.handler(
    new Request("http://localhost:3000/api/auth/sign-up/email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "rina@example.test",
        password: "correct-horse-battery-staple",
        name: "Rina",
      }),
    }),
  );
  assert.equal(signUp.status, 200);
  const payload = (await signUp.json()) as { user?: { email?: string } };
  assert.equal(payload.user?.email, "rina@example.test");
  const cookie = signUp.headers.get("set-cookie");
  assert.ok(cookie !== null, "Better Auth harus mengirim cookie sesi");

  const session = await auth.api.getSession({
    headers: new Headers({ cookie: cookie.split(";")[0] ?? "" }),
  });
  assert.equal(session?.user.email, "rina@example.test");
  assert.ok(session?.session.id, "session id tersedia");

  const bad = await auth.handler(
    new Request("http://localhost:3000/api/auth/sign-in/email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "rina@example.test", password: "salah-sekali" }),
    }),
  );
  assert.equal(bad.status, 401);
});
