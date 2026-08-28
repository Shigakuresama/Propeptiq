import { describe, expect, it, vi } from "vitest";

import type { BrowserCheckoutQuote, CheckoutQuoteResult } from "@/commerce/checkout-service";
import type { ProviderCheckoutRouteResult } from "@/commerce/provider-checkout-orchestration";
import { createCheckoutHttpHandlers } from "@/commerce/checkout-http";

const buyerId = "61000000-0000-4000-8000-000000000001";
const key = "6a000000-0000-4000-8000-000000000002";
const origin = "http://127.0.0.1:4631";
const requestBody = {
  items: [{ productId: "55000000-0000-4000-8000-000000000001", quantity: 2 }],
  destination: {
    recipientName: "Synthetic Research Buyer",
    line1: "100 Test Way",
    line2: null,
    city: "Los Angeles",
    stateCode: "CA",
    postalCode: "90001",
    countryCode: "US",
  },
  promotionIds: ["66000000-0000-4000-8000-000000000001"],
} as const;

const quote: BrowserCheckoutQuote = Object.freeze({
  status: "ready",
  reviewRequired: false,
  reasons: Object.freeze([]),
  currency: "USD",
  subtotalMinor: 4_800,
  discountMinor: 480,
  shippingMinor: 500,
  taxMinor: 321,
  totalMinor: 5_141,
  lines: Object.freeze([Object.freeze({
    productId: requestBody.items[0].productId,
    productName: "Synthetic Alpha Reference",
    packageForm: "Synthetic sealed vial",
    quantity: 2,
    unitAmountMinor: 2_400,
    subtotalMinor: 4_800,
    discountMinor: 480,
    totalMinor: 4_320,
  })]),
});

function request(
  path: string,
  body: unknown = requestBody,
  headers: Record<string, string> = {},
) {
  return new Request(`${origin}${path}`, {
    method: "POST",
    headers: {
      origin,
      "content-type": "application/json",
      "idempotency-key": key,
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

function fixture(overrides: Partial<Parameters<typeof createCheckoutHttpHandlers>[0]> = {}) {
  let count = 0;
  const quoteCheckout = vi.fn<(
    input: Readonly<{ buyerUserId: string; idempotencyKey: string; request: unknown; attributionCookie: string | null }>,
  ) => Promise<CheckoutQuoteResult>>(async () => ({ status: "quoted", quote } as CheckoutQuoteResult));
  const startSession = vi.fn<(
    input: Readonly<{ buyerUserId: string; idempotencyKey: string; request: unknown; attributionCookie: string | null }>,
  ) => Promise<ProviderCheckoutRouteResult>>(async () => ({
    status: "open",
    orderId: "61000000-0000-4000-8000-000000000003",
    url: `${origin}/__synthetic_local_checkout/cs_local_synthetic_fixture`,
    expiresAt: "2026-08-26T13:00:00.000Z",
  }));
  const handlers = createCheckoutHttpHandlers({
    environment: { APP_ENV: "local", APP_ORIGIN: origin },
    resolveActor: async () => ({ buyerUserId: buyerId }),
    rateLimitSecret: "checkout-http-test-secret-at-least-32-characters",
    rateLimitStore: { increment: async () => ++count },
    now: () => new Date("2026-08-26T12:00:00.000Z"),
    quoteCheckout,
    startSession,
    ...overrides,
  });
  return { handlers, quoteCheckout, startSession };
}

async function json(response: Response) {
  return response.json() as Promise<Record<string, unknown>>;
}

describe("checkout HTTP controllers", () => {
  it("projects a ready quote through the exact safe envelope", async () => {
    const { handlers, quoteCheckout } = fixture();
    const response = await handlers.quote(request("/api/checkout/quote", requestBody, {
      cookie: "unrelated=1; propeptiq_attribution_v1=signed-task5b-cookie",
    }));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await json(response)).toEqual({ status: "quoted", quote });
    expect(quoteCheckout).toHaveBeenCalledWith({
      buyerUserId: buyerId,
      idempotencyKey: key,
      request: requestBody,
      attributionCookie: "signed-task5b-cookie",
    });
  });

  it.each([
    ["wrong origin", { origin: "https://attacker.invalid" }, requestBody],
    ["missing key", { "idempotency-key": "" }, requestBody],
    ["uppercase key", { "idempotency-key": key.toUpperCase() }, requestBody],
    ["wrong content type", { "content-type": "text/plain" }, requestBody],
    ["browser total", {}, { ...requestBody, totalMinor: 1 }],
    ["browser currency", {}, { ...requestBody, currency: "USD" }],
    ["browser identity", {}, { ...requestBody, buyerUserId: buyerId }],
    ["browser provider price", {}, { ...requestBody, providerPriceId: "price_bad" }],
    ["browser metadata", {}, { ...requestBody, metadata: {} }],
    ["browser redirect", {}, { ...requestBody, success_url: "https://attacker.invalid" }],
    ["multiple promotions", {}, { ...requestBody, promotionIds: [key, buyerId] }],
  ])("rejects %s before commerce work", async (_label, headers, body) => {
    const { handlers, quoteCheckout, startSession } = fixture();
    const response = await handlers.quote(request("/api/checkout/quote", body, headers));
    expect([400, 403]).toContain(response.status);
    expect(quoteCheckout).not.toHaveBeenCalled();
    expect(startSession).not.toHaveBeenCalled();
  });

  it("authenticates and rate limits before commerce work", async () => {
    const unauthenticated = fixture({ resolveActor: async () => null });
    expect((await unauthenticated.handlers.quote(request("/api/checkout/quote"))).status).toBe(401);
    expect(unauthenticated.quoteCheckout).not.toHaveBeenCalled();

    const limited = fixture({ rateLimitStore: { increment: async () => 21 } });
    const response = await limited.handlers.quote(request("/api/checkout/quote"));
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toMatch(/^\d+$/u);
    expect(await json(response)).toEqual(expect.objectContaining({ status: "rate_limited" }));
    expect(limited.quoteCheckout).not.toHaveBeenCalled();
  });

  it("uses the operation-specific unavailable envelope when rate authority is absent", async () => {
    const withoutRateAuthority = fixture({ rateLimitStore: null });
    const quoteResponse = await withoutRateAuthority.handlers.quote(
      request("/api/checkout/quote"),
    );
    const sessionResponse = await withoutRateAuthority.handlers.session(
      request("/api/checkout/sessions"),
    );

    expect(quoteResponse.status).toBe(503);
    await expect(json(quoteResponse)).resolves.toEqual({
      status: "quote_unavailable",
      component: "commerce",
    });
    expect(sessionResponse.status).toBe(503);
    await expect(json(sessionResponse)).resolves.toEqual({ status: "unavailable" });
    expect(withoutRateAuthority.quoteCheckout).not.toHaveBeenCalled();
    expect(withoutRateAuthority.startSession).not.toHaveBeenCalled();
  });

  it("uses separate quote/session scopes and exposes a hosted URL only for strict open", async () => {
    const scopes: string[] = [];
    const ready = fixture({
      rateLimitStore: {
        increment: async (window) => {
          scopes.push(window.scopeHash);
          return 1;
        },
      },
    });
    await ready.handlers.quote(request("/api/checkout/quote"));
    const response = await ready.handlers.session(request("/api/checkout/sessions"));
    expect(response.status).toBe(200);
    expect(await json(response)).toEqual({
      status: "open",
      orderId: "61000000-0000-4000-8000-000000000003",
      hostedUrl: `${origin}/__synthetic_local_checkout/cs_local_synthetic_fixture`,
      expiresAt: "2026-08-26T13:00:00.000Z",
    });
    expect(new Set(scopes).size).toBe(2);

    const unknown = fixture({
      startSession: async () => ({ status: "provider_unknown" }),
    });
    expect(await json(await unknown.handlers.session(request("/api/checkout/sessions")))).toEqual({
      status: "provider_unknown",
    });
  });

  it("maps malformed dependency results and cyclic thrown values without leakage", async () => {
    const cyclic: Record<string, unknown> = { secret: "must-not-leak" };
    cyclic.self = cyclic;
    const malformed = fixture({ quoteCheckout: async () => cyclic as never });
    const first = await malformed.handlers.quote(request("/api/checkout/quote"));
    expect(first.status).toBe(503);
    expect(await first.text()).not.toContain("must-not-leak");

    const thrown = fixture({ quoteCheckout: async () => { throw cyclic; } });
    const second = await thrown.handlers.quote(request("/api/checkout/quote"));
    expect(second.status).toBe(503);
    expect(await second.text()).not.toContain("must-not-leak");
  });
});
