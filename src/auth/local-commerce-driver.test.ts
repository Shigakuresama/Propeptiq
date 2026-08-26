import { describe, expect, it } from "vitest";

import { afterEach, vi } from "vitest";

import { getLocalTestDriver } from "local-auth-driver";
import { createCheckoutServerRuntime } from "@/commerce/server-runtime";
import type { ServerEnv } from "@/config/env-schema";

const environment = {
  APP_ENV: "local", APP_ORIGIN: "http://127.0.0.1:4631", CATALOG_DEMO_MODE: "enabled", LOCAL_TEST_DRIVER: "enabled",
  LOCAL_TEST_SECRET: "local-commerce-event-secret-at-least-32-characters", RATE_LIMIT_SECRET: "local-commerce-rate-secret-at-least-32-characters",
  VERCEL_ENV: "development", VERCEL_TARGET_ENV: "development", AUTH_MODE: "disabled", DATABASE_MODE: "disabled", PAYMENTS_MODE: "disabled",
  STORAGE_MODE: "disabled", EMAIL_MODE: "disabled", COMMERCE_LIVE_CAPABILITY: "disabled", PAYMENTS_LIVE_CAPABILITY: "disabled",
  TAX_MODE: "test", SHIPPING_MODE: "test", FULFILLMENT_MODE: "test", OTEL_SERVICE_NAME: "propeptiq-labs",
} satisfies ServerEnv;

const eventSecret = "local-commerce-event-secret-at-least-32-characters";
const ownerUserId = "50000000-0000-4000-8000-000000000004";

async function openHostedSession(idempotencyKey: string) {
  const driver = getLocalTestDriver();
  const identity = driver.loadIdentityByClerkId("LOCAL_TEST_ONLY_PROPEPTIQ_91C4E7_NON_ADMIN");
  const principal = identity ? driver.loadPrincipal(identity.clerkUserId) : null;
  const runtime = await createCheckoutServerRuntime({ environment, identity, principal, localDriver: driver });
  const result = await runtime!.startSession({
    buyerUserId: ownerUserId,
    idempotencyKey,
    request: {
      items: [{ productId: "61000000-0000-4000-8000-000000000001", quantity: 2 }],
      destination: { recipientName: "Synthetic Buyer", line1: "100 Test Way", line2: null, city: "Los Angeles", stateCode: "CA", postalCode: "90001", countryCode: "US" },
      promotionIds: ["66000000-0000-4000-8000-000000000001"],
    },
  });
  if (result.status !== "open") throw new Error("expected local open session");
  return {
    driver,
    orderId: result.orderId,
    sessionId: result.url.split("/").at(-1)!,
  };
}

function attemptIdFromSession(sessionId: string): string {
  const value = sessionId.replace("cs_local_synthetic_", "");
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("guarded local commerce driver", () => {
  it("resets deterministically and exposes only the bounded inspection shape", () => {
    const commerce = getLocalTestDriver().commerce;
    const first = commerce.reset();
    const second = commerce.reset();
    expect(second).toEqual(first);
    expect(Object.keys(first).sort()).toEqual([
      "attemptCount", "deliveryCount", "effectCount", "exceptionCount",
      "lastOrderUpdatedAt", "orderCount", "paymentTransitionCount",
      "providerSessionCount", "refundCount", "releaseCount", "reservationCount",
      "reviewRequestCount", "revision", "schemaVersion", "shipmentHandoffCount",
    ].sort());
    expect(JSON.stringify(first)).not.toMatch(/address|email|secret|hash|metadata|providerSessionId/iu);
  });

  it("keeps canonical commerce fixtures separate from historical Task 5 display IDs", () => {
    const driver = getLocalTestDriver();
    const targets = driver.commerce.commandTargets();
    expect(targets.refundId).toMatch(/^[0-9a-f-]{36}$/u);
    expect(targets.fulfillmentOrderId).toMatch(/^[0-9a-f-]{36}$/u);
    expect(driver.loadOrder("50000000-0000-4000-8000-000000000001", "local-order-customer")).not.toBeNull();
  });

  it("keeps hosted return pending until one internally authenticated event and replays once", async () => {
    const driver = getLocalTestDriver();
    driver.commerce.reset();
    vi.stubEnv("LOCAL_TEST_SECRET", eventSecret);
    const created = await openHostedSession("6c000000-0000-4000-8000-000000000001");
    const before = driver.commerce.inspect();
    expect(driver.commerce.returnWithoutEvent({ ownerUserId, sessionId: created.sessionId })).toEqual({
      status: "pending",
      orderId: created.orderId,
    });
    expect(driver.commerce.inspect()).toEqual(before);
    expect(driver.commerce.completeWithInternallySignedEvent({ ownerUserId, sessionId: created.sessionId, secret: eventSecret })).toEqual({
      status: "paid",
      orderId: created.orderId,
    });
    const paid = driver.commerce.inspect();
    expect(paid.paymentTransitionCount).toBe(before.paymentTransitionCount + 1);
    expect(driver.commerce.completeWithInternallySignedEvent({ ownerUserId, sessionId: created.sessionId, secret: eventSecret })).toEqual({
      status: "paid",
      orderId: created.orderId,
    });
    expect(driver.commerce.inspect()).toEqual(paid);
    expect(driver.commerce.loadSuccess(ownerUserId, created.orderId)?.paymentState).toBe("paid");
    expect(driver.commerce.loadSuccess("50000000-0000-4000-8000-000000000001", created.orderId)).toBeNull();
  });

  it("binds internal event verification to the configured secret", async () => {
    const driver = getLocalTestDriver();
    driver.commerce.reset();
    vi.stubEnv("LOCAL_TEST_SECRET", eventSecret);
    const created = await openHostedSession("6c000000-0000-4000-8000-000000000002");
    const before = driver.commerce.inspect();

    expect(driver.commerce.completeWithInternallySignedEvent({
      ownerUserId,
      sessionId: created.sessionId,
      secret: "wrong-local-commerce-secret-at-least-32-characters",
    })).toBeNull();
    expect(driver.commerce.inspect()).toEqual(before);
    expect(driver.commerce.loadSuccess(ownerUserId, created.orderId)?.paymentState).toBe("pending_verification");
  });

  it("rejects completion after provider expiry without a payment transition", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-26T12:00:00.000Z"));
    vi.stubEnv("LOCAL_TEST_SECRET", eventSecret);
    const driver = getLocalTestDriver();
    driver.commerce.reset();
    const created = await openHostedSession("6c000000-0000-4000-8000-000000000003");
    const before = driver.commerce.inspect();
    vi.setSystemTime(new Date("2026-08-28T12:00:00.000Z"));

    expect(driver.commerce.completeWithInternallySignedEvent({
      ownerUserId,
      sessionId: created.sessionId,
      secret: eventSecret,
    })).toBeNull();
    expect(driver.commerce.inspect()).toEqual(before);
  });

  it("rejects completion after the attempt and order become terminal", async () => {
    vi.stubEnv("LOCAL_TEST_SECRET", eventSecret);
    const driver = getLocalTestDriver();
    driver.commerce.reset();
    const created = await openHostedSession("6c000000-0000-4000-8000-000000000004");
    const attemptId = attemptIdFromSession(created.sessionId);
    await driver.commerce.checkoutRepository.releaseDefiniteFailure({
      authority: "authoritative_provider_terminal",
      providerEvidenceId: "synthetic-terminal-evidence",
      attemptId,
      orderId: created.orderId,
      provider: "local_test",
      providerIdempotencyKey: `checkout_attempt:${attemptId}`,
      cause: "definite_rejection",
      targetAttemptStatus: "failed",
    });
    const before = driver.commerce.inspect();

    expect(driver.commerce.completeWithInternallySignedEvent({
      ownerUserId,
      sessionId: created.sessionId,
      secret: eventSecret,
    })).toBeNull();
    expect(driver.commerce.inspect()).toEqual(before);
  });
});
