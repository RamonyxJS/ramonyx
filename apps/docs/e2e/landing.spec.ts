import { expect, test } from "@playwright/test";

test("landing: hero, bukti dari machine layer, tema, pencarian Cmd+K", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Full-stack TypeScript");
  await expect(page.getByText("published on npm")).toBeVisible();
  await expect(page.getByText("npm packages")).toBeVisible();
  await expect(page.getByText("documentation pages")).toBeVisible();

  // Tema: toggle mengubah atribut <html> dan tersimpan.
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
  // Tunggu hidrasi (penanda `js` dipasang efek klien) sebelum memakai shortcut.
  await page.waitForFunction(() => document.documentElement.classList.contains("js"));
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
  await page.waitForFunction(() => document.documentElement.classList.contains("js"));
  await page.keyboard.press("ControlOrMeta+k");
  const dialog = page.getByRole("dialog", { name: "Search documentation" });
  await dialog.getByRole("searchbox").fill("routing");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/docs\/routing\/?$/);
});
