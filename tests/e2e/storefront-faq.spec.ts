import { expect, test } from "@playwright/test";

test("homepage FAQ keeps one answer open and structured data matches its visible copy", async ({ page }) => {
  await page.goto("/");
  const entries = page.locator("#faq details");
  await expect(entries).toHaveCount(8);
  const first = entries.nth(0).locator("summary");
  const second = entries.nth(1).locator("summary");
  await first.focus();
  await page.keyboard.press("Enter");
  await expect(entries.nth(0)).toHaveAttribute("open", "");
  await second.focus();
  await page.keyboard.press("Space");
  await expect(second).toBeFocused();
  await expect(entries.nth(1)).toHaveAttribute("open", "");
  await expect(entries.nth(0)).not.toHaveAttribute("open");
  await expect(page.locator("#faq details[open]")).toHaveCount(1);

  const visible = await entries.evaluateAll((nodes) => nodes.map((entry) => ({
    name: entry.querySelector("summary > span")!.textContent,
    text: entry.querySelector("p")!.textContent,
  })));
  const structured = await page.locator('script[type="application/ld+json"]').evaluateAll((nodes) =>
    nodes.map((node) => JSON.parse(node.textContent!)).filter((value) => value["@type"] === "FAQPage"),
  );
  expect(structured).toHaveLength(1);
  expect(structured[0].mainEntity.map((entry: { name: string; acceptedAnswer: { text: string } }) => ({
    name: entry.name, text: entry.acceptedAnswer.text,
  }))).toEqual(visible);
});

test("homepage FAQ works without JavaScript", async ({ browser, baseURL }) => {
  if (!baseURL) throw new Error("The storefront browser base URL must be configured.");
  const context = await browser.newContext({ baseURL, javaScriptEnabled: false, viewport: { width: 375, height: 812 } });
  try {
    const page = await context.newPage();
    await page.goto("/");
    const entries = page.locator("#faq details");
    await expect(entries).toHaveCount(8);
    await entries.nth(0).locator("summary").click();
    await expect(entries.nth(0).locator("p")).toBeVisible();
    await entries.nth(1).locator("summary").click();
    await expect(entries.nth(1).locator("p")).toBeVisible();
    await expect(entries.nth(0)).not.toHaveAttribute("open");
  } finally {
    await context.close();
  }
});
