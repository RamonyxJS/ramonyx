import { expect, test } from "@playwright/test";

test("auth: login, session cookie, logout, dan CSRF field", async ({ page }) => {
  await page.goto("/sesi");
  await expect(page.getByText("belum masuk")).toBeVisible();

  const login = page.locator('[data-auth-form="login"]');
  await login.locator('input[name="username"]').fill("rina");
  await login.locator('input[name="password"]').fill("salah-sekali");
  await login.getByRole("button", { name: "Masuk" }).click();
  await expect(page.getByRole("alert")).toHaveText("Nama pengguna atau kata sandi salah.");
  await expect(page.getByText("belum masuk")).toBeVisible();

  await login.locator('input[name="password"]').fill("rahasia-uji");
  await login.getByRole("button", { name: "Masuk" }).click();

  await expect(page.getByRole("status")).toHaveText("Berhasil masuk.");
  await expect(page.getByText("masuk sebagai rina")).toBeVisible();

  // Token field pada form berikutnya tetap terisi setelah action re-render.
  const logout = page.locator('[data-auth-form="logout"]');
  await expect(logout.locator('input[name="_csrf"]')).not.toHaveValue("");

  await logout.getByRole("button", { name: "Keluar" }).click();
  await expect(page.getByRole("status")).toHaveText("Sesi dihapus.");
  await expect(page.getByText("belum masuk")).toBeVisible();
});

test("auth: registrasi akun baru + rate limit/CSRF menolak request tanpa token", async ({
  page,
  request,
}) => {
  await page.goto("/sesi");
  const username = `budi${Date.now()}`;
  const register = page.locator('[data-auth-form="register"]');
  await register.locator('input[name="username"]').fill(username);
  await register.locator('input[name="password"]').fill("rahasia-budi");
  await register.getByRole("button", { name: "Daftar" }).click();

  await expect(page.getByRole("status")).toHaveText("Akun dibuat dan sesi dimulai.");
  await expect(page.getByText(`masuk sebagai ${username}`)).toBeVisible();

  const noToken = await request.post("/sesi", {
    form: { intent: "logout" },
  });
  expect(noToken.status()).toBe(403);
  await expect(noToken.json()).resolves.toEqual({ error: "CSRF token tidak valid" });
});

test("auth: berfungsi tanpa JavaScript (form field + session cookie)", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  try {
    await page.goto("/sesi");
    const login = page.locator('[data-auth-form="login"]');
    await login.locator('input[name="username"]').fill("rina");
    await login.locator('input[name="password"]').fill("rahasia-uji");
    await login.getByRole("button", { name: "Masuk" }).click();

    await expect(page.getByRole("status")).toHaveText("Berhasil masuk.");
    await expect(page.getByText("masuk sebagai rina")).toBeVisible();

    // Cookie bertahan antar navigasi penuh.
    await page.goto("/sesi");
    await expect(page.getByText("masuk sebagai rina")).toBeVisible();
  } finally {
    await context.close();
  }
});
