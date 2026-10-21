import { expect, test } from "@playwright/test";

test("deferred: shell, hydration, soft navigation, dan back/forward", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => {
    if (/hydrat|Minified React error/i.test(error.message)) {
      errors.push(error.message);
    }
  });
  page.on("console", (message) => {
    if (message.type() === "error" && /hydrat/i.test(message.text())) {
      errors.push(message.text());
    }
  });

  await page.goto("/deferred");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Deferred loader");
  await expect(
    page.getByText("Shell langsung dirender server sebelum data tambahan siap."),
  ).toBeVisible();
  await expect(page.locator("[data-deferred-content]")).toHaveText("Data deferred siap (loader)");
  await page.waitForFunction(() => document.documentElement.classList.contains("hydrated"));

  const state = await page.evaluate(() => window.__RAMONYX_DEFERRED__);
  expect(state?.d0?.status).toBe("fulfilled");
  expect(state?.d0?.status === "fulfilled" && state.d0.value).toEqual({
    message: "Data deferred siap",
    source: "loader",
  });

  // Soft navigation dari halaman full-hydration, lalu kembali ke halaman deferred.
  await page.goto("/");
  await page.waitForFunction(() => document.documentElement.classList.contains("hydrated"));
  await page.getByRole("link", { name: "/deferred", exact: true }).click();
  await expect(page).toHaveURL(/\/deferred$/);
  await expect(page.locator("[data-deferred-content]")).toHaveText("Data deferred siap (loader)");

  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Halo dari loader SSR");

  await page.goForward();
  await expect(page).toHaveURL(/\/deferred$/);
  await expect(page.locator("[data-deferred-content]")).toHaveText("Data deferred siap (loader)");
  expect(errors).toEqual([]);
});

test("deferred: fallback server tetap terbaca tanpa JavaScript", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  try {
    const response = await page.goto("/deferred");
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Deferred loader");
    await expect(page.locator("[data-deferred-fallback]")).toBeVisible();
    await expect(page.locator("[data-deferred-content]")).toBeHidden();
  } finally {
    await context.close();
  }
});
