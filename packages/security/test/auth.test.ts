import assert from "node:assert/strict";
import { test } from "node:test";

import { createMemoryStore } from "@ramonyx/core";
import {
  AuthorizationError,
  createAuthorization,
  createAuthTokens,
  createKeyValueUserStore,
  createMemoryUserStore,
  type UserStore,
} from "../src/index.ts";

const stores: Array<[string, () => UserStore]> = [
  ["memory", () => createMemoryUserStore()],
  ["keyvalue", () => createKeyValueUserStore(createMemoryStore())],
];

for (const [name, makeStore] of stores) {
  test(`user store ${name}: create/get/update/delete + unique index`, async () => {
    const users = makeStore();
    const user = await users.create({
      username: " Rina ",
      email: "Rina@Example.test",
      passwordHash: "hash",
      roles: ["user"],
    });
    assert.equal(user.username, "rina");
    assert.equal(user.email, "rina@example.test");
    assert.deepEqual(await users.getById(user.id), user);
    assert.equal((await users.getByUsername("RINA"))?.id, user.id);
    assert.equal((await users.getByEmail("rina@example.test"))?.id, user.id);

    await assert.rejects(() => users.create({ username: "RINA" }), /username/);
    await assert.rejects(
      () => users.create({ username: "other", email: "rina@example.test" }),
      /email/,
    );

    const updated = await users.update(user.id, {
      username: "rina-baru",
      email: "baru@example.test",
      emailVerified: true,
    });
    assert.equal(updated?.username, "rina-baru");
    assert.equal(updated?.emailVerified, true);
    assert.equal(await users.getByUsername("rina"), null);
    assert.equal(await users.getByEmail("rina@example.test"), null);
    assert.equal((await users.getByEmail("baru@example.test"))?.id, user.id);

    assert.equal(await users.delete(user.id), true);
    assert.equal(await users.getById(user.id), null);
    assert.equal(await users.getByUsername("rina-baru"), null);
    assert.equal(await users.delete(user.id), false);
  });
}

test("auth tokens: one-time consume, purpose isolation, and TTL validation", async () => {
  const tokens = createAuthTokens({ store: createMemoryStore() });
  const token = await tokens.issue("user-1", "reset", 60);
  assert.equal(await tokens.consume(token, "verify"), null, "purpose berbeda tidak valid");
  assert.equal(await tokens.consume(token, "reset"), "user-1");
  assert.equal(await tokens.consume(token, "reset"), null, "token sekali pakai");
  await assert.rejects(() => tokens.issue("user-1", "reset", 0), /ttlSeconds/);
});

test("authorization: deny-by-default, roles + direct permissions", () => {
  const authz = createAuthorization({
    roles: {
      admin: ["user:manage", "audit:read"],
      user: ["post:read"],
    },
  });
  assert.equal(authz.can(null, "post:read"), false);
  assert.equal(authz.can({}, "post:read"), false);
  assert.equal(authz.can({ roles: ["user"] }, "post:read"), true);
  assert.equal(authz.can({ roles: ["user"] }, "user:manage"), false);
  assert.equal(authz.can({ roles: ["admin"] }, "user:manage"), true);
  assert.equal(authz.can({ permissions: ["post:write"] }, "post:write"), true);
  assert.equal(authz.can({ roles: ["user"], permissions: ["post:write"] }, "post:write"), true);
  assert.throws(() => authz.assert({ roles: ["user"] }, "user:manage"), AuthorizationError);
  try {
    authz.assert({ roles: ["user"] }, "user:manage");
  } catch (error) {
    assert.equal((error as AuthorizationError).status, 403);
  }
});

test("authorization guard: route deny-by-default + audit", async () => {
  const { authorizationGuard } = await import("../src/index.ts");
  const authz = createAuthorization({ roles: { admin: ["admin:read"] } });
  const audit: string[] = [];
  let nextCalled = 0;
  const guard = authorizationGuard({
    authorization: authz,
    permission: "admin:read",
    subject: () => ({ roles: ["user"] }),
    audit: (event) => {
      audit.push(`${event.permission}:${event.path}`);
    },
  });
  const context = {
    request: new Request("http://test.local/admin"),
    env: { get: () => undefined },
    log: { debug() {}, info() {}, warn() {}, error() {} },
  };
  const denied = await guard(context, async () => {
    nextCalled += 1;
    return new Response("ok");
  });
  assert.equal(denied.status, 403);
  assert.equal(nextCalled, 0);
  assert.deepEqual(audit, ["admin:read:/admin"]);

  const allowed = authorizationGuard({
    authorization: authz,
    permission: "admin:read",
    subject: () => ({ roles: ["admin"] }),
  });
  const response = await allowed(context, async () => {
    nextCalled += 1;
    return new Response("ok");
  });
  assert.equal(response.status, 200);
  assert.equal(nextCalled, 1);
});

test("auth tokens: consume atomik pada store dengan take", async () => {
  const tokens = createAuthTokens({ store: createMemoryStore() });
  const token = await tokens.issue("user-2", "reset", 60);
  const [a, b] = await Promise.all([
    tokens.consume(token, "reset"),
    tokens.consume(token, "reset"),
  ]);
  assert.deepEqual([a, b].sort(), [null, "user-2"]);
});

test("authorizedAction: action ditolak sebelum handler berjalan", async () => {
  const { authorizedAction } = await import("../src/index.ts");
  const authz = createAuthorization({ roles: { admin: ["user:manage"] } });
  const audits: string[] = [];
  let mutations = 0;
  const removeUser = authorizedAction(
    {
      authorization: authz,
      permission: "user:manage",
      subject: () => ({ roles: ["user"] }),
      audit: ({ permission }) => {
        audits.push(permission);
      },
    },
    async () => {
      mutations += 1;
      return "deleted";
    },
  );
  await assert.rejects(() => removeUser({}), AuthorizationError);
  assert.equal(mutations, 0);
  assert.deepEqual(audits, ["user:manage"]);

  const allowed = authorizedAction(
    {
      authorization: authz,
      permission: "user:manage",
      subject: () => ({ roles: ["admin"] }),
    },
    async () => {
      mutations += 1;
      return "deleted";
    },
  );
  assert.equal(await allowed({}), "deleted");
  assert.equal(mutations, 1);
});
