import { expect, test } from "@playwright/test";

// Varian gambar (ADR-0079): plugin image menghasilkan WebP ter-resize saat build; halaman
// merender <picture> + srcset dari resolver (`assets.image`) — diuji di browser nyata
// (gambar benar-benar dimuat, bukan hanya markup).
test("gambar: <picture> + source webp + srcset ter-resize, gambar termuat di browser", async ({
  page,
}) => {
  await page.goto("/");

  const picture = page.locator("picture").first();
  await expect(picture).toBeVisible();

  const source = picture.locator('source[type="image/webp"]');
  const srcset = await source.getAttribute("srcset");
  expect(srcset, "srcset webp berisi varian ber-hash").toMatch(
    /\/assets\/img\/hero-\d+-[0-9a-f]{10}\.webp 320w, \/assets\/img\/hero-\d+-[0-9a-f]{10}\.webp 640w, \/assets\/img\/hero-\d+-[0-9a-f]{10}\.webp 800w/,
  );

  const img = picture.locator("img");
  await expect(img).toHaveAttribute("sizes", "(max-width: 768px) 100vw, 640px");
  await expect(img).toHaveAttribute("width", "800");
  await expect(img).toHaveAttribute("height", "600");
  await expect(img).toHaveAttribute("style", /background-image:\s*url\("data:image\/webp;base64,/);

  // Browser benar-benar memuat berkas varian (200, bukan 404) dan dimensinya sesuai.
  await img.scrollIntoViewIfNeeded();
  await img.evaluate((element) => {
    const image = element as HTMLImageElement;
    return image.complete
      ? true
      : new Promise<boolean>((resolve) => {
          image.addEventListener("load", () => resolve(true), { once: true });
        });
  });
  const naturalWidth = await img.evaluate((element) => (element as HTMLImageElement).naturalWidth);
  expect(naturalWidth).toBeGreaterThan(0);
  const loaded = await img.evaluate(async (element) => {
    const response = await fetch((element as HTMLImageElement).currentSrc);
    return { status: response.status, type: response.headers.get("content-type") ?? "" };
  });
  expect(loaded.status).toBe(200);
  expect(loaded.type).toMatch(/image\/(webp|png)/);
});
