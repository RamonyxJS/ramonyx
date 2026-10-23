import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

// Test CLI devtools (ADR-0053) terhadap aplikasi fixture berkonsep konvensi CLI:
// `ramonyx.config.ts` + `src/app.ts` (createApp) + `src/routes`.

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const loader = join(root, "tools", "register.mjs");
const cli = join(root, "packages", "devtools", "src", "cli.ts");
const fixture = join(root, "packages", "devtools", ".tmp-test", "app");

function setupFixture(): void {
  rmSync(fixture, { recursive: true, force: true });
  mkdirSync(join(fixture, "src", "routes"), { recursive: true });
  writeFileSync(
    join(fixture, "package.json"),
    `${JSON.stringify(
      {
        name: "devtools-fixture",
        private: true,
        type: "module",
        scripts: { dev: "ramonyx dev", build: "ramonyx build", start: "ramonyx start" },
        dependencies: { ramonyx: "^1.0.0" },
      },
      null,
      2,
    )}\n`,
  );
  writeFileSync(
    join(fixture, "ramonyx.config.ts"),
    `export default { server: { port: 0 }, app: { strictValidation: false } };\n`,
  );
  writeFileSync(
    join(fixture, "src", "app.ts"),
    `import { createHandler } from "@ramonyx/server";
import { route } from "ramonyx";

export async function createApp(options?: { clientScript?: string }) {
  return createHandler({
    routes: [
      {
        method: "GET",
        path: "/",
        definition: route({
          handler: ({ json }) =>
            json({
              ok: true,
              client: options?.clientScript ?? null,
              nodeEnv: process.env.NODE_ENV ?? null,
            }),
        }),
      },
    ],
  });
}
`,
  );
  writeFileSync(
    join(fixture, "src", "routes", "page.tsx"),
    `export async function loader() {\n  return { ok: true };\n}\n\nexport default function Page() {\n  return null;\n}\n`,
  );
  mkdirSync(join(fixture, "src", "routes", "api"), { recursive: true });
  writeFileSync(
    join(fixture, "src", "routes", "api", "health.ts"),
    `import { route } from "ramonyx";\n\nexport const GET = route({\n  handler: ({ json }) => json({ ok: true }),\n});\n`,
  );
}

function runCliIn(cwd: string, args: string[]): { stdout: string; code: number } {
  try {
    const stdout = execFileSync(process.execPath, ["--import", loader, cli, ...args], {
      cwd,
      encoding: "utf8",
      timeout: 120_000,
    });
    return { stdout, code: 0 };
  } catch (error) {
    const failure = error as { stdout?: string; stderr?: string; status?: number };
    return { stdout: `${failure.stdout ?? ""}${failure.stderr ?? ""}`, code: failure.status ?? 1 };
  }
}

test.before(setupFixture);
test.after(() => {
  rmSync(fixture, { recursive: true, force: true });
});

test("help, version, dan perintah tak dikenal", () => {
  const help = runCliIn(fixture, ["help"]);
  assert.equal(help.code, 0);
  assert.match(help.stdout, /ramonyx — CLI pengembangan/);
  assert.match(help.stdout, /ramonyx dev/);

  const version = runCliIn(fixture, ["version"]);
  assert.equal(version.code, 0);
  assert.match(version.stdout.trim(), /^\d+\.\d+\.\d+$/);

  const unknown = runCliIn(fixture, ["terbang"]);
  assert.equal(unknown.code, 1);
  assert.match(unknown.stdout, /perintah tidak dikenal: terbang/);
});

test("doctor: config, app, halaman, dan dist", () => {
  const { stdout, code } = runCliIn(fixture, ["doctor"]);
  assert.equal(code, 0);
  assert.match(stdout, /ramonyx CLI\s+\d+\.\d+\.\d+/);
  assert.match(stdout, /config\s+.*ramonyx\.config\.ts.*port 0/);
  assert.match(stdout, /entry\s+src\/app\.ts/);
  assert.match(stdout, /src\/routes\s+1 halaman, 1 route API/);
  assert.match(stdout, /dist\/client\s+belum dibangun/);

  // Flag --app dari direktori lain.
  const dariRoot = runCliIn(root, ["doctor", "--app", fixture]);
  assert.equal(dariRoot.code, 0);
  assert.match(dariRoot.stdout, /entry\s+src\/app\.ts/);
});

test("doctor --json: laporan mesin stabil", () => {
  const { stdout, code } = runCliIn(fixture, ["doctor", "--json"]);
  assert.equal(code, 0);
  const report = JSON.parse(stdout) as {
    schemaVersion: number;
    ok: boolean;
    entry: { file: string; kind: string };
    routes: { pages: number; api: number };
    framework: { cli: string; node: string };
  };
  assert.equal(report.schemaVersion, 1);
  assert.equal(report.ok, true);
  assert.deepEqual(report.entry, { file: "src/app.ts", kind: "app" });
  assert.deepEqual(report.routes, { pages: 1, api: 1 });
  assert.match(report.framework.cli, /^\d+\.\d+\.\d+$/);
  assert.match(report.framework.node, /^v\d+/);
});

test("routes --json: halaman + API + loader", () => {
  const { stdout, code } = runCliIn(fixture, ["routes", "--json"]);
  assert.equal(code, 0);
  const manifest = JSON.parse(stdout) as {
    pages: Array<{ path: string; file: string; loader: boolean }>;
    api: Array<{ path: string; methods: string[]; file: string }>;
  };
  assert.equal(manifest.pages.length, 1);
  assert.equal(manifest.pages[0]?.path, "/");
  assert.equal(manifest.pages[0]?.file, "src/routes/page.tsx");
  assert.equal(manifest.pages[0]?.loader, true);
  assert.deepEqual(manifest.api, [
    {
      path: "/api/health",
      file: "src/routes/api/health.ts",
      methods: ["GET"],
      middleware: [],
    },
  ]);
});

test("check --json: sukses dan boundary violation", () => {
  const ok = runCliIn(fixture, ["check", "--json"]);
  assert.equal(ok.code, 0);
  const result = JSON.parse(ok.stdout) as {
    ok: boolean;
    diagnostics: unknown[];
    summary: { errors: number };
  };
  assert.equal(result.ok, true);
  assert.deepEqual(result.diagnostics, []);
  assert.equal(result.summary.errors, 0);

  const badDir = join(fixture, "src", "routes", "bad");
  mkdirSync(badDir, { recursive: true });
  writeFileSync(
    join(badDir, "page.tsx"),
    `import { readFile } from "node:fs/promises";\n\nexport default function Page() {\n  return readFile;\n}\n`,
  );
  try {
    const bad = runCliIn(fixture, ["check", "--json"]);
    assert.equal(bad.code, 1);
    const report = JSON.parse(bad.stdout) as {
      ok: boolean;
      diagnostics: Array<{ code: string; severity: string; file: string }>;
    };
    assert.equal(report.ok, false);
    assert.equal(report.diagnostics[0]?.code, "RMX-BUILD-1");
    assert.equal(report.diagnostics[0]?.file, "src/routes/bad/page.tsx");
  } finally {
    rmSync(badDir, { recursive: true, force: true });
  }
});

test("check: entry hilang menghasilkan RMX-APP-1", () => {
  const missing = join(fixture, ".tmp-missing-app");
  rmSync(missing, { recursive: true, force: true });
  mkdirSync(join(missing, "src", "routes"), { recursive: true });
  writeFileSync(join(missing, "ramonyx.config.ts"), `export default {};\n`);
  try {
    const { stdout, code } = runCliIn(root, ["check", "--json", "--app", missing]);
    assert.equal(code, 1);
    const report = JSON.parse(stdout) as {
      diagnostics: Array<{ code: string; file: string }>;
    };
    assert.equal(report.diagnostics[0]?.code, "RMX-APP-1");
    assert.equal(report.diagnostics[0]?.file, "src/app.ts");
  } finally {
    rmSync(missing, { recursive: true, force: true });
  }
});

test("ai init/sync: AGENTS.md kanonik, adapter tipis, MCP dipin ke versi proyek", () => {
  const init = runCliIn(fixture, ["ai", "init", "--json"]);
  assert.equal(init.code, 0);
  const result = JSON.parse(init.stdout) as {
    schemaVersion: number;
    ok: boolean;
    mcp: { package: string; version: string; command: string[] };
    files: Array<{ path: string; action: string }>;
  };
  assert.equal(result.schemaVersion, 1);
  assert.equal(result.ok, true);
  assert.equal(result.mcp.package, "@ramonyx/mcp-docs-server");
  assert.equal(result.mcp.version, "1.0.0");
  assert.ok(result.mcp.command.join(" ").includes("@ramonyx/mcp-docs-server@1.0.0"));
  const actions = new Map(result.files.map((file) => [file.path, file.action]));
  for (const path of [
    "AGENTS.md",
    "CLAUDE.md",
    ".cursor/rules/ramonyx.mdc",
    ".github/copilot-instructions.md",
    ".opencode/skills/ramonyx/SKILL.md",
    ".mcp.json",
    "opencode.json",
  ]) {
    assert.match(actions.get(path) ?? "", /created/, `${path} harus dibuat`);
  }

  const agents = readFileSync(join(fixture, "AGENTS.md"), "utf8");
  assert.match(agents, /<!-- ramonyx:ai:start -->/);
  assert.match(agents, /`\/api\/health`/);
  assert.match(agents, /`\/`/);
  assert.match(agents, /ramonyx check --json/);

  const mcp = JSON.parse(readFileSync(join(fixture, ".mcp.json"), "utf8")) as {
    mcpServers: { ramonyx: { command: string; args: string[] } };
  };
  assert.equal(mcp.mcpServers.ramonyx.command, "npx");
  assert.ok(mcp.mcpServers.ramonyx.args.includes("@ramonyx/mcp-docs-server@1.0.0"));
  assert.deepEqual(mcp.mcpServers.ramonyx.args.slice(-2), ["--app", "."]);

  const opencode = JSON.parse(readFileSync(join(fixture, "opencode.json"), "utf8")) as {
    $schema: string;
    mcp: { ramonyx: { type: string; command: string[] } };
  };
  assert.equal(opencode.$schema, "https://opencode.ai/config.json");
  assert.equal(opencode.mcp.ramonyx.type, "local");

  const sync = runCliIn(fixture, ["ai", "sync", "--json"]);
  assert.equal(sync.code, 0);
  const synced = JSON.parse(sync.stdout) as { ok: boolean; files: Array<{ action: string }> };
  assert.equal(synced.ok, true);
  assert.ok(synced.files.every((file) => file.action === "unchanged"));

  // Package manager terdeteksi dari lockfile: perintah agen memakai bunx/bun, bukan PATH global.
  writeFileSync(join(fixture, "bun.lock"), "\n");
  const bunSync = runCliIn(fixture, ["ai", "sync", "--json"]);
  assert.equal(bunSync.code, 0);
  const bunAgents = readFileSync(join(fixture, "AGENTS.md"), "utf8");
  assert.match(bunAgents, /bun run dev/);
  assert.match(bunAgents, /bunx ramonyx check --json/);

  // Berkas pengguna tanpa marker tidak ditimpa tanpa --force.
  writeFileSync(join(fixture, "AGENTS.md"), "# My custom agent guide\n");
  const protectedSync = runCliIn(fixture, ["ai", "sync", "--json"]);
  assert.equal(protectedSync.code, 1);
  const protectedResult = JSON.parse(protectedSync.stdout) as {
    ok: boolean;
    files: Array<{ path: string; action: string; reason?: string }>;
  };
  assert.equal(protectedResult.ok, false);
  const agentsResult = protectedResult.files.find((file) => file.path === "AGENTS.md");
  assert.equal(agentsResult?.action, "skipped");
  assert.match(agentsResult?.reason ?? "", /--force/);
});

test("start: server produksi + NODE_ENV + clientScript", async () => {
  const child = spawn(process.execPath, ["--import", loader, cli, "start"], {
    cwd: fixture,
    stdio: ["ignore", "pipe", "pipe"],
  });

  let output = "";
  try {
    const url = await new Promise<string>((resolveUrl, rejectUrl) => {
      const timer = setTimeout(() => rejectUrl(new Error(`server tidak siap:\n${output}`)), 15_000);
      const onData = (chunk: Buffer): void => {
        output += String(chunk);
        const match = /(http:\/\/[^\s]+)/.exec(output);
        if (match !== null) {
          clearTimeout(timer);
          resolveUrl(match[1] as string);
        }
      };
      child.stdout?.on("data", onData);
      child.stderr?.on("data", onData);
      child.on("exit", (code) => {
        clearTimeout(timer);
        rejectUrl(new Error(`CLI keluar (${code}):\n${output}`));
      });
    });

    const response = await fetch(url);
    const payload = (await response.json()) as {
      ok: boolean;
      client: string;
      nodeEnv: string;
    };
    assert.equal(payload.ok, true);
    assert.equal(payload.client, "/assets/client.js", "CLI mengirim clientScript produksi");
    assert.equal(payload.nodeEnv, "production", "CLI men-set NODE_ENV=production");
  } finally {
    child.kill("SIGTERM");
    await new Promise((done) => {
      child.once("exit", done);
      setTimeout(done, 3_000).unref();
    });
  }
});
