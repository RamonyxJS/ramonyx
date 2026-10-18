import assert from "node:assert/strict";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import type { FetchHandler, LoadedPage } from "@ramonyx/core";
import { prerenderRoutes } from "../src/index.ts";

const workDir = fileURLToPath(new URL("../.tmp-test/prerender", import.meta.url));

function page(path: string, module: LoadedPage["page"]): LoadedPage {
  return { path, page: module, layouts: [], directory: "" };
}

function html(body: string, status = 200): Response {
  return new Response(`<html><body>${body}</body></html>`, {
    status,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

test("prerenderRoutes: rute statis + getStaticPaths + skip + 404 + aset + transform", async () => {
  await rm(workDir, { recursive: true, force: true });
  const outDir = `${workDir}/out`;
  const clientDir = `${workDir}/client`;
  await mkdir(clientDir, { recursive: true });
  await writeFile(`${clientDir}/client-abc.js`, "console.log(1)");

  const handler: FetchHandler = async (request) => {
    const pathname = new URL(request.url).pathname;
    if (pathname === "/__404__") {
      return html("404", 404);
    }
    if (pathname === "/" || pathname === "/halo" || pathname.startsWith("/blog/")) {
      return html(pathname);
    }
    return new Response("nope", { status: 404, headers: { "content-type": "text/plain" } });
  };

  const pages = [
    page("/", { default: () => null }),
    page("/halo", { default: () => null }),
    page("/rahasia", { default: () => null, prerender: false }),
    page("/blog/[slug]", {
      default: () => null,
      getStaticPaths: () => [{ slug: "a" }, { slug: "b" }],
    }),
    page("/lain/[slug]", { default: () => null }),
  ];

  try {
    const result = await prerenderRoutes({
      handler,
      pages,
      outDir,
      clientDir,
      nojekyll: true,
      notFoundPath: "/__404__",
      transformHtml: (source, routePath) =>
        source.replace("</body>", `<!-- ${routePath || "/"} --></body>`),
    });

    assert.deepEqual(
      result.routes.map((route) => route.path),
      ["/", "/blog/a", "/blog/b", "/halo"],
      "rute terurut: statis + getStaticPaths",
    );
    assert.equal(result.skipped.length, 2);
    assert.ok(result.skipped.some((entry) => entry.path === "/rahasia"));
    assert.ok(result.skipped.some((entry) => entry.reason.includes("getStaticPaths")));
    assert.equal(result.notFoundFile?.endsWith("404.html"), true);

    const index = await readFile(`${outDir}/index.html`, "utf8");
    assert.ok(index.includes("<!-- / -->"), "transformHtml dipakai");
    assert.ok((await readFile(`${outDir}/halo/index.html`, "utf8")).includes("<!-- /halo -->"));
    assert.ok((await readFile(`${outDir}/blog/a/index.html`, "utf8")).includes("<!-- /blog/a -->"));
    assert.ok((await readFile(`${outDir}/404.html`, "utf8")).includes("404"));
    assert.ok((await readFile(`${outDir}/assets/client-abc.js`, "utf8")).includes("console.log"));
    assert.ok((await readFile(`${outDir}/.nojekyll`, "utf8")) === "");
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
});

test("prerenderRoutes: paths eksplisit + kegagalan jelas (bukan HTML / status ≥400 / 404 bukan 404)", async () => {
  await rm(workDir, { recursive: true, force: true });

  const ok: FetchHandler = async (request) => {
    const pathname = new URL(request.url).pathname;
    if (pathname === "/dinamis/1") {
      return html("satu");
    }
    if (pathname === "/__404__") {
      return html("404", 404);
    }
    return html("x");
  };

  try {
    const result = await prerenderRoutes({
      handler: ok,
      pages: [],
      outDir: `${workDir}/out`,
      paths: ["/dinamis/1"],
      includeStaticPages: false,
      notFoundPath: "/__404__",
    });
    assert.deepEqual(
      result.routes.map((route) => route.path),
      ["/dinamis/1"],
    );

    // Bukan HTML → error.
    await assert.rejects(
      prerenderRoutes({
        handler: async () =>
          new Response("json", { headers: { "content-type": "application/json" } }),
        pages: [],
        outDir: `${workDir}/out`,
        paths: ["/x"],
        includeStaticPages: false,
      }),
      /bukan HTML/,
    );

    // Status ≥ 400 pada rute → error.
    await assert.rejects(
      prerenderRoutes({
        handler: async () => html("gagal", 500),
        pages: [],
        outDir: `${workDir}/out`,
        paths: ["/x"],
        includeStaticPages: false,
      }),
      /status 500/,
    );

    // notFoundPath yang tidak menghasilkan 404 → error.
    await assert.rejects(
      prerenderRoutes({
        handler: async () => html("selalu 200"),
        pages: [],
        outDir: `${workDir}/out`,
        includeStaticPages: false,
        notFoundPath: "/__404__",
      }),
      /harus 404/,
    );
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
});
