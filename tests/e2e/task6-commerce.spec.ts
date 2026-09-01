import AxeBuilder from "@axe-core/playwright";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { createHmac } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";

const origin = "http://127.0.0.1:4631";
const variantId = "55000000-0000-4000-8000-000000000001";
const localTestSecret = "task5-local-driver-secret-at-least-32-chars";
const screenshotDirectory = path.resolve(
  process.cwd(),
  ".superpowers/sdd/2026-08-24-propeptiq-lightweight-commerce/screenshots",
);

test.describe.configure({ mode: "serial" });

type Inspection = Readonly<{
  revision: number;
  orderCount: number;
  attemptCount: number;
  providerSessionCount: number;
  reviewRequestCount: number;
  paymentTransitionCount: number;
  refundCount: number;
  releaseCount: number;
  shipmentHandoffCount: number;
  deliveryCount: number;
  exceptionCount: number;
  effectCount: number;
  lastOrderUpdatedAt: string | null;
}>;

async function resetCommerce(request: APIRequestContext): Promise<Inspection> {
  const response = await request.post("/api/__local/commerce/reset", {
    headers: { Origin: origin },
  });
  expect(response.status()).toBe(200);
  return response.json() as Promise<Inspection>;
}

async function inspectCommerce(request: APIRequestContext): Promise<Inspection> {
  const response = await request.get("/api/__local/commerce/inspect", {
    headers: { Origin: origin },
  });
  expect(response.status()).toBe(200);
  return response.json() as Promise<Inspection>;
}

async function signInAs(page: Page, actor: string) {
  await page.goto("/sign-in");
  await page.getByRole("radio", { name: actor }).check();
  await Promise.all([
    page.waitForURL(/\/checkout$/u),
    page.getByRole("button", { name: "Continue to checkout" }).click(),
  ]);
}

async function seedCart(page: Page, quantity = 2) {
  await page.goto("/cart");
  await expect(page.getByLabel("Loading saved cart")).toHaveCount(0);
  await page.evaluate(({ id, requestedQuantity }) => {
    window.localStorage.setItem(
      "propeptiq.cart.v2",
      JSON.stringify({ version: 2, items: [{ variantId: id, quantity: requestedQuantity }] }),
    );
    window.sessionStorage.removeItem("propeptiq.cart-preview.presentation.v1");
    window.dispatchEvent(new StorageEvent("storage", { key: "propeptiq.cart.v2", storageArea: window.localStorage }));
  }, { id: variantId, requestedQuantity: quantity });
  await expect(page.getByRole("link", { name: `Cart, ${quantity} requested units` })).toBeVisible();
}

async function openBuyerCheckout(page: Page) {
  await seedCart(page);
  await signInAs(page, "Fixed non-administrator");
  await expect(page.getByText(/current authoritative baseline/i)).toBeVisible();
}

async function fillDestination(page: Page, stateCode: "CA" | "OR" | "NV" | "DE") {
  await page.getByLabel("Recipient name").fill("Synthetic Research Buyer");
  await page.getByLabel("Address line 1").fill("100 Test Way");
  await page.getByLabel("City").fill("Los Angeles");
  await page.getByLabel("State or district").selectOption(stateCode);
  await page.getByLabel("Postal code").fill("90001");
}

function checkoutBody(stateCode: "CA" | "OR" | "NV" | "DE") {
  return {
    items: [{ variantId, quantity: 2 }],
    destination: {
      recipientName: "Synthetic Research Buyer", line1: "100 Test Way", line2: null,
      city: "Los Angeles", stateCode, postalCode: "90001", countryCode: "US",
    },
  };
}

async function checkoutSessionBody(
  page: Page,
  headers: Readonly<Record<string, string>>,
  stateCode: "CA" | "OR" | "NV" | "DE",
) {
  const quote = await page.request.post("/api/checkout/quote", {
    headers,
    data: checkoutBody(stateCode),
  });
  expect(quote.status()).toBe(200);
  const body = await quote.json();
  expect(body).toMatchObject({
    status: stateCode === "OR" ? "review_required" : "quoted",
    pricingRevision: expect.stringMatching(/^[0-9a-f]{64}$/u),
  });
  return { ...checkoutBody(stateCode), pricingRevision: body.pricingRevision as string };
}

async function captureBrowserChannels(
  page: Page,
  channels: string[],
  loadedScripts: Set<string>,
) {
  channels.push(page.url(), await page.content());
  channels.push(...await page.locator("script:not([src])").allTextContents());
  const sources = await page.locator("script[src]").evaluateAll((scripts) => scripts
    .map((script) => script.getAttribute("src"))
    .filter((source): source is string => source !== null));
  for (const source of sources) {
    const url = new URL(source, page.url());
    if (url.origin !== origin || loadedScripts.has(url.href)) continue;
    loadedScripts.add(url.href);
    const response = await page.request.get(url.href);
    channels.push(url.href, JSON.stringify(response.headers()), await response.text());
  }
}

test.beforeAll(() => mkdirSync(screenshotDirectory, { recursive: true }));
test.beforeEach(async ({ request }) => {
  const reset = await resetCommerce(request);
  expect(reset).toMatchObject({ revision: 0, orderCount: 0, attemptCount: 0, providerSessionCount: 0 });
});

test("rejects browser authority injection without creating an order or provider session", async ({ page, request }) => {
  await openBuyerCheckout(page);
  await expect(page.getByText("Synthetic local test only", { exact: true })).toBeVisible();
  const before = await inspectCommerce(request);
  const response = await page.request.post("/api/checkout/quote", {
    headers: {
      Origin: origin,
      "Content-Type": "application/json",
      "Idempotency-Key": "6c000000-0000-4000-8000-000000000001",
    },
    data: {
      ...checkoutBody("CA"),
      total: 1,
      currency: "USD",
      buyerId: "50000000-0000-4000-8000-000000000001",
      providerPriceId: "price_injected",
      metadata: { injected: true },
      successUrl: "https://evil.example/success",
      cancelUrl: "https://evil.example/cancel",
    },
  });
  expect(response.status()).toBe(400);
  expect(await response.json()).toEqual({ status: "invalid_request" });
  expect(await inspectCommerce(request)).toEqual(before);
});

test("replays one exact hosted session and conflicts on changed facts for the same key", async ({ page, request }) => {
  await openBuyerCheckout(page);
  const headers = {
    Origin: origin,
    "Content-Type": "application/json",
    "Idempotency-Key": "6c000000-0000-4000-8000-000000000003",
  };
  const sessionRequest = await checkoutSessionBody(page, headers, "CA");
  const first = await page.request.post("/api/checkout/sessions", {
    headers,
    data: sessionRequest,
  });
  const firstBody = await first.json();
  expect({ httpStatus: first.status(), body: firstBody }).toEqual({
    httpStatus: 200,
    body: expect.objectContaining({ status: "open" }),
  });
  expect(firstBody).toMatchObject({
    status: "open",
    orderId: expect.stringMatching(/^[0-9a-f-]{36}$/u),
    hostedUrl: expect.stringMatching(/^http:\/\/127\.0\.0\.1:4631\/__synthetic_local_checkout\//u),
    expiresAt: expect.stringMatching(/^2026-/u),
  });
  const created = await inspectCommerce(request);
  expect(created).toMatchObject({ orderCount: 1, attemptCount: 1, providerSessionCount: 1 });

  const replay = await page.request.post("/api/checkout/sessions", {
    headers,
    data: sessionRequest,
  });
  expect(replay.status()).toBe(200);
  expect(await replay.json()).toEqual(firstBody);
  expect(await inspectCommerce(request)).toEqual(created);

  const changed = await page.request.post("/api/checkout/sessions", {
    headers,
    data: {
      ...sessionRequest,
      destination: { ...sessionRequest.destination, postalCode: "90002" },
    },
  });
  expect(changed.status()).toBe(409);
  expect(await changed.json()).toEqual({ status: "idempotency_conflict" });
  expect(await inspectCommerce(request)).toEqual(created);
});

test("renders exact CA totals and keeps hosted return pending until one internal signed event", async ({ page, request }) => {
  const browserConsole: string[] = [];
  const networkMetadata: string[] = [];
  const mutatingNavigations: string[] = [];
  const exposedChannels: string[] = [];
  const loadedScripts = new Set<string>();
  page.on("console", (message) => browserConsole.push(message.text()));
  page.on("request", (browserRequest) => {
    networkMetadata.push(browserRequest.url());
    if (browserRequest.isNavigationRequest() && browserRequest.method() !== "GET") {
      mutatingNavigations.push(`${browserRequest.method()} ${browserRequest.url()}`);
    }
  });
  page.on("response", (response) => networkMetadata.push(response.url(), JSON.stringify(response.headers())));
  await openBuyerCheckout(page);
  await fillDestination(page, "CA");
  await page.getByRole("button", { name: "Calculate authoritative total" }).click();
  await expect(page.getByRole("heading", { name: "Authoritative total" })).toBeVisible();
  await expect(page.getByText("Synthetic Reference Alpha — Demo Only", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("−$3.84", { exact: true })).toBeVisible();
  await expect(page.getByText("$5.00", { exact: true })).toBeVisible();
  await expect(page.getByText("$3.21", { exact: true })).toBeVisible();
  await expect(page.getByText("$52.37", { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.screenshot({ path: path.join(screenshotDirectory, "checkout-ready-1440.png"), fullPage: true });

  await page.getByRole("button", { name: "Continue to hosted payment" }).click();
  await expect(page.getByRole("heading", { name: "Hosted payment test double" })).toBeVisible();
  const hostedUrl = page.url();
  await captureBrowserChannels(page, exposedChannels, loadedScripts);
  const created = await inspectCommerce(request);
  expect(created).toMatchObject({ attemptCount: 1, providerSessionCount: 1, paymentTransitionCount: 0 });

  await page.getByRole("button", { name: "Return without payment event" }).click();
  await expect(page.getByRole("heading", { name: "Payment verification pending" })).toBeVisible();
  await expect(page.getByText("Synthetic local test only", { exact: true })).toBeVisible();
  await expect(page.getByText(/refreshing cannot confirm payment/i)).toBeVisible();
  const successUrl = page.url();
  await captureBrowserChannels(page, exposedChannels, loadedScripts);
  const pending = await inspectCommerce(request);
  const mutationCountBeforeHistory = mutatingNavigations.length;
  await page.reload();
  await expect(page.getByRole("heading", { name: "Payment verification pending" })).toBeVisible();
  await page.goto("/account/orders");
  await expect(page.getByRole("heading", { name: "Order history" })).toBeVisible();
  await page.evaluate(() => window.history.back());
  await expect(page).toHaveURL(successUrl);
  await expect(page.getByRole("heading", { name: "Payment verification pending" })).toBeVisible();
  await page.evaluate(() => window.history.forward());
  await expect(page).toHaveURL(/\/account\/orders$/u);
  await expect(page.getByRole("heading", { name: "Order history" })).toBeVisible();
  await page.evaluate(() => window.history.back());
  await expect(page).toHaveURL(successUrl);
  await expect(page.getByRole("heading", { name: "Payment verification pending" })).toBeVisible();
  expect(mutatingNavigations).toHaveLength(mutationCountBeforeHistory);
  expect(await inspectCommerce(request)).toEqual(pending);
  await page.screenshot({ path: path.join(screenshotDirectory, "success-pending-1440.png"), fullPage: true });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.screenshot({ path: path.join(screenshotDirectory, "success-pending-375.png"), fullPage: true });

  await page.goto(hostedUrl);
  await page.getByRole("button", { name: "Complete synthetic checkout" }).click();
  await expect(page.getByRole("heading", { name: "Payment verified" })).toBeVisible();
  await captureBrowserChannels(page, exposedChannels, loadedScripts);
  const paid = await inspectCommerce(request);
  expect(paid.paymentTransitionCount).toBe(pending.paymentTransitionCount + 1);
  await page.screenshot({ path: path.join(screenshotDirectory, "success-paid-375.png"), fullPage: true });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.screenshot({ path: path.join(screenshotDirectory, "success-paid-1440.png"), fullPage: true });

  await page.goto(hostedUrl);
  await page.getByRole("button", { name: "Complete synthetic checkout" }).click();
  await expect(page.getByRole("heading", { name: "Payment verified" })).toBeVisible();
  expect(await inspectCommerce(request)).toEqual(paid);

  const sessionId = new URL(hostedUrl).pathname.split("/").at(-1)!;
  const orderId = new URL(successUrl).pathname.split("/").at(-1)!;
  const signedPayload = JSON.stringify({
    schemaVersion: 1,
    eventId: `local-event:${sessionId}`,
    sessionId,
    orderId,
    amountMinor: 5_237,
    currency: "USD",
  });
  const signature = createHmac("sha256", localTestSecret).update(signedPayload).digest();
  exposedChannels.push(
    JSON.stringify(created),
    JSON.stringify(pending),
    JSON.stringify(paid),
    JSON.stringify(await page.context().cookies()),
    ...browserConsole,
    ...networkMetadata,
  );
  const exposed = exposedChannels.join("\n");
  expect(exposed).not.toContain(localTestSecret);
  expect(exposed).not.toContain(signature.toString("hex"));
  expect(exposed).not.toContain(signature.toString("base64"));
});

test("shows OR review, NV blocked, and DE unavailable without exposing a hosted URL", async ({ page, request }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await openBuyerCheckout(page);
  await fillDestination(page, "OR");
  await page.getByRole("button", { name: "Calculate authoritative total" }).click();
  await expect(page.getByText("Manual review is required", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue to hosted payment" })).toHaveCount(0);
  const reviewHeaders = {
    Origin: origin,
    "Content-Type": "application/json",
    "Idempotency-Key": "6c000000-0000-4000-8000-000000000002",
  };
  const reviewSessionRequest = await checkoutSessionBody(page, reviewHeaders, "OR");
  const firstReview = await page.request.post("/api/checkout/sessions", {
    headers: reviewHeaders,
    data: reviewSessionRequest,
  });
  expect(firstReview.status()).toBe(202);
  const firstReviewBody = await firstReview.json();
  expect(firstReviewBody).toMatchObject({ status: "review_required" });
  const reviewed = await inspectCommerce(request);
  expect(reviewed.reviewRequestCount).toBe(1);
  const replayReview = await page.request.post("/api/checkout/sessions", {
    headers: reviewHeaders,
    data: reviewSessionRequest,
  });
  expect(replayReview.status()).toBe(202);
  expect(await replayReview.json()).toEqual(firstReviewBody);
  expect((await inspectCommerce(request)).reviewRequestCount).toBe(1);
  await page.screenshot({ path: path.join(screenshotDirectory, "checkout-review-375.png"), fullPage: true });

  await page.getByLabel("State or district").selectOption("NV");
  await page.getByRole("button", { name: "Calculate authoritative total" }).click();
  await expect(page.getByText(/checkout is not permitted/i)).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue to hosted payment" })).toHaveCount(0);
  await page.screenshot({ path: path.join(screenshotDirectory, "checkout-blocked-375.png"), fullPage: true });

  await page.getByLabel("State or district").selectOption("DE");
  await page.getByRole("button", { name: "Calculate authoritative total" }).click();
  await expect(page.getByText(
    "One or more variants cannot be checked out with the current authoritative facts.",
    { exact: true },
  )).toBeVisible();
  await expect(page.getByRole("button", { name: "Try authoritative quote again" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue to hosted payment" })).toHaveCount(0);
  expect((await inspectCommerce(request)).providerSessionCount).toBe(0);
});

test("owner success URLs fail closed for malformed and cross-owner reads", async ({ page, request }) => {
  await openBuyerCheckout(page);
  await fillDestination(page, "CA");
  await page.getByRole("button", { name: "Calculate authoritative total" }).click();
  await page.getByRole("button", { name: "Continue to hosted payment" }).click();
  await page.getByRole("button", { name: "Return without payment event" }).click();
  const ownerSuccessUrl = page.url();
  expect(ownerSuccessUrl).toMatch(/\/checkout\/success\/[0-9a-f-]{36}$/u);
  const malformed = await page.goto("/checkout/success/not-an-order");
  expect(malformed?.status()).toBe(404);

  await signInAs(page, "Fixed new customer");
  const crossOwner = await page.goto(ownerSuccessUrl);
  expect(crossOwner?.status()).toBe(404);
  expect((await inspectCommerce(request)).paymentTransitionCount).toBe(0);
});

test("staff refund, hold, handoff, delivery, and exception commands have once-only read-back", async ({ page, request }) => {
  await signInAs(page, "Fixed capable administrator");
  await page.goto("/admin/refunds");
  const refundForm = page.getByRole("form", { name: /Submit or recover refund/ });
  await refundForm.getByRole("button", { name: "Submit guarded command" }).click();
  const refundStatus = page.getByRole("status").filter({
    hasText: /awaiting a signed provider event|recorded/i,
  });
  await expect(refundStatus).toContainText(/awaiting a signed provider event|recorded/i);
  const refunded = await inspectCommerce(request);
  await page.getByRole("form", { name: /Submit or recover refund/ }).getByRole("button", { name: "Submit guarded command" }).click();
  await expect(refundStatus).toBeVisible();
  expect(await inspectCommerce(request)).toEqual(refunded);

  await page.goto("/admin/orders");
  const focusTarget = await page.getByRole("form", { name: /Clear fulfillment hold/ })
    .locator('input[name="orderId"]')
    .inputValue();
  await page.goto(`/admin/orders?command=clear-hold&target=${focusTarget}&result=ineligible`);
  const failedCommand = page.getByRole("alert").filter({ hasText: "Command not completed" });
  await expect(failedCommand).toContainText("Command not completed");
  await expect(failedCommand).toBeFocused();
  await page.goto("/admin/orders");
  await page.getByRole("form", { name: /Clear fulfillment hold/ }).getByRole("button", { name: "Submit guarded command" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: /hold was cleared once/i }),
  ).toContainText(/hold was cleared once/i);
  const cleared = await inspectCommerce(request);
  await page.goto("/admin/shipments");
  await page.getByRole("form", { name: /Handoff shipment/ }).getByRole("button", { name: "Submit guarded command" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: /handed off once/i }),
  ).toContainText(/handed off once/i);
  const handedOff = await inspectCommerce(request);
  expect(handedOff.releaseCount).toBe(cleared.releaseCount + 1);
  expect(handedOff.shipmentHandoffCount).toBe(cleared.shipmentHandoffCount + 1);
  await page.setViewportSize({ width: 1024, height: 900 });
  await page.screenshot({ path: path.join(screenshotDirectory, "admin-shipment-actions-1024.png"), fullPage: true });

  await page.getByRole("form", { name: /Mark shipment delivered/ }).getByRole("button", { name: "Submit guarded command" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: /marked delivered once/i }),
  ).toContainText(/marked delivered once/i);
  const delivered = await inspectCommerce(request);
  expect(delivered.deliveryCount).toBe(handedOff.deliveryCount + 1);

  await resetCommerce(request);
  await page.goto("/admin/orders");
  await page.getByRole("form", { name: /Clear fulfillment hold/ }).getByRole("button", { name: "Submit guarded command" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: /hold was cleared once/i }),
  ).toContainText(/hold was cleared once/i);
  await page.goto("/admin/shipments");
  await page.getByRole("form", { name: /Handoff shipment/ }).getByRole("button", { name: "Submit guarded command" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: /handed off once/i }),
  ).toContainText(/handed off once/i);
  const beforeException = await inspectCommerce(request);
  await page.getByRole("form", { name: /Record shipment exception/ }).getByRole("button", { name: "Submit guarded command" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: /exception was recorded once/i }),
  ).toContainText(/exception was recorded once/i);
  const excepted = await inspectCommerce(request);
  expect(excepted.exceptionCount).toBe(beforeException.exceptionCount + 1);
  await page.reload();
  expect(await inspectCommerce(request)).toEqual(excepted);
});

test("required commerce pages preserve responsive, keyboard, and accessibility contracts", async ({ page }) => {
  test.setTimeout(120_000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openBuyerCheckout(page);
  await fillDestination(page, "CA");
  await page.getByRole("button", { name: "Calculate authoritative total" }).click();
  await page.getByRole("button", { name: "Continue to hosted payment" }).click();
  await page.getByRole("button", { name: "Return without payment event" }).click();
  const successUrl = page.url();
  const routes = ["checkout", "success", "orders", "shipments"] as const;

  const openRoute = async (route: typeof routes[number]) => {
    if (route === "shipments") {
      await signInAs(page, "Fixed capable administrator");
      await page.goto("/admin/shipments");
      await expect(page.getByRole("form", { name: /Handoff shipment/ })).toBeVisible();
      return;
    }
    await signInAs(page, "Fixed non-administrator");
    if (route === "checkout") {
      await seedCart(page);
      await page.goto("/checkout");
      await expect(page.getByLabel("Recipient name")).toBeVisible();
      return;
    }
    if (route === "success") {
      await page.goto(successUrl);
      await expect(page.getByRole("heading", { name: "Payment verification pending" })).toBeVisible();
      return;
    }
    await page.goto("/account/orders");
    await expect(page.getByRole("heading", { name: "Order history" })).toBeVisible();
  };

  for (const width of [375, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: width === 375 ? 812 : 900 });
    for (const route of routes) {
      await openRoute(route);
      await expect(page.locator("main#main-content")).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `${route} at ${width}px`).toBeLessThanOrEqual(1);
      expect((await new AxeBuilder({ page }).analyze()).violations, `${route} Axe at ${width}px`).toEqual([]);

      if (route === "shipments") {
        const trigger = page.getByRole("button", { name: "Open administration navigation" });
        if (width < 1280) await expect(trigger).toBeVisible();
        else await expect(trigger).toBeHidden();
        const aside = page.locator('nav[aria-label="Administration"]');
        if (width >= 1280) await expect(aside).toBeVisible();
        else await expect(aside).toBeHidden();
      } else {
        const trigger = page.getByRole("button", { name: "Open account navigation" });
        const desktop = page.locator('nav[aria-label="Account"]');
        if (width < 1280) {
          await expect(trigger).toBeVisible();
          await expect(desktop).toBeHidden();
        } else {
          await expect(trigger).toBeHidden();
          await expect(desktop).toBeVisible();
        }
      }

      if (width === 375) {
        await page.keyboard.press("Tab");
        const skip = page.getByRole("link", { name: "Skip to main content" });
        await expect(skip).toBeFocused();
        await page.keyboard.press("Enter");
        await expect(page.locator("main#main-content")).toBeFocused();
      }
    }
  }

  await page.setViewportSize({ width: 375, height: 812 });
  for (const [route, triggerName] of [
    ["orders", "Open account navigation"],
    ["shipments", "Open administration navigation"],
  ] as const) {
    await openRoute(route);
    const trigger = page.getByRole("button", { name: triggerName });
    await trigger.focus();
    await page.keyboard.press("Enter");
    const sheet = page.locator('[data-slot="sheet-content"]');
    await expect(sheet).toBeVisible();
    await page.keyboard.press("Tab");
    expect(await page.evaluate(() => Boolean(document.activeElement?.closest('[data-slot="sheet-content"]')))).toBe(true);
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
    await expect(trigger).toBeFocused();
  }

  await page.setViewportSize({ width: 1024, height: 900 });
  for (const route of routes) {
    await openRoute(route);
    await page.evaluate(() => { document.documentElement.style.zoom = "2"; });
    // This is the brief's labeled CSS-zoom proxy, not literal browser zoom.
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth),
      `${route} at the 200% CSS-zoom proxy`,
    ).toBeLessThanOrEqual(1);
    const requiredControls = route === "checkout"
      ? page.getByLabel(/Recipient name|State or district/)
      : route === "success"
        ? page.getByRole("link", { name: "View order history" })
        : route === "orders"
          ? page.getByRole("link", { name: "View order" }).first()
          : page.getByRole("form", { name: /Handoff shipment/ }).getByRole("button", { name: "Submit guarded command" });
    await expect(requiredControls.first()).toBeVisible();
    const targets = await requiredControls.evaluateAll((elements) => elements.map((element) => {
      const box = element.getBoundingClientRect();
      return { width: box.width, height: box.height, order: getComputedStyle(element).order, tabIndex: (element as HTMLElement).tabIndex };
    }));
    expect(targets.length).toBeGreaterThan(0);
    expect(targets.every((target) => target.width >= 44 && target.height >= 44 && target.order === "0" && target.tabIndex >= 0)).toBe(true);
  }

  await expect(page.locator("body")).toHaveCSS("animation-duration", "0s");
  await expect(page.locator("body")).toHaveCSS("transition-duration", "0s");
  await expect(page.locator("html")).toHaveCSS("scroll-behavior", "auto");
});
