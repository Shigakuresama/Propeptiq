import { beforeEach, describe, expect, it, vi } from "vitest";

const { getRequestIdentity, createCheckoutServerRuntime, quoteCheckout, readServerEnv } = vi.hoisted(() => ({
  getRequestIdentity: vi.fn(),
  createCheckoutServerRuntime: vi.fn(),
  quoteCheckout: vi.fn(),
  readServerEnv: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/auth/server", () => ({ getRequestIdentity }));
vi.mock("@/commerce/server-runtime", () => ({ createCheckoutServerRuntime }));
vi.mock("@/env", () => ({ readServerEnv }));

import { POST, dynamic } from "./route";

const buyerUserId = "50000000-0000-4000-8000-000000000004";
const idempotencyKey = "6d000000-0000-4000-8000-000000000001";
const environment = {
  APP_ENV: "local",
  APP_ORIGIN: "http://127.0.0.1:4631",
  RATE_LIMIT_SECRET: "route-test-rate-limit-secret-at-least-32-characters",
};
const body = {
  items: [{ productId: "61000000-0000-4000-8000-000000000001", quantity: 2 }],
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
};

function request(payload: unknown = body) {
  return new Request(`${environment.APP_ORIGIN}/api/checkout/quote`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "idempotency-key": idempotencyKey,
      origin: environment.APP_ORIGIN,
    },
    body: JSON.stringify(payload),
  });
}

describe("POST /api/checkout/quote", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    readServerEnv.mockReturnValue(environment);
    getRequestIdentity.mockResolvedValue({
      environment,
      identity: {
        clerkUserId: "local-customer",
        primaryEmail: "buyer@example.test",
        emailVerifiedAt: "2026-08-26T00:00:00.000Z",
        mfaConfigured: false,
        secondFactorCompleted: false,
      },
      principal: { actorId: buyerUserId, clerkUserId: "local-customer" },
      localDriver: {},
    });
    quoteCheckout.mockResolvedValue({
      status: "quoted",
      quote: {
        status: "ready",
        reviewRequired: false,
        reasons: [],
        currency: "USD",
        subtotalMinor: 4_800,
        discountMinor: 480,
        shippingMinor: 500,
        taxMinor: 321,
        totalMinor: 5_141,
        lines: [{
          productId: "61000000-0000-4000-8000-000000000001",
          productName: "Synthetic local test only — Alpha",
          packageForm: "Research vial",
          quantity: 2,
          unitAmountMinor: 2_400,
          subtotalMinor: 4_800,
          discountMinor: 480,
          totalMinor: 4_320,
        }],
      },
    });
    createCheckoutServerRuntime.mockResolvedValue({
      buyerUserId,
      rateLimitStore: { increment: vi.fn().mockResolvedValue(1) },
      quoteCheckout,
      startSession: vi.fn(),
    });
  });

  it("is dynamic and delegates the exact authenticated request to the checkout runtime", async () => {
    expect(dynamic).toBe("force-dynamic");
    const response = await POST(request());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: "quoted",
      quote: { totalMinor: 5_141 },
    });
    expect(quoteCheckout).toHaveBeenCalledWith({ buyerUserId, idempotencyKey, request: body });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("fails closed without a coherent runtime", async () => {
    createCheckoutServerRuntime.mockResolvedValue(null);
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect(quoteCheckout).not.toHaveBeenCalled();
  });

  it("denies a mismatched origin before identity or runtime resolution", async () => {
    const denied = request();
    denied.headers.set("origin", "http://localhost:9999");
    const response = await POST(denied);

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ status: "origin_denied" });
    expect(getRequestIdentity).not.toHaveBeenCalled();
    expect(createCheckoutServerRuntime).not.toHaveBeenCalled();
  });

  it("collapses runtime assembly failures to the closed quote envelope", async () => {
    createCheckoutServerRuntime.mockRejectedValue(new Error("sensitive runtime detail"));
    const response = await POST(request());
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      status: "quote_unavailable",
      component: "commerce",
    });
  });
});
