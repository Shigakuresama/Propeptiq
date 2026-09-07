import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const sizes = [
  { width: 375, height: 812 },
  { width: 768, height: 1024 },
  { width: 1280, height: 800 },
  { width: 1366, height: 768 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
];

for (const viewport of sizes) {
  test("redesign geometry and accessibility " + viewport.width, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: "reduce" });
    for (const [name, path, title] of [
      ["home", "/", "Research materials, documented with clarity."],
      ["product", "/catalog/items/retatrutide", "Retatrutide"],
      ["rewards", "/rewards", "Rewards"],
      ["contact", "/contact", "Contact us"],
    ]) {
      await page.goto(path!);
      await expect(page.getByRole("heading", { name: title!, exact: true, level: 1 })).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      const headerSearch = page.getByRole("banner").getByRole("button", { name: "Search PropeptIQ", exact: true });
      await expect(headerSearch).toBeVisible();
      await expect(page.getByRole("button", { name: "Search PropeptIQ", exact: true })).toHaveCount(1);
      expect(await headerSearch.evaluate(element => {
        const search = element.getBoundingClientRect();
        const header = element.closest("header")!.getBoundingClientRect();
        return search.left >= header.left && search.right <= header.right && search.top >= header.top && search.bottom <= header.bottom;
      })).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
      expect(await page.locator("main h1, main h2, main h3").evaluateAll(elements =>
        elements.every(e => getComputedStyle(e).textTransform === "uppercase" && e.scrollWidth <= e.clientWidth + 1))).toBe(true);
      await page.screenshot({ path: testInfo.outputPath(name + "-" + viewport.width + ".png"), fullPage: true });
      if (viewport.width === 1440) await page.screenshot({ path: testInfo.outputPath("viewport-" + name + ".png"), fullPage: false });
      const results = await new AxeBuilder({ page }).analyze();
      expect(results.violations).toEqual([]);
    }
  });
}

test("card amounts and product quantity keep exact cart selections", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const card = page.getByRole("article", { name: "Retatrutide", exact: true });
  await card.getByRole("combobox").selectOption({ label: "20mg" });
  await expect(card).toContainText("$94.49");
  const selectedId = await card.getByRole("combobox").inputValue();
  await card.getByRole("combobox").focus();
  await page.keyboard.press("Tab");
  await expect(card.getByRole("button", { name: "Add Retatrutide to cart" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("status", { name: "Cart updates" })).toContainText("Retatrutide, 20mg: 1 unit");
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("propeptiq.cart.v2") ?? "{}"))).toEqual({
    version: 2, items: [{ variantId: selectedId, quantity: 1 }],
  });
  await card.getByRole("link", { name: "View catalog item: Retatrutide", exact: true }).click();
  await page.getByRole("radio", { name: "20mg", exact: true }).focus();
  await page.keyboard.press("Space");
  const quantity = page.getByRole("spinbutton", { name: "Quantity", exact: true });
  const summary = page.getByRole("status", { name: "Purchase summary" });
  // $134.99 -> $94.49 WINTER30; rounded bundle units are $91.66 / $88.82 / $66.14.
  await quantity.fill("3");
  await expect(summary.locator("strong")).toHaveText("$274.98");
  for (const bundle of [
    { quantity: 2, extra: 3, total: "$183.32" },
    { quantity: 4, extra: 6, total: "$355.28" },
    { quantity: 11, extra: 30, total: "$727.54" },
  ]) {
    const preset = page.getByRole("button", { name: `${bundle.quantity} bottles, ${bundle.extra}% extra bundle discount, ${bundle.total} total`, exact: true });
    await preset.click();
    await expect(preset).toHaveAttribute("aria-pressed", "true");
    await expect(quantity).toHaveValue(String(bundle.quantity));
    await expect(summary.locator("strong")).toHaveText(bundle.total);
  }
  await page.getByRole("button", { name: "2 bottles, 3% extra bundle discount, $183.32 total", exact: true }).click();
  const increase = page.getByRole("button", { name: "Increase quantity", exact: true });
  await increase.focus();
  await expect(increase).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(quantity).toHaveValue("3");
  await expect(summary.locator("strong")).toHaveText("$274.98");
  await page.getByRole("button", { name: "Add Retatrutide to cart", exact: true }).click();
  await expect(page.getByRole("status", { name: "Cart updates" })).toContainText("Retatrutide, 20mg: 4 units");
  const cart = await page.evaluate(() => JSON.parse(localStorage.getItem("propeptiq.cart.v2") ?? "{}"));
  expect(cart).toEqual({ version: 2, items: [{ variantId: selectedId, quantity: 4 }] });
});

test("carousel arrows, native dropdown and keyboard scrolling work", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/catalog/items/retatrutide");
  const related = page.getByRole("region", { name: "Related Products", exact: true });
  const list = related.getByRole("list", { name: /Related products,/ });
  const previous = related.getByRole("button", { name: "Previous related products" });
  const next = related.getByRole("button", { name: "Next related products" });
  await expect(previous).toBeDisabled();
  await expect(next).toBeEnabled();
  await expect(list).toHaveCSS("scrollbar-width", "none");
  await next.click();
  await expect(previous).toBeEnabled();
  await expect(next).toBeDisabled();
  await previous.click();
  await expect(previous).toBeDisabled();
  await list.focus();
  await page.keyboard.press("ArrowRight");
  await expect(previous).toBeEnabled();
  const amount = related.getByRole("combobox").last();
  await amount.focus();
  await expect(related.locator(".related-carousel__edge").first()).toHaveCSS("opacity", "0");
});

test("animations move, stop within five seconds and respect reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");
  const field = page.locator(".header-brand-motion__field");
  await expect(field).not.toHaveCSS("animation-name", "none");
  const first = await field.evaluate(e => getComputedStyle(e).transform);
  await page.waitForTimeout(300);
  const second = await field.evaluate(e => getComputedStyle(e).transform);
  expect(second).not.toBe(first);
  expect(await page.locator(".promotion-banner").evaluate(e => getComputedStyle(e, "::before").animationName)).toBe("none");
  await expect(page.locator(".promotion-banner__molecule").first()).toHaveCSS("animation-name", "none");
  await expect.poll(() => field.evaluate(e => e.getAnimations().every(a => a.playState === "finished")), { timeout: 6000 }).toBe(true);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(field).toHaveCSS("animation-name", "none");
  expect(await page.locator(".promotion-banner").evaluate(e => getComputedStyle(e, "::before").animationName)).toBe("none");
});

test("unconfigured contact form reports failure without success", async ({ page }) => {
  await page.goto("/contact");
  await page.getByRole("textbox", { name: "Name", exact: true }).fill("Synthetic contact test");
  await page.getByRole("textbox", { name: "Email", exact: true }).fill("synthetic@example.invalid");
  await page.getByRole("textbox", { name: "Subject", exact: true }).fill("Local unavailable path");
  await page.getByRole("textbox", { name: "Message", exact: true }).fill("This is an isolated local test; no provider is configured.");
  const response = page.waitForResponse(r => r.url().endsWith("/api/contact") && r.request().method() === "POST");
  await page.getByRole("button", { name: "Send message" }).click();
  expect((await response).status()).toBe(503);
  await expect(page.getByRole("alert").filter({ hasText: "We couldn’t accept" })).toBeVisible();
  await expect(page.getByText("Your message was accepted for delivery.", { exact: false })).toHaveCount(0);
});

test("200 percent reflow remains contained", async ({ page }) => {
  await page.setViewportSize({ width: 640, height: 400 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const path of ["/", "/catalog/items/retatrutide", "/rewards", "/contact"]) {
    await page.goto(path);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  }
});

test("touch amount and quantity controls keep their state", async ({ browser, baseURL }) => {
  if (!baseURL) throw new Error("Playwright baseURL is required.");
  const context = await browser.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true, reducedMotion: "reduce" });
  try {
    const page = await context.newPage();
    await page.goto(new URL("/catalog/items/retatrutide", baseURL).toString());
    await page.getByRole("radio", { name: "20mg", exact: true }).locator("..").tap();
    await expect(page.getByRole("radio", { name: "20mg", exact: true })).toBeChecked();
    const quantity = page.getByRole("spinbutton", { name: "Quantity", exact: true });
    const summary = page.getByRole("status", { name: "Purchase summary" });
    await page.getByRole("button", { name: "Increase quantity", exact: true }).tap();
    await expect(quantity).toHaveValue("2");
    await expect(summary.locator("strong")).toHaveText("$183.32");
    await page.getByRole("button", { name: "4 bottles, 6% extra bundle discount, $355.28 total", exact: true }).tap();
    await expect(quantity).toHaveValue("4");
    await expect(summary.locator("strong")).toHaveText("$355.28");
    await page.getByRole("button", { name: "Decrease quantity", exact: true }).tap();
    await expect(quantity).toHaveValue("3");
    await expect(summary.locator("strong")).toHaveText("$274.98");
  } finally {
    await context.close();
  }
});
