import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { loadPageRoutes } from "../src/index.ts";

// Integrasi dengan app nyata: modul halaman di apps/playground mengimpor "ramonyx"
// dan @ramonyx/react, jadi test ini ikut membuktikan resolusi workspace + JSX loader
// (jalankan lewat `pnpm test`, yang memakai tools/register.mjs).

test("memindai halaman playground", async () => {
  const dir = fileURLToPath(new URL("../../../apps/playground/src/routes", import.meta.url));
  const pages = await loadPageRoutes({ dir });

  assert.deepEqual(
    pages.map((page) => page.path),
    ["/", "/[...notFound]", "/users", "/users/[id]"],
  );
  for (const page of pages) {
    assert.ok(page.layouts.length >= 1, `${page.path} punya layout root`);
    assert.ok(page.error !== undefined, `${page.path} mewarisi error root`);
  }

  const home = pages.find((page) => page.path === "/");
  assert.equal(typeof home?.page.loader, "function", "halaman / punya loader");
});
