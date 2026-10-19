import { expect, test } from "@playwright/test";

// Gate kebijakan konten (ADR-0082): tidak ada dokumen internal di build publik.
test("policy: ADR internal 404, pencarian internal kosong, machine internal tidak ada", async ({
  page,
  request,
}) => {
  // ADR 0018 (owner decisions) = internal → 404, bukan konten.
  const adr = await page.goto("/docs/adr/0018-owner-decisions");
  expect(adr?.status()).toBe(404);
  await expect(page.getByText("Page not found")).toBeVisible();

  // Dokumen internal lain juga 404.
  for (const path of ["/docs/security/threat-model", "/docs/PRD", "/docs/IMPLEMENTATION_STATUS"]) {
    const response = await page.goto(path);
    expect(response?.status()).toBe(404);
  }

  // Pencarian tidak mengembalikan hasil internal.
  for (const query of ["threat-model", "IMPLEMENTATION_STATUS", "asvs-mapping"]) {
    await page.goto("/");
    // Tunggu hidrasi sebelum berinteraksi (tombol SSR belum punya handler).
    await page.waitForFunction(() => document.documentElement.classList.contains("js"));
    await page.getByRole("button", { name: /Search docs/ }).click();
    const dialog = page.getByRole("dialog", { name: "Search documentation" });
    await dialog.getByRole("searchbox").fill(query);
    await expect(dialog.getByText(/No results/)).toBeVisible();
    await page.keyboard.press("Escape");
  }

  // Machine layer internal tidak disajikan.
  expect((await request.get("/machine/security.json")).status()).toBe(404);
  expect((await request.get("/machine/todo.json")).status()).toBe(404);

  // llms.txt publik tidak menautkan docs internal / alias legacy.
  const llms = await (await request.get("/machine/llms.txt")).text();
  expect(llms).not.toContain("docs/internal");
  expect(llms).not.toContain("/dokumen/");
  expect(llms).not.toContain("threat-model");
});
