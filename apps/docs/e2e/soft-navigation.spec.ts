import { expect, test } from "@playwright/test";

declare global {
  interface Window {
    __ramonyxLoadClient?: () => void;
  }
}

async function hydrate(page: import("@playwright/test").Page): Promise<void> {
  await page.evaluate(() => window.__ramonyxLoadClient?.());
  await page.waitForFunction(() => document.documentElement.classList.contains("hydrated"));
}

const landingHead = async (page: import("@playwright/test").Page) =>
  page.evaluate(() => ({
    title: document.title,
    alternate:
      document.querySelector('link[rel="alternate"][type="text/markdown"]')?.getAttribute("href") ??
      null,
    describedby: document.querySelector('link[rel="describedby"]')?.getAttribute("href") ?? null,
    landingStyle: document.querySelector("main.landing") !== null,
  }));

const docsHead = async (page: import("@playwright/test").Page) =>
  page.evaluate(() => {
    const sidebarList = document.querySelector(".sidebar ul");
    const layout = document.querySelector(".docs");
    return {
      title: document.title,
      alternate:
        document
          .querySelector('link[rel="alternate"][type="text/markdown"]')
          ?.getAttribute("href") ?? null,
      sidebarListStyle: sidebarList ? getComputedStyle(sidebarList).listStyleType : null,
      layoutDisplay: layout ? getComputedStyle(layout).display : null,
    };
  });

test("soft navigation / → docs merekonsiliasi CSS dan head", async ({ page }) => {
  // Prefetch dari viewport/hover tetap memakai jalur soft navigation yang sama.
  const prefetchRequest = page.waitForRequest(
    (request) =>
      request.headers()["x-ramonyx-prefetch"] === "1" &&
      request.url().includes("/docs/architecture"),
    { timeout: 5_000 },
  );

  await page.goto("/");
  await hydrate(page);

  const architecture = page.getByRole("link", { name: "Architecture", exact: true });
  await architecture.hover();
  const prefetched = await prefetchRequest;
  expect(prefetched.url()).toContain("/docs/architecture");

  const before = await landingHead(page);
  expect(before.landingStyle).toBe(true);
  expect(before.alternate).toBeNull();

  await architecture.click();
  await expect(page).toHaveURL(/\/docs\/architecture\/?$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Architecture");

  const after = await docsHead(page);
  expect(after.title).toMatch(/Architecture|Documentation/);
  expect(after.sidebarListStyle).toBe("none");
  expect(after.layoutDisplay).toBe("grid");
  expect(after.alternate).toBe("docs/architecture.md");

  // Back/forward: history harus mengembalikan head + varian CSS halaman yang benar.
  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator("main.landing")).toBeVisible();
  await expect.poll(async () => (await landingHead(page)).alternate).toBeNull();

  await page.goForward();
  await expect(page).toHaveURL(/\/docs\/architecture\/?$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Architecture");
  const forward = await docsHead(page);
  expect(forward.sidebarListStyle).toBe("none");
  expect(forward.alternate).toBe("docs/architecture.md");
});

test("soft navigation docs → / mengganti gaya landing dan membersihkan head docs", async ({
  page,
}) => {
  await page.goto("/docs/architecture");
  await hydrate(page);

  await page.locator(".topbar .merek").click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Full-stack TypeScript");

  const head = await landingHead(page);
  expect(head.landingStyle).toBe(true);
  expect(head.alternate).toBeNull();
  expect(head.describedby).toBe("machine/llms.txt");
});

test("soft navigation memuat stylesheet baru dan membersihkannya saat kembali", async ({
  page,
}) => {
  // Simulasi CSS per-rute: docs/architecture membawa stylesheet tambahan.
  await page.route("**/docs/architecture*", async (route) => {
    const response = await route.fetch();
    const body = (await response.text()).replace(
      "</head>",
      '<link rel="stylesheet" href="/assets/soft-nav-test.css" data-test-stylesheet /></head>',
    );
    await route.fulfill({ response, body });
  });
  await page.route("**/assets/soft-nav-test.css", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/css",
      body: ".sidebar ul { list-style-type: square; }",
    });
  });

  await page.goto("/");
  await hydrate(page);

  await page.getByRole("link", { name: "Architecture", exact: true }).click();
  await expect(page).toHaveURL(/\/docs\/architecture\/?$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Architecture");
  await expect
    .poll(async () =>
      page.evaluate(
        () =>
          getComputedStyle(document.querySelector(".sidebar ul") ?? document.body).listStyleType,
      ),
    )
    .toBe("square");
  expect(await page.locator("link[data-test-stylesheet]").count()).toBe(1);

  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator("main.landing")).toBeVisible();
  await expect.poll(async () => page.locator("link[data-test-stylesheet]").count()).toBe(0);
});
