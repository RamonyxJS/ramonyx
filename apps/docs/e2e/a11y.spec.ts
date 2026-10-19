import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

// A11y: tidak ada pelanggaran serious/critical pada landing + halaman docs.
for (const path of ["/", "/docs/getting-started"]) {
  test(`a11y: ${path} bebas pelanggaran serious/critical`, async ({ page }) => {
    await page.goto(path);
    const hasil = await new AxeBuilder({ page }).analyze();
    const serius = hasil.violations.filter(
      (violation) => violation.impact === "serious" || violation.impact === "critical",
    );
    expect(serius.map((violation) => `${violation.id}: ${violation.help}`)).toEqual([]);
  });
}
