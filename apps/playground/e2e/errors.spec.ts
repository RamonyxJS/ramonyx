import { expect, test } from "@playwright/test";

test("halaman error dari loader: 404 dan 400", async ({ page }) => {
  const notFound = await page.goto("/users/9c858901-8a57-4791-81fe-4c455b000000");
  expect(notFound?.status()).toBe(404);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("404");
  await expect(page.getByText("Pengguna tidak ditemukan")).toBeVisible();

  const badRequest = await page.goto("/users/bukan-uuid");
  expect(badRequest?.status()).toBe(400);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("400");
  await expect(page.getByText("ID pengguna tidak valid")).toBeVisible();
});

test("catch-all: path tak dikenal → 404 HTML dengan halaman kustom", async ({ page }) => {
  const response = await page.goto("/halaman-hilang/bertingkat");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("404");
  await expect(page.getByText(/Halaman tidak ditemukan/)).toBeVisible();
});
