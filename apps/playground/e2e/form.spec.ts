import { expect, test } from "@playwright/test";

function setSentinel(): void {
  (globalThis as unknown as Record<string, unknown>).__sentinelForm = 42;
}

function readSentinel(): unknown {
  return (globalThis as unknown as Record<string, unknown>).__sentinelForm;
}

test("form action: submit tanpa reload (JS enhancement) + pesan tampil", async ({ page }) => {
  await page.goto("/form");
  await page.evaluate(setSentinel);

  await page.fill('input[name="nama"]', "Ramonyx");
  await page.getByRole("button", { name: "Kirim" }).click();

  await expect(page.getByRole("status")).toHaveText("Halo, Ramonyx!");
  // Sentinel bertahan = halaman tidak full reload (submit diintersepsi klien).
  expect(await page.evaluate(readSentinel)).toBe(42);
  await expect(page).toHaveURL(/\/form$/);
});

test("form action: kesalahan validasi tampil di halaman yang sama", async ({ page }) => {
  await page.goto("/form");
  await page.fill('input[name="nama"]', "A");
  await page.getByRole("button", { name: "Kirim" }).click();

  await expect(page.getByRole("alert")).toHaveText("Nama minimal 2 karakter");
  await expect(page.getByRole("status")).toHaveCount(0);
});

test("form action: progressive enhancement — berfungsi tanpa JavaScript", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  try {
    await page.goto("/form");
    await page.fill('input[name="nama"]', "Tanpa JS");
    await page.getByRole("button", { name: "Kirim" }).click();

    // POST native → server merender ulang HTML dengan pesan (tanpa JS sama sekali).
    await expect(page.getByRole("status")).toHaveText("Halo, Tanpa JS!");
  } finally {
    await context.close();
  }
});
