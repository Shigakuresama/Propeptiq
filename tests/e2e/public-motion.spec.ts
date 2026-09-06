import { expect, test, type Locator, type Page } from "@playwright/test";

const standardEasing = "cubic-bezier(0.4, 0, 0.2, 1)";

type MotionStyles = Readonly<{
  animationDuration: string;
  animationTimingFunction: string;
  transitionDuration: string;
  transitionProperty: string;
  transitionTimingFunction: string;
}>;

type ReducedMotionStyles = Readonly<{
  animationDuration: string;
  rotate: string;
  scale: string;
  transform: string;
  transitionDuration: string;
  translate: string;
}>;

async function motionStyles(locator: Locator): Promise<MotionStyles> {
  return locator.evaluate((element) => {
    const styles = getComputedStyle(element);
    return {
      animationDuration: styles.animationDuration,
      animationTimingFunction: styles.animationTimingFunction,
      transitionDuration: styles.transitionDuration,
      transitionProperty: styles.transitionProperty,
      transitionTimingFunction: styles.transitionTimingFunction,
    };
  });
}

async function reducedMotionStyles(locator: Locator): Promise<ReducedMotionStyles> {
  return locator.evaluate((element) => {
    const styles = getComputedStyle(element);
    return {
      animationDuration: styles.animationDuration,
      rotate: styles.rotate,
      scale: styles.scale,
      transform: styles.transform,
      transitionDuration: styles.transitionDuration,
      translate: styles.translate,
    };
  });
}

async function expectTargetAtLeast44(locator: Locator, label: string) {
  await expect(locator, `${label} must be visible`).toBeVisible();
  const box = await locator.boundingBox();
  expect(box, `${label} must have a rendered hit target`).not.toBeNull();
  expect(box!.width, `${label} width`).toBeGreaterThanOrEqual(44);
  expect(box!.height, `${label} height`).toBeGreaterThanOrEqual(44);
}

async function expectDocumentContainment(page: Page, dialog: Locator, label: string) {
  await expect.poll(
    () => dialog.evaluate((element) => getComputedStyle(element).transform),
    { message: `${label} must settle before its bounds are measured` },
  ).toBe("none");
  const viewport = page.viewportSize();
  const box = await dialog.boundingBox();
  expect(viewport, `${label} viewport`).not.toBeNull();
  expect(box, `${label} sheet bounds`).not.toBeNull();
  expect(box!.x, `${label} left edge`).toBeGreaterThanOrEqual(-1);
  expect(box!.y, `${label} top edge`).toBeGreaterThanOrEqual(-1);
  expect(box!.x + box!.width, `${label} right edge`).toBeLessThanOrEqual(viewport!.width + 1);
  expect(box!.y + box!.height, `${label} bottom edge`).toBeLessThanOrEqual(viewport!.height + 1);
  expect(await page.evaluate(() => (
    document.documentElement.scrollWidth - document.documentElement.clientWidth
  )), `${label} document overflow`).toBeLessThanOrEqual(1);
}

async function expectPublicSheetMotion(page: Page, dialog: Locator) {
  const overlay = page.locator('[data-slot="sheet-overlay"][data-motion-scope="public"]');
  await expect(dialog).toHaveAttribute("data-motion-scope", "public");
  await expect(overlay).toHaveCount(1);
  for (const surface of [dialog, overlay]) {
    await expect.poll(() => motionStyles(surface)).toEqual({
      animationDuration: "0.3s",
      animationTimingFunction: standardEasing,
      transitionDuration: "0.3s",
      transitionProperty: "transform, opacity",
      transitionTimingFunction: standardEasing,
    });
  }
  const close = dialog.getByRole("button", { name: "Close" });
  await expect.poll(async () => {
    const styles = await motionStyles(close);
    return {
      duration: styles.transitionDuration,
      easing: styles.transitionTimingFunction,
      property: styles.transitionProperty,
    };
  }).toEqual({
    duration: "0.2s",
    easing: standardEasing,
    property: "transform, opacity",
  });
  const closeBox = await close.boundingBox();
  expect(closeBox?.width).toBeGreaterThanOrEqual(44);
  expect(closeBox?.height).toBeGreaterThanOrEqual(44);
}

async function closeWithEscape(page: Page, dialog: Locator, trigger: Locator) {
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
}

test.describe.configure({ mode: "serial" });

test("all four public sheets opt into the shared drawer motion and restore focus", async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 900 });
  await page.goto("/catalog");

  const navigationTrigger = page.getByRole("button", { name: "Open navigation" });
  await navigationTrigger.click();
  const navigation = page.getByRole("dialog", { name: "PROPEPTIQ LABS" });
  await expectPublicSheetMotion(page, navigation);
  await closeWithEscape(page, navigation, navigationTrigger);

  const searchTrigger = page.getByRole("button", { name: "Search PropeptIQ" });
  await searchTrigger.click();
  const search = page.getByRole("dialog", { name: "Search PropeptIQ" });
  await expectPublicSheetMotion(page, search);
  await expect(search.getByRole("searchbox", { name: "Search products and information" }))
    .toBeFocused();
  await closeWithEscape(page, search, searchTrigger);

  const cartTrigger = page.getByRole("link", { name: /Cart, 0 items/iu });
  await cartTrigger.click();
  const cart = page.getByRole("dialog", { name: "Your cart" });
  await expectPublicSheetMotion(page, cart);
  await expect(cart.getByRole("heading", { name: "Your cart is empty." })).toBeVisible();
  await closeWithEscape(page, cart, cartTrigger);

  const quickAddTrigger = page.getByRole("button", { name: /choose a variant/iu }).first();
  await quickAddTrigger.click();
  const quickAdd = page.getByRole("dialog", { name: /Choose a variant for/iu });
  await expectPublicSheetMotion(page, quickAdd);
  const enabledVariants = quickAdd.getByRole("radio").and(page.locator(":not(:disabled)"));
  expect(await enabledVariants.count()).toBeGreaterThan(1);
  await enabledVariants.nth(1).check();
  expect(await page.evaluate(() => {
    const value = localStorage.getItem("propeptiq.cart.v2");
    return value === null ? [] : (JSON.parse(value) as { items: unknown[] }).items;
  })).toEqual([]);
  await closeWithEscape(page, quickAdd, quickAddTrigger);
});

test("public controls and interactive catalog records use restrained transform-only motion", async ({ page }) => {
  await page.goto("/catalog");
  const representatives = [
    page.getByRole("button", { name: /choose a variant/iu }).first(),
    page.getByRole("link", { name: /View catalog item:/iu }).first(),
    page.getByRole("searchbox", { name: "Search catalog" }),
    page.getByRole("combobox", { name: "Sort catalog" }),
    page.locator(".catalog-listing-card").first(),
  ];
  for (const representative of representatives) {
    await expect.poll(async () => {
      const styles = await motionStyles(representative);
      return {
        duration: styles.transitionDuration,
        easing: styles.transitionTimingFunction,
        property: styles.transitionProperty,
      };
    }).toEqual({
      duration: "0.2s",
      easing: standardEasing,
      property: "transform, opacity",
    });
  }

  const card = page.locator(".catalog-listing-card").first();
  const image = card.locator(".catalog-product-visual__base");
  const before = await card.boundingBox();
  await card.hover();
  await expect.poll(() => card.evaluate((element) => getComputedStyle(element).transform))
    .toBe("matrix(1, 0, 0, 1, 0, -4)");
  await expect.poll(() => image.evaluate((element) => getComputedStyle(element).transform))
    .toBe("matrix(1.03, 0, 0, 1.03, 0, 0)");
  const after = await card.boundingBox();
  expect(after?.width).toBe(before?.width);
  expect(after?.height).toBe(before?.height);

  const action = page.getByRole("button", { name: /choose a variant/iu }).first();
  await action.hover();
  await expect.poll(() => action.evaluate((element) => getComputedStyle(element).transform))
    .toBe("matrix(1, 0, 0, 1, 0, -4)");

  const launcher = page.getByRole("button", { name: "Search PropeptIQ" });
  const lane = page.locator(".site-search-launcher-lane");
  const laneCenter = await lane.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return rect.left + rect.width / 2;
  });
  await launcher.hover();
  await expect(launcher).toHaveCSS("transform", "none");
  expect(Math.abs(laneCenter - (await page.evaluate(() => innerWidth / 2)))).toBeLessThanOrEqual(1);

  const disabledAction = page.getByRole("button", { name: "Subscribe" });
  await expect(disabledAction).toBeDisabled();
  await disabledAction.scrollIntoViewIfNeeded();
  const disabledBox = await disabledAction.boundingBox();
  expect(disabledBox).not.toBeNull();
  await page.mouse.move(
    disabledBox!.x + disabledBox!.width / 2,
    disabledBox!.y + disabledBox!.height / 2,
  );
  await expect(disabledAction).toBeDisabled();
  await expect(disabledAction).toHaveCSS("transform", "none");
});

test("an unmarked private account sheet retains the generic 200ms behavior", async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 900 });
  await page.goto("/sign-in");
  await page.getByRole("radio", { name: "Fixed capable administrator" }).check();
  await page.getByRole("button", { name: "Continue to checkout" }).click();
  await expect(page).toHaveURL(/\/checkout$/u);
  await page.goto("/account");
  await page.getByRole("button", { name: "Open account navigation" }).click();
  const accountSheet = page.getByRole("dialog", { name: "Account navigation" });
  const overlay = page.locator('[data-slot="sheet-overlay"]');
  await expect(accountSheet).not.toHaveAttribute("data-motion-scope");
  await expect(overlay).not.toHaveAttribute("data-motion-scope");
  await expect(accountSheet).toHaveCSS("transition-duration", "0.2s");
  await expect(overlay).toHaveCSS("animation-duration", "0.2s");
});

test("public science uses a finite opacity fade while auth keeps stroke drawing", async ({ page }) => {
  await page.goto("/quality-records");
  const signal = page.locator(".science-field__signal");
  const publicMotion = await signal.evaluate((element) => {
    const styles = getComputedStyle(element);
    const effect = element.getAnimations()[0]?.effect;
    const keyframes = effect instanceof KeyframeEffect
      ? effect.getKeyframes()
      : [];
    return {
      animationName: styles.animationName,
      duration: styles.animationDuration,
      easing: styles.animationTimingFunction,
      iterationCount: styles.animationIterationCount,
      keyframes,
    };
  });
  expect(publicMotion).toMatchObject({
    animationName: "site-surface-fade",
    duration: "0.24s",
    easing: standardEasing,
    iterationCount: "1",
  });
  expect(publicMotion.keyframes.some((frame) => "opacity" in frame)).toBe(true);
  expect(publicMotion.keyframes.some((frame) => "strokeDashoffset" in frame)).toBe(false);

  const publicNodes = await page.locator(
    ".science-field__node, .science-field__core, .science-field__core-dot",
  ).evaluateAll((elements) => elements.map((element) => {
    const styles = getComputedStyle(element);
    return [styles.animationDuration, styles.animationTimingFunction];
  }));
  expect(publicNodes.length).toBeGreaterThan(0);
  expect(publicNodes.every(([duration, easing]) => (
    duration === "0.24s" && easing === standardEasing
  ))).toBe(true);

  await page.goto("/sign-in");
  await expect(page.locator(".auth-science-field .science-field__signal"))
    .toHaveCSS("animation-name", "science-trace-draw");
});

test("reduced motion neutralizes decorative individual transforms without shifting search", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");

  const brand = page.getByRole("banner").locator(".brand-logo");
  await brand.hover();
  const faqSummary = page.locator("#faq summary").first();
  await faqSummary.click();
  const faqIndicator = faqSummary.locator('[aria-hidden="true"]');
  const card = page.locator(".catalog-listing-card").first();
  const image = card.locator(".catalog-product-visual__base");
  await card.hover();
  for (const [label, decorative] of [
    ["header brand", brand],
    ["FAQ indicator", faqIndicator],
    ["catalog card", card],
    ["catalog image", image],
  ] as const) {
    await expect.poll(() => decorative.evaluate((element) => {
      const styles = getComputedStyle(element);
      return {
        animationDuration: styles.animationDuration,
        rotateIsNeutral: styles.rotate === "none" || styles.rotate === "0deg",
        scale: styles.scale,
        transformIsNeutral: styles.transform === "none" ||
          styles.transform === "matrix(1, 0, 0, 1, 0, 0)",
        transitionDuration: styles.transitionDuration,
        translate: styles.translate,
      };
    }), { message: label }).toEqual({
      animationDuration: "0s",
      rotateIsNeutral: true,
      scale: "none",
      transformIsNeutral: true,
      transitionDuration: "0s",
      translate: "none",
    });
  }

  const trigger = page.getByRole("button", { name: "Search PropeptIQ" });
  const lane = page.locator(".site-search-launcher-lane");
  expect(await lane.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return Math.abs(rect.left + rect.width / 2 - innerWidth / 2);
  })).toBeLessThanOrEqual(1);
  await trigger.click();
  const search = page.getByRole("dialog", { name: "Search PropeptIQ" });
  const overlay = page.locator('[data-slot="sheet-overlay"][data-motion-scope="public"]');
  await expect.poll(() => reducedMotionStyles(search), {
    message: "reduced public Sheet content motion",
  }).toEqual({
    animationDuration: "0s",
    rotate: "none",
    scale: "none",
    transform: "none",
    transitionDuration: "0s",
    translate: "none",
  });
  await expect.poll(() => reducedMotionStyles(overlay), {
    message: "reduced public Sheet overlay motion",
  }).toEqual({
    animationDuration: "0s",
    rotate: "none",
    scale: "none",
    transform: "none",
    transitionDuration: "0s",
    translate: "none",
  });
  await expect(search.getByRole("searchbox", { name: "Search products and information" }))
    .toBeFocused();
  await expectTargetAtLeast44(search.getByRole("button", { name: "Close" }), "search close");
  expect(await search.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return Math.abs(rect.left + rect.width / 2 - innerWidth / 2);
  })).toBeLessThanOrEqual(1);
});

test("all public sheets remain contained with reachable controls at target widths", async ({ page }) => {
  for (const width of [375, 768, 1440]) {
    const height = width === 375 ? 812 : 900;
    await page.setViewportSize({ width: width === 1440 ? 768 : width, height });
    await page.goto("/catalog");

    const navigationTrigger = page.getByRole("button", { name: "Open navigation" });
    await navigationTrigger.click();
    const navigation = page.getByRole("dialog", { name: "PROPEPTIQ LABS" });
    if (width === 1440) {
      await page.setViewportSize({ width, height });
    }
    await expect(navigation).toBeVisible();
    await expectDocumentContainment(page, navigation, `${width}px navigation`);
    await expectTargetAtLeast44(
      navigation.getByRole("button", { name: "Close" }),
      `${width}px navigation close`,
    );
    await expectTargetAtLeast44(
      navigation.getByRole("navigation", { name: "Mobile primary" }).getByRole("link").first(),
      `${width}px navigation link`,
    );
    if (width === 1440) {
      await navigation.getByRole("button", { name: "Close" }).click();
      await expect(navigation).toBeHidden();
    } else {
      await closeWithEscape(page, navigation, navigationTrigger);
    }

    const searchTrigger = page.getByRole("button", { name: "Search PropeptIQ" });
    await searchTrigger.click();
    const search = page.getByRole("dialog", { name: "Search PropeptIQ" });
    await expectDocumentContainment(page, search, `${width}px search`);
    await expectTargetAtLeast44(
      search.getByRole("button", { name: "Close" }),
      `${width}px search close`,
    );
    await expectTargetAtLeast44(
      search.getByRole("searchbox", { name: "Search products and information" }),
      `${width}px search input`,
    );
    await closeWithEscape(page, search, searchTrigger);

    const cartTrigger = page.getByRole("link", { name: /Cart, 0 items/iu });
    await cartTrigger.click();
    const cart = page.getByRole("dialog", { name: "Your cart" });
    await expect(cart.getByRole("heading", { name: "Your cart is empty." })).toBeVisible();
    await expectDocumentContainment(page, cart, `${width}px cart`);
    await expectTargetAtLeast44(
      cart.getByRole("button", { name: "Close" }),
      `${width}px cart close`,
    );
    await expectTargetAtLeast44(
      cart.getByRole("link", { name: "View cart" }),
      `${width}px cart link`,
    );
    await closeWithEscape(page, cart, cartTrigger);

    const quickAddTrigger = page.getByRole("button", { name: /choose a variant/iu }).first();
    await quickAddTrigger.click();
    const quickAdd = page.getByRole("dialog", { name: /Choose a variant for/iu });
    await expectDocumentContainment(page, quickAdd, `${width}px quick-add`);
    await expectTargetAtLeast44(
      quickAdd.getByRole("button", { name: "Close" }),
      `${width}px quick-add close`,
    );
    const enabledVariants = quickAdd.getByRole("radio").and(page.locator(":not(:disabled)"));
    expect(await enabledVariants.count()).toBeGreaterThan(1);
    const selectedVariant = enabledVariants.nth(1);
    await selectedVariant.check();
    await expectTargetAtLeast44(
      selectedVariant.locator("xpath=ancestor::label[1]"),
      `${width}px quick-add associated radio label`,
    );
    await closeWithEscape(page, quickAdd, quickAddTrigger);
  }
});
