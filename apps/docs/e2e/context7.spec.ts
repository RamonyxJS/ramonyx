import { expect, test } from "@playwright/test";

import { CONTEXT7_ASK_ENDPOINT, CONTEXT7_LLMS_URL, CONTEXT7_SITE_KEY } from "../src/context7.ts";

test("Context7 Ask: verification, hidden note, llms, dan markdown docs", async ({
  page,
  request,
}) => {
  await page.goto("/docs/getting-started");
  await expect(page.locator('meta[name="context7-site-verification"]')).toHaveAttribute(
    "content",
    CONTEXT7_SITE_KEY,
  );
  const note = page.locator("blockquote[data-context7-ask]");
  await expect(note).toHaveAttribute("aria-hidden", "true");
  await expect(note).toHaveClass(/sr-only/);
  await expect(note).toContainText("Search");
  await expect(note).toContainText(`This site has a search endpoint: ${CONTEXT7_ASK_ENDPOINT}`);
  await expect(note).toContainText(`Page index: ${CONTEXT7_LLMS_URL}`);

  const llms = await request.get("/machine/llms.txt");
  await expect(llms).toBeOK();
  const llmsText = await llms.text();
  expect(llmsText).toContain("## Search");
  expect(llmsText).toContain(CONTEXT7_ASK_ENDPOINT);

  const markdown = await request.get("/docs/getting-started.md");
  await expect(markdown).toBeOK();
  const markdownText = await markdown.text();
  expect(markdownText.startsWith("## Search")).toBe(true);
  expect(markdownText).toContain(CONTEXT7_ASK_ENDPOINT);
  expect(markdownText).toContain(CONTEXT7_LLMS_URL);

  const notFoundMarkdown = await request.get("/404.md");
  await expect(notFoundMarkdown).toBeOK();
  expect((await notFoundMarkdown.text()).startsWith("## Search")).toBe(true);
});
