import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";

const productPath = "/catalog/items/tirzepatide";

type Bounds = Readonly<{
  bottom: number;
  height: number;
  left: number;
  right: number;
  top: number;
  width: number;
}>;

function captureBrowserErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  return errors;
}

function headerTargets(page: Page) {
  const header = page.getByRole("banner");
  const row = header.locator(".site-container");
  return {
    cart: header.getByRole("link", { name: /^Cart,/u }),
    header,
    home: header.getByRole("link", { name: "PROPEPTIQ LABS home" }),
    menu: header.getByRole("button", { name: "Open navigation" }),
    row,
    signIn: header.getByRole("link", { name: "Sign in" }),
  };
}

async function bounds(locator: Locator): Promise<Bounds> {
  return locator.evaluate((element) => {
    const rectangle = element.getBoundingClientRect();
    return {
      bottom: rectangle.bottom,
      height: rectangle.height,
      left: rectangle.left,
      right: rectangle.right,
      top: rectangle.top,
      width: rectangle.width,
    };
  });
}

async function readHeaderGeometry(page: Page) {
  const targets = headerTargets(page);
  const [header, row, home, cart, signIn, menu] = await Promise.all([
    bounds(targets.header),
    bounds(targets.row),
    bounds(targets.home),
    bounds(targets.cart),
    bounds(targets.signIn),
    bounds(targets.menu),
  ]);
  const documentGeometry = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    innerWidth: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  return { cart, document: documentGeometry, header, home, menu, row, signIn };
}

function expectInside(container: Bounds, target: Bounds, label: string) {
  expect.soft(target.left, `${label} left`).toBeGreaterThanOrEqual(container.left - 0.5);
  expect.soft(target.right, `${label} right`).toBeLessThanOrEqual(container.right + 0.5);
  expect.soft(target.top, `${label} top`).toBeGreaterThanOrEqual(container.top - 0.5);
  expect.soft(target.bottom, `${label} bottom`).toBeLessThanOrEqual(container.bottom + 0.5);
}

async function expectHeaderContained(page: Page, expectedWidth: number) {
  expect(page.viewportSize()?.width).toBe(expectedWidth);
  await page.evaluate(() => document.fonts.ready);
  const geometry = await readHeaderGeometry(page);
  const clientBounds: Bounds = {
    bottom: await page.evaluate(() => window.innerHeight),
    height: await page.evaluate(() => window.innerHeight),
    left: 0,
    right: geometry.document.clientWidth,
    top: 0,
    width: geometry.document.clientWidth,
  };

  expect(geometry.document.innerWidth).toBe(expectedWidth);
  expect(geometry.document.clientWidth).toBe(expectedWidth);
  expectInside(clientBounds, geometry.row, `${expectedWidth}px header row in client`);
  for (const [label, target] of [
    ["home", geometry.home],
    ["cart", geometry.cart],
    ["sign in", geometry.signIn],
    ["open navigation", geometry.menu],
  ] as const) {
    expectInside(geometry.header, target, `${expectedWidth}px ${label} in header`);
    expectInside(clientBounds, target, `${expectedWidth}px ${label} in client`);
    expect.soft(target.width, `${expectedWidth}px ${label} width`).toBeGreaterThanOrEqual(44);
    expect.soft(target.height, `${expectedWidth}px ${label} height`).toBeGreaterThanOrEqual(44);
  }
  expect(
    geometry.document.scrollWidth - geometry.document.clientWidth,
    `${expectedWidth}px document overflow: ${JSON.stringify(geometry)}`,
  ).toBeLessThanOrEqual(1);
  return geometry;
}

async function expectCompactBrand(page: Page) {
  const home = headerTargets(page).home;
  await expect(home.locator(".brand-logo__mark")).toBeVisible();
  await expect(home.locator(".brand-logo__wordmark")).toBeHidden();
}

test("305px available-width equivalent contains all header actions and keyboard focus", async ({ page }) => {
  const errors = captureBrowserErrors(page);
  await page.setViewportSize({ width: 305, height: 1000 });
  const response = await page.goto(productPath);
  expect(response?.status()).toBe(200);

  const publicOverflow = await page.locator(".public-layout").evaluate((element) => {
    const styles = getComputedStyle(element);
    return { overflow: styles.overflow, overflowX: styles.overflowX };
  });
  expect(["hidden", "clip"]).not.toContain(publicOverflow.overflow);
  expect(["hidden", "clip"]).not.toContain(publicOverflow.overflowX);

  const geometry = await expectHeaderContained(page, 305);
  console.info(`Task 18B 305px header geometry: ${JSON.stringify(geometry)}`);
  await expectCompactBrand(page);

  const targets = headerTargets(page);
  const orderedTargets = [targets.home, targets.cart, targets.signIn, targets.menu] as const;
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    window.scrollTo(0, 0);
  });
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to main content" })).toBeFocused();
  for (const [index, target] of orderedTargets.entries()) {
    await page.keyboard.press("Tab");
    await expect(target).toBeFocused();
    const focus = await target.evaluate((element) => {
      const styles = getComputedStyle(element);
      return {
        boxShadow: styles.boxShadow,
        focusVisible: element.matches(":focus-visible"),
        outlineStyle: styles.outlineStyle,
      };
    });
    expect(focus.focusVisible, `header target ${index} must be focus-visible`).toBe(true);
    expect(
      focus.outlineStyle !== "none" || focus.boxShadow !== "none",
      `header target ${index} must render a visible focus indicator: ${JSON.stringify(focus)}`,
    ).toBe(true);
  }

  expect((await new AxeBuilder({ page }).include(".persistent-chrome").analyze()).violations).toEqual([]);
  expect(errors).toEqual([]);
});

test("320px viewport selects the compact alpha-mark header state", async ({ page }) => {
  const errors = captureBrowserErrors(page);
  await page.setViewportSize({ width: 320, height: 1000 });
  const response = await page.goto(productPath);
  expect(response?.status()).toBe(200);
  await expectCompactBrand(page);
  const geometry = await expectHeaderContained(page, 320);
  console.info(`Task 18B 320px header geometry: ${JSON.stringify(geometry)}`);
  expect(errors).toEqual([]);
});

test("375px viewport retains the full wordmark and contained header actions", async ({ page }) => {
  const errors = captureBrowserErrors(page);
  await page.setViewportSize({ width: 375, height: 1000 });
  const response = await page.goto(productPath);
  expect(response?.status()).toBe(200);
  const home = headerTargets(page).home;
  await expect(home.locator(".brand-logo__mark")).toBeVisible();
  await expect(home.locator(".brand-logo__wordmark")).toBeVisible();
  const geometry = await expectHeaderContained(page, 375);
  console.info(`Task 18B 375px header geometry: ${JSON.stringify(geometry)}`);
  expect(errors).toEqual([]);
});

test("compact header keeps native destinations and navigation trigger visible without JavaScript", async ({ browser, baseURL }) => {
  if (baseURL === undefined) throw new Error("Playwright baseURL is required.");
  const context = await browser.newContext({
    baseURL,
    javaScriptEnabled: false,
    reducedMotion: "reduce",
    viewport: { width: 320, height: 1000 },
  });
  const page = await context.newPage();
  const errors = captureBrowserErrors(page);
  try {
    const response = await page.goto(productPath);
    expect(response?.status()).toBe(200);
    const targets = headerTargets(page);
    await expect(targets.home).toHaveAttribute("href", "/");
    await expect(targets.cart).toHaveAttribute("href", "/cart");
    await expect(targets.signIn).toHaveAttribute("href", "/sign-in");
    await expect(targets.menu).toBeVisible();
    await expectCompactBrand(page);
    const geometry = await expectHeaderContained(page, 320);
    console.info(`Task 18B no-JavaScript 320px header geometry: ${JSON.stringify(geometry)}`);
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});

test("reduced motion keeps the compact alpha brand static", async ({ page }) => {
  const errors = captureBrowserErrors(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 320, height: 1000 });
  const response = await page.goto(productPath);
  expect(response?.status()).toBe(200);
  await expectCompactBrand(page);
  const motion = page.locator(".persistent-chrome .header-brand-motion");
  await expect(motion).toHaveAttribute("data-motion-state", "static");
  expect(await motion.locator(".header-brand-motion__field").evaluate((field) => {
    const styles = getComputedStyle(field);
    return { animationName: styles.animationName, transform: styles.transform };
  })).toEqual({ animationName: "none", transform: "none" });
  expect(errors).toEqual([]);
});
