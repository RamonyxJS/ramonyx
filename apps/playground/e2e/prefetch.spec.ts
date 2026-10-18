import { expect, test } from "@playwright/test";

test("prefetch: tautan dimuat lebih awal; klik memakai cache (tanpa request navigasi)", async ({
  page,
}) => {
  await page.goto("/");

  const prefetchSelesai = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/users" &&
      response.request().headers()["x-ramonyx-prefetch"] === "1",
    { timeout: 10_000 },
  );

  const navigasiKeUsers: string[] = [];
  page.on("request", (request) => {
    if (
      new URL(request.url()).pathname === "/users" &&
      request.headers()["x-ramonyx-nav"] === "1"
    ) {
      navigasiKeUsers.push(request.url());
    }
  });

  // Hover (atau viewport) memicu prefetch — respons prefetch selesai sebelum klik.
  await page.getByRole("link", { name: "/users" }).hover();
  await prefetchSelesai;

  await page.getByRole("link", { name: "/users" }).click();
  await expect(page).toHaveURL(/\/users$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Pengguna");

  // Cache dipakai: tidak ada request navigasi (x-ramonyx-nav) untuk halaman yang sudah di-prefetch.
  expect(navigasiKeUsers).toHaveLength(0);
});
