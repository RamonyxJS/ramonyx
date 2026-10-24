// Integrasi Tailwind v4 + shadcn/ui (copy-in component).
//
// Tailwind dikompilasi lewat PostCSS; Button dirender dengan React SSR. Tidak ada browser
// atau CDN yang dibutuhkan, dan test memverifikasi utility yang benar-benar dihasilkan.

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/postcss";
import postcss from "postcss";
import { renderToStaticMarkup } from "react-dom/server";
import { Button } from "./fixtures/shadcn-button.tsx";

test("Tailwind v4 + shadcn/ui: utility CSS dan varian Button", async () => {
  const cssPath = fileURLToPath(new URL("./fixtures/tailwind-shadcn.css", import.meta.url));
  const input = await readFile(cssPath, "utf8");
  const result = await postcss([tailwindcss()]).process(input, { from: cssPath });

  assert.match(result.css, /\.bg-primary\b/);
  assert.match(result.css, /\.bg-destructive\b/);
  assert.match(result.css, /--color-primary:\s*#2340c8/);
  assert.match(result.css, /\.rounded-md\b/);

  const destructive = renderToStaticMarkup(
    <Button variant="destructive" size="sm">
      Hapus
    </Button>,
  );
  assert.match(destructive, /class="[^"]*bg-destructive/);
  assert.match(destructive, /class="[^"]*h-8/);
  assert.match(destructive, /class="[^"]*rounded-md/);

  const link = renderToStaticMarkup(
    <Button asChild>
      <a href="/docs">Dokumentasi</a>
    </Button>,
  );
  assert.match(link, /^<a /);
  assert.match(link, /href="\/docs"/);
  assert.match(link, /class="[^"]*bg-primary/);

  const merged = renderToStaticMarkup(<Button className="px-10">Gabung</Button>);
  assert.match(merged, /class="[^"]*px-10/);
  assert.doesNotMatch(merged, /class="[^"]*px-4/);
});
