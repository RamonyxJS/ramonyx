import { expect, test } from "@playwright/test";

test("action + revalidasi deklaratif: daftar diperbarui tanpa reload (JS)", async ({ page }) => {
  await page.goto("/catatan");
  await page.fill('input[name="teks"]', "Catatan JS");
  await page.getByRole("button", { name: "Tambah" }).click();
  await expect(page.getByRole("list").getByText("Catatan JS")).toBeVisible();
  await expect(page.getByRole("status")).toHaveText("Ditambahkan: Catatan JS");
});

test("action + revalidasi deklaratif: daftar diperbarui tanpa JavaScript", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  try {
    await page.goto("/catatan");
    await page.fill('input[name="teks"]', "Catatan NoJS");
    await page.getByRole("button", { name: "Tambah" }).click();
    await expect(page.getByRole("list").getByText("Catatan NoJS")).toBeVisible();
    await expect(page.getByRole("status")).toHaveText("Ditambahkan: Catatan NoJS");
  } finally {
    await context.close();
  }
});
