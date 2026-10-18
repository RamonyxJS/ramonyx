import { expect, test } from "@playwright/test";

function setSentinel(): void {
  (globalThis as unknown as Record<string, unknown>).__sentinel = 42;
}

function readSentinel(): unknown {
  return (globalThis as unknown as Record<string, unknown>).__sentinel;
}

test("soft navigation tanpa full reload (sentinel bertahan, back/forward)", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(setSentinel);

  await page.getByRole("link", { name: "/users" }).click();
  await expect(page).toHaveURL(/\/users$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Pengguna");
  expect(await page.evaluate(readSentinel)).toBe(42);

  await page.getByRole("link", { name: "Rina" }).click();
  await expect(page).toHaveURL(/3fa85f64-5717-4562-b3fc-2c963f66afa6$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Rina");
  expect(await page.evaluate(readSentinel)).toBe(42);

  await page.goBack();
  await expect(page).toHaveURL(/\/users$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Pengguna");
  expect(await page.evaluate(readSentinel)).toBe(42);
});
