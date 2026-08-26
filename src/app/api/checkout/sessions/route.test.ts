import { beforeEach, describe, expect, it, vi } from "vitest";

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

function request() {
  return new Request(`${origin}/api/checkout/sessions`, {
    method: "POST",
    headers: { "content-type": "application/json", "idempotency-key": idempotencyKey, origin },
    body: JSON.stringify(body),
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
    expect(startSession).toHaveBeenCalledWith({ buyerUserId, idempotencyKey, request: body });
  });
});
