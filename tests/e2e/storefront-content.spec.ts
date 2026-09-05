import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";

const browserErrors = new WeakMap<Page, string[]>();

test.beforeEach(({ page }) => {
  const errors: string[] = [];
  browserErrors.set(page, errors);
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
});

test.afterEach(({ page }) => {
  expect(browserErrors.get(page) ?? []).toEqual([]);
});

async function openPublicPage(page: Page, href: string, width: number) {
  await page.setViewportSize({ width, height: 1000 });
  const response = await page.goto(href);
  expect(response?.status()).toBe(200);
  await page.evaluate(() => document.fonts.ready);
}

async function expectNoHorizontalOverflow(page: Page) {
  expect(await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )).toBeLessThanOrEqual(1);
}

async function expectVisibleFocus(control: Locator) {
  await expect(control).toBeFocused();
  const outline = await control.evaluate((element) => {
    const style = getComputedStyle(element);
    return { style: style.outlineStyle, width: Number.parseFloat(style.outlineWidth) };
  });
  expect(outline.style).not.toBe("none");
  expect(outline.width).toBeGreaterThanOrEqual(2);
}

async function expectTouchTarget(control: Locator) {
  const rect = await control.boundingBox();
  expect(rect).not.toBeNull();
  expect(rect!.width).toBeGreaterThanOrEqual(44);
  expect(rect!.height).toBeGreaterThanOrEqual(44);
}

async function verifyResearch(
  page: Page,
  width: number,
  slug: "tirzepatide" | "aod-9604",
) {
  await openPublicPage(page, `/catalog/items/${slug}`, width);
  const section = page.getByRole("region", { name: "Verified research references", exact: true });
  await section.scrollIntoViewIfNeeded();
  await expect(section).toBeVisible();
  await expect(section.getByText(
    "Primary-source bibliography for the named compound. These studies did not test this catalog item.",
    { exact: true },
  )).toBeVisible();
  await expect(section.getByText(slug === "tirzepatide"
    ? "Randomized human research included"
    : "Animal research only", { exact: true })).toBeVisible();

  const disclosure = section.locator("details");
  const summary = disclosure.locator("summary");
  await expect(disclosure).toHaveCount(1);
  await expect(disclosure).not.toHaveAttribute("open");
  await expect(summary).toContainText("2 verified references");
  await expectTouchTarget(summary);
  await summary.focus();
  await page.keyboard.press("Enter");
  await expect(disclosure).toHaveAttribute("open", "");
  await expectVisibleFocus(summary);

  const expectedPmids = slug === "tirzepatide"
    ? ["35658024", "37385275"]
    : ["11146367", "11713213"];
  const links = disclosure.getByRole("link");
  await expect(links).toHaveCount(2);
  for (const pmid of expectedPmids) {
    const link = disclosure.locator(`a[href="https://pubmed.ncbi.nlm.nih.gov/${pmid}/"]`);
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(link).toHaveAttribute("rel", "noopener noreferrer");
    await expectTouchTarget(link);
    await expect(disclosure.getByText(`PMID: ${pmid}`, { exact: true })).toBeVisible();
  }
  await page.keyboard.press("Tab");
  await expectVisibleFocus(links.first());
  await expectNoHorizontalOverflow(page);
  expect((await new AxeBuilder({ page }).include("#research-references").analyze()).violations).toEqual([]);

  await summary.focus();
  await page.keyboard.press("Space");
  await expect(disclosure).not.toHaveAttribute("open");
  await expectVisibleFocus(summary);
  await page.keyboard.press("Space");
  await expect(disclosure).toHaveAttribute("open", "");
  await expectNoHorizontalOverflow(page);
}

async function verifyUnmappedProduct(page: Page, width: number) {
  // Pinealon is an owner-supplied real catalog slug without an approved bibliography join.
  await openPublicPage(page, "/catalog/items/pinealon", width);
  await expect(page.getByRole("heading", { name: "Pinealon", exact: true, level: 1 })).toBeVisible();
  await expect(page.getByRole("region", { name: "Verified research references", exact: true })).toHaveCount(0);
  await expect(page.locator("#research-references")).toHaveCount(0);
  await expectNoHorizontalOverflow(page);
}

async function verifyWhyChoose(page: Page, width: number, columns: number) {
  await openPublicPage(page, "/", width);
  const section = page.getByRole("region", { name: "Why choose PropeptIQ", exact: true });
  await section.scrollIntoViewIfNeeded();
  await expect(section).toBeVisible();
  // Contrast and geometry must be measured after the real reveal settles.
  await expect(section).toHaveCSS("opacity", "1");
  await expect(section).toHaveCSS("transform", "matrix(1, 0, 0, 1, 0, 0)");
  const cards = section.getByRole("listitem");
  await expect(cards).toHaveCount(6);
  await expect(cards.getByRole("heading", { level: 3 })).toHaveText([
    "Catalog clarity",
    "Clear availability",
    "Exact variant selection",
    "Transparent quantity pricing",
    "Search from anywhere",
    "Research-use focus",
  ]);
  expect(await section.innerText()).not.toMatch(
    /third.party.tested|clinically.dosed|cGMP|certified|guaranteed|\bpurity\b|\bsterile\b|\btherapeutic\b|\b99(?:\.\d+)?%/iu,
  );
  const positions = await cards.evaluateAll((elements) => elements.map((element) => {
    const rect = element.getBoundingClientRect();
    return { x: rect.x, y: rect.y, width: rect.width };
  }));
  const firstRow = positions.filter((position) => Math.abs(position.y - positions[0]!.y) < 1);
  expect(firstRow).toHaveLength(columns);
  for (const card of positions) {
    expect(card.x).toBeGreaterThanOrEqual(0);
    expect(card.x + card.width).toBeLessThanOrEqual(width + 1);
  }
  expect((await new AxeBuilder({ page }).include("#why-choose-propeptiq").analyze()).violations).toEqual([]);
  await expectNoHorizontalOverflow(page);
}

async function verifyBrandTones(page: Page, width: number) {
  await openPublicPage(page, "/", width);
  const header = page.getByRole("banner");
  const footer = page.getByRole("contentinfo");
  const headerHome = header.getByRole("link", { name: "PROPEPTIQ LABS home", exact: true });
  const footerHome = footer.getByRole("link", { name: "PROPEPTIQ LABS home", exact: true });
  await expect(headerHome.locator(".brand-logo__wordmark")).toHaveCSS("color", "rgb(23, 25, 21)");
  await expect(header.locator("div.border-b.bg-canvas")).toHaveCSS("background-color", "rgb(244, 241, 232)");
  await expectTouchTarget(headerHome);
  await footerHome.scrollIntoViewIfNeeded();
  await expect(footerHome).toBeVisible();
  await expect(footer).toHaveCSS("background-color", "rgb(23, 25, 21)");
  await expect(footerHome.locator(".brand-logo__wordmark")).toHaveCSS("color", "rgb(244, 241, 232)");
  await expect(footerHome.locator(".brand-logo")).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expectTouchTarget(footerHome);
  for (const social of await footer.getByRole("region", { name: "Social media" }).getByRole("link").all()) {
    await expectTouchTarget(social);
  }
  await expectNoHorizontalOverflow(page);
}

// Keep each test declaration on its own source line for the repository batch runner.
test("verified human bibliography is keyboard usable at 375px", async ({ page }) => { await verifyResearch(page, 375, "tirzepatide"); });
test("verified human bibliography is keyboard usable at 768px", async ({ page }) => { await verifyResearch(page, 768, "tirzepatide"); });
test("verified human bibliography is keyboard usable at 1440px", async ({ page }) => { await verifyResearch(page, 1440, "tirzepatide"); });
test("animal-only bibliography is keyboard usable at 375px", async ({ page }) => { await verifyResearch(page, 375, "aod-9604"); });
test("animal-only bibliography is keyboard usable at 768px", async ({ page }) => { await verifyResearch(page, 768, "aod-9604"); });
test("animal-only bibliography is keyboard usable at 1440px", async ({ page }) => { await verifyResearch(page, 1440, "aod-9604"); });
test("unmapped Pinealon has no inferred bibliography at 375px", async ({ page }) => { await verifyUnmappedProduct(page, 375); });
test("unmapped Pinealon has no inferred bibliography at 768px", async ({ page }) => { await verifyUnmappedProduct(page, 768); });
test("unmapped Pinealon has no inferred bibliography at 1440px", async ({ page }) => { await verifyUnmappedProduct(page, 1440); });
test("Why choose has six truthful cards in one column at 375px", async ({ page }) => { await verifyWhyChoose(page, 375, 1); });
test("Why choose has six truthful cards in two columns at 768px", async ({ page }) => { await verifyWhyChoose(page, 768, 2); });
test("Why choose has six truthful cards in three columns at 1440px", async ({ page }) => { await verifyWhyChoose(page, 1440, 3); });
test("header and footer wordmarks retain contrasting tones at 375px", async ({ page }) => { await verifyBrandTones(page, 375); });
test("header and footer wordmarks retain contrasting tones at 768px", async ({ page }) => { await verifyBrandTones(page, 768); });
test("header and footer wordmarks retain contrasting tones at 1440px", async ({ page }) => { await verifyBrandTones(page, 1440); });
