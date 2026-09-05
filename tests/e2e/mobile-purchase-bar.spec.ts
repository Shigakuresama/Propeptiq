import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";

// Real public catalog selection and the existing local preview pricing context.
// Legacy storage, absent browser capability, and explicitly labeled text stress
// cases use bounded test doubles; catalog, pricing, and cart behavior stay real.
const productPath = "/catalog/items/tirzepatide";
const tr30VariantId = "5ff78cc3-c541-5bf4-9f3b-12be2222cc75";
const tr60VariantId = "d6b26e70-2a1b-599c-93f0-c85cd014ffd5";
const cartKey = "propeptiq.cart.v2";
const legacyCartKey = "propeptiq.cart.v1";
const addLabel = "Add Tirzepatide to preview cart";

const purchaseSummary = (page: Page) => page.getByRole("status", { name: "Purchase summary" });
const mobilePurchase = (page: Page) => page.getByRole("region", { name: "Mobile purchase controls" });
const searchTrigger = (page: Page) => page.getByRole("button", { name: "Search PropeptIQ" });

async function rect(locator: Locator) {
  return locator.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return {
      top: bounds.top,
      right: bounds.right,
      bottom: bounds.bottom,
      left: bounds.left,
      width: bounds.width,
      height: bounds.height,
    };
  });
}

async function openProduct(page: Page) {
  await page.goto(productPath);
  await expect(page.getByRole("heading", { name: "Tirzepatide", exact: true })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await expect(purchaseSummary(page)).toContainText("Local cart preview");
}

async function chooseTwoBottles(page: Page) {
  await page.locator(`input[type="radio"][value="${tr30VariantId}"]`).check();
  await page.getByRole("button", { name: "2 bottles", exact: true }).click();
  await expect(purchaseSummary(page)).toContainText("30mg · 2 bottles");
  await expect(purchaseSummary(page)).toContainText("$83.98");
}

async function waitForPurchaseLayout(page: Page) {
  await purchaseSummary(page).evaluate(async (element) => {
    await document.fonts.ready;
    let previous: number[] | undefined;
    let stableFrames = 0;
    const deadline = performance.now() + 5_000;
    while (performance.now() < deadline) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const bounds = element.getBoundingClientRect();
      const geometry = [window.scrollY, bounds.bottom + window.scrollY, bounds.height, document.documentElement.scrollHeight];
      const visibleAnimationRunning = document.getAnimations().some((animation) => {
        if (animation.playState !== "running" || !Number.isFinite(animation.effect?.getComputedTiming().endTime)) return false;
        const target = animation.effect instanceof KeyframeEffect ? animation.effect.target : null;
        if (!(target instanceof Element)) return false;
        const targetBounds = target.getBoundingClientRect();
        return targetBounds.bottom > 0 && targetBounds.top < window.innerHeight;
      });
      if (!visibleAnimationRunning && previous && geometry.every((value, index) => Math.abs(value - previous![index]!) < 0.01)) {
        stableFrames += 1;
        if (stableFrames >= 6) return;
      } else {
        stableFrames = 0;
      }
      previous = geometry;
    }
    throw new Error("Purchase layout did not settle after scrolling and finite visible transitions.");
  });
}

async function positionSummaryBottom(page: Page, bottom: number) {
  // A native focus scroll is not a Web Animation. Wait for its geometry as
  // well as CSS transitions before setting the exact observer boundary.
  await waitForPurchaseLayout(page);
  await purchaseSummary(page).evaluate((element, targetBottom) => {
    window.scrollTo({ top: window.scrollY + element.getBoundingClientRect().bottom - targetBottom, behavior: "instant" });
  }, bottom);
  await waitForPurchaseLayout(page);
  await expect.poll(async () => Math.abs((await rect(purchaseSummary(page))).bottom - bottom)).toBeLessThanOrEqual(1);
}

async function expectPurchaseHeadingBelowHeader(page: Page) {
  const heading = page.getByRole("heading", { name: "Purchase", exact: true });
  await expect(heading).toBeFocused();
  await expect(heading).toBeInViewport();
  await expect.poll(async () => (await rect(heading)).top - (await rect(page.getByRole("banner"))).bottom).toBeGreaterThanOrEqual(0);
}

async function showMobilePurchase(page: Page) {
  await positionSummaryBottom(page, -12);
  await expect(mobilePurchase(page)).toBeVisible();
}

async function expectDockGeometry(page: Page, originalSearchBottom: number) {
  const viewport = page.viewportSize()!;
  const purchase = mobilePurchase(page);
  const search = searchTrigger(page);
  const [purchaseBounds, searchBounds] = await Promise.all([rect(purchase), rect(search)]);
  expect(purchaseBounds.left).toBeGreaterThanOrEqual(0);
  expect(purchaseBounds.right).toBeLessThanOrEqual(viewport.width);
  expect(purchaseBounds.top).toBeGreaterThanOrEqual(0);
  expect(purchaseBounds.bottom).toBeLessThan(searchBounds.top);
  expect(searchBounds.bottom).toBeCloseTo(originalSearchBottom, 0);
  expect((searchBounds.left + searchBounds.right) / 2).toBeCloseTo(viewport.width / 2, 0);
  expect(searchBounds.width).toBeCloseTo(44, 0);
  expect(searchBounds.height).toBeCloseTo(44, 0);
  for (const control of await purchase.locator("button, a").all()) {
    const bounds = await rect(control);
    expect(bounds.height).toBeGreaterThanOrEqual(44);
    expect(bounds.left).toBeGreaterThanOrEqual(purchaseBounds.left);
    expect(bounds.right).toBeLessThanOrEqual(purchaseBounds.right);
    expect(bounds.top).toBeGreaterThanOrEqual(purchaseBounds.top);
    expect(bounds.bottom).toBeLessThanOrEqual(purchaseBounds.bottom);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
}

test("mobile purchase waits until the inline summary has passed above the viewport", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await openProduct(page);
  expect((await rect(purchaseSummary(page))).top).toBeGreaterThan(812);
  await expect(mobilePurchase(page)).toBeHidden();
  const originalSearchBottom = (await rect(searchTrigger(page))).bottom;
  const liveRegionsBefore = await page.locator('[aria-live]:not([aria-live="off"]), [role="status"], [role="alert"]').count();

  await chooseTwoBottles(page);
  await positionSummaryBottom(page, 2);
  await expect(mobilePurchase(page)).toBeHidden();
  await showMobilePurchase(page);
  await expect(mobilePurchase(page)).toHaveCount(1);
  expect(await mobilePurchase(page).evaluate((element) => element.closest("main"))).toBeNull();
  await expect(mobilePurchase(page)).toContainText("30mg");
  await expect(mobilePurchase(page)).toContainText("2 bottles");
  await expect(mobilePurchase(page)).toContainText("$83.98");
  await expect(mobilePurchase(page)).toContainText("Local cart preview");
  await expect(mobilePurchase(page).getByRole("button", { name: addLabel })).toBeEnabled();
  await expect(mobilePurchase(page).locator('[aria-live], [role="status"], [role="alert"]')).toHaveCount(0);
  await expect(page.getByRole("status", { name: "Purchase summary" })).toHaveCount(1);
  await expect(page.getByRole("status", { name: "Cart updates" })).toHaveCount(1);
  await expect(page.locator('[aria-live]:not([aria-live="off"]), [role="status"], [role="alert"]')).toHaveCount(liveRegionsBefore);
  await expectDockGeometry(page, originalSearchBottom);

  await positionSummaryBottom(page, 2);
  await expect(mobilePurchase(page)).toBeHidden();
  await expect(searchTrigger(page)).toBeVisible();
});

test("inline and mobile additions merge the same canonical variant and persist the exact cart", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const paymentRequests: string[] = [];
  page.on("request", (request) => {
    if (/\/api\/checkout|api\.stripe\.com/u.test(request.url())) paymentRequests.push(request.url());
  });
  await openProduct(page);
  await chooseTwoBottles(page);
  await purchaseSummary(page).getByRole("button", { name: addLabel }).click();
  await expect(page.getByRole("status", { name: "Cart updates" })).toHaveText("Cart updated. Tirzepatide, 30mg: 2 units in cart.");
  await showMobilePurchase(page);
  await mobilePurchase(page).getByRole("button", { name: addLabel }).click();
  await expect(page.getByRole("status", { name: "Cart updates" })).toHaveText("Cart updated. Tirzepatide, 30mg: 4 units in cart.");
  await expect.poll(() => page.evaluate((key) => JSON.parse(window.localStorage.getItem(key) ?? "null"), cartKey)).toEqual({
    version: 2,
    items: [{ variantId: tr30VariantId, quantity: 4 }],
  });

  await page.goto("/cart");
  await page.reload();
  const lines = page.getByRole("list", { name: "Cart lines" });
  await expect(lines.locator("li")).toHaveCount(1);
  await expect(lines.getByText("30mg", { exact: true })).toBeVisible();
  await expect(lines.getByText("SKU PPQ-TIRZEPATIDE-TR30", { exact: true })).toBeVisible();
  await expect(lines.getByRole("spinbutton")).toHaveValue("4");
  await expect(lines.locator("strong")).toHaveText("$41.99");
  await expect(lines.getByText("Line subtotal").locator("xpath=following-sibling::dd")).toHaveText("$167.96");
  await expect(page.getByRole("button", { name: "Checkout unavailable" })).toBeDisabled();
  await expect(mobilePurchase(page)).toBeHidden();
  expect(paymentRequests).toEqual([]);
});

test("Change selection returns keyboard focus to Purchase without resetting variant or quantity", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await openProduct(page);
  await chooseTwoBottles(page);
  await page.locator(`input[type="radio"][value="${tr60VariantId}"]`).check();
  await expect(purchaseSummary(page)).toContainText("$153.98");
  await showMobilePurchase(page);
  await expect(mobilePurchase(page)).toContainText("60mg");
  await expect(mobilePurchase(page)).toContainText("2 bottles");
  await expect(mobilePurchase(page)).toContainText("$153.98");
  const changeSelection = mobilePurchase(page).getByRole("link", { name: "Change selection" });
  await expect(changeSelection).toHaveAttribute("href", "#purchase-heading");
  await changeSelection.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/catalog\/items\/tirzepatide#purchase-heading$/u);
  const heading = page.getByRole("heading", { name: "Purchase", exact: true });
  await expect(heading).toBeFocused();
  await expect(heading).toBeInViewport();
  await expectPurchaseHeadingBelowHeader(page);
  await expect(mobilePurchase(page)).toBeHidden();
  await expect(page.locator(`input[type="radio"][value="${tr60VariantId}"]`)).toBeChecked();
  await expect(page.getByRole("spinbutton", { name: "Exact quantity" })).toHaveValue("2");
  await expect(purchaseSummary(page)).toContainText("$153.98");
});

test("mobile purchase rejects an invalid quantity instead of showing the previous subtotal", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await openProduct(page);
  await chooseTwoBottles(page);
  const savedCartBefore = await page.evaluate((key) => window.localStorage.getItem(key), cartKey);
  await page.getByRole("spinbutton", { name: "Exact quantity" }).fill("");
  await expect(purchaseSummary(page)).toContainText("Invalid quantity");
  await showMobilePurchase(page);
  await expect(mobilePurchase(page)).toContainText("Invalid quantity");
  await expect(mobilePurchase(page)).not.toContainText("$83.98");
  await expect(mobilePurchase(page).getByRole("button", { name: "Tirzepatide unavailable" })).toBeDisabled();
  expect(await page.evaluate((key) => window.localStorage.getItem(key), cartKey)).toBe(savedCartBefore);
});

test("product and information navigation clear stale purchase portals and release reserved space", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/research-use-policy");
  const footerPaddingWithoutPurchase = await page.locator(".public-layout > footer").evaluate((element) => getComputedStyle(element).paddingBottom);
  const originalSearchBottom = (await rect(searchTrigger(page))).bottom;
  await openProduct(page);
  await chooseTwoBottles(page);
  await showMobilePurchase(page);
  await expect(mobilePurchase(page)).toContainText("Tirzepatide");

  await searchTrigger(page).click();
  const searchDialog = page.getByRole("dialog", { name: "Search PropeptIQ" });
  await searchDialog.getByRole("searchbox", { name: "Search products and information" }).fill("BPC-157");
  await searchDialog.locator('a[href="/catalog/items/bpc-157"]').click();
  await expect(page).toHaveURL(/\/catalog\/items\/bpc-157$/u);
  await expect(page.getByRole("heading", { name: "BPC-157", exact: true })).toBeVisible();
  await expect(mobilePurchase(page)).toBeHidden();
  await showMobilePurchase(page);
  await expect(mobilePurchase(page)).toContainText("BPC-157");
  await expect(mobilePurchase(page)).not.toContainText("Tirzepatide");
  await expect(mobilePurchase(page)).toHaveCount(1);
  await expectDockGeometry(page, originalSearchBottom);

  // The shared navigation uses a client transition, exercising portal cleanup
  // without relying on a full document reload to remove the previous product.
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page.getByRole("navigation", { name: "Mobile primary" }).getByRole("link", { name: "Research Use", exact: true }).click();
  await expect(page).toHaveURL(/\/research-use-policy$/u);
  const allPurchaseRegions = page.getByRole("region", { name: "Mobile purchase controls", includeHidden: true });
  await expect(allPurchaseRegions).toHaveCount(0);
  await expect.poll(() => page.locator(".public-layout > footer").evaluate((element) => getComputedStyle(element).paddingBottom)).toBe(footerPaddingWithoutPurchase);
  expect((await rect(searchTrigger(page))).bottom).toBeCloseTo(originalSearchBottom, 0);

  await page.goBack();
  await expect(page).toHaveURL(/\/catalog\/items\/bpc-157$/u);
  await showMobilePurchase(page);
  await expect(allPurchaseRegions).toHaveCount(1);
  await expect(mobilePurchase(page)).toContainText("BPC-157");
  await expect(mobilePurchase(page)).not.toContainText("Tirzepatide");
  await page.goForward();
  await expect(page).toHaveURL(/\/research-use-policy$/u);
  await expect(allPurchaseRegions).toHaveCount(0);
  await expect.poll(() => page.locator(".public-layout > footer").evaluate((element) => getComputedStyle(element).paddingBottom)).toBe(footerPaddingWithoutPurchase);
  await page.goBack();
  await expect(page).toHaveURL(/\/catalog\/items\/bpc-157$/u);
  await page.goBack();
  await expect(page).toHaveURL(/\/catalog\/items\/tirzepatide$/u);
  await showMobilePurchase(page);
  await expect(allPurchaseRegions).toHaveCount(1);
  await expect(mobilePurchase(page)).toContainText("Tirzepatide");
  await expect(mobilePurchase(page)).not.toContainText("BPC-157");
  await expectDockGeometry(page, originalSearchBottom);
});

test("header navigation owns hit testing and focus while the purchase dock is underneath", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 520 });
  await openProduct(page);
  await chooseTwoBottles(page);
  await showMobilePurchase(page);
  const originalSearchBottom = (await rect(searchTrigger(page))).bottom;
  const purchaseButtonBounds = await rect(mobilePurchase(page).getByRole("button", { name: addLabel }));
  const savedCartBefore = await page.evaluate((key) => window.localStorage.getItem(key), cartKey);
  const trigger = page.getByRole("button", { name: "Open navigation" });
  await trigger.click();
  const navigationDialog = page.locator('[data-slot="sheet-content"][data-side="right"]');
  await expect(navigationDialog).toBeVisible();
  await expect(page.locator('[data-slot="sheet-overlay"]:visible')).toHaveCount(1);
  for (const key of ["Tab", "Shift+Tab"] as const) {
    for (let step = 0; step < 10; step += 1) {
      await page.keyboard.press(key);
      expect(await navigationDialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
    }
  }
  expect(await page.evaluate(({ x, y }) => {
    const hit = document.elementFromPoint(x, y);
    return Boolean(hit?.closest('[data-slot="sheet-content"], [data-slot="sheet-overlay"]'));
  }, {
    x: (purchaseButtonBounds.left + purchaseButtonBounds.right) / 2,
    y: (purchaseButtonBounds.top + purchaseButtonBounds.bottom) / 2,
  })).toBe(true);
  await page.keyboard.press("Escape");
  await expect(navigationDialog).toBeHidden();
  await expect(trigger).toBeFocused();
  await expect(mobilePurchase(page)).toBeVisible();
  await expect(mobilePurchase(page)).toContainText("$83.98");
  await expectDockGeometry(page, originalSearchBottom);
  expect(await page.evaluate((key) => window.localStorage.getItem(key), cartKey)).toBe(savedCartBefore);
});

test("focused purchase controls hand focus to the inline heading when the viewport cannot retain the dock", async ({ page }) => {
  for (const viewport of [{ width: 768, height: 812 }, { width: 390, height: 240 }]) {
    await page.setViewportSize({ width: 375, height: 812 });
    await openProduct(page);
    await chooseTwoBottles(page);
    await showMobilePurchase(page);
    const add = mobilePurchase(page).getByRole("button", { name: addLabel });
    await add.focus();
    await expect(add).toBeFocused();
    const savedCartBefore = await page.evaluate((key) => window.localStorage.getItem(key), cartKey);
    await page.setViewportSize(viewport);
    const heading = page.getByRole("heading", { name: "Purchase", exact: true });
    await expect(heading).toBeFocused();
    await expect(heading).toBeInViewport();
    await expectPurchaseHeadingBelowHeader(page);
    await expect(mobilePurchase(page)).toBeHidden();
    await expect(searchTrigger(page)).toBeVisible();
    await expect(page.getByRole("spinbutton", { name: "Exact quantity" })).toHaveValue("2");
    expect(await page.evaluate((key) => window.localStorage.getItem(key), cartKey)).toBe(savedCartBefore);
  }
});

test("footer Tab navigation keeps every focused target fully above the active purchase row", async ({ page }) => {
  for (const viewport of [{ width: 375, height: 812 }, { width: 390, height: 520 }]) {
    await page.setViewportSize(viewport);
    await openProduct(page);
    await chooseTwoBottles(page);
    await showMobilePurchase(page);
    const footer = page.locator(".public-layout > footer");
    const previous = footer.getByRole("link", { name: "PROPEPTIQ LABS home", exact: true });
    const clearBottom = (await rect(mobilePurchase(page))).top - 8;
    await previous.evaluate((element, bottom) => {
      window.scrollTo({ top: window.scrollY + element.getBoundingClientRect().bottom - bottom, behavior: "instant" });
      (element as HTMLElement).focus({ preventScroll: true });
    }, clearBottom);
    await waitForPurchaseLayout(page);
    await expect(previous).toBeFocused();
    await expect(mobilePurchase(page)).toBeVisible();

    // Only the known preceding link is positioned by the fixture. All target
    // links and summaries below receive focus through actual Tab navigation and browser scroll.
    const targets = [
      ["Instagram", footer.getByRole("link", { name: "Instagram", exact: true })],
      ["TikTok", footer.getByRole("link", { name: "TikTok", exact: true })],
      ["X", footer.getByRole("link", { name: "X", exact: true })],
      ["Facebook", footer.getByRole("link", { name: "Facebook", exact: true })],
      ["Shop summary", footer.locator("summary").filter({ hasText: /^Shop$/u })],
      ["Catalog", footer.getByRole("link", { name: "Catalog", exact: true })],
      ["Cart", footer.getByRole("link", { name: "Cart", exact: true })],
      ["Rewards", footer.getByRole("link", { name: "Rewards", exact: true })],
      ["Partner Program", footer.getByRole("link", { name: "Partner Program", exact: true })],
      ["Support summary", footer.locator("summary").filter({ hasText: /^Support$/u })],
      ["Quality Records", footer.getByRole("link", { name: "Quality Records", exact: true })],
      ["Order tracking", footer.getByRole("link", { name: "Order tracking", exact: true })],
      ["FAQ", footer.getByRole("link", { name: "FAQ", exact: true })],
      ["Legal summary", footer.locator("summary").filter({ hasText: /^Legal$/u })],
      ["Research Use Only", footer.getByRole("link", { name: "Research Use Only", exact: true })],
    ] as const;
    for (const [name, target] of targets) {
      await page.keyboard.press("Tab");
      await expect(target).toBeFocused();
      await waitForPurchaseLayout(page);
      await expect(mobilePurchase(page)).toBeVisible();
      const targetBounds = await rect(target);
      const purchaseBounds = await rect(mobilePurchase(page));
      const headerBounds = await rect(page.getByRole("banner"));
      expect(targetBounds.top, `${name} focus must clear the fixed header at ${viewport.width}px`).toBeGreaterThanOrEqual(headerBounds.bottom);
      expect(targetBounds.bottom, `${name} full focus target must clear the purchase row at ${viewport.width}px`).toBeLessThanOrEqual(purchaseBounds.top);
      expect(targetBounds.left).toBeGreaterThanOrEqual(0);
      expect(targetBounds.right).toBeLessThanOrEqual(viewport.width);
    }
  }
});

test("enlarged text and a synthetic long label remeasure clearance and hand focus back when the row cannot fit", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 1200 });
  await openProduct(page);
  await chooseTwoBottles(page);
  await showMobilePurchase(page);
  const originalSearchBottom = (await rect(searchTrigger(page))).bottom;
  const originalPurchaseHeight = (await rect(mobilePurchase(page))).height;
  const originalNameFont = await mobilePurchase(page).locator(".mobile-purchase-bar__name").evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));

  // Test-only text stress: double actual rendered font sizes and replace only
  // the displayed name. Canonical identity, pricing, action labels, and cart
  // inputs are untouched. This is text enlargement, not a browser-zoom claim.
  await mobilePurchase(page).evaluate((element) => {
    const textElements = [element, ...element.querySelectorAll("p, a, button, strong")];
    const sizes = textElements.map((entry) => ({ entry, size: Number.parseFloat(getComputedStyle(entry).fontSize) }));
    for (const { entry, size } of sizes) {
      const textElement = entry as HTMLElement;
      textElement.style.fontSize = `${size * 2}px`;
      textElement.style.lineHeight = "1.4";
    }
    element.querySelector(".mobile-purchase-bar__name")!.textContent = "Tirzepatide — synthetic wrapping test label with extended text";
  });
  await expect.poll(async () => (await rect(mobilePurchase(page))).height).toBeGreaterThan(originalPurchaseHeight);
  await expect(mobilePurchase(page)).toBeVisible();
  const name = mobilePurchase(page).locator(".mobile-purchase-bar__name");
  expect(await name.evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize))).toBeCloseTo(originalNameFont * 2, 1);
  expect(await name.evaluate((element) => element.getBoundingClientRect().height / Number.parseFloat(getComputedStyle(element).lineHeight))).toBeGreaterThan(1.5);
  await expect(mobilePurchase(page)).toContainText("30mg");
  await expect(mobilePurchase(page)).toContainText("$83.98");
  await expectDockGeometry(page, originalSearchBottom);
  const occupiedHeight = (await rect(mobilePurchase(page))).height + 8 + 44 + (1200 - originalSearchBottom);
  await expect.poll(() => page.locator(".public-layout > footer").evaluate((element) => Number.parseFloat(getComputedStyle(element).paddingBottom))).toBeGreaterThanOrEqual(occupiedHeight);

  const add = mobilePurchase(page).getByRole("button", { name: addLabel });
  await add.focus();
  await expect(add).toBeFocused();
  // Increase text again, without a viewport resize, so ResizeObserver must
  // react to the now-impossible row and safely release the focused control.
  await mobilePurchase(page).evaluate((element) => {
    const textElements = [element, ...element.querySelectorAll("p, a, button, strong")];
    const sizes = textElements.map((entry) => ({ entry, size: Number.parseFloat(getComputedStyle(entry).fontSize) }));
    for (const { entry, size } of sizes) (entry as HTMLElement).style.fontSize = `${size * 2}px`;
  });
  await expect(page.getByRole("heading", { name: "Purchase", exact: true })).toBeFocused();
  await expectPurchaseHeadingBelowHeader(page);
  await expect(mobilePurchase(page)).toBeHidden();
  const measuredPurchase = page.getByRole("region", { name: "Mobile purchase controls", includeHidden: true });
  expect((await rect(measuredPurchase)).height + 84).toBeGreaterThan(600);
  await expect(searchTrigger(page)).toBeVisible();
  expect((await rect(searchTrigger(page))).bottom).toBeCloseTo(originalSearchBottom, 0);
  await expect(page.getByRole("spinbutton", { name: "Exact quantity" })).toHaveValue("2");
  await expect(purchaseSummary(page)).toContainText("$83.98");
});

test("search retains focus trapping and restoration while mobile purchase is active", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 520 });
  await openProduct(page);
  await chooseTwoBottles(page);
  const originalSearchBottom = (await rect(searchTrigger(page))).bottom;
  await showMobilePurchase(page);
  await expectDockGeometry(page, originalSearchBottom);
  const purchaseButtonBounds = await rect(mobilePurchase(page).getByRole("button", { name: addLabel }));
  await waitForPurchaseLayout(page);
  const closedAccessibility = await new AxeBuilder({ page }).analyze();
  expect(closedAccessibility.violations).toEqual([]);

  await searchTrigger(page).click();
  const dialog = page.getByRole("dialog", { name: "Search PropeptIQ" });
  const searchbox = dialog.getByRole("searchbox", { name: "Search products and information" });
  await expect(searchbox).toBeFocused();
  await expect(dialog.getByRole("status")).toHaveText("Type to search products and information.");
  await searchbox.fill("Tirzepatide");
  await expect(dialog.locator('a[href="/catalog/items/tirzepatide"]')).toBeVisible();
  for (const key of ["Tab", "Shift+Tab"] as const) {
    for (let step = 0; step < 5; step += 1) {
      await page.keyboard.press(key);
      expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
    }
  }
  expect(await page.evaluate(({ x, y }) => {
    const target = document.elementFromPoint(x, y);
    return Boolean(target?.closest('[role="region"][aria-label="Mobile purchase controls"]'));
  }, {
    x: (purchaseButtonBounds.left + purchaseButtonBounds.right) / 2,
    y: (purchaseButtonBounds.top + purchaseButtonBounds.bottom) / 2,
  })).toBe(false);
  await waitForPurchaseLayout(page);
  const openAccessibility = await new AxeBuilder({ page }).analyze();
  expect(openAccessibility.violations).toEqual([]);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(searchTrigger(page)).toBeFocused();
  await expect(mobilePurchase(page)).toBeVisible();
  await expect(mobilePurchase(page)).toContainText("30mg");
  await expect(mobilePurchase(page)).toContainText("2 bottles");
  await expect(mobilePurchase(page)).toContainText("$83.98");
  await expectDockGeometry(page, originalSearchBottom);
});

test("mobile widths keep purchase above centered search and the desktop breakpoint removes it", async ({ page }) => {
  for (const viewport of [
    { width: 320, height: 812 },
    { width: 375, height: 812 },
    { width: 390, height: 520 },
    { width: 767, height: 812 },
  ]) {
    await page.setViewportSize(viewport);
    await openProduct(page);
    const originalSearchBottom = (await rect(searchTrigger(page))).bottom;
    await chooseTwoBottles(page);
    await showMobilePurchase(page);
    await expectDockGeometry(page, originalSearchBottom);
  }
  // Resize an already active dock across the exact mobile boundary.
  await page.setViewportSize({ width: 768, height: 812 });
  await expect(mobilePurchase(page)).toBeHidden();
  await expect(searchTrigger(page)).toBeVisible();
  await page.setViewportSize({ width: 767, height: 812 });
  await showMobilePurchase(page);
  for (const viewport of [{ width: 768, height: 812 }, { width: 1440, height: 900 }]) {
    await page.setViewportSize(viewport);
    await openProduct(page);
    await positionSummaryBottom(page, -12);
    await expect(mobilePurchase(page)).toBeHidden();
    await expect(searchTrigger(page)).toBeVisible();
  }
});

test("insufficient usable width or height keeps search available and restores purchase when space returns", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await openProduct(page);
  await chooseTwoBottles(page);
  await showMobilePurchase(page);
  for (const viewport of [{ width: 195, height: 520 }, { width: 390, height: 240 }]) {
    await page.setViewportSize(viewport);
    await positionSummaryBottom(page, -12);
    await expect(mobilePurchase(page)).toBeHidden();
    await expect(searchTrigger(page)).toBeVisible();
    const searchBounds = await rect(searchTrigger(page));
    expect(searchBounds.left).toBeGreaterThanOrEqual(0);
    expect(searchBounds.right).toBeLessThanOrEqual(viewport.width);
    expect(searchBounds.bottom).toBeLessThanOrEqual(viewport.height);
    expect((searchBounds.left + searchBounds.right) / 2).toBeCloseTo(viewport.width / 2, 0);
  }
  await page.setViewportSize({ width: 375, height: 812 });
  await showMobilePurchase(page);
  await expect(mobilePurchase(page)).toContainText("$83.98");
});

test("missing IntersectionObserver keeps the inline purchase and search available", async ({ page }) => {
  // Explicit browser-capability test double: all catalog and cart code stays real.
  await page.addInitScript(() => {
    Object.defineProperty(window, "IntersectionObserver", { configurable: true, value: undefined });
  });
  await page.setViewportSize({ width: 375, height: 812 });
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await openProduct(page);
  await chooseTwoBottles(page);
  await purchaseSummary(page).getByRole("button", { name: addLabel }).click();
  await expect(page.getByRole("status", { name: "Cart updates" })).toContainText("2 units in cart");
  await positionSummaryBottom(page, -12);
  await expect(mobilePurchase(page)).toBeHidden();
  await searchTrigger(page).click();
  await expect(page.getByRole("dialog", { name: "Search PropeptIQ" })).toBeVisible();
  expect(pageErrors).toEqual([]);
});

test("without JavaScript the purchase summary remains in the document and the mobile dock stays absent", async ({ browser, baseURL }) => {
  const context = await browser.newContext({
    javaScriptEnabled: false,
    reducedMotion: "reduce",
    viewport: { width: 375, height: 812 },
  });
  const page = await context.newPage();
  try {
    await page.goto(new URL(productPath, baseURL).toString());
    await expect(purchaseSummary(page)).toContainText("30mg · 1 bottle");
    await expect(purchaseSummary(page)).toContainText("$41.99");
    await expect(purchaseSummary(page).getByRole("button", { name: addLabel })).toBeVisible();
    // Page JavaScript is disabled and reduced motion removes CSS movement;
    // synchronous automation evaluation must not wait for page RAF callbacks.
    await purchaseSummary(page).evaluate((element) => {
      window.scrollTo({ top: window.scrollY + element.getBoundingClientRect().bottom + 12, behavior: "instant" });
    });
    await expect.poll(async () => Math.abs((await rect(purchaseSummary(page))).bottom + 12)).toBeLessThanOrEqual(1);
    await expect(mobilePurchase(page)).toBeHidden();
    await expect(searchTrigger(page)).toBeVisible();
  } finally {
    await context.close();
  }
});

test("reduced motion keeps purchase usable without an active dock animation", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 375, height: 812 });
  await openProduct(page);
  await chooseTwoBottles(page);
  const originalSearchBottom = (await rect(searchTrigger(page))).bottom;
  await showMobilePurchase(page);
  expect(await mobilePurchase(page).evaluate((element) => element.getAnimations({ subtree: true }).filter((animation) => animation.playState === "running").length)).toBe(0);
  await expectDockGeometry(page, originalSearchBottom);
  await mobilePurchase(page).getByRole("link", { name: "Change selection" }).click();
  await expect(page.getByRole("heading", { name: "Purchase", exact: true })).toBeFocused();
  await expectPurchaseHeadingBelowHeader(page);
});

test("legacy-cart help wraps inside the purchase row and denied additions leave saved data intact", async ({ page }) => {
  // Synthetic old-format storage only, matching the existing legacy regression seam.
  const legacyCart = JSON.stringify({ version: 1, items: [{ productId: "synthetic-legacy-product", quantity: 2 }] });
  await page.addInitScript(({ key, value }) => window.localStorage.setItem(key, value), { key: legacyCartKey, value: legacyCart });
  await page.setViewportSize({ width: 375, height: 812 });
  await openProduct(page);
  await chooseTwoBottles(page);
  let addedThroughDock = false;
  for (const width of [375, 320]) {
    await page.setViewportSize({ width, height: 812 });
    const originalSearchBottom = (await rect(searchTrigger(page))).bottom;
    await positionSummaryBottom(page, -12);
    const measuredPurchase = page.getByRole("region", { name: "Mobile purchase controls", includeHidden: true });
    await expect(measuredPurchase).toHaveCount(1);
    const occupiedHeight = (await rect(measuredPurchase)).height + 8 + 44 + (812 - originalSearchBottom);
    const headerHeight = (await rect(page.getByRole("banner"))).height;
    const availableHeight = Math.min(406, 812 - headerHeight - 96);
    if (occupiedHeight > availableHeight) {
      await expect(mobilePurchase(page)).toBeHidden();
      await expect(purchaseSummary(page)).toContainText("Your saved cart uses an older format.");
      await expect(purchaseSummary(page).getByRole("link", { name: "Review saved cart" })).toHaveAttribute("href", "/cart");
      await expect(searchTrigger(page)).toBeVisible();
      continue;
    }
    await expect(mobilePurchase(page)).toBeVisible();
    const help = mobilePurchase(page).getByText("Your saved cart uses an older format. Clear the old cart before adding a variant.", { exact: true });
    await expect(help).toBeVisible();
    expect(await help.evaluate((element) => element.getClientRects().length)).toBeGreaterThan(1);
    await expect(mobilePurchase(page).getByRole("link", { name: "Review saved cart" })).toHaveAttribute("href", "/cart");
    await expectDockGeometry(page, originalSearchBottom);
    await mobilePurchase(page).getByRole("button", { name: addLabel }).click();
    addedThroughDock = true;
  }
  expect(addedThroughDock, "At least one normal phone width must fit the legacy help and exercise the denied dock action").toBe(true);
  await expect(page.getByRole("status", { name: "Cart updates" })).toHaveText("Open your cart and clear the old cart before choosing variants again. Your saved items have not been changed.");
  expect(await page.evaluate((key) => window.localStorage.getItem(key), cartKey)).toBeNull();
  expect(await page.evaluate((key) => window.localStorage.getItem(key), legacyCartKey)).toBe(legacyCart);
  await page.setViewportSize({ width: 195, height: 520 });
  await positionSummaryBottom(page, -12);
  await expect(mobilePurchase(page)).toBeHidden();
  await expect(searchTrigger(page)).toBeVisible();
});
