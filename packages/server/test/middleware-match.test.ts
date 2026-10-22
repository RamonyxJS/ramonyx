import assert from "node:assert/strict";
import { test } from "node:test";
import { matchMiddleware, withMiddleware } from "../src/index.ts";

test("matchMiddleware: exact, prefix, RegExp, function, + request replacement", async () => {
  const calls: string[] = [];
  const exact = matchMiddleware("/admin", async (_context, next) => {
    calls.push("exact");
    return next(new Request("http://x/admin?ganti=1"));
  });
  const prefix = matchMiddleware("/api/*", async (_context, next) => {
    calls.push("prefix");
    return next();
  });
  const regex = matchMiddleware(/^\/users\/\d+$/, async (_context, next) => {
    calls.push("regex");
    return next();
  });
  const fn = matchMiddleware(
    (path) => path.endsWith(".json"),
    async (_context, next) => {
      calls.push("fn");
      return next();
    },
  );

  const handler = withMiddleware(
    async (request) => Response.json({ path: new URL(request.url).pathname }),
    [exact, prefix, regex, fn],
  );
  const admin = await handler(new Request("http://x/admin"));
  assert.equal(admin.status, 200);
  assert.deepEqual(await admin.json(), { path: "/admin" });
  assert.deepEqual(calls, ["exact"]);

  calls.length = 0;
  await handler(new Request("http://x/api/users"));
  await handler(new Request("http://x/users/42"));
  await handler(new Request("http://x/data.json"));
  assert.deepEqual(calls, ["prefix", "regex", "fn"]);
});
