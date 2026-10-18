import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { loadPageRoutes, RouteManifestError } from "../src/index.ts";

async function withTempRoutes(run: (dir: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "ramonyx-pages-"));
  try {
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

const component = (name: string) => `export default function ${name}() { return null; }`;

test("memetakan halaman: root, statis, parameter + layout berantai", async () => {
  await withTempRoutes(async (root) => {
    await writeFixture(root, "layout.tsx", component("RootLayout"));
    await writeFixture(root, "error.tsx", component("RootError"));
    await writeFixture(root, "page.tsx", component("HomePage"));
    await writeFixture(root, "users/layout.tsx", component("UsersLayout"));
    await writeFixture(root, "users/page.tsx", component("UsersPage"));
    await writeFixture(root, "users/[id]/page.tsx", component("UserPage"));

    const pages = await loadPageRoutes({ dir: root });
    assert.deepEqual(
      pages.map((page) => page.path),
      ["/", "/users", "/users/[id]"],
    );

    const [home, users, user] = pages;
    assert.equal(home?.layouts.length, 1);
    assert.equal(users?.layouts.length, 2, "users mewarisi layout root + users");
    assert.equal(user?.layouts.length, 2, "[id] mewarisi layout root + users");
    assert.ok(home?.error);
    assert.ok(user?.error, "error dari root dipakai kalau tidak ada yang lebih dekat");
  });
});

test("error terdekat menang", async () => {
  await withTempRoutes(async (root) => {
    await writeFixture(root, "error.tsx", component("RootError"));
    await writeFixture(root, "page.tsx", component("HomePage"));
    await writeFixture(root, "admin/error.tsx", component("AdminError"));
    await writeFixture(root, "admin/page.tsx", component("AdminPage"));

    const pages = await loadPageRoutes({ dir: root });
    const admin = pages.find((page) => page.path === "/admin");
    assert.ok(admin?.error);
    // Modul error root dan admin berbeda; pastikan yang terdekat (admin) dipakai.
    assert.notEqual(admin.error, pages.find((page) => page.path === "/")?.error);
  });
});

test("mengabaikan api/, prefix _, dan non-page", async () => {
  await withTempRoutes(async (root) => {
    await writeFixture(root, "page.tsx", component("HomePage"));
    await writeFixture(
      root,
      "api/users.ts",
      "export const GET = { handler: () => new Response('ok') };",
    );
    await writeFixture(root, "api/page.tsx", component("ApiPageSalah"));
    await writeFixture(root, "_draft/page.tsx", component("DraftPage"));
    await writeFixture(root, "_partial.tsx", component("Partial"));
    await writeFixture(root, "page.d.ts", "export declare const x: 1;");

    const pages = await loadPageRoutes({ dir: root });
    assert.deepEqual(
      pages.map((page) => page.path),
      ["/"],
    );
  });
});

test("halaman tanpa default export → error jelas", async () => {
  await withTempRoutes(async (root) => {
    await writeFixture(root, "page.tsx", "export const metadata = { title: 'tanpa komponen' };");
    await assert.rejects(
      loadPageRoutes({ dir: root }),
      (error: unknown) =>
        error instanceof RouteManifestError && /tidak punya default export/.test(error.message),
    );
  });
});

test("tidak ada halaman → array kosong", async () => {
  await withTempRoutes(async (root) => {
    const pages = await loadPageRoutes({ dir: root });
    assert.deepEqual(pages, []);
  });
});

test("importer kustom dipakai tanpa mengeksekusi file (jalur dev)", async () => {
  await withTempRoutes(async (root) => {
    await writeFixture(root, "page.tsx", `throw new Error("file tidak boleh dieksekusi");`);

    const seen: string[] = [];
    const pages = await loadPageRoutes({
      dir: root,
      importer: async (absolute) => {
        seen.push(absolute);
        return {
          default: function FakePage() {
            return null;
          },
        };
      },
    });

    assert.equal(pages.length, 1);
    assert.equal(pages[0]?.path, "/");
    assert.equal(seen.length, 1);
    assert.ok(seen[0]?.endsWith("page.tsx"));
  });
});
