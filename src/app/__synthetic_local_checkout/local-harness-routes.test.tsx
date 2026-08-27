import { beforeEach, describe, expect, it, vi } from "vitest";

const { getRequestIdentity, reset, inspect, loadSession, returnWithoutEvent, complete } = vi.hoisted(() => ({
  getRequestIdentity: vi.fn(),
  reset: vi.fn(),
  inspect: vi.fn(),
  loadSession: vi.fn(),
  returnWithoutEvent: vi.fn(),
  complete: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/auth/server", () => ({ getRequestIdentity }));

import { GET as hostedRoute } from "@/app/__synthetic_local_checkout/[sessionId]/route";
import { POST as completeRoute } from "@/app/__synthetic_local_checkout/[sessionId]/complete/route";
import { POST as returnRoute } from "@/app/__synthetic_local_checkout/[sessionId]/return/route";
import { GET as inspectRoute } from "@/app/api/__local/commerce/inspect/route";
import { POST as resetRoute } from "@/app/api/__local/commerce/reset/route";

const origin = "http://127.0.0.1:4631";
const ownerId = "50000000-0000-4000-8000-000000000004";
const orderId = "71000000-0000-4000-8000-000000000001";
const sessionId = "cs_local_synthetic_71000000000040008000000000000001";
const secret = "local-harness-route-secret-at-least-32-characters";
const snapshot = {
  schemaVersion: 1,
  revision: 0,
  orderCount: 0,
  attemptCount: 0,
  providerSessionCount: 0,
  reviewRequestCount: 0,
  reservationCount: 0,
  paymentTransitionCount: 0,
  refundCount: 0,
  releaseCount: 0,
  shipmentHandoffCount: 0,
  deliveryCount: 0,
  exceptionCount: 0,
  effectCount: 0,
  lastOrderUpdatedAt: null,
};

function routeRequest(path: string, method: "GET" | "POST") {
  return new Request(`${origin}${path}`, { method, headers: { origin } });
}

describe("guarded local commerce routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    reset.mockReturnValue(snapshot);
    inspect.mockReturnValue(snapshot);
    loadSession.mockReturnValue({ orderId, sessionId, totalMinor: 5_141, currency: "USD" });
    returnWithoutEvent.mockReturnValue({ status: "pending", orderId });
    complete.mockReturnValue({ status: "paid", orderId });
    getRequestIdentity.mockResolvedValue({
      environment: {
        APP_ENV: "local", APP_ORIGIN: origin, CATALOG_DEMO_MODE: "enabled", LOCAL_TEST_DRIVER: "enabled",
        LOCAL_TEST_SECRET: secret, RATE_LIMIT_SECRET: "local-harness-rate-secret-at-least-32-characters",
        VERCEL_ENV: "development", VERCEL_TARGET_ENV: "development", AUTH_MODE: "disabled", DATABASE_MODE: "disabled",
        PAYMENTS_MODE: "disabled", STORAGE_MODE: "disabled", EMAIL_MODE: "disabled", COMMERCE_LIVE_CAPABILITY: "disabled",
        PAYMENTS_LIVE_CAPABILITY: "disabled", TAX_MODE: "test", SHIPPING_MODE: "test", FULFILLMENT_MODE: "test",
        OTEL_SERVICE_NAME: "propeptiq-labs",
      },
      identity: {
        clerkUserId: "local-customer", primaryEmail: "customer@example.test",
        emailVerifiedAt: "2026-08-26T00:00:00.000Z", mfaConfigured: false, secondFactorCompleted: false,
      },
      principal: { actorId: ownerId, clerkUserId: "local-customer", buyerStatus: "active", capabilities: [], mfaSatisfied: false },
      localDriver: { commerce: { reset, inspect, loadSyntheticHostedSession: loadSession, returnWithoutEvent, completeWithInternallySignedEvent: complete } },
    });
  });

  it("resets and inspects only the bounded synthetic snapshot", async () => {
    const resetResponse = await resetRoute(routeRequest("/api/__local/commerce/reset", "POST"));
    const inspectResponse = await inspectRoute(routeRequest("/api/__local/commerce/inspect", "GET"));
    expect(resetResponse.status).toBe(200);
    expect(inspectResponse.status).toBe(200);
    await expect(resetResponse.json()).resolves.toEqual(snapshot);
    await expect(inspectResponse.json()).resolves.toEqual(snapshot);
    expect(reset).toHaveBeenCalledOnce();
    expect(inspect).toHaveBeenCalledOnce();
  });

  it("renders the owner session without exposing the secret or generated HMAC", async () => {
    const response = await hostedRoute(
      routeRequest(`/__synthetic_local_checkout/${sessionId}`, "GET"),
      { params: Promise.resolve({ sessionId }) },
    );
    const markup = await response.text();
    expect(response.status).toBe(200);
    expect(markup).toContain("Synthetic local test only");
    expect(markup).toContain("$51.41");
    expect(markup).toContain("Return without payment event");
    expect(markup).toContain("Complete synthetic checkout");
    expect(markup).not.toContain(secret);
    expect(markup).not.toMatch(/[a-f0-9]{64}/u);
  });

  it("keeps return pending and completes only through the driver-owned internal event", async () => {
    const pending = await returnRoute(routeRequest(`/__synthetic_local_checkout/${sessionId}/return`, "POST"), { params: Promise.resolve({ sessionId }) });
    const paid = await completeRoute(routeRequest(`/__synthetic_local_checkout/${sessionId}/complete`, "POST"), { params: Promise.resolve({ sessionId }) });
    expect(pending.status).toBe(303);
    expect(paid.status).toBe(303);
    expect(pending.headers.get("location")).toBe(`${origin}/checkout/success/${orderId}`);
    expect(returnWithoutEvent).toHaveBeenCalledWith({ ownerUserId: ownerId, sessionId });
    expect(complete).toHaveBeenCalledWith({ ownerUserId: ownerId, sessionId, secret });
  });

  it("returns the same 404 with no harness call when a guard fails", async () => {
    getRequestIdentity.mockResolvedValue({ environment: { APP_ENV: "production" }, identity: null, principal: null, localDriver: null });
    const response = await resetRoute(routeRequest("/api/__local/commerce/reset", "POST"));
    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(reset).not.toHaveBeenCalled();
  });
});
