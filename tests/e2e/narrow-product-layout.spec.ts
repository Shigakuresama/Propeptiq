import { expect, test, type Browser, type Locator, type Page, type TestInfo } from "@playwright/test";

const productPath = "/catalog/items/tirzepatide";
const syntheticLongTitle = "SYNTHETICUNBROKENPRODUCTTITLEFORNARROWVIEWPORTVALIDATION";
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

async function expectViewportWidth(page: Page, width: number) {
  expect(page.viewportSize()?.width).toBe(width);
  expect(await page.evaluate(() => window.innerWidth)).toBe(width);
  expect(await page.evaluate(() => document.documentElement.clientWidth)).toBe(width);
}

async function horizontalBounds(locator: Locator) {
  return locator.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return { left: bounds.left, right: bounds.right, width: bounds.width, height: bounds.height };
  });
}

async function expectInside(container: Locator, targets: readonly Locator[], label: string) {
  const containerBounds = await horizontalBounds(container);
  for (const [index, target] of targets.entries()) {
    const bounds = await horizontalBounds(target);
    expect(bounds.left, `${label} target ${index} left`).toBeGreaterThanOrEqual(containerBounds.left - 0.5);
    expect(bounds.right, `${label} target ${index} right`).toBeLessThanOrEqual(containerBounds.right + 0.5);
  }
}

async function expectPrimaryGeometry(page: Page, width: number) {
  await expectViewportWidth(page, width);
  await page.evaluate(() => document.fonts.ready);
  const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
  const primary = [
    page.locator('header[data-motion-sequence="dossier-intro"]'),
    page.locator(".catalog-detail-image"),
    page.locator(".catalog-detail-content"),
  ];
  for (const [index, locator] of primary.entries()) {
    await expect(locator).toBeVisible();
    const bounds = await horizontalBounds(locator);
    expect(bounds.left, `${width}px primary ${index} left`).toBeGreaterThanOrEqual(-0.5);
    expect(bounds.right, `${width}px primary ${index} right`).toBeLessThanOrEqual(clientWidth + 0.5);
  }
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth),
    `${width}px document overflow`,
  ).toBeLessThanOrEqual(1);
}

async function expectNarrowDescendants(page: Page) {
  const content = page.locator(".catalog-detail-content");
  const configurations = page.getByRole("heading", { name: "Supplied configurations" });
  const summary = page.getByRole("status", { name: "Purchase summary" });
  const definitionList = summary.locator("dl");
  const add = summary.getByRole("button", { name: "Add Tirzepatide to preview cart" });
  await expectInside(content, [configurations, summary, definitionList, add], "195px detail content");

  const exactInput = page.getByRole("spinbutton", { name: "Exact quantity" });
  const exactRow = exactInput.locator("..");
  const decrease = exactRow.getByRole("button", { name: "Decrease quantity" });
  const increase = exactRow.getByRole("button", { name: "Increase quantity" });
  await expectInside(content, [exactRow], "195px quantity content");
  await expectInside(exactRow, [decrease, exactInput, increase], "195px quantity row");
  for (const control of [decrease, increase]) {
    const bounds = await horizontalBounds(control);
    expect(bounds.width).toBeGreaterThanOrEqual(44);
    expect(bounds.height).toBeGreaterThanOrEqual(44);
  }

  const related = page.getByRole("list", { name: /^Related products,/u });
  const relatedBounds = await horizontalBounds(related);
  const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
  expect(relatedBounds.left).toBeGreaterThanOrEqual(-0.5);
  expect(relatedBounds.right).toBeLessThanOrEqual(clientWidth + 0.5);
  expect(await related.evaluate((list) => list.scrollWidth)).toBeGreaterThan(
    await related.evaluate((list) => list.clientWidth),
  );
}

async function runNarrowProductCase(page: Page, width: 195 | 240 | 320, testInfo: TestInfo) {
  await page.setViewportSize({ width, height: 1000 });
  const forbiddenRequests: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (
      /\/api\/(?:checkout|stripe|provider|tax|shipping|fulfillment)(?:\/|$)/iu.test(url.pathname) ||
      /(?:^|\.)stripe\.com$/iu.test(url.hostname)
    ) {
      forbiddenRequests.push(request.url());
    }
  });
  const response = await page.goto(productPath);
  expect(response?.status()).toBe(200);
  await expectPrimaryGeometry(page, width);
  if (width === 195) await expectNarrowDescendants(page);
  if (width === 320) {
    expect((await horizontalBounds(page.getByRole("spinbutton", { name: "Exact quantity" }))).width)
      .toBeCloseTo(96, 0);
  }

  await page.evaluate(() => window.scrollTo(0, 0));
  if (width === 195 || width === 320) {
    await page.screenshot({ path: testInfo.outputPath(`narrow-product-${width}.png`) });
  }

  const heading = page.getByRole("heading", { level: 1, name: "Tirzepatide" });
  await heading.evaluate((element, label) => { element.textContent = label; }, syntheticLongTitle);
  await expectPrimaryGeometry(page, width);
  if (width === 195) {
    await expectNarrowDescendants(page);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: testInfo.outputPath("narrow-product-195-long-title.png") });
  }

  if (width === 320) {
    const add = page.getByRole("status", { name: "Purchase summary" })
      .getByRole("button", { name: "Add Tirzepatide to preview cart" });
    await add.click();
    await expect(page.getByRole("status", { name: "Cart updates" })).toContainText("1 unit in cart");
    await expect(page.getByRole("dialog", { name: "Your cart" })).toHaveCount(0);
    const cart = page.getByRole("link", { name: "Cart, 1 requested unit" });
    await cart.click();
    await expect(page.getByRole("dialog", { name: "Your cart" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth))
      .toBeLessThanOrEqual(1);
  }
  expect(forbiddenRequests).toEqual([]);
}

test("narrow product layout contains real and long titles at 195px", async ({ page }, testInfo) => runNarrowProductCase(page, 195, testInfo));
test("narrow product layout contains real and long titles at 240px", async ({ page }, testInfo) => runNarrowProductCase(page, 240, testInfo));
test("narrow product layout contains real and long titles at 320px and keeps cart explicit", async ({ page }, testInfo) => runNarrowProductCase(page, 320, testInfo));

async function runNoJavaScriptCase(
  browser: Browser,
  baseURL: string | undefined,
  width: 195 | 320,
) {
  if (baseURL === undefined) throw new Error("Playwright baseURL is required.");
  const context = await browser.newContext({
    javaScriptEnabled: false,
    reducedMotion: "reduce",
    viewport: { width, height: 1000 },
  });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  try {
    const response = await page.goto(new URL(productPath, baseURL).toString());
    expect(response?.status()).toBe(200);
    await expectViewportWidth(page, width);
    await page.evaluate(() => document.fonts.ready);
    const gallery = page.getByRole("region", { name: "Tirzepatide product illustration gallery" });
    await expect(gallery.getByRole("img").first()).toBeVisible();
    await expect(gallery.getByRole("status")).toHaveText("View 1 of 6: Front");
    await expect(page.getByRole("heading", { level: 1, name: "Tirzepatide" })).toBeVisible();
    await expect(page.getByRole("status", { name: "Purchase summary" })).toBeVisible();
    await expect(page.getByRole("contentinfo")).toBeVisible();
    await expect(page.getByRole("button", { name: "Search PropeptIQ" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Mobile purchase controls" })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth))
      .toBeLessThanOrEqual(1);
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
}

test("narrow product layout preserves no-JavaScript content at 195px", async ({ browser, baseURL }) => runNoJavaScriptCase(browser, baseURL, 195));
test("narrow product layout preserves no-JavaScript content at 320px", async ({ browser, baseURL }) => runNoJavaScriptCase(browser, baseURL, 320));
