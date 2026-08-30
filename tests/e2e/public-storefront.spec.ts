import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";

const publicRoutes = [
  "/",
  "/catalog",
  "/catalog/items/tirzepatide",
  "/catalog/synthetic-reference-alpha",
  "/cart",
  "/quality-records",
  "/research-use-policy",
] as const;

const screenshotDirectory = path.resolve(
  process.cwd(),
  ".superpowers/sdd/2026-08-24-propeptiq-lightweight-commerce/screenshots",
);

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

test("every public route renders the shared restriction and passes axe", async ({ page }) => {
  for (const route of publicRoutes) {
    await page.goto(route);
    await expect(page.locator("main#main-content")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(
      page.getByText("For legitimate laboratory and research use only.").first(),
    ).toBeVisible();
    const accessibility = await new AxeBuilder({ page }).analyze();
    expect(accessibility.violations, `${route} axe violations`).toEqual([]);
  }
});

test("synthetic commerce pages still identify every displayed record as fictional demo data", async ({
  page,
}) => {
  await page.goto("/catalog/synthetic-reference-alpha");

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

test("anonymous catalog to cart flow survives reload and preserves only IDs and quantities", async ({
  page,
}) => {
  await page.goto("/catalog/synthetic-reference-alpha");
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Synthetic Reference Alpha — Demo Only",
    }),
  ).toBeVisible();

  await page
    .getByRole("button", {
      name: "Add Synthetic Reference Alpha — Demo Only to cart",
    })
    .click();
  await expect(page.getByRole("link", { name: /Cart, 1 requested unit/ })).toBeVisible();
  await page.getByRole("link", { name: /Cart, 1 requested unit/ }).click();

  await expect(page.getByText("Synthetic Reference Alpha — Demo Only").first()).toBeVisible();
  await expect(page.getByText("$24.00", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue to sign in" })).toBeEnabled();

  const persisted = await page.evaluate(() =>
    JSON.parse(window.localStorage.getItem("propeptiq.cart.v1") ?? "null"),
  );
  expect(persisted).toEqual({
    version: 1,
    items: [{ productId: "61000000-0000-4000-8000-000000000001", quantity: 1 }],
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
      JSON.parse(window.localStorage.getItem("propeptiq.cart.v1") ?? "null"),
    ),
  ).toEqual({
    version: 1,
    items: [{ productId: "61000000-0000-4000-8000-000000000001", quantity: 1 }],
  });

  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);
});

test("cart quantity controls are keyboard operable", async ({ page }) => {
  await page.goto("/catalog/synthetic-reference-alpha");
  await page
    .getByRole("button", {
      name: "Add Synthetic Reference Alpha — Demo Only to cart",
    })
    .click();
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
  const trigger = page.locator('[data-slot="sheet-trigger"]');
  await expect(trigger).toHaveAccessibleName("Open navigation");
  await trigger.focus();
  await page.keyboard.press("Enter");
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
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
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
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

  const layout = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(
    layout.scrollWidth - layout.clientWidth,
    `homepage 200% zoom overflow: scrollWidth=${layout.scrollWidth}, clientWidth=${layout.clientWidth}`,
  ).toBeLessThanOrEqual(1);
});

test("reduced motion disables transition and animation durations", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/catalog");
  const card = page.locator("article.catalog-listing-card").first();
  await card.hover();
  const motion = await page
    .getByRole("link", { name: "Open catalog dossier: Tirzepatide" })
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

test("owner-supplied catalog is complete, price-free, and serves every illustration", async ({
  page,
  request,
}) => {
  await page.goto("/catalog");
  await expect(page.locator("article.catalog-listing-card")).toHaveCount(56);
  await expect(page.getByText("103 supplied package configurations")).toBeVisible();
  await expect(page.getByRole("button", { name: /add .* to cart/i })).toHaveCount(0);
  await expect(page.locator("main")).not.toContainText("$");

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

  await page.goto("/catalog/items/pinealon");
  await expect(page.getByRole("heading", { level: 1, name: "Pinealon" })).toBeVisible();
  await expect(page.getByText("Source label: Pinealon10mg")).toBeVisible();
  await expect(page.locator("main")).not.toContainText("$");
  await expect(page.getByRole("button", { name: /add .* to cart/i })).toHaveCount(0);

  const imageLoaded = await page.getByRole("img", {
    name: /illustrative research-catalog still life for Pinealon/i,
  }).evaluate((image) => {
    const element = image as HTMLImageElement;
    return element.complete && element.naturalWidth > 0 && element.naturalHeight > 0;
  });
  expect(imageLoaded).toBe(true);

  const unknown = await page.goto("/catalog/items/not-a-real-item");
  expect(unknown?.status()).toBe(404);
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
