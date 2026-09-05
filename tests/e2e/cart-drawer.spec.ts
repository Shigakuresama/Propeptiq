import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";

const origin = "http://127.0.0.1:4631";
const bpc10VariantId = "b0447a0a-6da0-5209-a273-cdb0035a5d97";
const tirzepatide30VariantId = "5ff78cc3-c541-5bf4-9f3b-12be2222cc75";

async function addBpc10(page: Page, times = 1) {
  await page.goto("/catalog/items/bpc-157");
  const pricing = page.getByRole("status", { name: "Purchase summary" });
  await expect(pricing).toContainText("$39.99");
  await expect(pricing).toContainText("$27.99");
  const add = page.getByRole("button", { name: "Add BPC-157 to preview cart" });
  for (let index = 0; index < times; index += 1) await add.click();
}

async function openDrawer(page: Page) {
  const trigger = page.getByRole("link", { name: /Cart, \d+ requested unit/iu });
  await trigger.click();
  const drawer = page.getByRole("dialog", { name: "Your cart" });
  await expect(drawer).toBeVisible();
  return { drawer, trigger };
}

async function expectNoHorizontalOverflow(locator: Locator, label: string) {
  const layout = await locator.evaluate((root) => {
    const rootRect = root.getBoundingClientRect();
    const offenders = [...root.querySelectorAll("*")]
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          left: rect.left,
          right: rect.right,
          text: element.textContent?.trim().slice(0, 70) ?? "",
          tag: element.tagName,
        };
      })
      .filter(({ left, right }) => left < rootRect.left - 1 || right > rootRect.right + 1)
      .slice(0, 10);
    return {
      clientWidth: root.clientWidth,
      offenders,
      scrollWidth: root.scrollWidth,
    };
  });
  expect(layout.scrollWidth - layout.clientWidth, `${label}: ${JSON.stringify(layout.offenders)}`)
    .toBeLessThanOrEqual(1);
  expect(layout.offenders, label).toEqual([]);
}

test("configured BPC-157 and Tirzepatide facts merge, persist, and match the full cart without payment traffic", async ({ page }, testInfo) => {
  const errors: string[] = [];
  const paymentRequests: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (/\/api\/(?:checkout|stripe|provider|tax|shipping|fulfillment)(?:\/|$)/iu.test(url.pathname) ||
      /(?:^|\.)stripe\.com$/iu.test(url.hostname)) paymentRequests.push(request.url());
  });

  await addBpc10(page, 2);
  const { drawer, trigger } = await openDrawer(page);
  await expect(drawer).toHaveCSS("animation-duration", "0.3s");
  const bpcLine = drawer.getByRole("listitem").filter({ hasText: "BPC-157" });
  await expect(bpcLine).toHaveCount(1);
  await expect(bpcLine.getByRole("heading", { name: "BPC-157" })).toBeVisible();
  await expect(bpcLine.getByText("10mg", { exact: true })).toBeVisible();
  await expect(bpcLine.getByRole("img", {
    name: "AI-generated catalog illustration beside BPC-157, 10mg",
  })).toBeVisible();
  const disclosure = bpcLine.getByText(
    "AI-generated catalog illustration — not actual product photography.",
    { exact: true },
  );
  await disclosure.scrollIntoViewIfNeeded();
  await expect(disclosure).toBeVisible();
  await expect(bpcLine.locator("del")).toHaveText("$39.99");
  await expect(bpcLine.locator("strong")).toHaveText("$27.99");
  await expect(bpcLine.getByText("$55.98", { exact: true })).toBeVisible();
  const bpcQuantity = bpcLine.getByRole("spinbutton", { name: "Quantity for BPC-157, 10mg" });
  await expect(bpcQuantity).toHaveValue("2");
  await bpcQuantity.fill("3");
  await expect(bpcLine.getByText("$83.97", { exact: true })).toBeVisible();
  const checkout = drawer.getByRole("button", { name: "Checkout — Coming Soon" });
  await expect(checkout).toBeDisabled();
  await expect(checkout).toHaveAttribute("aria-disabled", "true");
  await expect(drawer.getByText(/final shipping, tax, and payment are not available/iu)).toBeVisible();

  const scrollRegion = drawer.locator("[data-cart-drawer-scroll]");
  await page.setViewportSize({ width: 375, height: 900 });
  await scrollRegion.evaluate((element) => element.scrollTo(0, 0));
  await drawer.screenshot({ path: testInfo.outputPath("cart-drawer-initial-375x900.png") });
  await page.setViewportSize({ width: 1440, height: 900 });
  await scrollRegion.evaluate((element) => element.scrollTo(0, 0));
  await drawer.screenshot({ path: testInfo.outputPath("cart-drawer-initial-1440x900.png") });
  await page.setViewportSize({ width: 375, height: 900 });
  await scrollRegion.evaluate((element) => element.scrollTo(0, element.scrollHeight));
  await expect(checkout).toBeVisible();
  await drawer.screenshot({ path: testInfo.outputPath("cart-drawer-bottom-checkout-375x900.png") });

  await drawer.getByRole("button", { name: "Close" }).click();
  await expect(trigger).toBeFocused();
  await trigger.click();
  await expect(page.getByRole("dialog", { name: "Your cart" }).getByRole("spinbutton", {
    name: "Quantity for BPC-157, 10mg",
  })).toHaveValue("3");
  await page.getByRole("dialog", { name: "Your cart" }).getByRole("button", { name: "Close" }).click();
  await page.reload();
  const reopened = (await openDrawer(page)).drawer;
  await expect(reopened.getByRole("spinbutton", { name: "Quantity for BPC-157, 10mg" })).toHaveValue("3");
  await reopened.getByRole("button", { name: "Close" }).click();

  await page.goto("/catalog/items/tirzepatide");
  await page.locator(`input[type="radio"][value="${tirzepatide30VariantId}"]`).check();
  await page.getByRole("button", { name: "Add Tirzepatide to preview cart" }).click();
  const combined = (await openDrawer(page)).drawer;
  await expect(combined.getByRole("listitem")).toHaveCount(2);
  await expect(combined.getByRole("listitem").filter({ hasText: "Tirzepatide" }).locator("del"))
    .toHaveText("$59.99");
  await expect(combined.getByRole("listitem").filter({ hasText: "Tirzepatide" }).locator("strong"))
    .toHaveText("$41.99");
  await expect(combined.getByText("$125.96", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("propeptiq.cart.v2") ?? "null")))
    .toEqual({
      version: 2,
      items: [
        { variantId: bpc10VariantId, quantity: 3 },
        { variantId: tirzepatide30VariantId, quantity: 1 },
      ],
    });

  await combined.getByRole("link", { name: "View cart" }).click();
  await expect(page).toHaveURL(/\/cart$/u);
  await expect(page.getByRole("dialog", { name: "Your cart" })).toHaveCount(0);
  const pageLines = page.getByRole("list", { name: "Cart lines" });
  await expect(pageLines).toHaveCount(1);
  await expect(pageLines.getByRole("listitem")).toHaveCount(2);
  await expect(pageLines.getByRole("listitem").filter({ hasText: "BPC-157" }).locator("strong"))
    .toHaveText("$27.99");
  await expect(page.getByRole("complementary", { name: "Order summary" }).getByText("$125.96", { exact: true }))
    .toBeVisible();
  expect(paymentRequests).toEqual([]);
  expect(errors).toEqual([]);
});

test("keyboard, dismissal, search, mobile navigation, reduced motion, and native no-JavaScript fallback remain isolated", async ({ page, browser }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await page.setViewportSize({ width: 375, height: 520 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/catalog");
  await page.goto("/catalog/items/tirzepatide?source=drawer-test");
  await page.locator(`input[type="radio"][value="${tirzepatide30VariantId}"]`).check();
  await page.getByRole("button", { name: "Add Tirzepatide to preview cart" }).click();
  const trigger = page.getByRole("link", { name: "Cart, 1 requested unit" });
  await trigger.focus();
  await page.keyboard.press("Enter");
  const drawer = page.getByRole("dialog", { name: "Your cart" });
  await expect(drawer).toBeVisible();
  await expect(drawer).toHaveCSS("transition-duration", "0s");
  await expect(drawer).toHaveCSS("transform", "none");
  expect((await new AxeBuilder({ page }).include(".cart-drawer").analyze()).violations).toEqual([]);
  for (let index = 0; index < 14; index += 1) {
    await page.keyboard.press("Tab");
    expect(await drawer.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(drawer).toBeHidden();
  await expect(trigger).toBeFocused();
  await expect(page).toHaveURL(`${origin}/catalog/items/tirzepatide?source=drawer-test`);
  await expect(page.locator(`input[type="radio"][value="${tirzepatide30VariantId}"]`)).toBeChecked();

  await page.setViewportSize({ width: 1024, height: 700 });
  await trigger.click();
  await page.mouse.click(5, 5);
  await expect(drawer).toBeHidden();
  await expect(trigger).toBeFocused();
  await page.setViewportSize({ width: 375, height: 520 });
  await trigger.click();
  await drawer.getByRole("button", { name: "Close" }).click();
  await expect(trigger).toBeFocused();

  await trigger.click();
  await page.goBack();
  await expect(page).toHaveURL(/\/catalog$/u);
  await expect(drawer).toBeHidden();
  await page.goForward();
  await expect(page).toHaveURL(/\/catalog\/items\/tirzepatide\?source=drawer-test$/u);
  await expect(drawer).toBeHidden();

  await page.getByRole("button", { name: "Open navigation" }).click();
  await expect(page.getByRole("dialog", { name: "PROPEPTIQ LABS" })).toBeVisible();
  await expect(drawer).toBeHidden();
  await page.getByRole("dialog", { name: "PROPEPTIQ LABS" }).getByRole("button", { name: "Close" }).click();
  await page.getByRole("button", { name: "Search PropeptIQ" }).click();
  await expect(page.getByRole("dialog", { name: "Search PropeptIQ" })).toBeVisible();
  await expect(drawer).toBeHidden();
  await page.getByRole("dialog", { name: "Search PropeptIQ" }).getByRole("button", { name: "Close" }).click();

  const noJavaScript = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 375, height: 520 } });
  try {
    const fallbackPage = await noJavaScript.newPage();
    await fallbackPage.goto(`${origin}/catalog`);
    const fallbackLink = fallbackPage.getByRole("link", { name: "Cart, 0 requested units" });
    await expect(fallbackLink).toHaveAttribute("href", "/cart");
    await fallbackLink.click();
    await expect(fallbackPage).toHaveURL(`${origin}/cart`);
  } finally {
    await noJavaScript.close();
  }
  expect(errors).toEqual([]);
});

test("preview failure retry, stale response isolation, short-phone layout, and removal focus stay safe", async ({ page }, testInfo) => {
  const errors: string[] = [];
  const expectedPreviewDiagnostics: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    if (message.text() === "Failed to load resource: the server responded with a status of 503 (Service Unavailable)") {
      expectedPreviewDiagnostics.push(message.text());
      return;
    }
    errors.push(message.text());
  });
  await addBpc10(page);

  let previewRequestCount = 0;
  let failPreview = true;
  let holdNextPreview = false;
  let releaseHeld: (() => Promise<void>) | undefined;
  await page.route("**/api/catalog/preview", async (route) => {
    previewRequestCount += 1;
    if (failPreview) {
      await route.fulfill({ status: 503, contentType: "application/json", body: '{"error":"synthetic browser failure"}' });
      return;
    }
    if (holdNextPreview) {
      holdNextPreview = false;
      const response = await route.fetch();
      await new Promise<void>((resolve) => {
        releaseHeld = async () => {
          await route.fulfill({ response }).catch(() => undefined);
          resolve();
        };
      });
      return;
    }
    await route.continue();
  });

  const { drawer } = await openDrawer(page);
  await expect(drawer.getByRole("alert")).toContainText("authoritative cart preview is unavailable");
  await expect(drawer).not.toContainText("synthetic browser failure");
  failPreview = false;
  await drawer.getByRole("button", { name: "Retry current cart facts" }).click();
  await expect(drawer.getByRole("heading", { name: "BPC-157" })).toBeVisible();
  const increase = drawer.getByRole("button", { name: /Increase quantity/iu });
  const beforeHeldRequest = previewRequestCount;
  holdNextPreview = true;
  await increase.click();
  await expect.poll(() => previewRequestCount).toBe(beforeHeldRequest + 1);
  await increase.click();
  await expect.poll(() => previewRequestCount).toBe(beforeHeldRequest + 2);
  await expect(drawer.getByRole("spinbutton", { name: "Quantity for BPC-157, 10mg" })).toHaveValue("3");
  await releaseHeld?.();
  await expect(drawer.getByRole("spinbutton", { name: "Quantity for BPC-157, 10mg" })).toHaveValue("3");

  for (const width of [195, 320, 375, 768, 1440]) {
    await page.setViewportSize({ width, height: width <= 375 ? 520 : 900 });
    await expect(drawer).toBeVisible();
    await expectNoHorizontalOverflow(drawer, `${width}px cart drawer overflow`);
    if (width === 1440) {
      const drawerLayout = drawer.locator(".cart-layout--drawer");
      const layoutFacts = await drawerLayout.evaluate((element) => ({
        columns: getComputedStyle(element).gridTemplateColumns.trim().split(/\s+/u),
        summaryPosition: getComputedStyle(element.querySelector(".cart-summary")!).position,
      }));
      expect(layoutFacts.columns).toHaveLength(1);
      expect(layoutFacts.summaryPosition).toBe("static");
    }
    const close = drawer.getByRole("button", { name: "Close" });
    const viewCart = drawer.getByRole("link", { name: "View cart" });
    await expect(close).toBeVisible();
    await expect(viewCart).toBeVisible();
    for (const control of await drawer.getByRole("button").all()) {
      const box = await control.boundingBox();
      expect(box?.width).toBeGreaterThanOrEqual(44);
      expect(box?.height).toBeGreaterThanOrEqual(44);
    }
  }
  await page.setViewportSize({ width: 375, height: 520 });
  await expect(drawer.getByRole("button", { name: "Close" })).toBeVisible();
  await expect(drawer.getByRole("link", { name: "View cart" })).toBeVisible();
  await drawer.screenshot({ path: testInfo.outputPath("cart-drawer-375x520.png") });
  expect((await new AxeBuilder({ page }).include(".cart-drawer").analyze()).violations).toEqual([]);

  await drawer.getByRole("button", { name: "Remove BPC-157, 10mg from cart" }).click();
  const emptyHeading = drawer.getByRole("heading", { name: "Your cart is empty." });
  await expect(emptyHeading).toBeVisible();
  await expect(emptyHeading).toBeFocused();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("propeptiq.cart.v2") ?? "null")))
    .toEqual({ version: 2, items: [] });
  expect(expectedPreviewDiagnostics).toEqual([
    "Failed to load resource: the server responded with a status of 503 (Service Unavailable)",
  ]);
  expect(errors).toEqual([]);
});
