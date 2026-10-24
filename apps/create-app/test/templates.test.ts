import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const cli = join(root, "apps", "create-app", "src", "cli.ts");
const loader = join(root, "tools", "register.mjs");
const devtoolsCli = join(root, "packages", "devtools", "src", "cli.ts");
const workDir = join(root, "apps", "create-app", ".tmp-templates");

function runCli(args: string[], allowFail = false): string {
  try {
    return execFileSync(process.execPath, ["--import", loader, cli, ...args], {
      encoding: "utf8",
    });
  } catch (error) {
    if (allowFail) {
      const failure = error as { stdout?: string; stderr?: string };
      return `${failure.stdout ?? ""}${failure.stderr ?? ""}`;
    }
    throw error;
  }
}

function scaffold(name: string, template: string): string {
  const target = join(workDir, name);
  const output = runCli([target, "--template", template]);
  assert.match(output, new RegExp(`template: ${template}`));
  return target;
}

function runNode(script: string, cwd: string): string {
  return execFileSync(process.execPath, ["--import", "@ramonyx/compiler/register", script], {
    cwd,
    encoding: "utf8",
  });
}

function runDevtools(cwd: string, args: string[]): string {
  return execFileSync(process.execPath, ["--import", loader, devtoolsCli, ...args, "--app", cwd], {
    cwd,
    encoding: "utf8",
    timeout: 240_000,
  });
}

test.beforeEach(() => {
  rmSync(workDir, { recursive: true, force: true });
  mkdirSync(workDir, { recursive: true });
});
test.after(() => {
  rmSync(workDir, { recursive: true, force: true });
});

test("CLI: daftar template, validasi nama, dan overlay", () => {
  const list = runCli(["--list-templates"]);
  for (const id of ["minimal", "api-auth", "cloudflare", "docs-blog"]) {
    assert.match(list, new RegExp(id));
  }

  const invalid = runCli([join(workDir, "salah"), "--template", "tidak-ada"], true);
  assert.match(invalid, /template tidak dikenal/);
  assert.ok(!existsSync(join(workDir, "salah")), "tidak membuat direktori untuk template salah");

  const auth = scaffold("overlay-auth", "api-auth");
  assert.ok(existsSync(join(auth, "src/lib/auth.server.ts")));
  assert.ok(existsSync(join(auth, "src/routes/api/me.ts")));
  assert.match(readFileSync(join(auth, "README.md"), "utf8"), /API auth starter/);
});

test("api-auth: build + login action, protected API, dan logout", () => {
  const target = scaffold("auth-app", "api-auth");
  const buildOutput = runDevtools(target, ["build"]);
  assert.match(buildOutput, /client bundle/);

  writeFileSync(
    join(target, "smoke.mjs"),
    `import { createApp } from "./src/app.ts";
const app = await createApp({ clientScript: "/assets/client.js" });

const home = await app(new Request("http://uji/"));
if (home.status !== 200) throw new Error("home: " + home.status);
const homeHtml = await home.text();
if (!homeHtml.includes("Sign in")) throw new Error("form login tidak ada");
const csrf = /name="_csrf" value="([^"]+)"/.exec(homeHtml)?.[1];
if (!csrf) throw new Error("csrf field hilang");
const csrfCookie = home.headers.getSetCookie()
  .find((value) => value.startsWith("ramonyx-csrf="))?.split(";")[0];
if (!csrfCookie) throw new Error("csrf cookie hilang");

const denied = await app(new Request("http://uji/api/me"));
if (denied.status !== 401) throw new Error("me tanpa cookie: " + denied.status);

const badForm = new FormData();
badForm.set("username", "demo");
badForm.set("password", "salah");
badForm.set("_csrf", csrf);
const bad = await app(new Request("http://uji/", {
  method: "POST",
  headers: { cookie: csrfCookie },
  body: badForm,
}));
if (bad.status !== 400) throw new Error("bad login: " + bad.status);
if (!(await bad.text()).includes("Invalid username or password.")) throw new Error("error login tidak tampil");

const form = new FormData();
form.set("username", "demo");
form.set("password", "demo-password-123");
form.set("_csrf", csrf);
const login = await app(new Request("http://uji/", {
  method: "POST",
  headers: { cookie: csrfCookie },
  body: form,
}));
if (login.status !== 303) throw new Error("login status: " + login.status);
const cookie = login.headers.getSetCookie()
  .find((value) => value.startsWith("ramonyx_session="))?.split(";")[0];
if (!cookie) throw new Error("session cookie hilang");
if (!login.headers.get("set-cookie")?.includes("HttpOnly")) throw new Error("cookie tidak HttpOnly");

const me = await app(new Request("http://uji/api/me", { headers: { cookie } }));
if (me.status !== 200) throw new Error("me status: " + me.status);
const profile = await me.json();
if (profile.user?.username !== "demo") throw new Error("me: " + JSON.stringify(profile));

const signedIn = await app(new Request("http://uji/", {
  headers: { cookie: cookie + "; " + csrfCookie },
}));
const html = await signedIn.text();
if (!html.includes("Signed in as")) throw new Error("state login tidak dirender");
const logoutToken = /name="_csrf" value="([^"]+)"/.exec(html)?.[1];
if (!logoutToken) throw new Error("csrf logout hilang");

const logoutForm = new FormData();
logoutForm.set("_csrf", logoutToken);
const logout = await app(new Request("http://uji/api/auth/logout", {
  method: "POST",
  headers: { cookie: cookie + "; " + csrfCookie },
  body: logoutForm,
}));
if (logout.status !== 200) throw new Error("logout: " + logout.status);
const cleared = logout.headers.get("set-cookie");
if (cleared === null || !cleared.includes("Max-Age=0")) throw new Error("cookie tidak dikosongkan");

const revoked = await app(new Request("http://uji/api/me", { headers: { cookie } }));
if (revoked.status !== 401) throw new Error("session tidak direvokasi: " + revoked.status);
console.log("AUTH TEMPLATE OK");
`,
  );
  assert.match(runNode("smoke.mjs", target), /AUTH TEMPLATE OK/);
});

test("cloudflare: build edge + R2/KV binding smoke", () => {
  const target = scaffold("cf-app", "cloudflare");
  const output = runDevtools(target, ["build", "--target", "edge"]);
  assert.match(output, /edge: .*index\.js/);
  assert.ok(existsSync(join(target, "dist/edge/index.js")));
  assert.ok(existsSync(join(target, "wrangler.toml")));

  writeFileSync(
    join(target, "edge.mjs"),
    `const mod = await import("./dist/edge/index.js");
const handler = mod.default.fetch;
const kv = new Map();
const r2 = new Map();
const env = {
  KV_STORE: {
    get: async (key) => kv.get(key) ?? null,
    put: async (key, value) => { kv.set(key, value); },
  },
  STORAGE_TOKEN: "test-storage-token-123",
  R2_BUCKET: {
    get: async (key) => {
      const value = r2.get(key);
      return value === undefined ? null : { text: async () => value, size: value.length, httpEtag: '"x"' };
    },
    put: async (key, value) => { r2.set(key, typeof value === "string" ? value : await value.text()); },
  },
};

const home = await handler(new Request("http://edge/"));
if (home.status !== 200) throw new Error("home: " + home.status);
if (!(await home.text()).includes("Files in R2")) throw new Error("halaman template salah");

const write = await handler(
  new Request("http://edge/api/storage", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer test-storage-token-123" },
    body: JSON.stringify({ key: "demo", value: "hello" }),
  }),
  env,
);
if (write.status !== 201) throw new Error("write: " + write.status);

const read = await handler(
  new Request("http://edge/api/storage?key=demo", {
    headers: { authorization: "Bearer test-storage-token-123" },
  }),
  env,
);
if (read.status !== 200) throw new Error("read: " + read.status);
const data = await read.json();
if (data.kv !== "hello" || data.r2 !== "hello") throw new Error("binding data: " + JSON.stringify(data));

const missing = await handler(
  new Request("http://edge/api/storage?key=missing", {
    headers: { authorization: "Bearer test-storage-token-123" },
  }),
  env,
);
if (missing.status !== 404) throw new Error("missing: " + missing.status);
console.log("CLOUDFLARE TEMPLATE OK");
`,
  );
  assert.match(runNode("edge.mjs", target), /CLOUDFLARE TEMPLATE OK/);
});

test("docs-blog: build static + prerendered dynamic posts", () => {
  const target = scaffold("blog-app", "docs-blog");
  const output = runDevtools(target, ["build", "--static"]);
  assert.match(output, /static:/);
  assert.ok(existsSync(join(target, "dist/static/index.html")));
  assert.ok(existsSync(join(target, "dist/static/blog/hello-ramonyx/index.html")));
  assert.ok(existsSync(join(target, "dist/static/blog/hello-ramonyx/index.html")));
  const post = readFileSync(join(target, "dist/static/blog/hello-ramonyx/index.html"), "utf8");
  assert.match(post, /A content site with no client runtime/);
  assert.match(post, /hello-ramonyx/);
  assert.ok(existsSync(join(target, "dist/static/404.html")));
});
