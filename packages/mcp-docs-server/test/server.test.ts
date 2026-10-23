// Test protokol MCP docs server (ADR-0078): handshake, tools (≥3), resources, error JSON-RPC,
// notifikasi tanpa respons, dan runner stdio dengan stream in-memory.

import assert from "node:assert/strict";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { createMcpServer, type McpServer, resolveDocsRoot, runStdioServer } from "../src/index.ts";

const fixtures = join(dirname(fileURLToPath(import.meta.url)), "fixtures", "docs");
const appFixture = join(dirname(fileURLToPath(import.meta.url)), "fixtures", "app");

function server(): McpServer {
  return createMcpServer({ docsRoot: fixtures, version: "9.9.9" });
}

function projectServer(): McpServer {
  return createMcpServer({ docsRoot: fixtures, version: "9.9.9", appRoot: appFixture });
}

function kirim(mcp: McpServer, msg: unknown): Record<string, unknown> {
  const line = mcp.handleLine(JSON.stringify(msg));
  assert.ok(line !== null, "harus ada respons");
  return JSON.parse(line) as Record<string, unknown>;
}

function hasilTool(
  mcp: McpServer,
  name: string,
  args: Record<string, unknown>,
): Record<string, unknown> {
  const respons = kirim(mcp, {
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: { name, arguments: args },
  });
  assert.ok(
    respons.result !== undefined,
    `tools/call ${name} harus sukses: ${JSON.stringify(respons)}`,
  );
  return respons.result as Record<string, unknown>;
}

function teksDari(result: Record<string, unknown>): string {
  const content = result.content as { type: string; text: string }[];
  return content.map((bagian) => bagian.text).join("\n");
}

test("initialize: handshake echo versi klien + capabilities + instructions", () => {
  const respons = kirim(server(), {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "uji", version: "1" },
    },
  });
  const result = respons.result as Record<string, unknown>;
  assert.equal(result.protocolVersion, "2025-06-18");
  const info = result.serverInfo as Record<string, unknown>;
  assert.equal(info.name, "ramonyx-docs");
  assert.equal(info.version, "9.9.9");
  const capabilities = result.capabilities as Record<string, unknown>;
  assert.ok("tools" in capabilities && "resources" in capabilities);
  assert.match(String(result.instructions), /search_docs/);
});

test("tools/list: ≥3 tools dengan inputSchema valid", () => {
  const respons = kirim(server(), { jsonrpc: "2.0", id: 2, method: "tools/list" });
  const tools = (
    respons.result as { tools: { name: string; inputSchema: Record<string, unknown> }[] }
  ).tools;
  assert.ok(tools.length >= 3, `harus ≥3 tools, dapat ${tools.length}`);
  const names = tools.map((tool) => tool.name).sort();
  assert.deepEqual(names, [
    "get_feature_status",
    "get_page",
    "get_rules",
    "list_adrs",
    "search_docs",
  ]);
  for (const tool of tools) {
    assert.equal(tool.inputSchema.type, "object");
    assert.ok(tool.inputSchema.properties !== undefined);
  }
});

test("search_docs: judul diprioritaskan + excerpt; get_page mengembalikan markdown", () => {
  const mcp = server();
  const cari = hasilTool(mcp, "search_docs", { query: "tutorial" });
  const teks = teksDari(cari);
  assert.match(teks, /tutorial/);
  const results = (cari.structuredContent as { results: { slug: string }[] }).results;
  assert.equal(results[0]?.slug, "tutorial", "judul cocok harus di peringkat atas");

  const halaman = hasilTool(mcp, "get_page", { slug: "tutorial" });
  assert.match(teksDari(halaman), /^# Tutorial/);
  assert.match(teksDari(halaman), /hydration/);
});

test("search_docs: tanpa hasil tetap sukses; isi dokumen ikut dicari", () => {
  const mcp = server();
  const kosong = hasilTool(mcp, "search_docs", { query: "zzz-tidak-ada" });
  assert.match(teksDari(kosong), /Tidak ada halaman/);

  const isi = hasilTool(mcp, "search_docs", { query: "hydration" });
  const results = (isi.structuredContent as { results: { slug: string }[] }).results;
  assert.ok(
    results.some((hit) => hit.slug === "tutorial"),
    "cocok dari isi dokumen",
  );
});

test("get_feature_status: match id/status + batasan; slug halaman tak ada → isError", () => {
  const mcp = server();
  const fitur = hasilTool(mcp, "get_feature_status", { query: "revalidate" });
  const data = fitur.structuredContent as {
    features: { id: string; status: string; since: string }[];
  };
  assert.equal(data.features[0]?.id, "revalidate");
  assert.equal(data.features[0]?.status, "implemented");
  assert.equal(data.features[0]?.since, "0.2.0");

  const planned = hasilTool(mcp, "get_feature_status", { query: "planned" });
  assert.match(teksDari(planned), /i18n/);

  const hilang = hasilTool(mcp, "get_page", { slug: "tidak/ada" });
  assert.equal(hilang.isError, true);
  assert.match(teksDari(hilang), /search_docs/);
});

test("get_rules: filter scope; list_adrs: filter query", () => {
  const mcp = server();
  const aturan = hasilTool(mcp, "get_rules", {});
  assert.match(teksDari(aturan), /erasable-syntax/);
  assert.match(teksDari(aturan), /Penegakan/);

  const scopeKosong = hasilTool(mcp, "get_rules", { scope: "app" });
  assert.equal(scopeKosong.isError, true);

  const adrs = hasilTool(mcp, "list_adrs", {});
  assert.match(teksDari(adrs), /ADR-0001/);
  const adrFilter = hasilTool(mcp, "list_adrs", { query: "contoh" });
  assert.match(teksDari(adrFilter), /Contoh keputusan/);
});

test("error protokol: tool tak dikenal -32602, method tak dikenal -32601, parse -32700", () => {
  const mcp = server();
  const tool = kirim(mcp, {
    jsonrpc: "2.0",
    id: 3,
    method: "tools/call",
    params: { name: "tidak-ada", arguments: {} },
  });
  assert.equal((tool.error as { code: number }).code, -32602);

  const method = kirim(mcp, { jsonrpc: "2.0", id: 4, method: "sampling/createMessage" });
  assert.equal((method.error as { code: number }).code, -32601);

  const parse = mcp.handleLine("{bukan json");
  assert.ok(parse !== null);
  assert.equal((JSON.parse(parse) as { error: { code: number } }).error.code, -32700);

  const batch = kirim(mcp, [{ jsonrpc: "2.0", id: 5, method: "ping" }]);
  assert.equal((batch.error as { code: number }).code, -32600);
});

test("notifikasi tanpa id tidak dibalas; ping & logging/setLevel sukses", () => {
  const mcp = server();
  assert.equal(
    mcp.handleLine(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })),
    null,
  );
  assert.equal(mcp.handleLine(JSON.stringify({ jsonrpc: "2.0", method: "tidak/dikenal" })), null);
  const ping = kirim(mcp, { jsonrpc: "2.0", id: 6, method: "ping" });
  assert.deepEqual(ping.result, {});
  const logging = kirim(mcp, {
    jsonrpc: "2.0",
    id: 7,
    method: "logging/setLevel",
    params: { level: "debug" },
  });
  assert.deepEqual(logging.result, {});
});

test("resources: list memuat machine + halaman; read machine JSON & markdown; uri salah → error", () => {
  const mcp = server();
  const list = kirim(mcp, { jsonrpc: "2.0", id: 8, method: "resources/list" });
  const resources = (list.result as { resources: { uri: string; mimeType: string }[] }).resources;
  const uris = resources.map((resource) => resource.uri);
  assert.ok(uris.includes("ramonyx://machine/stats"));
  assert.ok(uris.includes("ramonyx://docs/tutorial"));
  assert.ok(uris.includes("ramonyx://docs/adr/0001-contoh"));
  const stats = resources.find((resource) => resource.uri === "ramonyx://machine/stats");
  assert.equal(stats?.mimeType, "application/json");

  const bacaStats = kirim(mcp, {
    jsonrpc: "2.0",
    id: 9,
    method: "resources/read",
    params: { uri: "ramonyx://machine/stats" },
  });
  const contents = (bacaStats.result as { contents: { text: string; mimeType: string }[] })
    .contents;
  assert.equal(contents[0]?.mimeType, "application/json");
  assert.match(contents[0]?.text ?? "", /9\.9\.9/);

  const bacaHalaman = kirim(mcp, {
    jsonrpc: "2.0",
    id: 10,
    method: "resources/read",
    params: { uri: "ramonyx://docs/tutorial" },
  });
  assert.match(
    (bacaHalaman.result as { contents: { text: string }[] }).contents[0]?.text ?? "",
    /# Tutorial/,
  );

  const salah = kirim(mcp, {
    jsonrpc: "2.0",
    id: 11,
    method: "resources/read",
    params: { uri: "ramonyx://lain/x" },
  });
  assert.equal((salah.error as { code: number }).code, -32602);

  const templates = kirim(mcp, { jsonrpc: "2.0", id: 12, method: "resources/templates/list" });
  assert.deepEqual(templates.result, { resourceTemplates: [] });
});

test("mode proyek: tools statis, route manifest, detail route, recipe, API search", () => {
  const mcp = projectServer();
  const list = kirim(mcp, { jsonrpc: "2.0", id: 20, method: "tools/list" });
  const names = (list.result as { tools: { name: string }[] }).tools
    .map((tool) => tool.name)
    .sort();
  assert.deepEqual(names, [
    "get_feature_status",
    "get_page",
    "get_project_context",
    "get_recipe",
    "get_route",
    "get_rules",
    "list_adrs",
    "list_routes",
    "search_api",
    "search_docs",
  ]);

  const context = hasilTool(mcp, "get_project_context", {});
  const data = context.structuredContent as {
    entry: string;
    configFile: string;
    pages: { path: string }[];
    api: { path: string }[];
    warnings: string[];
  };
  assert.equal(data.entry, "src/app.ts");
  assert.equal(data.configFile, "ramonyx.config.ts");
  assert.deepEqual(
    data.pages.map((page) => page.path),
    ["/", "/about", "/blog/[slug]"],
  );
  assert.deepEqual(
    data.api.map((route) => route.path),
    ["/api/health", "/api/users/[id]"],
  );
  assert.deepEqual(data.warnings, []);

  const routes = hasilTool(mcp, "list_routes", { query: "health" });
  assert.match(teksDari(routes), /\/api\/health/);
  assert.doesNotMatch(teksDari(routes), /\/blog/);

  const blog = hasilTool(mcp, "get_route", { path: "blog/[slug]" });
  const blogData = blog.structuredContent as {
    routes: { file: string; loader: boolean; layouts: string[]; middleware: string[] }[];
  };
  assert.equal(blogData.routes[0]?.file, "src/routes/blog/[slug]/page.tsx");
  assert.equal(blogData.routes[0]?.loader, true);
  assert.deepEqual(blogData.routes[0]?.layouts, ["src/routes/layout.tsx"]);
  assert.deepEqual(blogData.routes[0]?.middleware, ["src/routes/middleware.ts"]);

  const api = hasilTool(mcp, "get_route", { path: "/api/health", kind: "api" });
  assert.match(teksDari(api), /GET, POST/);

  const missing = hasilTool(mcp, "get_route", { path: "/missing" });
  assert.equal(missing.isError, true);
  assert.match(teksDari(missing), /list_routes/);

  const recipe = hasilTool(mcp, "get_recipe", { id: "page-loader" });
  assert.match(teksDari(recipe), /Add a page with a loader/);
  const recipeSearch = hasilTool(mcp, "get_recipe", { query: "loader" });
  assert.match(teksDari(recipeSearch), /src\/routes\/page\.tsx/);

  const symbols = hasilTool(mcp, "search_api", { query: "createHandler" });
  const apiData = symbols.structuredContent as {
    results: { name: string; package: string; kind: string }[];
  };
  assert.deepEqual(apiData.results[0], {
    package: "@ramonyx/server",
    name: "createHandler",
    kind: "value",
    source: "packages/server/src/index.ts",
    version: "9.9.9",
  });
});

test("mode proyek: resource manifest + server tanpa --app tetap docs-only", () => {
  const mcp = projectServer();
  const list = kirim(mcp, { jsonrpc: "2.0", id: 21, method: "resources/list" });
  const uris = (list.result as { resources: { uri: string }[] }).resources.map(
    (resource) => resource.uri,
  );
  assert.ok(uris.includes("ramonyx://project/manifest"));

  const manifest = kirim(mcp, {
    jsonrpc: "2.0",
    id: 22,
    method: "resources/read",
    params: { uri: "ramonyx://project/manifest" },
  });
  const text = (manifest.result as { contents: { text: string }[] }).contents[0]?.text ?? "";
  assert.match(text, /mcp-project-fixture/);
  assert.match(text, /src\/routes\/api\/health\.ts/);

  const docsOnly = server();
  assert.equal(docsOnly.project, undefined);
  assert.equal(docsOnly.tools.length, 5);
});

test("runStdioServer: baris diproses berurutan, notifikasi tanpa output, sisa buffer di-flush", async () => {
  const keluaran: string[] = [];
  const input = [
    `${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } })}\n`,
    `${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`,
    `${JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" })}`,
  ];
  await runStdioServer({
    docsRoot: fixtures,
    input: (async function* () {
      for (const chunk of input) {
        yield chunk;
      }
    })(),
    output: { write: (chunk: string) => keluaran.push(chunk) },
  });

  assert.equal(keluaran.length, 2, "initialize + tools/list (notifikasi tidak dibalas)");
  const pertama = JSON.parse(keluaran[0] ?? "") as { result: { serverInfo: { name: string } } };
  assert.equal(pertama.result.serverInfo.name, "ramonyx-docs");
  const kedua = JSON.parse(keluaran[1] ?? "") as { result: { tools: unknown[] } };
  assert.ok(kedua.result.tools.length >= 3);
});

test("resolveDocsRoot: eksplisit (docs atau root), naik dari cwd, dan pesan jelas saat gagal", () => {
  assert.equal(resolveDocsRoot({ explicit: fixtures }), fixtures);
  const akarRepo = resolve(fixtures, "..");
  assert.equal(resolveDocsRoot({ explicit: akarRepo }), fixtures);
  assert.equal(resolveDocsRoot({ cwd: join(fixtures, "adr") }), fixtures);
  assert.throws(() => resolveDocsRoot({ explicit: join(fixtures, "adr") }), /machine\/stats\.json/);
});
