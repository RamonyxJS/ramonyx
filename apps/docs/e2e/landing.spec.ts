import { expect, test } from "@playwright/test";

declare global {
  interface Window {
    __vtCount?: number;
    __ramonyxLoadClient?: () => void;
  }
}

async function hydrate(page: import("@playwright/test").Page): Promise<void> {
  await page.evaluate(() => window.__ramonyxLoadClient?.());
  await page.waitForFunction(() => document.documentElement.classList.contains("hydrated"));
}

test("landing: hero, bukti dari machine layer, tema, pencarian Cmd+K", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Full-stack TypeScript");
  await expect(page.getByText("published on npm")).toBeVisible();
  await expect(page.getByText("npm packages")).toBeVisible();
  await expect(page.getByText("documentation pages")).toBeVisible();

  // Tema: toggle mengubah atribut <html> dan tersimpan (tunggu hydration + effect).
  await hydrate(page);
  await page.waitForFunction(() => document.documentElement.hasAttribute("data-theme"));
  const toggle = page.getByRole("button", { name: /Switch to (dark|light) theme/ });
  const temaAwal = await page.locator("html").getAttribute("data-theme");
  await toggle.click();
  await expect(page.locator("html")).not.toHaveAttribute("data-theme", temaAwal ?? "");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute(
    "data-theme",
    temaAwal === "light" ? "dark" : "light",
  );

  // Pencarian: Cmd+K → query publik → hasil menuju halaman docs.
  // Reload tidak memuat bundle sampai interaksi; picu loader eksplisit.
  await hydrate(page);
  await page.keyboard.press("ControlOrMeta+k");
  const dialog = page.getByRole("dialog", { name: "Search documentation" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("searchbox").fill("routing");
  const hasilRouting = dialog.locator('a[href="docs/routing"]');
  await expect(hasilRouting).toBeVisible();
  await hasilRouting.click();
  await expect(page).toHaveURL(/\/docs\/routing\/?$/);
});

test("docs: halaman, ToC, prev/next, copy kode, dan alias lama", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/docs/getting-started");
  await hydrate(page);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Getting Started");
  await expect(page.getByRole("navigation", { name: "Previous and next" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Edit this page on GitHub/ })).toBeVisible();

  // ToC → anchor.
  const toc = page.getByRole("complementary", { name: "On this page" });
  if (await toc.count()) {
    const firstAnchor = toc.getByRole("link").first();
    await firstAnchor.click();
    await expect(page).toHaveURL(/#.+/);
  }

  // Copy kode (blok pertama di halaman).
  const copy = page.getByRole("button", { name: "Copy code" }).first();
  if (await copy.count()) {
    await copy.click();
    await expect(copy).toHaveText("Copied");
  }

  // Alias lama tetap melayani halaman publik yang sama.
  await page.goto("/dokumen/getting-started");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Getting Started");
});

test("docs mobile: tanpa overflow horizontal; sidebar dan ToC bisa dibuka", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/docs/getting-started");

  const lebar = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(lebar).toBeLessThanOrEqual(390);

  const sidebar = page.locator(".sidebar-mobile");
  await expect(sidebar).toBeVisible();
  await sidebar.locator("summary").click();
  await expect(sidebar.getByRole("link", { name: "Routing", exact: true })).toBeVisible();

  const toc = page.locator(".toc-mobile");
  await expect(toc).toBeVisible();
  await toc.locator("summary").click();
  await expect(toc.getByRole("link").first()).toBeVisible();
});

test("search: Enter membuka hasil pertama (navigasi keyboard)", async ({ page }) => {
  await page.goto("/docs/getting-started");
  await hydrate(page);
  await page.keyboard.press("ControlOrMeta+k");
  const dialog = page.getByRole("dialog", { name: "Search documentation" });
  await dialog.getByRole("searchbox").fill("routing");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/docs\/routing\/?$/);
});

test("landing keyboard: arrow, help, shortcut docs, dan view transition", async ({ page }) => {
  await page.addInitScript(() => {
    const original = Document.prototype.startViewTransition;
    Document.prototype.startViewTransition = function (callback) {
      window.__vtCount = (window.__vtCount ?? 0) + 1;
      return original.call(this, callback);
    };
  });
  await page.goto("/");
  await hydrate(page);
  await page.locator("body").click({ position: { x: 8, y: 500 } });
  await page.keyboard.press("ArrowDown");
  await expect(page).toHaveURL(/#routing/);

  await page.keyboard.press("Shift+Slash");
  const keyboardDialog = page.getByRole("dialog", { name: "Keyboard shortcuts" });
  await expect(keyboardDialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(keyboardDialog).toBeHidden();
  await page.waitForTimeout(300);

  await page.keyboard.press("d");
  await expect(page).toHaveURL(/\/docs\/?$/);
  expect(await page.evaluate(() => window.__vtCount ?? 0)).toBeGreaterThan(0);
});

test("landing reduced-motion: animasi besar dimatikan", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const state = await page.evaluate(() => ({
    wordmark: getComputedStyle(document.querySelector(".hero-wordmark span") ?? document.body)
      .animationName,
    chapter: getComputedStyle(document.querySelector(".chapter-head") ?? document.body)
      .animationName,
    glow: getComputedStyle(document.querySelector(".cursor-glow") ?? document.body).display,
  }));
  expect(state.wordmark).toBe("none");
  expect(state.chapter).toBe("none");
  expect(state.glow).toBe("none");
});

test("landing no-JS: konten dan navigasi tetap terbaca", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Full-stack TypeScript");
  expect(await page.locator(".chapter").count()).toBe(7);
  await expect(page.locator(".rail-list a")).toHaveCount(7);
  await context.close();
});
