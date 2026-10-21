import { expect, test } from "@playwright/test";

async function waitForIslands(page: import("@playwright/test").Page): Promise<void> {
  await page.waitForFunction(
    () => document.documentElement.dataset.ramonyxHydration === "islands",
    undefined,
    { timeout: 5_000 },
  );
  await page.waitForSelector("[data-ramonyx-island-hydrated='true']");
}

test("islands: hanya batas interaktif yang di-hydrate; soft nav/back/forward", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" && /hydrat/i.test(message.text())) {
      errors.push(message.text());
    }
  });

  await page.goto("/islands");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Partial hydration islands");
  await expect(page.getByText("Konten ini dirender server dan tidak di-hydrate.")).toBeVisible();

  const button = page.getByRole("button", { name: /Island counter/ });
  await expect(button).toHaveText("Island counter: 2");
  await waitForIslands(page);
  expect(await page.evaluate(() => document.documentElement.dataset.ramonyxHydration)).toBe(
    "islands",
  );
  const islandIds = await page.evaluate(() => {
    const button = document.querySelector("[data-ramonyx-island] button");
    const describedBy = button?.getAttribute("aria-describedby") ?? null;
    return {
      describedBy,
      hint: describedBy === null ? null : (document.getElementById(describedBy)?.id ?? null),
    };
  });
  expect(islandIds.describedBy).not.toBeNull();
  expect(islandIds.hint).toBe(islandIds.describedBy);

  await button.click();
  await expect(button).toHaveText("Island counter: 3");

  // Soft navigation dari halaman full-hydration ke halaman islands.
  await page.goto("/");
  await page.waitForFunction(() => document.documentElement.classList.contains("hydrated"));
  await page.getByRole("link", { name: "/islands", exact: true }).click();
  await expect(page).toHaveURL(/\/islands$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Partial hydration islands");
  await waitForIslands(page);
  await page.getByRole("button", { name: /Island counter/ }).click();
  await expect(page.getByRole("button", { name: /Island counter/ })).toHaveText(
    "Island counter: 3",
  );

  // Kembali ke halaman full: root kembali di-hydrate dan counter lama berfungsi.
  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Halo dari loader SSR");
  await page.waitForFunction(
    () => document.documentElement.dataset.ramonyxHydration === "full",
    undefined,
    { timeout: 5_000 },
  );
  const homeCounter = page.getByRole("button", { name: /Klik saya/ });
  await homeCounter.click();
  await expect(homeCounter).toHaveText("Klik saya: 1");

  await page.goForward();
  await expect(page).toHaveURL(/\/islands$/);
  await waitForIslands(page);
  await page.getByRole("button", { name: /Island counter/ }).click();
  await expect(page.getByRole("button", { name: /Island counter/ })).toHaveText(
    "Island counter: 3",
  );

  expect(errors).toEqual([]);
});

test("islands: konten server tetap terbaca tanpa JavaScript", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  try {
    const response = await page.goto("/islands");
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Partial hydration islands");
    await expect(page.getByText("Konten ini dirender server dan tidak di-hydrate.")).toBeVisible();

    const button = page.getByRole("button", { name: /Island counter/ });
    await expect(button).toHaveText("Island counter: 2");
    await button.click();
    await expect(button).toHaveText("Island counter: 2");
  } finally {
    await context.close();
  }
});
