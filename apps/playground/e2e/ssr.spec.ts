import { expect, test } from "@playwright/test";

test("SSR + hydration: konten server tampil, counter jadi interaktif", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Halo dari loader SSR");
  await expect(page.getByText("Ramonyx Playground").first()).toBeVisible();

  const button = page.getByRole("button", { name: /Klik saya/ });
  await expect(button).toHaveText("Klik saya: 0");

  await button.click();
  await button.click();

  await expect(button).toHaveText("Klik saya: 2");
});
