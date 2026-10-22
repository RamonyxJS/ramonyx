import assert from "node:assert/strict";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { test } from "node:test";

import { createMemoryStore } from "@ramonyx/core";
import {
  createAuthTokens,
  createMemoryUserStore,
  hashPassword,
  verifyPassword,
} from "../src/index.ts";

async function body(request: IncomingMessage): Promise<URLSearchParams> {
  let raw = "";
  for await (const chunk of request) {
    raw += String(chunk);
  }
  return new URLSearchParams(raw);
}

function json(response: ServerResponse, status: number, payload: unknown, headers = {}): void {
  response.writeHead(status, { "content-type": "application/json", ...headers });
  response.end(JSON.stringify(payload));
}

test("auth flow via HTTP: generic reset request, one-time token, new password", async () => {
  const users = createMemoryUserStore();
  const tokens = createAuthTokens({ store: createMemoryStore() });
  await users.create({
    username: "rina",
    email: "rina@example.test",
    passwordHash: await hashPassword("password-lama", { iterations: 1_000 }),
  });

  const server = createServer(async (request, response) => {
    try {
      if (request.method !== "POST") {
        json(response, 404, { error: "not found" });
        return;
      }
      const form = await body(request);
      if (request.url === "/forgot") {
        const user = await users.getByEmail(form.get("email") ?? "");
        if (user !== null) {
          const token = await tokens.issue(user.id, "reset", 60);
          // Hanya test yang mengembalikan token; produksi harus mengirim lewat email.
          json(response, 200, { ok: true }, { "x-test-reset-token": token });
        } else {
          json(response, 200, { ok: true });
        }
        return;
      }
      if (request.url === "/verify/request") {
        const user = await users.getByEmail(form.get("email") ?? "");
        if (user !== null) {
          const token = await tokens.issue(user.id, "verify", 60);
          json(response, 200, { ok: true }, { "x-test-verify-token": token });
        } else {
          json(response, 200, { ok: true });
        }
        return;
      }
      if (request.url === "/verify") {
        const userId = await tokens.consume(form.get("token") ?? "", "verify");
        if (userId === null) {
          json(response, 400, { error: "invalid token" });
          return;
        }
        await users.update(userId, { emailVerified: true });
        json(response, 200, { ok: true });
        return;
      }
      if (request.url === "/reset") {
        const userId = await tokens.consume(form.get("token") ?? "", "reset");
        const next = form.get("password") ?? "";
        if (userId === null || next.length < 8) {
          json(response, 400, { error: "invalid token or password" });
          return;
        }
        await users.update(userId, {
          passwordHash: await hashPassword(next, { iterations: 1_000 }),
        });
        json(response, 200, { ok: true });
        return;
      }
      if (request.url === "/login") {
        const user = await users.getByUsername(form.get("username") ?? "");
        const ok =
          user?.passwordHash !== undefined &&
          (await verifyPassword(form.get("password") ?? "", user.passwordHash));
        json(response, ok ? 200 : 401, { ok });
        return;
      }
      json(response, 404, { error: "not found" });
    } catch {
      json(response, 500, { error: "internal" });
    }
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const base =
    typeof address === "object" && address !== null
      ? `http://127.0.0.1:${address.port}`
      : "http://127.0.0.1";
  try {
    const unknown = await fetch(`${base}/forgot`, {
      method: "POST",
      body: new URLSearchParams({ email: "tidak@example.test" }),
    });
    assert.equal(unknown.status, 200);
    assert.equal(unknown.headers.get("x-test-reset-token"), null, "respons generik");

    const forgot = await fetch(`${base}/forgot`, {
      method: "POST",
      body: new URLSearchParams({ email: "rina@example.test" }),
    });
    const token = forgot.headers.get("x-test-reset-token");
    assert.ok(token);

    const reset = await fetch(`${base}/reset`, {
      method: "POST",
      body: new URLSearchParams({ token, password: "password-baru" }),
    });
    assert.equal(reset.status, 200);

    const reused = await fetch(`${base}/reset`, {
      method: "POST",
      body: new URLSearchParams({ token, password: "password-lain" }),
    });
    assert.equal(reused.status, 400, "token sekali pakai");

    const login = await fetch(`${base}/login`, {
      method: "POST",
      body: new URLSearchParams({ username: "rina", password: "password-baru" }),
    });
    assert.equal(login.status, 200, "password baru berlaku");
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("auth flow via HTTP: email verification token is one-time", async () => {
  const users = createMemoryUserStore();
  const tokens = createAuthTokens({ store: createMemoryStore() });
  const user = await users.create({ username: "budi", email: "budi@example.test" });
  const server = createServer(async (request, response) => {
    if (request.method !== "POST" || request.url !== "/verify") {
      json(response, 404, { error: "not found" });
      return;
    }
    const form = await body(request);
    const userId = await tokens.consume(form.get("token") ?? "", "verify");
    if (userId === null) {
      json(response, 400, { error: "invalid token" });
      return;
    }
    await users.update(userId, { emailVerified: true });
    json(response, 200, { ok: true });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const base =
    typeof address === "object" && address !== null
      ? `http://127.0.0.1:${address.port}`
      : "http://127.0.0.1";
  try {
    const token = await tokens.issue(user.id, "verify", 60);
    const first = await fetch(`${base}/verify`, {
      method: "POST",
      body: new URLSearchParams({ token }),
    });
    assert.equal(first.status, 200);
    assert.equal((await users.getById(user.id))?.emailVerified, true);
    const second = await fetch(`${base}/verify`, {
      method: "POST",
      body: new URLSearchParams({ token }),
    });
    assert.equal(second.status, 400);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("auth token endpoints can share rateLimit middleware", async () => {
  const { rateLimit } = await import("../src/index.ts");
  const limiter = rateLimit({ limit: 2, windowMs: 60_000 });
  const context = {
    request: new Request("http://test.local/forgot"),
    env: { get: () => undefined },
    log: { debug() {}, info() {}, warn() {}, error() {} },
  };
  let calls = 0;
  const run = () =>
    limiter(context, async () => {
      calls += 1;
      return new Response("ok");
    });
  assert.equal((await run()).status, 200);
  assert.equal((await run()).status, 200);
  assert.equal((await run()).status, 429);
  assert.equal(calls, 2);
});
