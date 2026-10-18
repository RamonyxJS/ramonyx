import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import type { LoadedPage } from "@ramonyx/core";
import { generateClientEntry, loadPageRoutes, RouteManifestError } from "../src/index.ts";

const component = (name: string) => `export default function ${name}() { return null; }`;

async function writeFixture(root: string, relativePath: string, content: string): Promise<void> {
  const target = join(root, relativePath);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, content);
}

test("generateClientEntry: registry halaman + impor relatif ke entry", async () => {
  const root = await mkdtemp(join(tmpdir(), "ramonyx-entry-"));
  try {
    await writeFixture(root, "page.tsx", component("HomePage"));
    await writeFixture(root, "layout.tsx", component("RootLayout"));
    await writeFixture(root, "users/page.tsx", component("UsersPage"));

    const pages = await loadPageRoutes({ dir: root });
    const entry = generateClientEntry(pages, { from: join(root, ".ramonyx") });

    assert.ok(
      entry.includes('import { enableClientNavigation, hydrateAll } from "@ramonyx/react/client";'),
    );
    assert.ok(entry.includes('import * as m0 from "../page.tsx";'));
    assert.ok(entry.includes('import * as m1 from "../layout.tsx";'));
    assert.ok(entry.includes('import * as m2 from "../users/page.tsx";'));
    assert.ok(entry.includes('"/": { page: m0, layouts: [m1] },'));
    assert.ok(entry.includes('"/users": { page: m2, layouts: [m1] },'));
    assert.ok(entry.includes("const registry = {"));
    assert.ok(entry.includes("hydrateAll(registry);"));
    assert.ok(entry.includes("enableClientNavigation(registry);"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("generateClientEntry: halaman tanpa pageFile → error jelas", () => {
  const page: LoadedPage = {
    path: "/manual",
    page: { default: () => null },
    layouts: [],
    directory: "/tmp",
  };

  assert.throws(
    () => generateClientEntry([page], { from: "/tmp" }),
    (error: unknown) =>
      error instanceof RouteManifestError && /tidak punya pageFile/.test(error.message),
  );
});
