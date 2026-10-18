import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
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
    `export default function Page() {\n  return null;\n}\n`,
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
  assert.match(stdout, /src\/app\.ts\s+ada/);
  assert.match(stdout, /src\/routes\s+1 halaman/);
  assert.match(stdout, /dist\/client\s+belum dibangun/);

  // Flag --app dari direktori lain.
  const dariRoot = runCliIn(root, ["doctor", "--app", fixture]);
  assert.equal(dariRoot.code, 0);
  assert.match(dariRoot.stdout, /src\/app\.ts\s+ada/);
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
