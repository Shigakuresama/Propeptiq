import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test";

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

async function openFooter(page: Page, route: string, width: number) {
  await page.setViewportSize({ width, height: width < 768 ? 812 : 1000 });
  const response = await page.goto(route);
  expect(response?.status()).toBe(200);
  await page.evaluate(() => document.fonts.ready);
  const footer = page.getByRole("contentinfo");
  await footer.scrollIntoViewIfNeeded();
  return footer;
}

async function expectContained(
  page: Page,
  root: Locator,
  width: number,
  pageWide = true,
) {
  const layout = await root.evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
    descendants: [...element.querySelectorAll<HTMLElement>("*")]
      .filter((child) => {
        const bounds = child.getBoundingClientRect();
        return bounds.left < -0.5 || bounds.right > document.documentElement.clientWidth + 0.5;
      })
      .map((child) => ({
        className: child.getAttribute("class") ?? "",
        tagName: child.tagName,
        text: child.textContent?.trim().slice(0, 80) ?? "",
      })),
  }));
  expect(layout.scrollWidth - layout.clientWidth, `${width}px footer internal overflow`).toBeLessThanOrEqual(1);
  expect(layout.descendants, `${width}px footer viewport offenders`).toEqual([]);
  if (!pageWide) return;
  const pageLayout = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    offenders: [...document.body.querySelectorAll<HTMLElement>("*")]
      .filter((element) => {
        const bounds = element.getBoundingClientRect();
        return bounds.left < -0.5 || bounds.right > document.documentElement.clientWidth + 0.5;
      })
      .map((element) => ({
        className: element.getAttribute("class") ?? "",
        left: element.getBoundingClientRect().left,
        right: element.getBoundingClientRect().right,
        tagName: element.tagName,
        text: element.textContent?.trim().slice(0, 80) ?? "",
      })),
  }));
  expect(
    pageLayout.scrollWidth - pageLayout.clientWidth,
    `${width}px page overflow: ${JSON.stringify(pageLayout.offenders)}`,
  ).toBeLessThanOrEqual(1);
}

async function expectTouchTarget(locator: Locator) {
  const bounds = await locator.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.width).toBeGreaterThanOrEqual(44);
  expect(bounds!.height).toBeGreaterThanOrEqual(44);
}

async function expectFooterColumns(
  page: Page,
  width: 375 | 768 | 1440,
  expectedColumns: number,
  testInfo: TestInfo,
) {
  for (const [routeLabel, route] of [
    ["home", "/"],
    ["catalog", "/catalog"],
    ["pdp", "/catalog/items/tirzepatide"],
  ] as const) {
    const footer = await openFooter(page, route, width);
    const items = footer.locator(".footer-brand, nav[aria-label='Footer'] > details");
    await expect(items).toHaveCount(4);
    const leftEdges = await items.evaluateAll((elements) =>
      elements.map((element) => Math.round(element.getBoundingClientRect().left)),
    );
    expect(new Set(leftEdges).size).toBe(expectedColumns);
    for (const summary of await footer.locator("summary").all()) await expectTouchTarget(summary);
    for (const link of await footer.getByRole("link").all()) await expectTouchTarget(link);
    await expectContained(page, footer, width);
    await footer.screenshot({
      path: testInfo.outputPath(`footer-${routeLabel}-${width}.png`),
      style: `
        .skip-link,
        .public-layout > header,
        .site-search-launcher-lane,
        .mobile-purchase-bar {
          visibility: hidden !important;
        }
      `,
    });
  }
}

test("footer forms one stacked column at 375px", async ({ page }, testInfo) => {
  await expectFooterColumns(page, 375, 1, testInfo);
});

test("footer forms two columns at 768px", async ({ page }, testInfo) => {
  await expectFooterColumns(page, 768, 2, testInfo);
});

test("footer forms four columns at 1440px", async ({ page }, testInfo) => {
  await expectFooterColumns(page, 1440, 4, testInfo);
});

test("shared footer exposes the exact links and one disabled newsletter on home catalog and product routes", async ({ page }) => {
  const newsletterRequests: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && new URL(request.url()).pathname === "/api/newsletter") {
      newsletterRequests.push(request.url());
    }
  });

  for (const route of ["/", "/catalog", "/catalog/items/tirzepatide"] as const) {
    const footer = await openFooter(page, route, 375);
    await expect(page.getByRole("form", { name: "Newsletter signup" })).toHaveCount(1);
    await expect(footer.getByRole("form", { name: "Newsletter signup" })).toHaveCount(1);
    await expect(footer.getByRole("textbox", { name: "Email address" })).toHaveCount(1);
    await expect(footer.getByRole("textbox", { name: "Email address" })).toBeDisabled();
    await expect(footer.getByRole("checkbox")).not.toBeChecked();
    const subscribe = footer.getByRole("button", { name: "Subscribe" });
    await expect(subscribe).toBeDisabled();
    await subscribe.evaluate((button) => {
      if (button instanceof HTMLButtonElement) button.click();
    });
    await expect(footer.getByRole("status")).toHaveText(
      "Newsletter signup is temporarily unavailable.",
    );
    expect(await footer.getByRole("navigation", { name: "Footer" }).getByRole("link").evaluateAll(
      (links) => links.map((link) => ({ href: link.getAttribute("href"), label: link.textContent?.trim() })),
    )).toEqual([
      { href: "/catalog", label: "Catalog" },
      { href: "/cart", label: "Cart" },
      { href: "/rewards", label: "Rewards" },
      { href: "/partners", label: "Partner Program" },
      { href: "/quality-records", label: "Quality Records" },
      { href: "/account/orders", label: "Order tracking" },
      { href: "/#faq", label: "FAQ" },
      { href: "/research-use-policy", label: "Research Use Only" },
    ]);
    await expect(footer).toContainText(`© ${new Date().getFullYear()} PROPEPTIQ LABS`);
  }

  expect(newsletterRequests).toEqual([]);
});

test("native footer disclosures toggle with Enter and Space and retain visible focus", async ({ page }) => {
  const footer = await openFooter(page, "/catalog", 375);
  const disclosures = footer.locator("nav[aria-label='Footer'] details");
  await expect(disclosures).toHaveCount(3);
  for (let index = 0; index < 3; index += 1) {
    await expect(disclosures.nth(index)).toHaveAttribute("open", "");
  }

  const summary = disclosures.first().locator("summary");
  await summary.focus();
  await expect(summary).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(disclosures.first()).not.toHaveAttribute("open");
  await page.keyboard.press("Space");
  await expect(disclosures.first()).toHaveAttribute("open", "");
  expect(await summary.evaluate((element) => {
    const style = getComputedStyle(element);
    return element.matches(":focus-visible") &&
      style.outlineStyle !== "none" && Number.parseFloat(style.outlineWidth) >= 2;
  })).toBe(true);
});

test("footer long content stays contained at 195px and 320px", async ({ page }) => {
  for (const width of [195, 320] as const) {
    for (const route of ["/", "/catalog", "/catalog/items/tirzepatide"] as const) {
      const footer = await openFooter(page, route, width);
      const hasKnownPdpPageOverflow = width === 195 && route === "/catalog/items/tirzepatide";
      await expectContained(page, footer, width, !hasKnownPdpPageOverflow);
    }
  }
});

test("footer FAQ native anchor reactivates when the fragment is already current", async ({ page }) => {
  await openFooter(page, "/", 375);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const faq = page.getByRole("navigation", { name: "Footer" }).getByRole("link", {
      name: "FAQ",
      exact: true,
    });
    await faq.click();
    await expect(page).toHaveURL(/\/#faq$/u);
    await expect(page.getByRole("heading", {
      name: "Frequently Asked Questions",
      exact: true,
    })).toBeInViewport({ ratio: 1 });
    await faq.scrollIntoViewIfNeeded();
  }
});

test("footer clears fixed public controls and passes Axe under reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const footer = await openFooter(page, "/catalog/items/tirzepatide", 375);
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const search = page.getByRole("button", { name: "Search PropeptIQ" });
  const purchase = page.getByRole("region", { name: "Mobile purchase controls" });
  const bottomRow = footer.locator(".footer-bottom-row");
  await expect(bottomRow).toBeVisible();
  await expect(purchase).toBeVisible();
  await expect(search).toBeVisible();
  const [searchBounds, purchaseBounds, rowBounds] = await Promise.all([
    search.boundingBox(),
    purchase.boundingBox(),
    bottomRow.boundingBox(),
  ]);
  expect(searchBounds).not.toBeNull();
  expect(purchaseBounds).not.toBeNull();
  expect(rowBounds).not.toBeNull();
  expect(
    searchBounds!.x < rowBounds!.x + rowBounds!.width &&
      searchBounds!.x + searchBounds!.width > rowBounds!.x &&
      searchBounds!.y < rowBounds!.y + rowBounds!.height &&
      searchBounds!.y + searchBounds!.height > rowBounds!.y,
  ).toBe(false);
  expect(
    purchaseBounds!.x < rowBounds!.x + rowBounds!.width &&
      purchaseBounds!.x + purchaseBounds!.width > rowBounds!.x &&
      purchaseBounds!.y < rowBounds!.y + rowBounds!.height &&
      purchaseBounds!.y + purchaseBounds!.height > rowBounds!.y,
  ).toBe(false);
  expect(purchaseBounds!.y + purchaseBounds!.height).toBeLessThan(searchBounds!.y);
  expect((await new AxeBuilder({ page }).include("footer").analyze()).violations).toEqual([]);
});

test("footer content and native disclosures remain available without JavaScript", async ({ browser, baseURL }) => {
  if (baseURL === undefined) throw new Error("Playwright baseURL is required.");
  const context = await browser.newContext({
    javaScriptEnabled: false,
    reducedMotion: "reduce",
    viewport: { width: 375, height: 812 },
  });
  const page = await context.newPage();
  try {
    await page.goto(new URL("/catalog", baseURL).toString());
    const footer = page.getByRole("contentinfo");
    await expect(footer.getByRole("form", { name: "Newsletter signup" })).toHaveCount(1);
    const details = footer.locator("details");
    await expect(details).toHaveCount(3);
    await expect(details.first()).toHaveAttribute("open", "");
    await details.first().locator("summary").focus();
    await page.keyboard.press("Enter");
    await expect(details.first()).not.toHaveAttribute("open");
    await expectContained(page, footer, 375);
  } finally {
    await context.close();
  }
});
