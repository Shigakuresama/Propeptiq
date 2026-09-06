import { expect, test } from "@playwright/test";

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
  await createAccount.focus();
  await expect(createAccount).toBeFocused();
  await expect(createAccount).toBeInViewport();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(`/sign-up?returnTo=${encodeURIComponent(returnTo)}`);

  const signIn = page.getByRole("link", { name: "Sign in" });
  await signIn.focus();
  await expect(signIn).toBeFocused();
  await expect(signIn).toBeInViewport();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(`/sign-in?returnTo=${encodeURIComponent(returnTo)}`);
});
