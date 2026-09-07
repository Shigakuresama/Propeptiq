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

async function footerDockGeometry(page: Page) {
  return page.evaluate(() => {
    const root = document.documentElement;
    const rectangle = (selector: string) => {
      const element = document.querySelector<HTMLElement>(selector);
      if (element === null) return null;
      const bounds = element.getBoundingClientRect();
      return {
        bottom: bounds.bottom,
        height: bounds.height,
        left: bounds.left,
        right: bounds.right,
        top: bounds.top,
        width: bounds.width,
      };
    };
    const layout = document.querySelector<HTMLElement>(".public-layout");
    const footer = document.querySelector<HTMLElement>(".public-layout > footer");
    return {
      atEnd: Math.abs(window.scrollY + root.clientHeight - root.scrollHeight),
      clientHeight: root.clientHeight,
      footer: rectangle(".public-layout > footer"),
      footerBottomRow: rectangle(".footer-bottom-row"),
      footerPaddingBottom: footer ? getComputedStyle(footer).paddingBottom : "missing",
      purchase: rectangle('[role="region"][aria-label="Mobile purchase controls"]'),
      purchaseVisible: document.querySelector<HTMLElement>('[role="region"][aria-label="Mobile purchase controls"]')?.dataset.visible ?? "missing",
      reservation: layout?.style.getPropertyValue("--public-action-dock-reserved-height") || "missing",
      scrollHeight: root.scrollHeight,
      scrollY: window.scrollY,
      search: rectangle('button[aria-label="Search PropeptIQ"]'),
    };
  });
}

async function readCartStatusFooterGeometry(
  page: Page,
  route: "/" | "/cart",
  viewport: { width: 195 | 320; height: 520 | 812 },
) {
  await page.setViewportSize(viewport);
  const response = await page.goto(route);
  expect(response?.status()).toBe(200);
  await page.evaluate(async () => {
    await document.fonts.ready;
    window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" });
  });
  await expect.poll(() => page.evaluate(() => {
    const root = document.documentElement;
    const visibleImagesReady = [...document.images]
      .filter((image) => {
        const bounds = image.getBoundingClientRect();
        return bounds.bottom > 0 && bounds.top < root.clientHeight;
      })
      .every((image) => image.complete && image.naturalWidth > 0 && image.naturalHeight > 0);
    return {
      atEnd: Math.abs(window.scrollY + root.clientHeight - root.scrollHeight) <= 1,
      fonts: document.fonts.status,
      visibleImagesReady,
    };
  })).toEqual({ atEnd: true, fonts: "loaded", visibleImagesReady: true });

  await page.evaluate(async () => {
    let previous = "";
    let stableFrames = 0;
    for (let frame = 0; frame < 180 && stableFrames < 6; frame += 1) {
      await new Promise<void>((resolveFrame) => requestAnimationFrame(() => resolveFrame()));
      const footer = document.querySelector<HTMLElement>(".public-layout > footer")?.getBoundingClientRect();
      const status = document.querySelector<HTMLElement>('p[aria-label="Cart updates"]')?.getBoundingClientRect();
      const signature = JSON.stringify({
        footerBottom: footer?.bottom,
        scrollHeight: document.documentElement.scrollHeight,
        scrollY: window.scrollY,
        statusBottom: status?.bottom,
      });
      stableFrames = signature === previous ? stableFrames + 1 : 0;
      previous = signature;
    }
    if (stableFrames < 6) throw new Error("Footer geometry did not settle within 180 animation frames.");
  });

  const status = page.getByRole("status", { name: "Cart updates" });
  await expect(status).toHaveCount(1);
  await expect(status).toHaveAttribute("aria-label", "Cart updates");
  await expect(status).toHaveAttribute("aria-live", "polite");
  await expect(status).toHaveAttribute("aria-atomic", "true");
  await expect(status).toHaveAttribute("role", "status");

  return status.evaluate((element) => {
    const root = document.documentElement;
    const statusBounds = element.getBoundingClientRect();
    const footerBounds = document.querySelector<HTMLElement>(".public-layout > footer")!.getBoundingClientRect();
    const statusStyle = getComputedStyle(element);
    return {
      atEnd: window.scrollY + root.clientHeight - root.scrollHeight,
      footerBottomFromDocumentBottom: footerBounds.bottom + window.scrollY - root.scrollHeight,
      footerBottomFromViewportBottom: footerBounds.bottom - root.clientHeight,
      horizontalOffenders: [...document.body.querySelectorAll<HTMLElement>("*")]
        .filter((candidate) => {
          const bounds = candidate.getBoundingClientRect();
          return bounds.left < -0.5 || bounds.right > root.clientWidth + 0.5;
        })
        .slice(0, 20)
        .map((candidate) => {
          const bounds = candidate.getBoundingClientRect();
          return {
            ariaLabel: candidate.getAttribute("aria-label"),
            className: candidate.getAttribute("class") ?? "",
            left: bounds.left,
            right: bounds.right,
            tagName: candidate.tagName,
          };
        }),
      horizontalOverflow: root.scrollWidth - root.clientWidth,
      status: {
        documentBottom: statusBounds.bottom + window.scrollY,
        documentTop: statusBounds.top + window.scrollY,
        height: statusBounds.height,
        overflow: statusStyle.overflow,
        position: statusStyle.position,
        width: statusBounds.width,
      },
      statusBottomFromFooterBottom: statusBounds.bottom - footerBounds.bottom,
    };
  });
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

test("shared footer exposes the exact links and omits the disabled newsletter on home catalog and product routes", async ({ page }) => {
  const newsletterRequests: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && new URL(request.url()).pathname === "/api/newsletter") {
      newsletterRequests.push(request.url());
    }
  });

  for (const route of ["/", "/catalog", "/catalog/items/tirzepatide"] as const) {
    const footer = await openFooter(page, route, 375);
    await expect(page.getByRole("form", { name: "Newsletter signup" })).toHaveCount(0);
    await expect(page.getByRole("textbox", { name: "Email address" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Subscribe", exact: true })).toHaveCount(0);
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
      { href: "/contact", label: "Contact us" },
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
      await expectContained(page, footer, width);
    }
  }
});

test("home cart status remains hidden without extending the 320px document footer", async ({ page }) => {
  const geometry = await readCartStatusFooterGeometry(page, "/", { width: 320, height: 812 });
  expect(Math.abs(geometry.atEnd)).toBeLessThanOrEqual(1);
  expect(Math.abs(geometry.footerBottomFromDocumentBottom)).toBeLessThanOrEqual(1);
  expect(Math.abs(geometry.footerBottomFromViewportBottom)).toBeLessThanOrEqual(1);
  expect(
    geometry.horizontalOverflow,
    `horizontal offenders: ${JSON.stringify(geometry.horizontalOffenders)}`,
  ).toBeLessThanOrEqual(1);
  expect(geometry.status).toEqual({
    documentBottom: 1,
    documentTop: 0,
    height: 1,
    overflow: "hidden",
    position: "absolute",
    width: 1,
  });
  expect(geometry.statusBottomFromFooterBottom).toBeLessThanOrEqual(0);
});

test("cart status remains hidden without extending the 195px document footer", async ({ page }) => {
  const geometry = await readCartStatusFooterGeometry(page, "/cart", { width: 195, height: 520 });
  expect(Math.abs(geometry.atEnd)).toBeLessThanOrEqual(1);
  expect(Math.abs(geometry.footerBottomFromDocumentBottom)).toBeLessThanOrEqual(1);
  expect(Math.abs(geometry.footerBottomFromViewportBottom)).toBeLessThanOrEqual(1);
  expect(
    geometry.horizontalOverflow,
    `horizontal offenders: ${JSON.stringify(geometry.horizontalOffenders)}`,
  ).toBeLessThanOrEqual(1);
  expect(geometry.status).toEqual({
    documentBottom: 1,
    documentTop: 0,
    height: 1,
    overflow: "hidden",
    position: "absolute",
    width: 1,
  });
  expect(geometry.statusBottomFromFooterBottom).toBeLessThanOrEqual(0);

  const catalogLink = page.getByRole("link", { name: "Continue to catalog" });
  await expect(catalogLink).toHaveAttribute("href", "/catalog");
  const catalogBounds = await catalogLink.boundingBox();
  expect(catalogBounds).not.toBeNull();
  expect(catalogBounds!.x).toBeGreaterThanOrEqual(-1);
  expect(catalogBounds!.x + catalogBounds!.width).toBeLessThanOrEqual(196);
  expect(catalogBounds!.height).toBeGreaterThanOrEqual(44);
  for (let tab = 0; tab < 30 && !(await catalogLink.evaluate((link) => document.activeElement === link)); tab += 1) {
    await page.keyboard.press("Tab");
  }
  await expect(catalogLink).toBeFocused();
  expect(await catalogLink.evaluate((link) => {
    const style = getComputedStyle(link);
    const visibleOutline = style.outlineStyle !== "none" && Number.parseFloat(style.outlineWidth) >= 2;
    return link.matches(":focus-visible") && (visibleOutline || style.boxShadow !== "none");
  })).toBe(true);
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
  const search = page.getByRole("button", { name: "Search PropeptIQ" });
  const purchase = page.getByRole("region", { name: "Mobile purchase controls" });
  const bottomRow = footer.locator(".footer-bottom-row");
  await expect(bottomRow).toBeVisible();
  await expect(purchase).toBeVisible();
  await expect(search).toBeVisible();
  await expect.poll(async () => {
    const geometry = await footerDockGeometry(page);
    const occupiedHeight = Math.ceil(geometry.clientHeight - (geometry.purchase?.top ?? geometry.clientHeight));
    const reservation = Number.parseFloat(geometry.reservation);
    const footerPadding = Number.parseFloat(geometry.footerPaddingBottom);
    return {
      footerPaddingCommitted: footerPadding >= reservation + 16,
      purchaseVisible: geometry.purchaseVisible === "true",
      reservationCommitted: reservation >= occupiedHeight,
    };
  }).toEqual({
    footerPaddingCommitted: true,
    purchaseVisible: true,
    reservationCommitted: true,
  });
  const reservedGeometry = await footerDockGeometry(page);
  console.info(`Task 18C reserved footer geometry: ${JSON.stringify(reservedGeometry)}`);

  await page.evaluate(() => {
    window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" });
  });
  await expect.poll(async () => (await footerDockGeometry(page)).atEnd).toBeLessThanOrEqual(1);
  const settledGeometry = await footerDockGeometry(page);
  expect(Math.abs(settledGeometry.footer!.bottom - settledGeometry.clientHeight))
    .toBeLessThanOrEqual(1);
  console.info(`Task 18C settled footer geometry: ${JSON.stringify(settledGeometry)}`);
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
  expect(searchBounds!.y + searchBounds!.height).toBeLessThan(purchaseBounds!.y);
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
    await expect(page.getByRole("form", { name: "Newsletter signup" })).toHaveCount(0);
    await expect(footer.getByRole("link", { name: "Contact us", exact: true })).toHaveAttribute("href", "/contact");
    const details = footer.getByRole("navigation", { name: "Footer", exact: true }).locator("details");
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
