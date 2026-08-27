import { beforeEach, describe, expect, it, vi } from "vitest";

import { parseServerEnv } from "@/config/env-schema";

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
const previewEnvironment = parseServerEnv({
  APP_ENV: "preview",
  VERCEL_ENV: "preview",
  APP_ORIGIN: "https://preview.propeptiq.example.invalid",
  CATALOG_DEMO_MODE: "enabled",
  LOCAL_TEST_DRIVER: "disabled",
  LOCAL_TEST_SECRET: "",
  AUTH_MODE: "test",
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_synthetic_task7_preview",
  CLERK_SECRET_KEY: "sk_test_synthetic_task7_preview",
  CLERK_WEBHOOK_SIGNING_SECRET: "",
  RATE_LIMIT_SECRET: "synthetic-task7-preview-rate-limit-secret-0001",
  DATABASE_MODE: "test",
  TEST_DATABASE_URL:
    "postgresql://synthetic_task7:synthetic_password@db.example.invalid/propeptiq_task7_test",
  TEST_DATABASE_CONFIRMATION: "isolated-test-database",
  DATABASE_URL: "",
  DATABASE_MIGRATION_URL: "",
  PAYMENTS_MODE: "test",
  STRIPE_ACCOUNT_ID: "acct_SyntheticTask7Preview",
  STRIPE_SECRET_KEY: "sk_test_synthetic_task7_preview",
  STRIPE_WEBHOOK_SECRET: "whsec_synthetic_task7_preview",
  STORAGE_MODE: "disabled",
  EMAIL_MODE: "disabled",
  TAX_MODE: "disabled",
  SHIPPING_MODE: "disabled",
  FULFILLMENT_MODE: "disabled",
  COMMERCE_LIVE_CAPABILITY: "disabled",
  PAYMENTS_LIVE_CAPABILITY: "disabled",
});
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

function request(
  payload: unknown = body,
  requestOrigin = environment.APP_ORIGIN,
) {
  return new Request(`${requestOrigin}/api/checkout/quote`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "idempotency-key": idempotencyKey,
      origin: requestOrigin,
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

  it("returns the closed no-store envelope without a quote operation for the exact Preview matrix", async () => {
    const previewIdentity = {
      environment: previewEnvironment,
      identity: {
        clerkUserId: "synthetic-preview-buyer",
        primaryEmail: "synthetic-preview-buyer@example.invalid",
        emailVerifiedAt: "2026-08-26T00:00:00.000Z",
        mfaConfigured: false,
        secondFactorCompleted: false,
      },
      principal: {
        actorId: buyerUserId,
        clerkUserId: "synthetic-preview-buyer",
      },
      localDriver: null,
    };
    readServerEnv.mockReturnValue(previewEnvironment);
    getRequestIdentity.mockResolvedValue(previewIdentity);
    createCheckoutServerRuntime.mockResolvedValue(null);

    const response = await POST(
      request(body, previewEnvironment.APP_ORIGIN),
    );

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({
      status: "quote_unavailable",
      component: "commerce",
    });
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
