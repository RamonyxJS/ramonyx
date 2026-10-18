import { expect, test } from "@playwright/test";

test("sesi: action men-set cookie; render ulang melihat sesi; keluar menghapus", async ({
  page,
}) => {
  await page.goto("/sesi");
  await expect(page.getByText("belum masuk")).toBeVisible();

  await page.fill('input[name="nama"]', "Rina");
  await page.getByRole("button", { name: "Masuk" }).click();

  await expect(page.getByRole("status")).toHaveText("Sesi dibuat untuk Rina.");
  // Render ulang memakai cookie baru — loader melihat sesi yang baru dibuat.
  await expect(page.getByText("masuk sebagai Rina")).toBeVisible();

  await page.getByRole("button", { name: "Keluar" }).click();
  await expect(page.getByRole("status")).toHaveText("Sesi dihapus.");
  await expect(page.getByText("belum masuk")).toBeVisible();
});

test("sesi: berfungsi tanpa JavaScript (POST native + Set-Cookie)", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  try {
    await page.goto("/sesi");
    await page.fill('input[name="nama"]', "Tanpa JS");
    await page.getByRole("button", { name: "Masuk" }).click();

    await expect(page.getByRole("status")).toHaveText("Sesi dibuat untuk Tanpa JS.");
    await expect(page.getByText("masuk sebagai Tanpa JS")).toBeVisible();

    // Cookie bertahan antar navigasi penuh.
    await page.goto("/sesi");
    await expect(page.getByText("masuk sebagai Tanpa JS")).toBeVisible();
  } finally {
    await context.close();
  }
});
