import { expect, test, type Page } from "@playwright/test";

const currentKey = "propeptiq.cart.v2";
const legacyKey = "propeptiq.cart.v1";
const tr30VariantId = "5ff78cc3-c541-5bf4-9f3b-12be2222cc75";

// Synthetic old-format browser storage only. Product selection and pricing use
// the real canonical local catalog; the configured browser server disables payment.
async function seedLegacyCart(page: Page, nonempty: boolean) {
  const serialized = JSON.stringify({
    version: 1,
    items: nonempty ? [{ productId: "synthetic-legacy-product", quantity: 2 }] : [],
  });
  await page.addInitScript(({ key, oldKey, value }) => {
    if (window.sessionStorage.getItem("legacy-cart-regression-seeded")) return;
    window.localStorage.removeItem(key);
    window.localStorage.setItem(oldKey, value);
    window.sessionStorage.setItem("legacy-cart-regression-seeded", "true");
  }, { key: currentKey, oldKey: legacyKey, value: serialized });
  return serialized;
}

async function selectCanonicalVariant(page: Page) {
  await page.goto("/catalog/items/tirzepatide");
  await expect(page.getByRole("heading", { name: "Tirzepatide", exact: true })).toBeVisible();
  await page.locator(`input[type="radio"][value="${tr30VariantId}"]`).check();
  await expect(page.getByRole("status", { name: "Purchase summary" })).toContainText("$41.99");
}

async function expectSavedCanonicalCart(page: Page, quantity: number) {
  await expect.poll(() => page.evaluate((key) => JSON.parse(window.localStorage.getItem(key) ?? "null"), currentKey)).toEqual({
    version: 2,
    items: [{ variantId: tr30VariantId, quantity }],
  });
  await page.goto("/cart");
  await page.reload();
  const lines = page.getByRole("list", { name: "Cart lines" });
  await expect(lines.locator("li")).toHaveCount(1);
  await expect(lines.getByRole("heading", { name: "Tirzepatide", exact: true })).toBeVisible();
  await expect(lines.getByText("30mg", { exact: true })).toBeVisible();
  await expect(lines.getByText("SKU PPQ-TIRZEPATIDE-TR30", { exact: true })).toBeVisible();
  await expect(lines.getByRole("spinbutton")).toHaveValue(String(quantity));
  await expect(lines.locator("del")).toHaveText("$59.99");
  await expect(lines.locator("strong")).toHaveText("$41.99");
  const subtotal = lines.locator("dl > div").filter({ has: page.locator("dt", { hasText: "Line subtotal" }) }).locator("dd");
  await expect(subtotal).toHaveText(quantity === 2 ? "$83.98" : "$41.99");
  await expect(page.getByRole("heading", { name: "Choose your variants again." })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Checkout unavailable" })).toBeDisabled();
}

test("empty legacy cart allows canonical addition that survives a full reload", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const paymentRequests: string[] = [];
  page.on("request", (request) => {
    if (/\/api\/checkout|api\.stripe\.com/u.test(request.url())) paymentRequests.push(request.url());
  });
  await seedLegacyCart(page, false);
  await selectCanonicalVariant(page);
  await expect(page.getByRole("link", { name: "Review saved cart" })).toHaveCount(0);
  await page.getByRole("button", { name: "2 bottles", exact: true }).click();
  await page.getByRole("button", { name: "Add Tirzepatide to preview cart" }).click();
  await expect(page.getByRole("status", { name: "Cart updates" })).toHaveText("Cart updated. Tirzepatide, 30mg: 2 units in cart.");
  await expect(page.getByRole("link", { name: "Cart, 2 requested units" })).toBeVisible();
  await expectSavedCanonicalCart(page, 2);
  expect(paymentRequests).toEqual([]);
});

test("nonempty legacy cart rejects additions until explicit acknowledgement then persists the exact variant", async ({ page }) => {
  const legacy = await seedLegacyCart(page, true);
  await selectCanonicalVariant(page);
  const purchase = page.getByRole("status", { name: "Purchase summary" });
  const reviewSavedCart = purchase.getByRole("link", { name: "Review saved cart" });
  await expect(purchase.getByText("Your saved cart uses an older format. Clear the old cart before adding a variant.")).toBeVisible();
  await expect(reviewSavedCart).toBeVisible();
  await expect(reviewSavedCart).toHaveAttribute("href", "/cart");
  await page.getByRole("button", { name: "Add Tirzepatide to preview cart" }).click();
  await expect(page.getByRole("status", { name: "Cart updates" })).toHaveText(
    "Open your cart and clear the old cart before choosing variants again. Your saved items have not been changed.",
  );
  await expect(page.getByRole("link", { name: "Cart, 0 requested units" })).toBeVisible();
  expect(await page.evaluate((key) => window.localStorage.getItem(key), currentKey)).toBeNull();
  expect(await page.evaluate((key) => window.localStorage.getItem(key), legacyKey)).toBe(legacy);
  await reviewSavedCart.click();
  await expect(page).toHaveURL(/\/cart$/u);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Choose your variants again." })).toBeVisible();
  await expect(page.getByText(/contains 2 requested units from an older cart format/u)).toBeVisible();
  await page.getByRole("button", { name: "Clear old cart and choose variants" }).click();
  await expect(page.getByRole("heading", { name: "Your cart is empty." })).toBeVisible();
  expect(await page.evaluate((key) => window.localStorage.getItem(key), legacyKey)).toBeNull();
  await selectCanonicalVariant(page);
  await expect(page.getByRole("link", { name: "Review saved cart" })).toHaveCount(0);
  await page.getByRole("button", { name: "Add Tirzepatide to preview cart" }).click();
  await expect(page.getByRole("status", { name: "Cart updates" })).toHaveText("Cart updated. Tirzepatide, 30mg: 1 unit in cart.");
  await expectSavedCanonicalCart(page, 1);
});
