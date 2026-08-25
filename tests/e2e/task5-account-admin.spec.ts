import { expect, test, type Page } from "@playwright/test";

/**
 * These checks intentionally use the fixed local deterministic driver. They are
 * synthetic browser proof only; they do not exercise Clerk, a shared database,
 * payment providers, or production records.
 *
 * The suite is serial because the local driver owns one module-global state and
 * the Playwright configuration must run it with one worker.
 */
test.describe.configure({ mode: "serial" });

async function signInAs(page: Page, actorLabel: string) {
  await page.goto("/sign-in");
  await page.getByRole("radio", { name: actorLabel }).check();
  await page.getByRole("button", { name: "Continue to checkout" }).click();
  await expect(page).toHaveURL(/\/checkout$/);
}

test("preserves exact cart IDs and quantities through fixed sign-in and checkout", async ({ page }) => {
  await page.goto("/cart");
  await page.evaluate(() => {
    window.localStorage.setItem(
      "propeptiq.cart.v1",
      JSON.stringify({ version: 1, items: [{ productId: "demo-product-alpha", quantity: 2 }] }),
    );
  });
  await page.reload();
  await page.getByRole("button", { name: "Continue to sign in" }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
  await page.getByRole("radio", { name: "Fixed new customer" }).check();
  await page.getByRole("button", { name: "Continue to checkout" }).click();
  await expect(page).toHaveURL(/\/checkout$/);
  await expect(page.getByRole("heading", { name: "Checkout readiness" })).toBeVisible();
  await expect(page.getByRole("list", { name: "Saved cart lines" })).toContainText("Synthetic Reference Alpha");
  await expect(page.getByRole("list", { name: "Saved cart lines" })).toContainText("× 2");
  const savedCart = await page.evaluate(() =>
    JSON.parse(window.localStorage.getItem("propeptiq.cart.v1") ?? "null"),
  );
  expect(savedCart).toEqual({
    version: 1,
    items: [{ productId: "demo-product-alpha", quantity: 2 }],
  });
});

test("ignores a hostile sign-in return query and returns only to the fixed checkout route", async ({ page }) => {
  await page.goto("/sign-in?returnTo=https%3A%2F%2Fevil.example%2Fcapture");
  await expect(page.getByText("For legitimate laboratory and research use only.", { exact: true })).toBeVisible();
  await expect(page.locator("main#main-content")).toHaveCount(1);
  await page.getByRole("radio", { name: "Fixed new customer" }).check();
  await page.getByRole("button", { name: "Continue to checkout" }).click();
  await expect(page).toHaveURL(/\/checkout$/);
  expect(new URL(page.url()).origin).toBe("http://127.0.0.1:4631");
});

test("activates a new customer only after the verified account facts and current attestation are submitted", async ({ page }) => {
  await signInAs(page, "Fixed new customer");
  await page.getByRole("checkbox", { name: "I confirm that I am at least 21 years old." }).check();
  await page.getByLabel("Research purpose").selectOption("analytical");
  await page.getByRole("checkbox", { name: /accept attestation version 1/i }).check();
  await page.getByRole("button", { name: "Complete verified account" }).click();
  await expect(
    page.getByRole("status", { name: "Account facts saved" }),
  ).toContainText("Account facts saved");
  await page.goto("/account");
  await expect(page.getByText("active", { exact: true })).toBeVisible();
  await expect(page.getByText("Version 1", { exact: true })).toBeVisible();
});

test("allows an owner to read its order but denies cross-owner and malformed order reads", async ({ page }) => {
  await signInAs(page, "Fixed new customer");
  await page.goto("/account/orders");
  await expect(page.getByText("Order local-order-customer", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "View order" })).toHaveAttribute("href", "/account/orders/local-order-customer");
  const crossOwner = await page.goto("/account/orders/local-order-blocked");
  expect(crossOwner?.status()).toBe(404);
  const malformed = await page.goto("/account/orders/not-a-valid-order-id");
  expect(malformed?.status()).toBe(404);
});

test("keeps a blocked customer read-only while retaining own account and order reads", async ({ page }) => {
  await signInAs(page, "Fixed blocked customer");
  await page.goto("/account");
  await expect(page.getByText(/Blocked:/)).toBeVisible();
  await expect(page.getByRole("button", { name: /Update account facts/i })).toHaveCount(0);
  await page.goto("/account/orders");
  await expect(page.getByText("Order local-order-blocked", { exact: true })).toBeVisible();
  await page.goto("/checkout");
  await expect(page.getByRole("alert").filter({ hasText: "blocked" })).toContainText("blocked");
  await expect(page.getByRole("button", { name: /Update account facts|Complete verified account/i })).toHaveCount(0);
});

test("shows precise admin gates for non-admin, missing-MFA, and missing-capability principals", async ({ page }) => {
  await signInAs(page, "Fixed non-administrator");
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Required capability is not granted" })).toBeVisible();

  await signInAs(page, "Fixed administrator without MFA");
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Multi-factor authentication is not configured" })).toBeVisible();

  await signInAs(page, "Fixed limited administrator");
  await page.goto("/admin/products");
  await expect(page.getByRole("heading", { name: "Required capability is not granted" })).toBeVisible();
});

test("one capable administrator can mutate a local resource and read its redacted audit event", async ({ page }) => {
  await signInAs(page, "Fixed capable administrator");
  await page.goto("/admin/products");
  await expect(page.getByRole("heading", { name: "Products" })).toBeVisible();
  // Production contract: each command form has an accessible name matching its
  // lifecycle command, so adding another CRUD form cannot retarget this proof.
  const productCommand = page.getByRole("form", { name: "Activate one verified product" });
  await productCommand.getByRole("button", { name: "Submit guarded command" }).click();
  await expect(page).toHaveURL(/\/admin\/products\?result=saved$/);
  await expect(page.getByRole("status")).toContainText("confirm the resource or audit read-back");
  await page.goto("/admin/audit");
  await expect(page.getByRole("list", { name: "Redacted audit history" })).toContainText("catalog.product.activated");
});

test("labels order, refund, and shipment pages as Task 6 unavailable surfaces", async ({ page }) => {
  await signInAs(page, "Fixed capable administrator");
  for (const resource of ["orders", "refunds", "shipments"]) {
    await page.goto(`/admin/${resource}`);
    const task6Boundary = page.locator(".warning-record").filter({ hasText: "Task 6 boundary:" });
    await expect(task6Boundary).toBeVisible();
    await expect(task6Boundary).toContainText(/provider refund submission|release issuance|delivery effects remain unavailable/i);
  }
});

test("account and admin shells remain usable at approved widths without horizontal overflow", async ({ page }) => {
  await signInAs(page, "Fixed capable administrator");
  for (const width of [375, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/admin");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `${width}px admin overflow`).toBeLessThanOrEqual(1);
    await page.goto("/account");
    const accountOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(accountOverflow, `${width}px account overflow`).toBeLessThanOrEqual(1);
  }
});

test("account and admin interaction supports keyboard focus, reduced motion, minimum targets, and a labeled 200% proxy", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await signInAs(page, "Fixed capable administrator");
  await page.goto("/admin");
  await expect(page.getByText("For legitimate laboratory and research use only.", { exact: true })).toBeVisible();
  await expect(page.locator("main#main-content")).toHaveCount(1);
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to main content" })).toBeFocused();
  expect(await page.evaluate(() => {
    const element = document.activeElement;
    if (!(element instanceof HTMLElement)) return false;
    const styles = getComputedStyle(element);
    return styles.outlineStyle !== "none" || styles.boxShadow !== "none";
  })).toBe(true);
  await expect(page.locator("p.text-base").first()).toHaveCSS("font-size", "16px");
  expect(await page.evaluate(() => {
    const body = getComputedStyle(document.body);
    const root = getComputedStyle(document.documentElement);
    return body.animationDuration === "0s" && body.transitionDuration === "0s" && root.scrollBehavior === "auto";
  })).toBe(true);
  const targets = await page.getByRole("link").evaluateAll((links) => links.map((link) => {
    const box = link.getBoundingClientRect();
    return { width: box.width, height: box.height };
  }));
  expect(targets.filter((target) => target.width > 0 && target.height > 0).every((target) => target.width >= 44 && target.height >= 44)).toBe(true);
  await page.setViewportSize({ width: 1024, height: 900 });
  await page.goto("/account");
  await expect(page.getByText("For legitimate laboratory and research use only.", { exact: true })).toBeVisible();
  await expect(page.locator("main#main-content")).toHaveCount(1);
  await page.evaluate(() => { document.documentElement.style.zoom = "2"; });
  // This is a CSS-zoom reflow proxy for 200% text scaling, not literal browser zoom.
  await expect(page.getByRole("heading", { name: "Verified account record" })).toBeVisible();
  const zoomOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(zoomOverflow).toBeLessThanOrEqual(1);
  await expect(page.locator("main#main-content")).toHaveAttribute("id", "main-content");
});
