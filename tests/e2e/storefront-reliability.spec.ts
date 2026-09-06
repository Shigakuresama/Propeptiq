import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

for (const width of [375, 768, 1024, 1440]) {
  test(`storefront refinement is accessible and contained at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 950 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    await page.evaluate(() => document.fonts.ready);
    await expect(page.getByRole("complementary", { name: "Promotion" })).toContainText("WINTER30 APPLIED AUTOMATICALLY");
    await expect(page.getByRole("complementary", { name: "Promotion" })).not.toContainText("USE CODE");
    const headings = page.locator("main h1, main h2, main h3, footer h2, .newsletter-prefooter h2");
    expect(await headings.evaluateAll((elements) => elements.every((el) => getComputedStyle(el).textTransform === "uppercase"))).toBe(true);
    const newsletter = page.getByRole("region", { name: "PropeptIQ newsletter" });
    expect(await newsletter.evaluate((el) => Boolean(el.compareDocumentPosition(document.querySelector("footer")!) & Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);
    expect(await newsletter.evaluate((el) => el.closest("footer") === null)).toBe(true);
    await expect(page.getByRole("region", { name: "Growth programs" }).getByRole("link")).toHaveCount(4);
    await expect(page.locator(".catalog-listing-card").getByText("Checkout unavailable", { exact: true })).toHaveCount(0);
    await expect(page.locator(".header-brand-motion__field")).toHaveCSS("animation-name", "none");
    await expect(page.locator(".header-brand-motion__field")).toHaveCSS("color", "rgb(20, 125, 120)");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await expect(page.locator("footer a[href='/']").filter({ hasNot: page.locator(".brand-logo") })).toHaveCount(0);
    const accessibility = await new AxeBuilder({ page }).analyze();
    expect(accessibility.violations).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath(`home-${width}.png`), fullPage: true });
  });
}

test("FAQ keyboard states and heading casing preserve answer text", async ({ page }) => {
  await page.goto("/");
  const entry = page.locator("#faq details").first();
  const summary = entry.locator("summary");
  await summary.focus();
  await page.keyboard.press("Enter");
  await expect(entry).toHaveAttribute("open", "");
  await expect(summary).toBeFocused();
  await expect(summary.locator("h3")).toHaveCSS("text-transform", "uppercase");
  await expect(entry.locator("p")).toHaveCSS("text-transform", "none");
  await page.keyboard.press("Space");
  await expect(entry).not.toHaveAttribute("open");
});

test("saved local session displays Account after navigation and refresh", async ({ page }) => {
  await page.goto("/sign-in?returnTo=%2Faccount");
  await page.getByRole("radio", { name: /^Fixed referred buyer/ }).check();
  await page.getByRole("button", { name: /Continue/ }).click();
  await page.waitForURL("**/checkout");
  await page.goto("/");
  await expect(page.getByRole("banner").getByRole("link", { name: "Account", exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("banner").getByRole("link", { name: "Account", exact: true })).toBeVisible();
  await page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Catalog", exact: true }).click();
  await page.waitForURL("**/catalog");
  await expect(page.getByRole("banner").getByRole("link", { name: "Account", exact: true })).toBeVisible();
});
