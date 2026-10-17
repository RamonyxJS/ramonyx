import assert from "node:assert/strict";
import { test } from "node:test";
import { createTestServerFromHandler } from "@ramonyx/testing";
import type { Logger } from "ramonyx";
import { resolveConfig } from "ramonyx";
import config from "../ramonyx.config.ts";
import { createApp } from "../src/app.ts";

function collectingLogger(): {
  logger: Logger;
  lines: { level: string; message: string; data?: Record<string, unknown> }[];
} {
  const lines: { level: string; message: string; data?: Record<string, unknown> }[] = [];
  const push = (level: string) => (message: string, data?: Record<string, unknown>) => {
    lines.push(data === undefined ? { level, message } : { level, message, data });
  };
  return {
    logger: { debug: push("debug"), info: push("info"), warn: push("warn"), error: push("error") },
    lines,
  };
}

const knownUserId = "3fa85f64-5717-4562-b3fc-2c963f66afa6";

test("playground end-to-end lewat file routing + createTestServer", async () => {
  const { logger, lines } = collectingLogger();
  const resolved = resolveConfig(config);
  const app = await createApp({ logger, strictValidation: resolved.app.strictValidation });
  const server = await createTestServerFromHandler(app);

  try {
    const hello = await server.fetch("/api/hello");
    assert.equal(hello.status, 200);
    assert.deepEqual(await hello.json(), { message: "Hello from Ramonyx" });

    const user = await server.fetch(`/api/users/${knownUserId}`);
    assert.equal(user.status, 200);
    const userBody = (await user.json()) as { user: { name: string } };
    assert.equal(userBody.user.name, "Rina");

    const missing = await server.fetch("/api/users/9c858901-8a57-4791-81fe-4c455b000000");
    assert.equal(missing.status, 404);

    const invalid = await server.fetch("/api/users/bukan-uuid");
    assert.equal(invalid.status, 400);

    const unknownPath = await server.fetch("/api/tidak-ada");
    assert.equal(unknownPath.status, 404);

    const wrongMethod = await server.fetch("/api/hello", { method: "POST" });
    assert.equal(wrongMethod.status, 405);
    assert.equal(wrongMethod.headers.get("allow"), "GET");

    const requestLogs = lines.filter((line) => line.message === "request");
    assert.equal(requestLogs.length, 6);
    for (const log of requestLogs) {
      assert.equal(typeof log.data?.status, "number");
    }
  } finally {
    await server.close();
  }
});
