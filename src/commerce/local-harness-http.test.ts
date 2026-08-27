import { describe, expect, it } from "vitest";

import type { RequestIdentity } from "@/auth/server";
import { authorizeLocalCommerceHarness } from "@/commerce/local-harness-http";

const origin = "http://127.0.0.1:4631";
const ownerId = "50000000-0000-4000-8000-000000000004";
const secret = "local-harness-test-secret-at-least-32-characters";

function identity(overrides: Record<string, unknown> = {}): RequestIdentity {
  return {
    environment: {
      APP_ENV: "local",
      APP_ORIGIN: origin,
      CATALOG_DEMO_MODE: "enabled",
      LOCAL_TEST_DRIVER: "enabled",
      LOCAL_TEST_SECRET: secret,
      RATE_LIMIT_SECRET: "local-harness-rate-secret-at-least-32-characters",
      VERCEL_ENV: "development",
      VERCEL_TARGET_ENV: "development",
      AUTH_MODE: "disabled",
      DATABASE_MODE: "disabled",
      PAYMENTS_MODE: "disabled",
      STORAGE_MODE: "disabled",
      EMAIL_MODE: "disabled",
      COMMERCE_LIVE_CAPABILITY: "disabled",
      PAYMENTS_LIVE_CAPABILITY: "disabled",
      TAX_MODE: "test",
      SHIPPING_MODE: "test",
      FULFILLMENT_MODE: "test",
      OTEL_SERVICE_NAME: "propeptiq-labs",
      ...(overrides.environment as object | undefined),
    },
    identity: {
      clerkUserId: "local-customer",
      primaryEmail: "customer@example.test",
      emailVerifiedAt: "2026-08-26T00:00:00.000Z",
      mfaConfigured: false,
      secondFactorCompleted: false,
    },
    principal: {
      actorId: ownerId,
      clerkUserId: "local-customer",
      buyerStatus: "active",
      capabilities: [],
      mfaSatisfied: false,
    },
    localDriver: { commerce: {} } as RequestIdentity["localDriver"],
    ...overrides,
  } as RequestIdentity;
}

function request(requestOrigin = origin, requestUrl = `${origin}/api/__local/commerce/reset`) {
  return new Request(requestUrl, { headers: { origin: requestOrigin } });
}

describe("local commerce harness guard", () => {
  it("permits only the exact local-development test matrix and verified owner binding", () => {
    const result = authorizeLocalCommerceHarness({
      request: request(),
      requestIdentity: identity(),
      requireOriginHeader: true,
      requireOwner: true,
    });
    expect(result).toMatchObject({ ownerUserId: ownerId, secret });
  });

  it("accepts Next local request URL canonicalization only with exact trusted Host and Origin headers", () => {
    const canonicalized = new Request("http://localhost:4631/api/__local/commerce/reset", {
      headers: { origin, host: "127.0.0.1:4631" },
    });
    expect(authorizeLocalCommerceHarness({
      request: canonicalized,
      requestIdentity: identity(),
      requireOriginHeader: true,
      requireOwner: false,
    })).not.toBeNull();
    const wrongHost = new Request("http://localhost:4631/api/__local/commerce/reset", {
      headers: { origin, host: "localhost:4631" },
    });
    expect(authorizeLocalCommerceHarness({
      request: wrongHost,
      requestIdentity: identity(),
      requireOriginHeader: true,
      requireOwner: false,
    })).toBeNull();
  });

  it.each([
    ["production identity", { APP_ENV: "production", VERCEL_ENV: "production", VERCEL_TARGET_ENV: "production" }],
    ["preview identity", { APP_ENV: "preview", VERCEL_ENV: "preview", VERCEL_TARGET_ENV: "preview" }],
    ["disabled driver", { LOCAL_TEST_DRIVER: "disabled" }],
    ["missing secret", { LOCAL_TEST_SECRET: undefined }],
    ["enabled database", { DATABASE_MODE: "test" }],
    ["enabled payments", { PAYMENTS_MODE: "test" }],
    ["disabled tax test double", { TAX_MODE: "disabled" }],
  ])("denies %s", (_label, environment) => {
    expect(authorizeLocalCommerceHarness({
      request: request(),
      requestIdentity: identity({ environment }),
      requireOriginHeader: true,
      requireOwner: false,
    })).toBeNull();
  });

  it("denies wrong origin, non-local hosts, missing driver, and ambiguous owner without throwing", () => {
    const cases = [
      { request: request("http://localhost:9999"), requestIdentity: identity() },
      { request: request("https://example.test", "https://example.test/api/__local/commerce/reset"), requestIdentity: identity({ environment: { APP_ORIGIN: "https://example.test" } }) },
      { request: request(), requestIdentity: identity({ localDriver: null }) },
      { request: request(), requestIdentity: identity({ principal: null }) },
      { request: request(), requestIdentity: identity({ identity: null }) },
    ];
    for (const candidate of cases) {
      expect(authorizeLocalCommerceHarness({
        ...candidate,
        requireOriginHeader: true,
        requireOwner: true,
      })).toBeNull();
    }
  });
});
