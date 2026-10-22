import assert from "node:assert/strict";
import { test } from "node:test";
import { createMcpHttpHandler } from "../src/index.ts";

const docsRoot = new URL("../../../docs/public", import.meta.url).pathname;

function initialize(): Request {
  return new Request("http://mcp.local/mcp", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: "Bearer rahasia",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test" } },
    }),
  });
}

test("MCP HTTP: bearer auth + initialize handshake", async () => {
  const handler = createMcpHttpHandler({ docsRoot, token: "rahasia" });
  const unauthorized = await handler(
    new Request("http://mcp.local/mcp", { method: "POST", body: "{}" }),
  );
  assert.equal(unauthorized.status, 401);

  const response = await handler(initialize());
  assert.equal(response.status, 200);
  const payload = (await response.json()) as {
    jsonrpc: string;
    result: { serverInfo: { name: string }; protocolVersion: string };
  };
  assert.equal(payload.jsonrpc, "2.0");
  assert.equal(payload.result.serverInfo.name, "ramonyx-docs");
  assert.equal(payload.result.protocolVersion, "2025-06-18");
});

test("MCP HTTP: rate limit + method/body guard", async () => {
  const handler = createMcpHttpHandler({
    docsRoot,
    token: "rahasia",
    rateLimit: { limit: 1, windowMs: 60_000, key: () => "test" },
  });
  assert.equal((await handler(new Request("http://mcp.local/mcp"))).status, 405);
  assert.equal((await handler(initialize())).status, 200);
  assert.equal((await handler(initialize())).status, 429);

  const small = createMcpHttpHandler({ docsRoot, maxBodyBytes: 10 });
  const tooLarge = await small(
    new Request("http://mcp.local/mcp", {
      method: "POST",
      headers: { "content-length": "100" },
      body: "0123456789",
    }),
  );
  assert.equal(tooLarge.status, 413);
});
