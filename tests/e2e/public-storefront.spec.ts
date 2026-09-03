import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page, type Route } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { FaqSection } from "../../src/components/site/faq-section";

type PlaywrightTransformedHostElement = Readonly<{
  __pw_type: "jsx";
  type: string;
  props: Readonly<Record<string, unknown>>;
  key: string | number | undefined;
}>;

function playwrightHostTreeToReact(node: unknown): ReactNode {
  if (
    node === null ||
    node === undefined ||
    typeof node === "string" ||
    typeof node === "number" ||
    typeof node === "boolean"
  ) {
    return node;
  }
  if (Array.isArray(node)) return node.map(playwrightHostTreeToReact);
  if (
    typeof node !== "object" ||
    (node as { __pw_type?: unknown }).__pw_type !== "jsx" ||
    typeof (node as { type?: unknown }).type !== "string"
  ) {
    throw new TypeError("Unexpected transformed FAQ server markup.");
  }

  const element = node as PlaywrightTransformedHostElement;
  const { children, ...attributes } = element.props;
  const props: Record<string, unknown> = { ...attributes };
  if (element.key !== undefined) props.key = element.key;
  const childNodes = children === undefined
    ? []
    : Array.isArray(children)
      ? children
      : [children];
  return createElement(
    element.type,
    props,
    ...childNodes.map(playwrightHostTreeToReact),
  );
}

type PublicRoute =
  | "/"
  | "/catalog"
  | "/catalog/items/tirzepatide"
  | "/catalog/synthetic-reference-alpha"
  | "/cart"
  | "/quality-records"
  | "/research-use-policy";

const screenshotDirectory = path.resolve(
  process.cwd(),
  ".superpowers/sdd/2026-09-02-propeptiq-visible-storefront-correction/screenshots",
);
const localTestVariantId = "55000000-0000-4000-8000-000000000001";
const tirzepatideVariantIds = {
  tr5: "64922357-4f10-5d9d-be72-ba5f492cfa13",
  tr30: "5ff78cc3-c541-5bf4-9f3b-12be2222cc75",
  tr60: "d6b26e70-2a1b-599c-93f0-c85cd014ffd5",
} as const;
const fictionalSearchIndex = {
  version: 1,
  entries: [
    ...Array.from({ length: 12 }, (_, index) => {
      const ordinal = index + 1;
      const suffix = ordinal === 1
        ? "synthetic-alpha"
        : `synthetic-result-${String(ordinal).padStart(2, "0")}`;
      return {
        id: `product:fictional-${ordinal}`,
        group: "products",
        title: `Fictional Product ${String(ordinal).padStart(2, "0")}`,
        href: `/catalog/items/${suffix}`,
        description: "Clearly fictional browser-test product; not a real offer.",
        exactTerms: ordinal === 1 ? ["FICTIONAL-ALPHA"] : [`FICTIONAL-${ordinal}`],
        keywords: ["fictional", "browser fixture"],
        popularityRank: ordinal,
      };
    }),
    {
      id: "information:fictional-quality",
      group: "information",
      title: "Fictional Quality Page",
      href: "/quality-records",
      description: "Clearly fictional browser-test information entry.",
      exactTerms: ["FICTIONAL-QUALITY"],
      keywords: ["fictional", "quality"],
      popularityRank: null,
    },
    {
      id: "information:fictional-policy",
      group: "information",
      title: "Fictional Research Policy",
      href: "/research-use-policy",
      description: "Clearly fictional browser-test information entry.",
      exactTerms: ["FICTIONAL-POLICY"],
      keywords: ["fictional", "policy"],
      popularityRank: null,
    },
  ],
} as const;

type SearchRequestEvidence = Readonly<{
  method: string;
  origin: string;
  pathname: string;
  search: string;
}>;

test("FAQ native disclosure toggles with Enter and Space while keyboard focus remains visible", async ({
  page,
}) => {
  const fictionalEntries = Object.freeze([
    Object.freeze({
      id: "fictional-browser-question",
      question: "Fictional browser question?",
      answer: "Fictional browser answer.",
      anchor: "faq-fictional-browser-question" as const,
    }),
  ]);
  const markup = renderToStaticMarkup(
    playwrightHostTreeToReact(FaqSection({ entries: fictionalEntries })),
  );

  await page.goto("/");
  await page.setContent(`<!doctype html><html><body>${markup}</body></html>`);

  const details = page.locator("details#faq-fictional-browser-question");
  const summary = details.locator("summary");
  await summary.focus();
  await expect(summary).toBeFocused();
  expect(await summary.evaluate((element) => element.matches(":focus-visible"))).toBe(true);

  await page.keyboard.press("Enter");
  await expect(details).toHaveAttribute("open", "");
  await expect(summary).toBeFocused();
  expect(await summary.evaluate((element) => element.matches(":focus-visible"))).toBe(true);

  await page.keyboard.press("Space");
  await expect(details).not.toHaveAttribute("open", "");
  await expect(summary).toBeFocused();
  expect(await summary.evaluate((element) => element.matches(":focus-visible"))).toBe(true);
});

async function interceptFictionalSearch(
  page: Page,
  statuses: readonly number[] = [200],
): Promise<SearchRequestEvidence[]> {
  const requests: SearchRequestEvidence[] = [];
  await page.route(/\/api\/storefront-search(?:\?.*)?$/u, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    requests.push({
      method: request.method(),
      origin: url.origin,
      pathname: url.pathname,
      search: url.search,
    });
    const status = statuses[Math.min(requests.length - 1, statuses.length - 1)] ?? 200;
    await route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(
        status === 200 ? fictionalSearchIndex : { error: "fictional test outage" },
      ),
    });
  });
  return requests;
}

function expectQueryFreeSearchGet(
  evidence: SearchRequestEvidence,
  baseURL: string,
): void {
  expect(evidence).toEqual({
    method: "GET",
    origin: new URL(baseURL).origin,
    pathname: "/api/storefront-search",
    search: "",
  });
}

async function clientRect(locator: Locator) {
  return locator.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return {
      bottom: bounds.bottom,
      height: bounds.height,
      left: bounds.left,
      right: bounds.right,
      top: bounds.top,
      width: bounds.width,
    };
  });
}

function rectanglesIntersect(
  left: Awaited<ReturnType<typeof clientRect>>,
  right: Awaited<ReturnType<typeof clientRect>>,
): boolean {
  return left.left < right.right &&
    left.right > right.left &&
    left.top < right.bottom &&
    left.bottom > right.top;
}

async function horizontalLayout(page: Page) {
  return page.evaluate(() => {
    const root = document.documentElement;
    const rootBounds = root.getBoundingClientRect();
    const measuredScale = root.offsetWidth > 0
      ? rootBounds.width / root.offsetWidth
      : 1;
    const rectScale = Number.isFinite(measuredScale) && measuredScale > 0
      ? measuredScale
      : 1;
    const coordinateWidth = rootBounds.width / rectScale;
    const rootLeft = rootBounds.left;
    const clientWidth = root.clientWidth;
    return {
      clientWidth,
      coordinateWidth,
      offenders: [...document.querySelectorAll("html, body, body *")]
        .map((element) => {
          const bounds = element.getBoundingClientRect();
          const styles = getComputedStyle(element);
          const elementClientWidth = element instanceof HTMLElement
            ? element.clientWidth
            : null;
          const elementScrollWidth = element instanceof HTMLElement
            ? element.scrollWidth
            : null;
          return {
            className: element.getAttribute("class") ?? "",
            clientWidth: elementClientWidth,
            display: styles.display,
            gridTemplateColumns: styles.gridTemplateColumns,
            isDecorativeScienceGeometry: element instanceof SVGElement &&
              element.closest('[data-science-field][aria-hidden="true"]') !== null,
            isRootOrBody: element === root || element === document.body,
            left: (bounds.left - rootLeft) / rectScale,
            minWidth: styles.minWidth,
            overflowX: styles.overflowX,
            right: (bounds.right - rootLeft) / rectScale,
            scrollWidth: elementScrollWidth,
            tagName: element.tagName,
            text: element.textContent?.trim().slice(0, 80) ?? "",
            textOverflow: styles.textOverflow,
            whiteSpace: styles.whiteSpace,
            width: bounds.width / rectScale,
          };
        })
        .filter(({
          clientWidth: ownClientWidth,
          isDecorativeScienceGeometry,
          isRootOrBody,
          left,
          right,
          scrollWidth,
        }) =>
          !isDecorativeScienceGeometry &&
          (left < -1 ||
            right > coordinateWidth + 1 ||
            (isRootOrBody &&
              ownClientWidth !== null &&
              scrollWidth !== null &&
              scrollWidth > ownClientWidth + 1))
        )
        .slice(0, 20),
      rectScale,
      scrollWidth: root.scrollWidth,
    };
  });
}

async function seedLocalTestCart(page: import("@playwright/test").Page, quantity = 1) {
  await page.evaluate(({ variantId, requestedQuantity }) => {
    window.localStorage.setItem(
      "propeptiq.cart.v2",
      JSON.stringify({
        version: 2,
        items: [{ variantId, quantity: requestedQuantity }],
      }),
    );
    window.dispatchEvent(
      new StorageEvent("storage", {
        key: "propeptiq.cart.v2",
        storageArea: window.localStorage,
      }),
    );
  }, { variantId: localTestVariantId, requestedQuantity: quantity });
}

test.beforeAll(() => {
  mkdirSync(screenshotDirectory, { recursive: true });
});

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (!window.sessionStorage.getItem("task4-storage-cleared")) {
      window.localStorage.clear();
      window.sessionStorage.setItem("task4-storage-cleared", "true");
    }
  });
});

test("owner-configured WINTER30 promotion remains visible with preview-only canonical lines", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: async () => undefined },
    });
  });
  await page.goto("/");

  const banner = page.getByRole("complementary", { name: "Promotion" });
  await expect(banner).toHaveCount(1);
  await expect(banner).toBeVisible();
  await expect(
    banner.getByText(
      "WINTER SALE: 30% OFF SITEWIDE — USE CODE WINTER30",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    banner.getByRole("button", { name: "Copy promotion code WINTER30" }),
  ).toBeVisible();
  await banner.getByRole("button", { name: "Copy promotion code WINTER30" }).click();
  await expect(banner.getByRole("status")).toHaveText("WINTER30 copied");
});

test("site search ultra-narrow public header keeps every keyboard focus target inside the viewport without clipping overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 195, height: 520 });
  const requests = await interceptFictionalSearch(page);
  await page.goto("/catalog");

  const publicLayout = page.locator(".public-layout");
  const publicOverflow = await publicLayout.evaluate((element) => ({
    overflow: getComputedStyle(element).overflow,
    overflowX: getComputedStyle(element).overflowX,
  }));
  expect.soft(["hidden", "clip"]).not.toContain(publicOverflow.overflow);
  expect.soft(["hidden", "clip"]).not.toContain(publicOverflow.overflowX);

  const headerRow = page.getByRole("banner").locator(".site-container");
  const rowWidth = await headerRow.evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
  }));
  expect.soft(
    rowWidth.scrollWidth,
    `persistent header row overflowed: ${JSON.stringify(rowWidth)}`,
  ).toBeLessThanOrEqual(rowWidth.clientWidth);

  const headerTargets = headerRow.locator(
    "a[href]:visible, button:not([disabled]):visible",
  );
  await expect(headerTargets).toHaveCount(4);
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    window.scrollTo(0, 0);
  });
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to main content" }))
    .toBeFocused();

  for (let index = 0; index < 4; index += 1) {
    await page.keyboard.press("Tab");
    const target = headerTargets.nth(index);
    await expect(target).toBeFocused();
    const focusTarget = await target.evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      const styles = getComputedStyle(element);
      const focusExtent = Number.parseFloat(styles.outlineWidth) +
        Number.parseFloat(styles.outlineOffset);
      return {
        bottom: bounds.bottom,
        focusExtent,
        label: element.getAttribute("aria-label") ?? element.textContent?.trim() ?? "",
        left: bounds.left,
        right: bounds.right,
        top: bounds.top,
      };
    });
    expect.soft(
      focusTarget.left - focusTarget.focusExtent,
      `${focusTarget.label} left focus ring`,
    ).toBeGreaterThanOrEqual(-0.5);
    expect.soft(
      focusTarget.right + focusTarget.focusExtent,
      `${focusTarget.label} right focus ring`,
    ).toBeLessThanOrEqual(195.5);
    expect.soft(
      focusTarget.top - focusTarget.focusExtent,
      `${focusTarget.label} top focus ring`,
    ).toBeGreaterThanOrEqual(-0.5);
    expect.soft(
      focusTarget.bottom + focusTarget.focusExtent,
      `${focusTarget.label} bottom focus ring`,
    ).toBeLessThanOrEqual(520.5);
  }

  expect(requests).toHaveLength(0);
});

test("site search ultra-narrow layout exposes a removable test-only long-content sentinel before returning to exact viewport width", async ({
  page,
}) => {
  await page.setViewportSize({ width: 195, height: 520 });
  const requests = await interceptFictionalSearch(page);
  await page.goto("/catalog");
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => {
    document.documentElement.style.scrollBehavior = "auto";
    const sentinel = document.createElement("div");
    sentinel.setAttribute("aria-hidden", "true");
    sentinel.dataset.task4bOverflowSentinel = "true";
    sentinel.style.width = "max-content";
    sentinel.style.whiteSpace = "nowrap";
    sentinel.textContent = "TASK-4B-TEST-ONLY-LONG-CONTENT-SENTINEL-".repeat(20);
    document.querySelector("main#main-content")?.append(sentinel);
  });

  const sentinel = page.locator('[data-task4b-overflow-sentinel="true"]');
  await expect(sentinel).toHaveCount(1);
  const overflowWidth = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(overflowWidth.scrollWidth).toBeGreaterThan(overflowWidth.clientWidth);

  await page.evaluate(() => {
    window.scrollTo(document.documentElement.scrollWidth, 0);
  });
  await expect.poll(() => page.evaluate(() => window.scrollX)).toBeGreaterThan(0);
  expect((await clientRect(sentinel)).right).toBeLessThanOrEqual(195.5);

  await sentinel.evaluate((element) => element.remove());
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.evaluate(() => document.fonts.ready);

  const firstCatalogCard = page.locator(".catalog-grid > li").first();
  const firstCatalogArticle = firstCatalogCard.locator("article");
  const firstCatalogHeading = firstCatalogArticle.getByRole("heading", { level: 2 });
  const firstCatalogLink = firstCatalogArticle.getByRole("link", {
    name: /View catalog item/u,
  });
  for (const [label, locator] of [
    ["first catalog card", firstCatalogArticle],
    ["first catalog heading", firstCatalogHeading],
    ["first catalog action", firstCatalogLink],
  ] as const) {
    const bounds = await clientRect(locator);
    expect.soft(bounds.left, `${label} left edge`).toBeGreaterThanOrEqual(-0.5);
    expect.soft(bounds.right, `${label} right edge`).toBeLessThanOrEqual(195.5);
  }
  await firstCatalogLink.evaluate((element) => {
    if (element instanceof HTMLElement) element.focus({ preventScroll: true });
  });
  await expect(firstCatalogLink).toBeFocused();
  const catalogFocus = await firstCatalogLink.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    const styles = getComputedStyle(element);
    const focusExtent = Number.parseFloat(styles.outlineWidth) +
      Number.parseFloat(styles.outlineOffset);
    return {
      left: bounds.left - focusExtent,
      right: bounds.right + focusExtent,
    };
  });
  expect.soft(catalogFocus.left, "first catalog action left focus ring")
    .toBeGreaterThanOrEqual(-0.5);
  expect.soft(catalogFocus.right, "first catalog action right focus ring")
    .toBeLessThanOrEqual(195.5);

  const publicFooter = page.locator(".public-layout > footer");
  const footerBrand = publicFooter.getByRole("link", { name: /home$/u });
  const footerLastLink = publicFooter
    .getByRole("navigation", { name: "Footer" })
    .getByRole("link")
    .last();
  for (const [label, locator] of [
    ["footer brand", footerBrand],
    ["footer final action", footerLastLink],
  ] as const) {
    const bounds = await clientRect(locator);
    expect.soft(bounds.left, `${label} left edge`).toBeGreaterThanOrEqual(-0.5);
    expect.soft(bounds.right, `${label} right edge`).toBeLessThanOrEqual(195.5);
  }

  const realLayout = await horizontalLayout(page);
  expect(
    realLayout.scrollWidth,
    `real 195px overflow: ${JSON.stringify(realLayout.offenders)}`,
  ).toBe(realLayout.clientWidth);
  expect(
    realLayout.offenders,
    `real 195px offenders: ${JSON.stringify(realLayout)}`,
  ).toEqual([]);
  expect(requests).toHaveLength(0);
});

test("site search launcher stays centered, operable, and clear of the footer across the Chromium viewport matrix", async ({
  page,
}) => {
  const requests = await interceptFictionalSearch(page);

  for (const width of [195, 320, 352, 353, 375, 768, 1024, 1440, 1920]) {
    await page.setViewportSize({ width, height: width <= 375 ? 520 : 900 });
    await page.goto("/catalog");
    if (width === 195) await seedLocalTestCart(page, 12);

    const cartLink = page.getByRole("link", { name: "Cart, 12 requested units" });
    await expect(cartLink).toBeVisible();
    if (width <= 352) {
      await expect(cartLink.locator(".cart-count")).toBeHidden();
    } else {
      await expect(cartLink.locator(".cart-count")).toBeVisible();
    }

    const trigger = page.getByRole("button", { name: "Search PropeptIQ" });
    await expect(trigger).toHaveCount(1);
    await expect(trigger).toBeVisible();
    const triggerBounds = await clientRect(trigger);
    expect(triggerBounds.width, `${width}px trigger width`).toBeGreaterThanOrEqual(44);
    expect(triggerBounds.height, `${width}px trigger height`).toBeGreaterThanOrEqual(44);
    expect(
      Math.abs((triggerBounds.left + triggerBounds.right) / 2 - width / 2),
      `${width}px launcher centering`,
    ).toBeLessThanOrEqual(1);
    const layout = await horizontalLayout(page);
    expect(
      layout.scrollWidth - layout.clientWidth,
      `${width}px horizontal overflow: ${JSON.stringify(layout.offenders)}`,
    ).toBeLessThanOrEqual(1);

    if (width === 195) {
      const laneBounds = await clientRect(page.locator(".site-search-launcher-lane"));
      expect(laneBounds.left).toBeGreaterThanOrEqual(0);
      expect(laneBounds.right).toBeLessThanOrEqual(width);
      expect(
        Math.abs((laneBounds.left + laneBounds.right) / 2 - width / 2),
      ).toBeLessThanOrEqual(1);
      expect(triggerBounds.left).toBeGreaterThanOrEqual(0);
      expect(triggerBounds.right).toBeLessThanOrEqual(width);
    }

    await page.evaluate(() => {
      document.documentElement.style.scrollBehavior = "auto";
      window.scrollTo(0, document.documentElement.scrollHeight);
    });
    await expect.poll(() => page.evaluate(() => Math.max(
      0,
      document.documentElement.scrollHeight - window.innerHeight - window.scrollY,
    ))).toBeLessThanOrEqual(1);

    const footerLink = page
      .getByRole("navigation", { name: "Footer" })
      .getByRole("link")
      .last();
    await expect(footerLink).toBeVisible();
    expect(
      rectanglesIntersect(await clientRect(trigger), await clientRect(footerLink)),
      `${width}px launcher/footer collision`,
    ).toBe(false);
  }

  expect(requests).toHaveLength(0);
});

test("canonical catalog and detail stay within the viewport at every required width", async ({
  page,
}) => {
  const widths = [320, 375, 768, 1024, 1440, 1920] as const;
  for (const width of widths) {
    await page.setViewportSize({ width, height: width <= 375 ? 812 : 900 });
    for (const route of ["/catalog", "/catalog/items/tirzepatide"] as const) {
      await page.goto(route);
      await expect(page.getByRole("button", { name: "Search PropeptIQ" })).toBeVisible();
      const layout = await horizontalLayout(page);
      expect(
        layout.scrollWidth - layout.clientWidth,
        `${route} at ${width}px horizontal overflow: ${JSON.stringify(layout.offenders)}`,
      ).toBeLessThanOrEqual(1);
      const launcher = await clientRect(page.getByRole("button", { name: "Search PropeptIQ" }));
      expect(launcher.left, `${route} at ${width}px launcher left`).toBeGreaterThanOrEqual(0);
      expect(launcher.right, `${route} at ${width}px launcher right`).toBeLessThanOrEqual(width);
    }
  }
});

test("site search Sheet switches from full-height phone geometry at 767px to capped desktop geometry at 768px", async ({
  page,
  baseURL,
}) => {
  const requests = await interceptFictionalSearch(page);

  for (const width of [767, 768]) {
    await page.setViewportSize({ width, height: 600 });
    await page.goto("/catalog");
    const response = page.waitForResponse(
      (candidate) => new URL(candidate.url()).pathname === "/api/storefront-search",
    );
    await page.getByRole("button", { name: "Search PropeptIQ" }).click();
    await response;
    const sheet = page.locator('.site-search-sheet[data-side="bottom"]');
    await expect(sheet).toBeVisible();
    const bounds = await clientRect(sheet);
    const radius = await sheet.evaluate((element) => getComputedStyle(element).borderRadius);

    if (width === 767) {
      expect(bounds.width).toBeCloseTo(767, 0);
      expect(bounds.height).toBeCloseTo(600, 0);
      expect(radius).toBe("0px");
    } else {
      expect(bounds.width).toBeCloseTo(576, 0);
      expect(bounds.height).toBeCloseTo(568, 0);
      expect(radius).not.toBe("0px");
    }
  }

  expect(requests).toHaveLength(2);
  for (const request of requests) expectQueryFreeSearchGet(request, baseURL!);
});

test("site search short-phone Sheet keeps fixed controls visible, scrolls results, reuses cache, and selects an approved page", async ({
  page,
  baseURL,
}) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.setViewportSize({ width: 390, height: 520 });
  const requests = await interceptFictionalSearch(page);
  await page.goto("/catalog");

  const closedAccessibility = await new AxeBuilder({ page }).analyze();
  expect(closedAccessibility.violations).toEqual([]);

  const trigger = page.getByRole("button", { name: "Search PropeptIQ" });
  const firstResponse = page.waitForResponse(
    (candidate) => new URL(candidate.url()).pathname === "/api/storefront-search",
  );
  await trigger.click();
  await firstResponse;
  expect(requests).toHaveLength(1);
  expectQueryFreeSearchGet(requests[0]!, baseURL!);

  const sheet = page.locator('.site-search-sheet[data-side="bottom"]');
  const searchbox = sheet.getByRole("searchbox", {
    name: "Search products and information",
  });
  const close = sheet.getByRole("button", { name: "Close" });
  const status = sheet.getByRole("status");
  await expect(sheet).toBeVisible();
  await expect(searchbox).toBeFocused();
  await expect(close).toBeVisible();
  await expect(status).toHaveText("Type to search products and information.");
  const sheetBounds = await clientRect(sheet);
  expect(sheetBounds.left).toBeCloseTo(0, 0);
  expect(sheetBounds.right).toBeCloseTo(390, 0);
  expect(sheetBounds.height).toBeCloseTo(520, 0);

  await searchbox.fill("fictional");
  await expect(sheet.getByRole("heading", { name: "Products" })).toBeVisible();
  await expect(
    sheet.getByRole("heading", { name: "Pages or Information" }),
  ).toBeVisible();
  await expect(status).toHaveText("14 results found.");
  const results = sheet.locator(".site-search-results");
  const firstResult = results.getByRole("link").first();
  await expect(firstResult).toBeVisible();
  const scrollState = await results.evaluate((element) => ({
    clientHeight: element.clientHeight,
    overflowY: getComputedStyle(element).overflowY,
    overscrollBehavior: getComputedStyle(element).overscrollBehavior,
    scrollHeight: element.scrollHeight,
  }));
  expect(scrollState.scrollHeight).toBeGreaterThan(scrollState.clientHeight);
  expect(scrollState.overflowY).toBe("auto");
  expect(scrollState.overscrollBehavior).toBe("contain");
  await results.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  expect(await results.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  await expect(searchbox).toBeVisible();
  await expect(close).toBeVisible();
  await expect(status).toBeVisible();

  await searchbox.fill("zzzzzz-no-fictional-match");
  await expect(status).toHaveText("No results found.");
  await expect(results.getByRole("link")).toHaveCount(0);
  const openAccessibility = await new AxeBuilder({ page }).analyze();
  expect(openAccessibility.violations).toEqual([]);

  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  await expect(trigger).toBeFocused();
  await trigger.click();
  await expect(searchbox).toBeFocused();
  await expect(status).toHaveText("Type to search products and information.");
  expect(requests).toHaveLength(1);

  await searchbox.fill("fictional");
  await searchbox.press("ArrowDown");
  await searchbox.press("ArrowUp");
  expect(await searchbox.getAttribute("aria-activedescendant")).toContain("result-13");
  expect(await sheet.textContent()).not.toMatch(
    /dosage|administration|treatment advice|add to cart/iu,
  );
  await Promise.all([
    page.waitForURL("**/research-use-policy"),
    searchbox.press("Enter"),
  ]);
  expect(new URL(page.url()).pathname).toBe("/research-use-policy");
  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
});

test("catalog search exposes a fixed error and performs exactly one explicit Retry before reusing success", async ({
  page,
  baseURL,
}) => {
  await page.setViewportSize({ width: 390, height: 520 });
  const requests = await interceptFictionalSearch(page, [503, 200]);
  await page.goto("/catalog");
  const trigger = page.getByRole("button", { name: "Search PropeptIQ" });

  const failedResponse = page.waitForResponse(
    (candidate) => new URL(candidate.url()).pathname === "/api/storefront-search",
  );
  await trigger.click();
  expect((await failedResponse).status()).toBe(503);
  const sheet = page.locator('.site-search-sheet[data-side="bottom"]');
  await expect(sheet.getByRole("status")).toHaveText(
    "Search is temporarily unavailable. Please try again.",
  );
  await expect(sheet).not.toContainText("503");
  await expect(sheet).not.toContainText("fictional test outage");
  expect(requests).toHaveLength(1);

  const successfulResponse = page.waitForResponse(
    (candidate) => new URL(candidate.url()).pathname === "/api/storefront-search",
  );
  await sheet.getByRole("button", { name: "Retry" }).click();
  expect((await successfulResponse).status()).toBe(200);
  await expect(sheet.getByRole("status")).toHaveText(
    "Type to search products and information.",
  );
  expect(requests).toHaveLength(2);

  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  await trigger.click();
  await expect(sheet.getByRole("status")).toHaveText(
    "Type to search products and information.",
  );
  expect(requests).toHaveLength(2);
  for (const request of requests) expectQueryFreeSearchGet(request, baseURL!);
});

test("site search stays closed when a deferred response resolves and reuses that one success", async ({
  page,
  baseURL,
}) => {
  await page.setViewportSize({ width: 390, height: 520 });
  const requests: SearchRequestEvidence[] = [];
  let releaseResponse!: () => void;
  const responseGate = new Promise<void>((resolve) => {
    releaseResponse = resolve;
  });
  await page.route(/\/api\/storefront-search(?:\?.*)?$/u, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    requests.push({
      method: request.method(),
      origin: url.origin,
      pathname: url.pathname,
      search: url.search,
    });
    await responseGate;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(fictionalSearchIndex),
    });
  });
  await page.goto("/catalog");

  const requestStarted = page.waitForRequest(
    (request) => new URL(request.url()).pathname === "/api/storefront-search",
  );
  const trigger = page.getByRole("button", { name: "Search PropeptIQ" });
  await trigger.click();
  await requestStarted;
  const dialog = page.getByRole("dialog", { name: "Search PropeptIQ" });
  await expect(dialog.getByRole("status")).toHaveText("Loading search index.");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);

  const responseFinished = page.waitForResponse(
    (response) => new URL(response.url()).pathname === "/api/storefront-search",
  );
  releaseResponse();
  await responseFinished;
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await trigger.click();
  await expect(page.getByRole("dialog", { name: "Search PropeptIQ" }).getByRole("status")).toHaveText(
    "Type to search products and information.",
  );
  expect(requests).toHaveLength(1);
  expectQueryFreeSearchGet(requests[0]!, baseURL!);
});

test("site search and mobile navigation leave only the active Sheet hit-testable and select the exact fictional product", async ({
  page,
  baseURL,
}) => {
  await page.setViewportSize({ width: 390, height: 520 });
  const requests = await interceptFictionalSearch(page);
  await page.goto("/");

  const navigationTrigger = page.getByRole("button", { name: "Open navigation" });
  await navigationTrigger.click();
  await expect(page.locator('[data-slot="sheet-overlay"]:visible')).toHaveCount(1);
  await expect(page.locator('[data-slot="sheet-content"]:visible')).toHaveCount(1);
  await expect(page.locator('[data-slot="sheet-content"]:visible'))
    .toHaveAttribute("data-side", "right");
  await page.keyboard.press("Escape");
  await expect(page.locator('[data-slot="sheet-overlay"]:visible')).toHaveCount(0);
  await expect(navigationTrigger).toBeFocused();

  const searchResponse = page.waitForResponse(
    (candidate) => new URL(candidate.url()).pathname === "/api/storefront-search",
  );
  const searchTrigger = page.getByRole("button", { name: "Search PropeptIQ" });
  await searchTrigger.click();
  await searchResponse;
  await expect(page.locator('[data-slot="sheet-overlay"]:visible')).toHaveCount(1);
  const activeContent = page.locator('[data-slot="sheet-content"]:visible');
  await expect(activeContent).toHaveCount(1);
  await expect(activeContent).toHaveAttribute("data-side", "bottom");
  expect(await activeContent.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    const hit = document.elementFromPoint(
      bounds.left + bounds.width / 2,
      bounds.top + bounds.height / 2,
    );
    return hit !== null && element.contains(hit);
  })).toBe(true);

  await activeContent.getByRole("button", { name: "Close" }).click();
  await expect(page.locator('[data-slot="sheet-overlay"]:visible')).toHaveCount(0);
  await expect(searchTrigger).toBeFocused();
  await navigationTrigger.click();
  await expect(page.locator('[data-slot="sheet-content"]:visible'))
    .toHaveAttribute("data-side", "right");
  await page.keyboard.press("Escape");

  await searchTrigger.click();
  const searchbox = page.getByRole("searchbox", {
    name: "Search products and information",
  });
  await searchbox.fill("FICTIONAL-ALPHA");
  const product = page.getByRole("link", { name: /Fictional Product 01/iu });
  await expect(product).toHaveAttribute("href", "/catalog/items/synthetic-alpha");
  expect(await page.getByRole("dialog").textContent()).not.toMatch(
    /dosage|administration|treatment advice|add to cart/iu,
  );
  await Promise.all([
    page.waitForURL("**/catalog/items/synthetic-alpha"),
    product.click(),
  ]);
  expect(new URL(page.url()).pathname).toBe("/catalog/items/synthetic-alpha");
  expect(requests).toHaveLength(1);
  expectQueryFreeSearchGet(requests[0]!, baseURL!);
});

test("site search honors reduced motion and passes axe both closed and open without console errors", async ({
  page,
  baseURL,
}) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 520 });
  const requests = await interceptFictionalSearch(page);
  await page.goto("/catalog");
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

  const trigger = page.getByRole("button", { name: "Search PropeptIQ" });
  const triggerMotion = await trigger.evaluate((element) => ({
    animationDuration: getComputedStyle(element).animationDuration,
    pointerEvents: getComputedStyle(element).pointerEvents,
    scrollBehavior: getComputedStyle(document.documentElement).scrollBehavior,
    transitionDuration: getComputedStyle(element).transitionDuration,
  }));
  expect(triggerMotion).toEqual({
    animationDuration: "0s",
    pointerEvents: "auto",
    scrollBehavior: "auto",
    transitionDuration: "0s",
  });

  const response = page.waitForResponse(
    (candidate) => new URL(candidate.url()).pathname === "/api/storefront-search",
  );
  await trigger.click();
  await response;
  const sheet = page.locator('.site-search-sheet[data-side="bottom"]');
  expect(await sheet.evaluate((element) => ({
    animationDuration: getComputedStyle(element).animationDuration,
    transitionDuration: getComputedStyle(element).transitionDuration,
  }))).toEqual({
    animationDuration: "0s",
    transitionDuration: "0s",
  });
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(errors).toEqual([]);
  expect(requests).toHaveLength(1);
  expectQueryFreeSearchGet(requests[0]!, baseURL!);
});

test("site search launcher does not obscure the visible primary cart action", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 520 });
  const requests = await interceptFictionalSearch(page);
  await page.goto("/catalog/synthetic-reference-alpha");
  await seedLocalTestCart(page);
  await page.goto("/cart");

  const action = page.getByRole("button", { name: "Continue to sign in" });
  const trigger = page.getByRole("button", { name: "Search PropeptIQ" });
  await expect(action).toBeEnabled();
  await action.scrollIntoViewIfNeeded();
  await expect(action).toBeVisible();
  await expect(trigger).toBeVisible();
  expect(
    rectanglesIntersect(await clientRect(action), await clientRect(trigger)),
    "launcher/cart primary-action collision",
  ).toBe(false);
  expect(requests).toHaveLength(0);
});

async function expectPublicRouteRestrictionAndAccessibility(
  page: Page,
  route: PublicRoute,
) {
  await page.goto(route);
  await expect(page.locator("main#main-content")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(
    page.getByText("For legitimate laboratory and research use only.").first(),
  ).toBeVisible();
  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations, `${route} axe violations`).toEqual([]);
}

test("public route / renders the shared restriction and passes axe", async ({ page }) => {
  await expectPublicRouteRestrictionAndAccessibility(page, "/");
});

test("public route /catalog renders the shared restriction and passes axe", async ({ page }) => {
  await expectPublicRouteRestrictionAndAccessibility(page, "/catalog");
});

test("public route /catalog/items/tirzepatide renders the shared restriction and passes axe", async ({ page }) => {
  await expectPublicRouteRestrictionAndAccessibility(page, "/catalog/items/tirzepatide");
});

test("public route /catalog/synthetic-reference-alpha renders the shared restriction and passes axe", async ({ page }) => {
  await expectPublicRouteRestrictionAndAccessibility(page, "/catalog/synthetic-reference-alpha");
});

test("public route /cart renders the shared restriction and passes axe", async ({ page }) => {
  await expectPublicRouteRestrictionAndAccessibility(page, "/cart");
});

test("public route /quality-records renders the shared restriction and passes axe", async ({ page }) => {
  await expectPublicRouteRestrictionAndAccessibility(page, "/quality-records");
});

test("public route /research-use-policy renders the shared restriction and passes axe", async ({ page }) => {
  await expectPublicRouteRestrictionAndAccessibility(page, "/research-use-policy");
});

test("synthetic commerce pages still identify every displayed record as fictional demo data", async ({
  page,
}) => {
  await page.goto("/catalog/synthetic-reference-alpha");

  await expect(page).toHaveURL(/\/catalog\/synthetic-reference-alpha$/u);
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Synthetic Reference Alpha — Demo Only",
    }),
  ).toBeVisible();

  const notice = page.getByRole("note");
  await expect(
    notice.getByText("Synthetic demo catalog", { exact: true }),
  ).toBeVisible();
  await expect(
    notice.getByText(
      "Every product, price, lot, promotion, and quality record shown in this mode is fictional test data—not a real offer or production record.",
      { exact: true },
    ),
  ).toBeVisible();
});

test("anonymous canonical local/test cart survives reload and preserves only variant IDs and quantities", async ({
  page,
}) => {
  await page.goto("/catalog/synthetic-reference-alpha");
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Synthetic Reference Alpha — Demo Only",
    }),
  ).toBeVisible();

  await expect(page.getByRole("button", { name: /add .* to cart/iu })).toHaveCount(0);
  await seedLocalTestCart(page);
  await expect(page.getByRole("link", { name: /Cart, 1 requested unit/ })).toBeVisible();
  await page.getByRole("link", { name: /Cart, 1 requested unit/ }).click();

  await expect(page.getByText("Synthetic Reference Alpha — Demo Only").first()).toBeVisible();
  await expect(page.getByText("$24.00", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue to sign in" })).toBeEnabled();

  const persisted = await page.evaluate(() =>
    JSON.parse(window.localStorage.getItem("propeptiq.cart.v2") ?? "null"),
  );
  expect(persisted).toEqual({
    version: 2,
    items: [{ variantId: localTestVariantId, quantity: 1 }],
  });

  await page.reload();
  await expect(page.getByText("Synthetic Reference Alpha — Demo Only").first()).toBeVisible();
  await expect(
    page.getByRole("spinbutton", {
      name: "Quantity for Synthetic Reference Alpha — Demo Only",
    }),
  ).toHaveValue("1");
  await page.getByRole("button", { name: "Continue to sign in" }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
  expect(
    await page.evaluate(() =>
      JSON.parse(window.localStorage.getItem("propeptiq.cart.v2") ?? "null"),
    ),
  ).toEqual({
    version: 2,
    items: [{ variantId: localTestVariantId, quantity: 1 }],
  });

  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);
});

test("cart quantity controls are keyboard operable", async ({ page }) => {
  await page.goto("/catalog/synthetic-reference-alpha");
  await expect(page.getByRole("button", { name: /add .* to cart/iu })).toHaveCount(0);
  await seedLocalTestCart(page);
  await page.goto("/cart");
  const increase = page.getByRole("button", {
    name: "Increase quantity for Synthetic Reference Alpha — Demo Only",
  });
  await increase.focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("spinbutton", {
      name: "Quantity for Synthetic Reference Alpha — Demo Only",
    }),
  ).toHaveValue("2");
  await page.reload();
  await expect(
    page.getByRole("spinbutton", {
      name: "Quantity for Synthetic Reference Alpha — Demo Only",
    }),
  ).toHaveValue("2");
});

test("skip link is first and moves focus to main content", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Tab");
  const skipLink = page.getByRole("link", { name: "Skip to main content" });
  await expect(skipLink).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("main#main-content")).toBeFocused();
});

test("mobile navigation traps focus, closes on Escape, and restores trigger focus", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");
  const trigger = page.getByRole("button", {
    name: "Open navigation",
    exact: true,
  });
  await expect(trigger).toBeVisible();
  await trigger.focus();
  await page.keyboard.press("Enter");
  const hiddenTrigger = page.getByRole("button", {
    name: "Open navigation",
    exact: true,
    includeHidden: true,
  });
  await expect(hiddenTrigger).toHaveAttribute("aria-expanded", "true");
  const sheet = page.locator('[data-slot="sheet-content"]');
  await expect(sheet).toBeVisible();

  for (let index = 0; index < 8; index += 1) {
    await page.keyboard.press("Tab");
    expect(
      await page.evaluate(() =>
        Boolean(document.activeElement?.closest('[data-slot="sheet-content"]')),
      ),
    ).toBe(true);
  }

  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  await expect(trigger).toBeVisible();
  await expect(trigger).toBeFocused();
});

test("responsive widths and the 512px 200%-zoom reflow proxy have no horizontal overflow", async ({
  page,
}) => {
  for (const width of [375, 768, 1024, 1440, 512]) {
    await page.setViewportSize({ width, height: width === 375 ? 812 : 900 });
    await page.goto("/catalog/synthetic-reference-alpha");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `${width}px horizontal overflow`).toBeLessThanOrEqual(1);
  }

  await page.setViewportSize({ width: 512, height: 900 });
  await page.goto("/catalog");
  const cards = page.locator(".catalog-grid > li");
  const [firstCard, secondCard] = await Promise.all([
    cards.nth(0).boundingBox(),
    cards.nth(1).boundingBox(),
  ]);
  expect(firstCard).not.toBeNull();
  expect(secondCard).not.toBeNull();
  expect(Math.abs((firstCard?.x ?? 0) - (secondCard?.x ?? 0))).toBeLessThanOrEqual(1);
  expect(secondCard?.y ?? 0).toBeGreaterThan((firstCard?.y ?? 0) + (firstCard?.height ?? 0));
});

test("mobile explanatory copy meets the 16px body minimum", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/catalog");

  for (const locator of [
    page.locator(".restriction-bar"),
    page.locator("main p.text-lg").first(),
    page.locator(".catalog-grid article p.text-sm").first(),
  ]) {
    const fontSize = await locator.evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));
    expect(fontSize).toBeGreaterThanOrEqual(16);
  }
});

test("header logo remains uncropped while brand and footer targets stay accessible", async ({ page }) => {
  for (const width of [375, 1440]) {
    await page.setViewportSize({ width, height: width === 375 ? 812 : 1000 });
    await page.goto("/");

    const logoStyles = await page
      .getByRole("banner")
      .getByRole("link", { name: "PROPEPTIQ LABS home" })
      .locator("img")
      .evaluate((image) => {
        const imageStyles = getComputedStyle(image);
        const wrapperStyles = getComputedStyle(image.parentElement!);
        return {
          backgroundColor: wrapperStyles.backgroundColor,
          borderRadius: wrapperStyles.borderRadius,
          objectFit: imageStyles.objectFit,
          overflow: wrapperStyles.overflow,
          transform: imageStyles.transform,
        };
      });

    expect(logoStyles, `${width}px header logo styles`).toEqual({
      backgroundColor: "rgba(0, 0, 0, 0)",
      borderRadius: "0px",
      objectFit: "contain",
      overflow: "visible",
      transform: "none",
    });
  }

  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");

  const brandTarget = await page
    .getByRole("banner")
    .getByRole("link", { name: "PROPEPTIQ LABS home" })
    .evaluate((link) => {
      const bounds = link.getBoundingClientRect();
      return { height: bounds.height, width: bounds.width };
    });

  console.info(`Header brand target size at 375px: ${JSON.stringify(brandTarget)}`);
  expect(brandTarget.height).toBeGreaterThanOrEqual(44);
  expect(brandTarget.width).toBeGreaterThanOrEqual(44);

  const targetSizes = await page
    .getByRole("navigation", { name: "Footer" })
    .getByRole("link")
    .evaluateAll((links) =>
      links.map((link) => {
        const bounds = link.getBoundingClientRect();
        return { height: bounds.height, width: bounds.width };
      }),
    );

  expect(targetSizes.length).toBeGreaterThan(0);
  console.info(`Footer target sizes at 375px: ${JSON.stringify(targetSizes)}`);
  expect(targetSizes.every(({ height, width }) => height >= 44 && width >= 44)).toBe(true);
});

test("explicit 200% CSS rendering pass remains operable without horizontal overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1024, height: 900 });
  await page.goto("/catalog");
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => {
    document.documentElement.style.zoom = "2";
  });
  const layout = await horizontalLayout(page);
  expect(
    layout.rectScale,
    `catalog 200% rectangle scale: ${JSON.stringify(layout)}`,
  ).toBe(2);
  expect(
    layout.scrollWidth - layout.clientWidth,
    `catalog 200% zoom overflow: ${JSON.stringify(layout)}`,
  ).toBeLessThanOrEqual(1);
  expect(layout.offenders, `catalog 200% zoom offenders: ${JSON.stringify(layout)}`)
    .toEqual([]);
  await expect(page.getByRole("button", { name: "Open navigation" })).toBeVisible();
  await page.screenshot({
    path: path.join(screenshotDirectory, "catalog-css-zoom-200.png"),
    fullPage: true,
  });
});

test("homepage current catalog remains reachable at 200% CSS zoom without horizontal overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1024, height: 900 });
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => {
    document.documentElement.style.zoom = "2";
  });

  const currentCatalog = page.getByText("Current catalog", { exact: true });
  await currentCatalog.scrollIntoViewIfNeeded();
  await expect(currentCatalog).toBeVisible();

  const browseCatalog = page.getByRole("link", { name: "Browse catalog" });
  await browseCatalog.scrollIntoViewIfNeeded();
  await browseCatalog.focus();
  await expect(browseCatalog).toBeFocused();

  const layout = await horizontalLayout(page);
  expect(
    layout.scrollWidth - layout.clientWidth,
    `homepage 200% zoom overflow: ${JSON.stringify(layout)}`,
  ).toBeLessThanOrEqual(1);
  expect(layout.offenders, `homepage 200% zoom offenders: ${JSON.stringify(layout)}`)
    .toEqual([]);
});

test("reduced motion disables transition and animation durations", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/catalog");
  const card = page.locator("article.catalog-listing-card").first();
  await card.hover();
  const motion = await page
    .getByRole("link", { name: "View catalog item: Tirzepatide" })
    .evaluate((element) => ({
      animationDuration: getComputedStyle(element).animationDuration,
      transitionDuration: getComputedStyle(element).transitionDuration,
      scrollBehavior: getComputedStyle(document.documentElement).scrollBehavior,
      cardTransform: getComputedStyle(element.closest("article")!).transform,
    }));
  expect(motion).toEqual({
    animationDuration: "0s",
    transitionDuration: "0s",
    scrollBehavior: "auto",
    cardTransform: "none",
  });
});

test("unknown product slugs fail closed", async ({ page }) => {
  const response = await page.goto("/catalog/not-a-real-record");
  expect(response?.status()).toBe(404);
  await expect(
    page.getByRole("heading", { level: 1, name: "Catalog record unavailable." }),
  ).toBeVisible();
});

test("owner-supplied catalog is complete, priced where reviewed, and serves every illustration", async ({
  page,
  request,
}) => {
  await page.goto("/catalog");
  await expect(page.locator("article.catalog-listing-card")).toHaveCount(56);
  await expect(page.getByText("103 supplied package configurations")).toBeVisible();
  await expect(page.getByRole("button", { name: /add .* to cart/i })).toHaveCount(56);
  await expect(page.locator("main")).toContainText("$41.99");
  await expect(page.locator("main")).toContainText("-30%");
  const imagePaths = await page.locator("article.catalog-listing-card img").evaluateAll(
    (images) =>
      images.map((image) => {
        const url = new URL((image as HTMLImageElement).src);
        return url.searchParams.get("url") ?? url.pathname;
      }),
  );
  expect(new Set(imagePaths).size).toBe(56);

  for (const imagePath of imagePaths) {
    const response = await request.get(imagePath);
    expect(response.ok(), `${imagePath} illustration response`).toBe(true);
    expect(response.headers()["content-type"]).toContain("image/webp");
    expect((await response.body()).byteLength).toBeGreaterThan(1_000);
  }

  await page.goto("/catalog/items/tirzepatide");
  await expect(page).toHaveURL(/\/catalog\/items\/tirzepatide$/u);
  await expect(page.getByRole("heading", { level: 1, name: "Tirzepatide" })).toBeVisible();
  await expect(page.getByText("TR5", { exact: true })).toBeVisible();
  await expect(page.getByRole("radio")).toHaveCount(9);
  await expect(page.locator("main")).toContainText("$41.99");
  await expect(page.locator("main")).toContainText("Preview only");

  const imageLoaded = await page.getByRole("img", {
    name: /illustrative research-catalog still life for Tirzepatide/i,
  }).evaluate((image) => {
    const element = image as HTMLImageElement;
    return element.complete && element.naturalWidth > 0 && element.naturalHeight > 0;
  });
  expect(imageLoaded).toBe(true);

  const unknown = await page.goto("/catalog/items/not-a-real-item");
  expect(unknown?.status()).toBe(404);
});

test("preview item has no gated calculator, related carousel, overflow, or eager related media", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/catalog/items/tirzepatide");
  await expect(page.getByRole("heading", { name: "Laboratory concentration calculator", exact: true })).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: "Vial amount (mg)", exact: true })).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: "Diluent volume (mL)", exact: true })).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: "Sample volume (mL, optional)", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Calculate", exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Frequently Researched Together", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Previous related products" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Next related products" })).toHaveCount(0);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  const images = await page.locator("main img").evaluateAll((entries) => entries.map((image) => ({ loading: (image as HTMLImageElement).loading, fetchPriority: image.getAttribute("fetchpriority") })));
  expect(images.filter((image) => image.loading !== "lazy" || image.fetchPriority === "high")).toHaveLength(1);
});

test("configured catalog cards keep selected one-bottle prices, layout, chooser, and null-metadata sorting truthful", async ({
  page,
}) => {
  const expectedCards = [
    { amount: "30 mg · 1 bottle", base: "$59.99", imagePath: "/catalog/tirzepatide.webp", name: "Tirzepatide", sale: "$41.99" },
    { amount: "10 mg · 1 bottle", base: "$69.99", imagePath: "/catalog/retatrutide.webp", name: "Retatrutide", sale: "$48.99" },
    { amount: "500 mg · 1 bottle", base: "$69.99", imagePath: "/catalog/nad-plus.webp", name: "NAD+", sale: "$48.99" },
  ] as const;
  const targetImagePaths = new Set<string>(expectedCards.map((card) => card.imagePath));
  const nextImageRequest = /\/_next\/image(?:\?.*)?$/u;

  for (const width of [375, 1440]) {
    const heldImagePaths = new Set<string>();
    let releaseActualImages: () => void = () => {};
    const actualImagesReleased = new Promise<void>((resolve) => {
      releaseActualImages = resolve;
    });
    const holdActualCatalogImages = async (route: Route) => {
      const imagePath = new URL(route.request().url()).searchParams.get("url");
      if (imagePath === null || !targetImagePaths.has(imagePath)) {
        await route.continue();
        return;
      }
      heldImagePaths.add(imagePath);
      await actualImagesReleased;
      await route.continue();
    };

    await page.route(nextImageRequest, holdActualCatalogImages);
    try {
      await page.setViewportSize({ width, height: width === 375 ? 812 : 1000 });
      await page.goto("/catalog", { waitUntil: "domcontentloaded" });
      const measuredFrames: Array<{
        before: Awaited<ReturnType<typeof clientRect>>;
        image: Locator;
      }> = [];

      for (const expectedCard of expectedCards) {
        const card = page.getByRole("article", { name: expectedCard.name, exact: true });
        const imageFrame = card.locator(".catalog-image-frame");
        const image = imageFrame.locator("img");

        await expect(card.getByText(expectedCard.amount, { exact: true })).toBeVisible();
        await expect(card.locator("del")).toHaveText(expectedCard.base);
        await expect(card.locator("strong")).toHaveText(expectedCard.sale);
        await imageFrame.scrollIntoViewIfNeeded();
        const beforeImageCompletion = await clientRect(imageFrame);
        expect(beforeImageCompletion.width / beforeImageCompletion.height).toBeCloseTo(4 / 3, 2);
        await expect(image).toHaveJSProperty("complete", false);
        expect(await image.evaluate((element) => {
          const entry = element as HTMLImageElement;
          return { naturalHeight: entry.naturalHeight, naturalWidth: entry.naturalWidth };
        })).toEqual({ naturalHeight: 0, naturalWidth: 0 });
        measuredFrames.push({ before: beforeImageCompletion, image });
      }

      await expect.poll(() => heldImagePaths.size).toBe(expectedCards.length);
      releaseActualImages();

      for (const { before, image } of measuredFrames) {
        await expect
          .poll(() => image.evaluate((element) => {
            const entry = element as HTMLImageElement;
            return entry.complete && entry.naturalWidth > 0 && entry.naturalHeight > 0;
          }))
          .toBe(true);
        const decodedState = await image.evaluate(async (element) => {
          const entry = element as HTMLImageElement;
          await entry.decode();
          return {
            complete: entry.complete,
            naturalHeight: entry.naturalHeight,
            naturalWidth: entry.naturalWidth,
          };
        });
        expect(decodedState.complete).toBe(true);
        expect(decodedState.naturalHeight).toBeGreaterThan(0);
        expect(decodedState.naturalWidth).toBeGreaterThan(0);
        const afterImageCompletion = await clientRect(image.locator("xpath=.."));
        expect(Math.abs(afterImageCompletion.width - before.width)).toBeLessThanOrEqual(1);
        expect(Math.abs(afterImageCompletion.height - before.height)).toBeLessThanOrEqual(1);
      }

      const layout = await horizontalLayout(page);
      expect(layout.scrollWidth - layout.clientWidth, `${width}px catalog overflow`).toBeLessThanOrEqual(1);
      expect(layout.offenders, `${width}px catalog overflow offenders`).toEqual([]);
    } finally {
      releaseActualImages();
      await page.unroute(nextImageRequest, holdActualCatalogImages);
    }
  }

  const tirzepatideCard = page.getByRole("article", { name: "Tirzepatide", exact: true });
  const chooserTrigger = tirzepatideCard.getByRole("button", { name: "Add Tirzepatide to cart" });
  const cartBeforeChooser = await page.evaluate(() => window.localStorage.getItem("propeptiq.cart.v2"));
  await chooserTrigger.focus();
  await page.keyboard.press("Enter");
  const chooser = page.getByRole("dialog", { name: "Choose a variant for Tirzepatide" });
  await expect(chooser).toBeVisible();
  const pendingVariant = chooser
    .locator(`input[type="radio"][value="${tirzepatideVariantIds.tr5}"]`)
    .locator("xpath=ancestor::label[1]");
  await expect(pendingVariant).toBeVisible();
  await expect(pendingVariant).toContainText("$0.00");
  await expect(pendingVariant).toContainText("Local cart preview");
  await expect(pendingVariant.locator('input[type="radio"]')).not.toBeDisabled();
  const enabledRadios = chooser.locator('input[type="radio"]:not(:disabled)');
  await enabledRadios.first().focus();
  await expect(enabledRadios.first()).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(enabledRadios.nth(1)).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(chooser).toBeHidden();
  await expect(chooserTrigger).toBeFocused();
  expect(await page.evaluate(() => window.localStorage.getItem("propeptiq.cart.v2"))).toBe(cartBeforeChooser);

  const sort = page.getByRole("combobox", { name: "Sort catalog" });
  const catalogResults = page.getByRole("region", { name: "Catalog results region" });
  const titles = async () => catalogResults.getByRole("article").evaluateAll((articles) =>
    articles.map((article) => article.querySelector("h2")?.textContent?.trim() ?? ""),
  );
  await sort.selectOption("alphabetical");
  const alphabeticalTitles = await titles();
  expect(alphabeticalTitles).toHaveLength(56);
  await sort.selectOption("popular");
  expect(await titles()).toEqual(alphabeticalTitles);
  await sort.selectOption("newest");
  expect(await titles()).toEqual(alphabeticalTitles);

  const search = page.getByRole("searchbox", { name: "Search catalog" });
  await search.fill("NAD+");
  await expect(page.getByText("1 of 56 products", { exact: true })).toBeVisible();
  await expect(catalogResults.getByRole("article", { name: "NAD+", exact: true })).toHaveCount(1);
  await sort.selectOption("price-desc");
  await expect(search).toHaveValue("NAD+");
  await expect(page.getByText("1 of 56 products", { exact: true })).toBeVisible();
});

test("canonical product pricing, variant switching, tiers, and local cart identity stay exact", async ({ page }) => {
  const consoleErrors: string[] = [];
  const forbiddenCommerceRequests: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (
      /\/api\/(?:checkout|stripe|provider|tax|shipping|fulfillment)(?:\/|$)/iu.test(url.pathname) ||
      /(?:^|\.)stripe\.com$/iu.test(url.hostname)
    ) forbiddenCommerceRequests.push(request.url());
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/catalog");
  const card = page.locator("article.catalog-listing-card").filter({ hasText: "Tirzepatide" }).first();
  await expect(card.locator("del")).toContainText("$59.99");
  await expect(card.locator("strong")).toContainText("$41.99");
  await expect(card).toContainText("-30%");
  await expect(card.getByText("Local cart preview", { exact: true })).toBeVisible();

  await page.goto("/catalog/items/tirzepatide");
  const radios = page.locator('input[type="radio"]');
  await expect(radios).toHaveCount(9);
  await expect(page.locator(`input[type="radio"][value="${tirzepatideVariantIds.tr5}"]`)).toBeVisible();
  await page.locator(`input[type="radio"][value="${tirzepatideVariantIds.tr5}"]`).check();
  const pricing = page.locator("main dl");
  const tr5Pricing = await pricing.evaluate((element) => {
    const values = new Map<string, string>();
    const terms = [...element.querySelectorAll("dt")];
    for (const term of terms) {
      const value = term.nextElementSibling;
      if (value) values.set(term.textContent?.trim() ?? "", value.textContent?.trim() ?? "");
    }
    return Object.fromEntries(values);
  });
  expect(tr5Pricing).toMatchObject({
    "Standard unit price": "$0.00",
    "Effective unit price": "$0.00",
    Discount: "30%",
    Savings: "$0.00",
    Subtotal: "$0.00",
  });
  await expect(page.getByRole("status", { name: "Purchase summary" })).toContainText("Preview only");
  await page.locator(`input[type="radio"][value="${tirzepatideVariantIds.tr30}"]`).check();
  await expect(page.locator(`input[type="radio"][value="${tirzepatideVariantIds.tr30}"]`)).toBeChecked();
  await expect(pricing).toContainText("$59.99");
  await expect(pricing).toContainText("$41.99");
  await expect(pricing).toContainText("30%");
  await expect(pricing).toContainText("$18.00");
  await expect(pricing).toContainText("Subtotal");
  const quantityPresets = new Map([[1, "1 bottle"], [2, "2 bottles"], [3, "3 bottles"], [10, "10 or more bottles"]]);
  const expectedSubtotals = new Map([[1, "$41.99"], [2, "$83.98"], [3, "$125.97"], [4, "$167.96"], [9, "$377.91"], [10, "$419.90"], [11, "$461.89"]]);
  for (const quantity of [1, 2, 3, 4, 9, 10, 11]) {
    const preset = quantityPresets.get(quantity);
    if (preset) await page.getByRole("button", { name: preset }).click();
    else await page.getByRole("spinbutton", { name: "Exact quantity" }).fill(String(quantity));
    await expect(pricing).toContainText("30%");
    await expect(pricing).not.toContainText(/(?:38|40)%/u);
    await expect(pricing).toContainText(expectedSubtotals.get(quantity)!);
  }
  await expect(page.getByRole("spinbutton", { name: "Exact quantity" })).toHaveAttribute("min", "10");

  await page.getByRole("button", { name: "3 bottles" }).click();
  await expect(page.getByRole("status", { name: "Purchase summary" })).toContainText("3 bottles");
  await page.getByRole("button", { name: "Increase quantity" }).click();
  await expect(page.getByRole("status", { name: "Purchase summary" })).toContainText("4 bottles");
  await page.getByRole("button", { name: "Decrease quantity" }).click();
  await expect(page.getByRole("status", { name: "Purchase summary" })).toContainText("3 bottles");

  await page.getByRole("button", { name: "1 bottle" }).click();
  await page.locator(`input[type="radio"][value="${tirzepatideVariantIds.tr30}"]`).check();
  await page.getByRole("button", { name: /add tirzepatide to cart/i }).click();
  await page.getByRole("button", { name: /add tirzepatide to cart/i }).click();
  await page.locator(`input[type="radio"][value="${tirzepatideVariantIds.tr60}"]`).check();
  await expect(pricing).toContainText("$109.99");
  await expect(pricing).toContainText("$76.99");
  await expect(pricing).toContainText("$33.00");
  await page.getByRole("button", { name: /add tirzepatide to cart/i }).click();
  await page.getByRole("link", { name: /Cart, \d+ requested units/iu }).click();
  const persisted = await page.evaluate(() => JSON.parse(window.localStorage.getItem("propeptiq.cart.v2") ?? "null"));
  expect(persisted.items).toHaveLength(2);
  expect(persisted.items.map((item: { quantity: number }) => item.quantity).sort()).toEqual([1, 2]);
  expect(persisted.items).toEqual(expect.arrayContaining([
    expect.objectContaining({ variantId: tirzepatideVariantIds.tr30, quantity: 2 }),
    expect.objectContaining({ variantId: tirzepatideVariantIds.tr60, quantity: 1 }),
  ]));

  await page.goto("/cart");
  const cartLines = page.getByRole("list", { name: "Cart lines" });
  const tr30Line = cartLines.locator("li").filter({ hasText: "30mg" });
  const tr60Line = cartLines.locator("li").filter({ hasText: "60mg" });
  await expect(tr30Line).toHaveCount(1);
  await expect(tr60Line).toHaveCount(1);
  for (const line of [tr30Line, tr60Line]) {
    await expect(line.getByRole("heading", { name: "Tirzepatide" })).toBeVisible();
    await expect(line.getByText("1 bottle", { exact: true })).toBeVisible();
    await expect(line.getByText("WINTER30", { exact: true })).toBeVisible();
    await expect(line.getByText("-30%", { exact: true })).toBeVisible();
    await expect(line.getByText(
      "Local cart preview only. No payment will be created.",
      { exact: true },
    )).toBeVisible();
  }
  await expect(tr30Line.getByText("30mg", { exact: true })).toBeVisible();
  await expect(tr30Line.getByText("SKU PPQ-TIRZEPATIDE-TR30", { exact: true })).toBeVisible();
  await expect(tr30Line.locator("del")).toHaveText("$59.99");
  await expect(tr30Line.locator("strong")).toHaveText("$41.99");
  await expect(tr30Line.getByText("Save $36.00", { exact: true })).toBeVisible();
  await expect(tr30Line.getByText("$83.98", { exact: true })).toBeVisible();
  await expect(tr60Line.getByText("60mg", { exact: true })).toBeVisible();
  await expect(tr60Line.getByText("SKU PPQ-TIRZEPATIDE-TR60", { exact: true })).toBeVisible();
  await expect(tr60Line.locator("del")).toHaveText("$109.99");
  await expect(tr60Line.locator("strong")).toHaveText("$76.99");
  await expect(tr60Line.getByText("Save $33.00", { exact: true })).toBeVisible();
  await expect(tr60Line.getByText("Line subtotal").locator("xpath=following-sibling::dd")).toHaveText("$76.99");
  const cartSummary = page.getByRole("complementary", { name: "Order summary" });
  await expect(cartSummary.getByText("$160.97", { exact: true })).toBeVisible();
  await expect(cartSummary.getByText(
    "Included in displayed merchandise prices",
    { exact: true },
  )).toBeVisible();
  await expect(cartSummary.getByRole("heading", { name: "Display-price cart preview" })).toBeVisible();
  await expect(cartSummary.getByRole("button", { name: "Checkout unavailable" })).toBeDisabled();

  const increaseTr30 = page.getByRole("button", {
    name: "Increase quantity for Tirzepatide, 30mg",
  });
  await increaseTr30.focus();
  await expect(increaseTr30).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(tr30Line.getByText("$125.97", { exact: true })).toBeVisible();
  await expect(cartSummary.getByText("$202.96", { exact: true })).toBeVisible();
  await expect(tr30Line.getByText(
    "Local cart preview only. No payment will be created.",
    { exact: true },
  )).toBeVisible();
  const decreaseTr30 = page.getByRole("button", {
    name: "Decrease quantity for Tirzepatide, 30mg",
  });
  await decreaseTr30.focus();
  await expect(decreaseTr30).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(tr30Line.getByText("$83.98", { exact: true })).toBeVisible();
  await expect(cartSummary.getByText("$160.97", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(window.localStorage.getItem("propeptiq.cart.v2") ?? "null"))).toEqual({
    version: 2,
    items: [
      { variantId: tirzepatideVariantIds.tr30, quantity: 2 },
      { variantId: tirzepatideVariantIds.tr60, quantity: 1 },
    ],
  });

  for (const width of [320, 375, 768, 1440]) {
    await page.setViewportSize({ width, height: width <= 375 ? 720 : 900 });
    await page.goto("/cart");
    const responsiveSummary = page.getByRole("complementary", { name: "Order summary" });
    const responsiveAction = responsiveSummary.getByRole("button", { name: "Checkout unavailable" });
    const responsiveTrigger = page.getByRole("button", { name: "Search PropeptIQ" });
    await expect(page.getByText("30mg", { exact: true })).toBeVisible();
    await expect(page.getByText("60mg", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Increase quantity for Tirzepatide, 30mg" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Remove Tirzepatide, 60mg from cart" })).toBeVisible();
    await expect(responsiveSummary.getByText("$160.97", { exact: true })).toBeVisible();
    const layout = await horizontalLayout(page);
    expect(
      layout.scrollWidth - layout.clientWidth,
      `${width}px cart overflow: ${JSON.stringify(layout.offenders)}`,
    ).toBeLessThanOrEqual(1);
    expect(layout.offenders, `${width}px cart overflow offenders`).toEqual([]);
    await responsiveAction.scrollIntoViewIfNeeded();
    await expect(responsiveAction).toBeVisible();
    await expect(responsiveTrigger).toBeVisible();
    expect(
      rectanglesIntersect(await clientRect(responsiveAction), await clientRect(responsiveTrigger)),
      `${width}px search/cart primary-action collision`,
    ).toBe(false);
  }

  expect(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(true);
  expect(forbiddenCommerceRequests).toEqual([]);
  expect(consoleErrors).toEqual([]);
});

test("home and browse catalog hydrate without application console errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });

  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await page.goto("/catalog");
  await page.waitForLoadState("networkidle");

  expect(errors).toEqual([]);
});

test("the known Scribe root attribute does not create a hydration warning", async ({ page }) => {
  const hydrationErrors: string[] = [];
  await page.route("**/", async (route) => {
    const response = await route.fetch();
    const body = (await response.text()).replace(
      "<html ",
      '<html data-scribe-recorder-ready="true" ',
    );
    await route.fulfill({ response, body });
  });
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      /hydration|hydrated|server rendered html.*didn.t match/iu.test(message.text())
    ) {
      hydrationErrors.push(message.text());
    }
  });

  await page.goto("/");
  await page.waitForLoadState("networkidle");

  await expect(page.locator("html")).toHaveAttribute(
    "data-scribe-recorder-ready",
    "true",
  );
  expect(hydrationErrors).toEqual([]);
});

test("captures approved desktop and mobile storefront evidence", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await page.screenshot({
    path: path.join(screenshotDirectory, "home-1440.png"),
    fullPage: true,
  });

  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/catalog");
  await page.screenshot({
    path: path.join(screenshotDirectory, "catalog-375.png"),
    fullPage: true,
  });
});

test("scroll reveal keeps server content visible, hides only below-fold sections after hydration, and never replays", async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 375, height: 520 });
  const serverResponse = await request.get("/");
  expect(serverResponse.ok()).toBe(true);
  const serverHtml = await serverResponse.text();
  expect(serverHtml).toContain("Research materials, documented with greater clarity.");
  expect(serverHtml).not.toContain("data-scroll-reveal-state");

  await page.goto("/");
  const sections = page.locator(".public-layout > main section");
  const firstSection = sections.first();
  const belowFoldSection = sections.filter({ hasText: "Catalog highlights" });

  await expect(firstSection).toHaveAttribute("data-scroll-reveal-state", "visible");
  await expect(firstSection).toHaveCSS("opacity", "1");
  await expect(belowFoldSection).toHaveAttribute("data-scroll-reveal-state", "pending");
  await expect(belowFoldSection).toHaveCSS("transition-duration", "0s");
  const before = await belowFoldSection.evaluate((element) => ({
    height: (element as HTMLElement).offsetHeight,
    offsetTop: (element as HTMLElement).offsetTop,
    width: (element as HTMLElement).offsetWidth,
  }));

  await belowFoldSection.scrollIntoViewIfNeeded();
  await expect(belowFoldSection).toHaveAttribute("data-scroll-reveal-state", "visible");
  await expect(belowFoldSection).toHaveCSS(
    "transition-duration",
    /^0\.28s(?:,\s*0\.28s)?$/u,
  );
  const after = await belowFoldSection.evaluate((element) => ({
    height: (element as HTMLElement).offsetHeight,
    offsetTop: (element as HTMLElement).offsetTop,
    width: (element as HTMLElement).offsetWidth,
  }));
  expect(after).toEqual(before);

  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await expect(belowFoldSection).toHaveAttribute("data-scroll-reveal-state", "visible");
});

test("scroll reveal exposes a pending section to keyboard focus without moving focus", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 520 });
  await page.goto("/");
  const qualitySection = page.locator(
    '.public-layout > main section[aria-labelledby="quality-callout-heading"]',
  );
  const qualityLink = qualitySection.getByRole("link", { name: "View quality records" });

  await expect(qualitySection).toHaveAttribute("data-scroll-reveal-state", "pending");
  await qualityLink.evaluate((element) => element.focus({ preventScroll: true }));
  await expect(qualitySection).toHaveAttribute("data-scroll-reveal-state", "visible");
  await expect(qualityLink).toBeFocused();
});

test("scroll reveal reduced motion keeps sections visible with no transition", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 375, height: 520 });
  await page.goto("/");
  const belowFoldSection = page
    .locator(".public-layout > main section")
    .filter({ hasText: "Catalog highlights" });

  await expect(belowFoldSection).toHaveAttribute("data-scroll-reveal-state", "visible");
  expect(await belowFoldSection.evaluate((element) => ({
    animationDuration: getComputedStyle(element).animationDuration,
    opacity: getComputedStyle(element).opacity,
    scrollBehavior: getComputedStyle(document.documentElement).scrollBehavior,
    transform: getComputedStyle(element).transform,
    transitionDuration: getComputedStyle(element).transitionDuration,
  }))).toEqual({
    animationDuration: "0s",
    opacity: "1",
    scrollBehavior: "auto",
    transform: "none",
    transitionDuration: "0s",
  });
});

test("JavaScript disabled keeps essential public sections visible and navigable", async ({
  baseURL,
  browser,
}) => {
  if (baseURL === undefined) throw new Error("Playwright baseURL is required.");
  const context = await browser.newContext({
    baseURL,
    javaScriptEnabled: false,
    viewport: { width: 375, height: 812 },
  });
  const page = await context.newPage();
  try {
    await page.goto("/");
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "Research materials, documented with greater clarity.",
      }),
    ).toBeVisible();
    const browseCatalog = page.getByRole("link", { name: "Browse catalog" });
    await expect(browseCatalog).toBeVisible();
    await browseCatalog.click();
    await expect(page).toHaveURL(/\/catalog$/u);
    await expect(
      page.getByRole("heading", { level: 1, name: "Research catalog, organized by product." }),
    ).toBeVisible();
  } finally {
    await context.close();
  }
});

test("scroll reveal public routes stay overflow-free and error-free on mobile and desktop", async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));

  for (const viewport of [
    { width: 375, height: 812 },
    { width: 1440, height: 1000 },
  ]) {
    await page.setViewportSize(viewport);
    for (const route of ["/", "/catalog"] as const) {
      await page.goto(route);
      const geometry = await page.evaluate(() => ({
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
      }));
      expect(
        geometry.scrollWidth - geometry.clientWidth,
        `${route} at ${viewport.width}px`,
      ).toBeLessThanOrEqual(1);
    }
  }

  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
});
