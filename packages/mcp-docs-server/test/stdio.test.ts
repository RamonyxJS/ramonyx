// Test stdio end-to-end (ADR-0078): bin `ramonyx-mcp-docs` dijalankan sebagai proses nyata,
// berbicara JSON-RPC lewat stdin/stdout terhadap docs repo — persis seperti klien MCP.

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const cli = join(root, "packages", "mcp-docs-server", "src", "cli.ts");
const loader = join(root, "tools", "register.mjs");
const docsRepo = join(root, "docs", "public");

interface Pesan {
  id?: unknown;
  result?: Record<string, unknown>;
  error?: { code: number; message: string };
}

function tunggu(ms: number): Promise<void> {
  return new Promise((resolveTunggu) => setTimeout(resolveTunggu, ms));
}

test("bin ramonyx-mcp-docs: handshake + tools/list + tools/call + resources lewat stdio", async () => {
  const child = spawn(process.execPath, ["--import", loader, cli, "--docs", docsRepo], {
    cwd: root,
    stdio: ["pipe", "pipe", "pipe"],
  });

  const pesan: Pesan[] = [];
  let stderr = "";
  let buffer = "";
  child.stdout.on("data", (chunk: Buffer) => {
    buffer += chunk.toString("utf8");
    let index = buffer.indexOf("\n");
    while (index >= 0) {
      const line = buffer.slice(0, index).trim();
      buffer = buffer.slice(index + 1);
      if (line.length > 0) {
        pesan.push(JSON.parse(line) as Pesan);
      }
      index = buffer.indexOf("\n");
    }
  });
  child.stderr.on("data", (chunk: Buffer) => {
    stderr += chunk.toString("utf8");
  });

  const kirim = (msg: unknown): void => {
    child.stdin.write(`${JSON.stringify(msg)}\n`);
  };

  try {
    kirim({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "uji", version: "1" },
      },
    });
    kirim({ jsonrpc: "2.0", method: "notifications/initialized" });
    kirim({ jsonrpc: "2.0", id: 2, method: "tools/list" });
    kirim({
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "search_docs", arguments: { query: "ADR-0078" } },
    });
    kirim({
      jsonrpc: "2.0",
      id: 4,
      method: "resources/read",
      params: { uri: "ramonyx://machine/stats" },
    });

    const batas = Date.now() + 30_000;
    while (pesan.length < 4 && Date.now() < batas) {
      await tunggu(50);
    }
    assert.equal(pesan.length, 4, `harus 4 respons (notifikasi diabaikan); stderr: ${stderr}`);
    child.stdin.end();
    const kodeKeluar = await new Promise<number | null>((resolveKeluar) => {
      child.once("exit", (kode) => resolveKeluar(kode));
    });
    assert.equal(kodeKeluar, 0, `bin harus keluar 0; stderr: ${stderr}`);

    const init = pesan[0]?.result as { serverInfo: { name: string } };
    assert.equal(init.serverInfo.name, "ramonyx-docs");

    const responsTools = pesan[1];
    assert.ok(responsTools?.result !== undefined, "respons tools/list ada");
    const tools = (responsTools.result as { tools: { name: string }[] }).tools;
    assert.ok(tools.length >= 3);
    assert.ok(tools.some((tool) => tool.name === "get_feature_status"));

    const cari = pesan[2]?.result as { content: { text: string }[] };
    assert.match(cari.content[0]?.text ?? "", /adr\/0078/, "search_docs menemukan ADR-0078");

    const stats = pesan[3]?.result as { contents: { text: string }[] };
    const data = JSON.parse(stats.contents[0]?.text ?? "{}") as { packages?: { npm?: number } };
    assert.equal(typeof data.packages?.npm, "number", "stats.json repo terbaca");
  } finally {
    if (child.exitCode === null) {
      child.kill("SIGTERM");
    }
  }
});

test("bin ramonyx-mcp-docs: --help dan --version", async () => {
  const jalankan = (args: string[]): Promise<{ kode: number | null; stdout: string }> =>
    new Promise((resolveJalan) => {
      const child = spawn(process.execPath, ["--import", loader, cli, ...args], { cwd: root });
      let stdout = "";
      child.stdout.on("data", (chunk: Buffer) => {
        stdout += chunk.toString("utf8");
      });
      child.once("exit", (kode) => resolveJalan({ kode, stdout }));
    });

  const bantuan = await jalankan(["--help"]);
  assert.equal(bantuan.kode, 0);
  assert.match(bantuan.stdout, /ramonyx-mcp-docs/);
  assert.match(bantuan.stdout, /search_docs/);

  const versi = await jalankan(["--version"]);
  assert.equal(versi.kode, 0);
  assert.match(versi.stdout.trim(), /^\d+\.\d+\.\d+$/);
});
