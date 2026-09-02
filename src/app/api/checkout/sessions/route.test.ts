import { beforeEach, describe, expect, it, vi } from "vitest";

import { parseServerEnv } from "@/config/env-schema";

const { getRequestIdentity, createCheckoutServerRuntime, startSession, readServerEnv } = vi.hoisted(() => ({
  getRequestIdentity: vi.fn(),
  createCheckoutServerRuntime: vi.fn(),
  startSession: vi.fn(),
  readServerEnv: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/auth/server", () => ({ getRequestIdentity }));
vi.mock("@/commerce/server-runtime", () => ({ createCheckoutServerRuntime }));
vi.mock("@/env", () => ({ readServerEnv }));

import { POST, dynamic } from "./route";

const buyerUserId = "50000000-0000-4000-8000-000000000004";
const idempotencyKey = "6e000000-0000-4000-8000-000000000001";
const origin = "http://127.0.0.1:4631";
const syntheticBetterAuth = {
  BETTER_AUTH_SECRET:
    "synthetic-better-auth-secret-material-0123456789ABCDEF",
  RESEND_API_KEY: "re_synthetic_auth_test",
  RESEND_FROM: "accounts@example.test",
} as const;
const previewEnvironment = parseServerEnv({
  APP_ENV: "preview",
  VERCEL_ENV: "preview",
  APP_ORIGIN: "https://preview.propeptiq.example.invalid",
  CATALOG_DEMO_MODE: "enabled",
  LOCAL_TEST_DRIVER: "disabled",
  LOCAL_TEST_SECRET: "",
  AUTH_MODE: "test",
  ...syntheticBetterAuth,
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
  EMAIL_MODE: "test",
  TAX_MODE: "disabled",
  SHIPPING_MODE: "disabled",
  FULFILLMENT_MODE: "disabled",
  COMMERCE_LIVE_CAPABILITY: "disabled",
  PAYMENTS_LIVE_CAPABILITY: "disabled",
});
const body = {
  items: [{ variantId: "20000000-0000-4000-8000-000000000001", quantity: 2 }],
  destination: {
    recipientName: "Synthetic Research Buyer",
    line1: "100 Test Way",
    line2: null,
    city: "Los Angeles",
    stateCode: "CA",
    postalCode: "90001",
    countryCode: "US",
  },
  pricingRevision: "a".repeat(64),
};

function request(requestOrigin = origin, payload: unknown = body) {
  return new Request(`${requestOrigin}/api/checkout/sessions`, {
    method: "POST",
    headers: { "content-type": "application/json", "idempotency-key": idempotencyKey, origin: requestOrigin },
    body: JSON.stringify(payload),
  });
}

describe("POST /api/checkout/sessions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    readServerEnv.mockReturnValue({ APP_ENV: "local", APP_ORIGIN: origin });
    getRequestIdentity.mockResolvedValue({
      environment: { APP_ENV: "local", APP_ORIGIN: origin, RATE_LIMIT_SECRET: "route-test-rate-limit-secret-at-least-32-characters" },
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
    startSession.mockResolvedValue({
      status: "open",
      orderId: "6f000000-0000-4000-8000-000000000001",
      url: `${origin}/__synthetic_local_checkout/70000000-0000-4000-8000-000000000001`,
      expiresAt: "2026-08-26T21:30:00.000Z",
    });
    createCheckoutServerRuntime.mockResolvedValue({
      buyerUserId,
      rateLimitStore: { increment: vi.fn().mockResolvedValue(1) },
      quoteCheckout: vi.fn(),
      startSession,
    });
  });

  it("is dynamic and returns only the normalized hosted-session projection", async () => {
    expect(dynamic).toBe("force-dynamic");
    const response = await POST(request());
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      status: "open",
      orderId: "6f000000-0000-4000-8000-000000000001",
      hostedUrl: `${origin}/__synthetic_local_checkout/70000000-0000-4000-8000-000000000001`,
      expiresAt: "2026-08-26T21:30:00.000Z",
    });
    expect(startSession).toHaveBeenCalledWith({
      buyerUserId,
      idempotencyKey,
      request: body,
      attributionCookie: null,
    });
  });

  it("returns exact 409 PRICE_CHANGED with refreshed safe variant lines and no hosted URL", async () => {
    startSession.mockResolvedValueOnce({
      status: "PRICE_CHANGED",
      pricingRevision: "b".repeat(64),
      cart: {
        items: [{
          variantId: "20000000-0000-4000-8000-000000000001",
          quantity: 2,
          available: true,
          name: "Synthetic local test only — Alpha",
          variantLabel: "5 mg test fixture",
          unitAmountMinor: 1_680,
          lineSubtotalMinor: 3_360,
          currency: "USD",
        }],
        subtotalMinor: 3_360,
        currency: "USD",
        taxMinor: null,
        shippingMinor: null,
        finalDiscountMinor: null,
      },
    });

    const response = await POST(request());
    expect(response.status).toBe(409);
    const result = await response.json();
    expect(result).toEqual({
      status: "PRICE_CHANGED",
      pricingRevision: "b".repeat(64),
      cart: expect.objectContaining({
        items: [expect.objectContaining({
          variantId: "20000000-0000-4000-8000-000000000001",
          unitAmountMinor: 1_680,
        })],
      }),
    });
    expect(JSON.stringify(result)).not.toMatch(/stripe|provider|productId/iu);
  });

  it.each([
    ["pricingRevision", undefined],
    ["pricingRevision", "a".repeat(63)],
    ["productId", "20000000-0000-4000-8000-000000000010"],
    ["promotionIds", ["winter30"]],
    ["totalMinor", 3_360],
  ])("rejects hostile or missing session authority %s before runtime delegation", async (field, value) => {
    const payload = { ...body } as Record<string, unknown>;
    if (value === undefined) delete payload[field];
    else payload[field] = value;
    const response = await POST(request(origin, payload));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ status: "invalid_request" });
    expect(startSession).not.toHaveBeenCalled();
  });

  it("returns the closed no-store envelope without a session operation for the exact Preview matrix", async () => {
    readServerEnv.mockReturnValue(previewEnvironment);
    getRequestIdentity.mockResolvedValue({
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
    });
    createCheckoutServerRuntime.mockResolvedValue(null);

    const response = await POST(request(previewEnvironment.APP_ORIGIN));

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({ status: "unavailable" });
    expect(startSession).not.toHaveBeenCalled();
  });
});
