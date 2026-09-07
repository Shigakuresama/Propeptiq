import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import path from "node:path";
import { mkdir } from "node:fs/promises";

test("annotated product controls, stacked bundles and matched imagery work together", async ({ page }) => {
  await page.setViewportSize({ width: 1045, height: 1272 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/catalog/items/tirzepatide");
  const quantity = page.getByRole("spinbutton", { name: "Quantity", exact: true });
  const summary = page.getByRole("status", { name: "Purchase summary" });
  const add = page.getByRole("button", { name: "Add Tirzepatide to cart" });
  await expect(page.getByText("Product specifications", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Compound information", exact: true })).toBeVisible();
  await expect(page.locator("main")).not.toContainText("Price unavailable");
  await expect(quantity).toHaveValue("1");
  await expect(page.getByRole("button", { name: "Decrease quantity", exact: true })).toBeDisabled();

  for (const [bottles, extra, total] of [[2, 3, "$81.46"], [4, 6, "$157.88"], [11, 30, "$323.29"]] as const) {
    const bundle = page.getByRole("button", { name: `${bottles} bottles, ${extra}% extra bundle discount, ${total} total` });
    await bundle.click();
    await expect(bundle).toHaveAttribute("aria-pressed", "true");
    await expect(quantity).toHaveValue(String(bottles));
    await expect(summary.locator("strong")).toHaveText(total);
    await expect(summary).toContainText(`Bundle −${extra}% extra`);
    await expect(summary).toContainText("WINTER30 −30%");
  }
  await quantity.fill("26");
  await expect(quantity).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByRole("button", { name: /Tirzepatide unavailable/ })).toBeDisabled();
  await quantity.fill("25");
  await expect(page.getByRole("button", { name: "Increase quantity", exact: true })).toBeDisabled();
  await quantity.fill("1");
  await page.getByRole("button", { name: "Increase quantity", exact: true }).click();
  await expect(quantity).toHaveValue("2");
  await page.getByRole("button", { name: "Decrease quantity", exact: true }).click();
  await expect(quantity).toHaveValue("1");

  const image = page.locator(".catalog-detail-image");
  await expect.poll(() => image.locator("img").evaluate((node) => (node as HTMLImageElement).complete && (node as HTMLImageElement).naturalWidth > 0)).toBe(true);
  const left = (await image.boundingBox())!;
  const content = (await page.locator(".catalog-detail-content").boundingBox())!;
  const header = (await page.locator(".product-detail-grid > header").boundingBox())!;
  expect(Math.abs(left.y - header.y)).toBeLessThanOrEqual(2);
  expect(Math.abs(left.y + left.height - content.y - content.height)).toBeLessThanOrEqual(2);
  const bundleBounds = (await page.locator(".bundle-options").boundingBox())!;
  expect(bundleBounds.y + bundleBounds.height).toBeLessThanOrEqual((await add.boundingBox())!.y);
  const images = await page.locator(".bundle-option__bottle, .catalog-detail-image img").evaluateAll((nodes) => nodes.map((node) => {
    const url = new URL((node as HTMLImageElement).src); return url.searchParams.get("url") ?? url.pathname;
  }));
  expect(new Set(images).size).toBe(1);
  expect((await new AxeBuilder({ page }).include(".product-detail-grid").include(".compound-information").analyze()).violations).toEqual([]);
});

test("annotated storefront reflows and preserves usable footer, contact and rewards controls", async ({ page }) => {
  const directory = path.resolve(".codex-evidence/annotations");
  await mkdir(directory, { recursive: true });
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const width of [195, 375, 768, 1045, 1440]) {
    await page.setViewportSize({ width, height: width === 1045 ? 1272 : 900 });
    await page.goto("/catalog/items/tirzepatide");
    await page.evaluate(() => document.fonts.ready);
    await expect.poll(() => page.locator(".catalog-detail-image img").evaluate((node) => (node as HTMLImageElement).complete && (node as HTMLImageElement).naturalWidth > 0)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), `${width}px overflow`).toBeLessThanOrEqual(1);
    const increment = (await page.getByRole("button", { name: "Increase quantity", exact: true }).boundingBox())!;
    expect(increment.width).toBeGreaterThanOrEqual(44);
    expect(increment.height).toBeGreaterThanOrEqual(44);
    await page.screenshot({ path: path.join(directory, `product-${width}.png`), fullPage: true });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.locator("footer").scrollIntoViewIfNeeded();
  const ssl = (await page.getByRole("link", { name: "SSL secured connection to propeptiq.com" }).boundingBox())!;
  const methods = (await page.locator(".footer-payment-methods").boundingBox())!;
  expect(ssl.x).toBeLessThan(methods.x);
  await page.getByText("Stripe-supported methods", { exact: true }).click();
  await expect(page.getByRole("listitem").filter({ hasText: /^SEPA Direct Debit$/ })).toBeVisible();
  await expect(page.getByRole("listitem").filter({ hasText: /^PayPal$/ })).toBeVisible();

  await page.goto("/rewards");
  const actions = page.locator("main .rewards-action");
  expect(await actions.count()).toBeGreaterThan(0);
  for (const action of await actions.all()) await expect(action).toHaveCSS("text-transform", "uppercase");
  await page.goto("/contact");
  await expect(page.getByRole("heading", { name: "Contact us", exact: true })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Email", exact: true })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Message", exact: true })).toBeVisible();
  expect((await new AxeBuilder({ page }).include("main").analyze()).violations).toEqual([]);
});
