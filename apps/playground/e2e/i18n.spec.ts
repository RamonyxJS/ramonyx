import { expect, test } from "@playwright/test";

// Routing i18n (ADR-0081): default locale tanpa prefix, locale lain berprefix, `<html lang>`,
// hreflang alternatif, redirect prefix default, dan hydration tetap jalan di locale non-default.
test("i18n: / (id) tanpa prefix, /en berprefix, redirect /id → /, hydration di /en", async ({
  page,
}) => {
  // Default locale (id) — tanpa prefix.
  const respons = await page.goto("/");
  expect(respons?.status()).toBe(200);
  await expect(page.locator("html")).toHaveAttribute("lang", "id");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Halo dari loader SSR");
  await expect(page.locator("[data-locale]")).toHaveText("id");
  await expect(page.locator('link[rel="alternate"][hreflang="en"]')).toHaveAttribute(
    "href",
    /\/en$/,
  );
  await expect(page.locator('link[rel="alternate"][hreflang="x-default"]')).toHaveCount(1);

  // Locale en — berprefix, teks Inggris, hydration tetap aktif (counter interaktif).
  const en = await page.goto("/en");
  expect(en?.status()).toBe(200);
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Hello from the SSR loader");
  await expect(page.locator("[data-locale]")).toHaveText("en");

  const button = page.getByRole("button", { name: /Klik saya/ });
  await button.click();
  await expect(button).toHaveText("Klik saya: 1", { timeout: 5000 });

  // Prefix default locale di-redirect (308) ke tanpa prefix — query dipertahankan.
  const redirect = await page.request.get("/id?dari=uji", { maxRedirects: 0 });
  expect(redirect.status()).toBe(308);
  expect(redirect.headers().location).toBe("/?dari=uji");

  // Catch-all berprefix: 404 halaman tidak-ditemukan tetap ter-lokalisasi.
  const notFound = await page.goto("/en/tidak-ada");
  expect(notFound?.status()).toBe(404);
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
});
