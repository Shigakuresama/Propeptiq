import { expect, test, type Page } from "@playwright/test";

/**
 * Browser contract for the finite, route-aware motion system. These checks use
 * the deterministic local driver configured by playwright.config.ts and do not
 * exercise production identity, catalog, or commerce providers.
 */
test.describe.configure({ mode: "serial" });

async function signInAs(page: Page, actorLabel: string) {
  await page.goto("/sign-in");
  await page.getByRole("radio", { name: actorLabel }).check();
  await page.getByRole("button", { name: "Continue to checkout" }).click();
  await expect(page).toHaveURL(/\/checkout$/);
}

test("public routes expose the shared public motion surface", async ({ page }) => {
  for (const route of [
    "/",
    "/cart",
    "/catalog",
    "/catalog/items/tirzepatide",
    "/partners",
    "/partners/terms",
    "/quality-records",
    "/research-use-policy",
    "/rewards",
    "/rewards/terms",
    "/sets/invalid-code",
  ]) {
    await page.goto(route);
    await expect(page.locator('[data-motion-surface="public"]')).toHaveCount(1);
  }
});

test("auth routes expose the auth motion surface", async ({ page }) => {
  for (const route of ["/sign-in", "/sign-up"]) {
    await page.goto(route);
    await expect(page.locator('[data-motion-surface="auth"]')).toHaveCount(1);
  }
});

test("account and checkout expose the private motion surface", async ({ page }) => {
  await page.goto("/account");
  await expect(page.locator('[data-motion-surface="private"]')).toHaveCount(1);

  await signInAs(page, "Fixed capable administrator");
  await expect(page.locator('[data-motion-surface="private"]')).toHaveCount(1);
});

test("an authorized admin route exposes the admin motion surface", async ({ page }) => {
  await signInAs(page, "Fixed capable administrator");
  await page.goto("/admin");
  await expect(page.locator('[data-motion-surface="admin"]')).toHaveCount(1);
});

test("a denied admin route retains the minimal admin motion surface", async ({ page }) => {
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Administrator sign-in required" })).toBeVisible();
  await expect(page.locator('[data-motion-surface="admin"]')).toHaveCount(1);
});

test("scientific decoration is hidden from assistive technology", async ({ page }) => {
  await page.goto("/");
  const fields = page.locator("[data-science-field]");
  await expect(fields).toHaveCount(1);
  await expect(fields).toHaveAttribute("aria-hidden", "true");
  await expect(fields.locator("svg")).toHaveAttribute("focusable", "false");
});

test("reduced motion removes surface, step, and science signal animation", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");

  const motion = await page.locator(
    '[data-motion-surface], [data-motion-step], [data-science-field] .science-field__signal',
  ).evaluateAll((elements) => elements.map((element) => {
    const styles = getComputedStyle(element);
    return {
      animationName: styles.animationName,
      transform: styles.transform,
    };
  }));

  expect(motion.length).toBeGreaterThan(0);
  expect(motion.every(({ animationName, transform }) => animationName === "none" && transform === "none")).toBe(true);
});

test("finite entrance motion releases transform ownership after completion", async ({ page }) => {
  await page.goto("/catalog");
  await page.waitForTimeout(750);

  const motion = await page.locator(
    '[data-motion-surface="public"], .catalog-grid > li:nth-child(-n + 3)',
  ).evaluateAll((elements) => elements.map((element) => {
    const styles = getComputedStyle(element);
    return {
      animationName: styles.animationName,
      iterationCount: styles.animationIterationCount,
      transform: styles.transform,
    };
  }));

  expect(motion.length).toBeGreaterThan(1);
  expect(motion[0]).toMatchObject({ animationName: "site-surface-enter", iterationCount: "1" });
  expect(motion.slice(1).every(({ animationName, iterationCount }) => (
    animationName === "site-reveal" && iterationCount === "1"
  ))).toBe(true);
  expect(motion.every(({ transform }) => transform === "none")).toBe(true);
});

test("click navigation keeps the public destination content visible", async ({ page }) => {
  await page.goto("/");
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    const state = window as typeof window & {
      __siteMotionSamples?: Array<{
        cardOpacity: number;
        headingOpacity: number;
        nodeOpacity: number;
        path: string;
        signalOffset: number;
        signalPlayState: string;
        surfaceOpacity: number;
      }>;
    };
    state.__siteMotionSamples = [];
    let frame = 0;
    const capture = () => {
      const surface = document.querySelector('[data-motion-surface="public"]');
      const heading = document.querySelector("h1");
      const card = document.querySelector(".catalog-grid > li:first-child");
      const signal = document.querySelector(".science-field__signal");
      const node = document.querySelector(".science-field__node");
      state.__siteMotionSamples!.push({
        cardOpacity: card ? Number.parseFloat(getComputedStyle(card).opacity) : 1,
        headingOpacity: heading ? Number.parseFloat(getComputedStyle(heading).opacity) : 0,
        nodeOpacity: node ? Number.parseFloat(getComputedStyle(node).opacity) : 1,
        path: window.location.pathname,
        signalOffset: signal
          ? Number.parseFloat(getComputedStyle(signal).strokeDashoffset)
          : 0,
        signalPlayState: signal ? getComputedStyle(signal).animationPlayState : "none",
        surfaceOpacity: surface ? Number.parseFloat(getComputedStyle(surface).opacity) : 0,
      });
      frame += 1;
      if (frame < 75) window.requestAnimationFrame(capture);
    };
    window.requestAnimationFrame(capture);
  });

  await page.getByRole("link", { name: "Browse catalog", exact: true }).first().click();
  await expect(page).toHaveURL(/\/catalog$/u);
  await page.waitForTimeout(500);

  const destinationSamples = await page.evaluate(() => {
    const state = window as typeof window & {
      __siteMotionSamples?: Array<{
        cardOpacity: number;
        headingOpacity: number;
        nodeOpacity: number;
        path: string;
        signalOffset: number;
        signalPlayState: string;
        surfaceOpacity: number;
      }>;
    };
    return (state.__siteMotionSamples ?? []).filter(({ path }) => path === "/catalog");
  });
  expect(destinationSamples.length).toBeGreaterThan(0);
  for (const key of ["surfaceOpacity", "headingOpacity", "cardOpacity"] as const) {
    expect(Math.min(...destinationSamples.map((sample) => sample[key]))).toBeGreaterThan(0.98);
  }
  expect(destinationSamples.some(({ signalPlayState }) => signalPlayState === "paused")).toBe(true);
  expect(destinationSamples[0]!.signalOffset).toBeGreaterThan(0.98);
  expect(destinationSamples[0]!.nodeOpacity).toBeLessThan(0.02);
});

test("staggered destination content does not rewind after navigation", async ({ page }) => {
  await page.goto("/catalog");
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    const state = window as typeof window & { __homeStepSamples?: number[] };
    state.__homeStepSamples = [];
    let frame = 0;
    const capture = () => {
      if (window.location.pathname === "/") {
        const finalStep = document.querySelector(
          '[data-motion-sequence="home-hero"] > :nth-child(4)',
        );
        state.__homeStepSamples!.push(
          finalStep ? Number.parseFloat(getComputedStyle(finalStep).opacity) : 0,
        );
      }
      frame += 1;
      if (frame < 90) window.requestAnimationFrame(capture);
    };
    window.requestAnimationFrame(capture);
  });

  await page.getByRole("banner").getByRole("link", { name: "PROPEPTIQ LABS home" }).click();
  await expect(page).toHaveURL(/\/$/u);
  await page.waitForTimeout(700);

  const samples = await page.evaluate(() => (
    (window as typeof window & { __homeStepSamples?: number[] }).__homeStepSamples ?? []
  ));
  expect(samples.length).toBeGreaterThan(0);
  expect(Math.min(...samples)).toBeGreaterThan(0.98);
});

test("representative routes remain free of horizontal overflow at mobile and desktop widths", async ({ page }) => {
  for (const width of [375, 1440]) {
    await page.setViewportSize({ width, height: width === 375 ? 812 : 900 });
    for (const route of ["/", "/catalog", "/account"]) {
      await page.goto(route);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `${route} at ${width}px`).toBeLessThanOrEqual(1);
    }
  }
});
