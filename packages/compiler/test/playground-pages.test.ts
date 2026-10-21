import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { generateRouteTypes, loadPageRoutes } from "../src/index.ts";

// Integrasi dengan app nyata: modul halaman di apps/playground mengimpor "ramonyx"
// dan @ramonyx/react, jadi test ini ikut membuktikan resolusi workspace + JSX loader
// (jalankan lewat `pnpm test`, yang memakai tools/register.mjs).

test("memindai halaman playground", async () => {
  const dir = fileURLToPath(new URL("../../../apps/playground/src/routes", import.meta.url));
  const pages = await loadPageRoutes({ dir });

  assert.deepEqual(
    pages.map((page) => page.path),
    ["/", "/tentang", "/[...notFound]", "/form", "/islands", "/sesi", "/users", "/users/[id]"],
  );
  for (const page of pages) {
    assert.ok(page.layouts.length >= 1, `${page.path} punya layout root`);
    assert.ok(page.error !== undefined, `${page.path} mewarisi error root`);
  }

  // Middleware per-folder (ADR-0061): root berlaku untuk semua; users/ menambah satu lapis.
  // Root middleware = [securityHeaders, cspNonce] → 2 fungsi; users/ menambah 1.
  const home = pages.find((page) => page.path === "/");
  assert.equal(home?.middlewares?.length, 2, "halaman / mewarisi middleware root");
  assert.equal(home?.middlewareFiles?.length, 1);
  const users = pages.find((page) => page.path === "/users");
  assert.equal(users?.middlewares?.length, 3, "halaman /users mewarisi root + users middleware");
  assert.equal(users?.middlewareFiles?.length, 2);
  assert.equal(typeof home?.page.loader, "function", "halaman / punya loader");
  assert.equal(
    pages.find((page) => page.path === "/tentang")?.directory.endsWith("(publik)/tentang"),
    true,
    "route group tetap ada di direktori fisik",
  );
});

test("generateRouteTypes: pola rute → params bertipe (ADR-0073)", async () => {
  const dir = fileURLToPath(new URL("../../../apps/playground/src/routes", import.meta.url));
  const pages = await loadPageRoutes({ dir });
  const output = generateRouteTypes(pages);

  assert.ok(output.includes('import { fillHref } from "@ramonyx/router";'), "runtime fillHref");
  assert.ok(output.includes("export type RouteParamsMap = {"), "peta params");
  assert.ok(output.includes('"/users/[id]": { id: string };'), "param dinamis bertipe");
  assert.ok(output.includes('"/[...notFound]": { notFound: string };'), "catch-all bertipe");
  assert.ok(output.includes('"/": undefined;'), "rute tanpa param = undefined");
  assert.ok(output.includes("export function routeHref<P extends RoutePath>("), "wrapper bertipe");
});
