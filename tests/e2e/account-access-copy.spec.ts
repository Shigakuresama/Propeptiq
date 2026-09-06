import { expect, test, type Locator, type Page } from "@playwright/test";

async function focusByKeyboard(page: Page, target: Locator) {
  for (let index = 0; index < 10; index += 1) {
    await page.keyboard.press("Tab");
    if (await target.evaluate((element) => element === document.activeElement)) return;
  }
  throw new Error("Keyboard traversal did not reach the expected account navigation link.");
}

async function expectVisibleFocusIndicator(target: Locator) {
  const indicator = await target.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      outlineColor: style.outlineColor,
      outlineStyle: style.outlineStyle,
      outlineWidth: style.outlineWidth,
    };
  });
  expect(indicator.outlineStyle).toBe("solid");
  expect(indicator.outlineWidth).toBe("3px");
  expect(indicator.outlineColor).not.toBe("rgba(0, 0, 0, 0)");
}

const sharedBullets = [
  "Sign in to view your account and orders.",
  "Your saved cart stays in this browser.",
  "Review product prices and availability in your cart.",
] as const;

const retiredFrameCopy = [
  "Private account access",
  "Verified account setup",
  "Owner-scoped records remain private.",
  "Checkout facts are verified by the server.",
  "Identity verification",
  "Account enrollment",
] as const;

test("account access shared frame presents plain copy without overflow at approved widths", async ({ page }) => {
  for (const width of [375, 768, 1440]) {
    await page.setViewportSize({ width, height: width === 375 ? 812 : 900 });
    for (const entry of [
      {
        route: "/sign-in?returnTo=%2Faccount%2Forders%2Fsynthetic-order",
        eyebrow: "Your account",
        title: "Welcome back.",
        description: "Sign in to review your account and orders.",
        label: "Account access",
        current: "Sign in",
      },
      {
        route: "/sign-up?returnTo=%2Faccount%2Forders%2Fsynthetic-order",
        eyebrow: "Create an account",
        title: "Your PropeptIQ account.",
        description: "Create an account, then verify your email to continue.",
        label: "Account setup",
        current: "Create account",
      },
    ] as const) {
      await page.goto(entry.route);

      for (const text of [entry.eyebrow, entry.title, entry.description, entry.label, ...sharedBullets]) {
        await expect(page.getByText(text, { exact: true })).toBeVisible();
      }
      await expect(page.getByRole("link", { name: entry.current })).toHaveAttribute("aria-current", "page");
      for (const retired of retiredFrameCopy) {
        await expect(page.getByText(retired, { exact: true })).toHaveCount(0);
      }
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `${entry.route} at ${width}px`).toBeLessThanOrEqual(1);
    }
  }
});

test("account access navigation preserves return destination with visible keyboard focus", async ({ page }) => {
  const returnTo = "/account/orders/synthetic-order";
  await page.goto(`/sign-in?returnTo=${encodeURIComponent(returnTo)}`);
  const createAccount = page.getByRole("link", { name: "Create account" });
  await focusByKeyboard(page, createAccount);
  await expect(createAccount).toBeFocused();
  await expect(createAccount).toBeInViewport();
  await expectVisibleFocusIndicator(createAccount);
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(`/sign-up?returnTo=${encodeURIComponent(returnTo)}`);

  const signIn = page.getByRole("link", { name: "Sign in" });
  await focusByKeyboard(page, signIn);
  await expect(signIn).toBeFocused();
  await expect(signIn).toBeInViewport();
  await expectVisibleFocusIndicator(signIn);
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(`/sign-in?returnTo=${encodeURIComponent(returnTo)}`);
});
