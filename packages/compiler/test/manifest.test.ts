import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { createRouteManifest, RouteManifestError } from "../src/index.ts";

async function withTempRoutes(run: (dir: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "ramonyx-routes-"));
  try {
    await mkdir(join(root, "api"), { recursive: true });
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function writeFixture(root: string, relativePath: string, content: string): Promise<void> {
  const target = join(root, relativePath);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, content);
}

const plainGet = `export const GET = { handler: () => new Response("ok") };`;

test("memetakan file ke path: statis, index, parameter, bertingkat", async () => {
  await withTempRoutes(async (root) => {
    await writeFixture(root, "api/hello.ts", plainGet);
    await writeFixture(root, "api/users/index.ts", plainGet);
    await writeFixture(
      root,
      "api/users/[id].ts",
      `export const POST = { handler: () => new Response("ok") };`,
    );
    await writeFixture(root, "api/files/[dir]/[name].ts", plainGet);

    const entries = await createRouteManifest({ dir: root });
    const summary = entries.map((entry) => `${entry.method} ${entry.path}`).sort();
    assert.deepEqual(summary, [
      "GET /api/files/[dir]/[name]",
      "GET /api/hello",
      "GET /api/users",
      "POST /api/users/[id]",
    ]);
  });
});

test("satu file boleh mengekspor beberapa method", async () => {
  await withTempRoutes(async (root) => {
    await writeFixture(
      root,
      "api/users.ts",
      `export const GET = { handler: () => new Response("ok") };\nexport const POST = { handler: () => new Response("ok") };`,
    );

    const entries = await createRouteManifest({ dir: root });
    const summary = entries.map((entry) => `${entry.method} ${entry.path}`).sort();
    assert.deepEqual(summary, ["GET /api/users", "POST /api/users"]);
  });
});

test("mengabaikan: prefix _, luar api/, .d.ts, non-ts, file di direktori _", async () => {
  await withTempRoutes(async (root) => {
    await writeFixture(root, "api/hello.ts", plainGet);
    await writeFixture(root, "api/_helpers.ts", "export const apa = 1;");
    await writeFixture(root, "api/_internal/tidak-dipindai.ts", "export const apa = 1;");
    await writeFixture(root, "api/tipe.d.ts", "export declare const GET: unknown;");
    await writeFixture(root, "api/catatan.md", "# catatan");
    await writeFixture(root, "pages/page.ts", "export const apa = 1;");
    await writeFixture(root, "tidak-relevan.ts", "export const apa = 1;");

    const entries = await createRouteManifest({ dir: root });
    const summary = entries.map((entry) => `${entry.method} ${entry.path}`).sort();
    assert.deepEqual(summary, ["GET /api/hello"]);
  });
});

test("file api tanpa ekspor HTTP method → error jelas", async () => {
  await withTempRoutes(async (root) => {
    await writeFixture(root, "api/broken.ts", "export const handler = 1;");
    await assert.rejects(
      createRouteManifest({ dir: root }),
      (error: unknown) =>
        error instanceof RouteManifestError && /tidak mengekspor HTTP method/.test(error.message),
    );
  });
});

test("ekspor method yang bukan definisi route → error jelas", async () => {
  await withTempRoutes(async (root) => {
    await writeFixture(root, "api/salah.ts", "export const GET = 42;");
    await assert.rejects(
      createRouteManifest({ dir: root }),
      (error: unknown) =>
        error instanceof RouteManifestError &&
        /bukan definisi route yang valid/.test(error.message),
    );
  });
});

test("gagal impor file route → error memuat path", async () => {
  await withTempRoutes(async (root) => {
    await writeFixture(root, "api/boom.ts", `throw new Error("meledak");`);
    await assert.rejects(
      createRouteManifest({ dir: root }),
      (error: unknown) =>
        error instanceof RouteManifestError &&
        /Gagal mengimpor route \/api\/boom/.test(error.message),
    );
  });
});

test("direktori route tidak ada → error jelas", async () => {
  await assert.rejects(
    createRouteManifest({ dir: join(tmpdir(), "ramonyx-tidak-ada-xyz") }),
    (error: unknown) =>
      error instanceof RouteManifestError &&
      /Tidak bisa membaca direktori route/.test(error.message),
  );
});
