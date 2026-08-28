import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getLocalTestDriver } from "local-auth-driver";
import {
  createCheckoutServerRuntime,
  createStaffCommerceServerRuntime,
  isBuyerCheckoutRuntimeReady,
} from "@/commerce/server-runtime";
import { parseServerEnv, type ServerEnv } from "@/config/env-schema";
import { createAttributionCookie } from "@/growth/attribution-cookie";

const origin = "http://127.0.0.1:4631";
const localEnvironment = {
  APP_ENV: "local",
  APP_ORIGIN: origin,
  CATALOG_DEMO_MODE: "enabled",
  LOCAL_TEST_DRIVER: "enabled",
  LOCAL_TEST_SECRET: "server-runtime-test-secret-at-least-32-characters",
  RATE_LIMIT_SECRET: "server-runtime-rate-secret-at-least-32-characters",
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
} satisfies ServerEnv;

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

function requestForActor(actorKey: "non_admin" | "admin") {
  const driver = getLocalTestDriver();
  const signed = driver.signActor(actorKey, localEnvironment.LOCAL_TEST_SECRET!);
  const identity = driver.resolveIdentity(signed ?? undefined, localEnvironment.LOCAL_TEST_SECRET!);
  const principal = identity ? driver.loadPrincipal(identity.clerkUserId) : null;
  return { environment: localEnvironment, identity, principal, localDriver: driver };
}

const checkoutRequest = {
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
} as const;
const idempotencyKey = "6b000000-0000-4000-8000-000000000001";
const localAffiliateCode = "aff_LocalRuntimePartner01";
const localAffiliateProfileId = "6b000000-0000-4000-8000-000000000021";
const localAffiliateUserId = "6b000000-0000-4000-8000-000000000022";
const localReferralCode = "ref_LocalRuntimeReferrer01";
const localReferralCodeId = "6b000000-0000-4000-8000-000000000031";
const localReferrerUserId = "6b000000-0000-4000-8000-000000000032";

describe("commerce server composition", () => {
  beforeEach(() => getLocalTestDriver().commerce.reset());
  afterEach(() => vi.useRealTimers());

  it("reports buyer checkout ready only for the guarded local request and not the exact Preview matrix", async () => {
    const localRequest = requestForActor("non_admin");
    expect(isBuyerCheckoutRuntimeReady(localRequest)).toBe(true);

    const previewRequest = {
      ...localRequest,
      environment: previewEnvironment,
      localDriver: null,
    };
    expect(isBuyerCheckoutRuntimeReady(previewRequest)).toBe(false);
    await expect(createCheckoutServerRuntime(previewRequest)).resolves.toBeNull();
  });

  it("composes the existing checkout service/orchestrator over one local adapter", async () => {
    const request = requestForActor("non_admin");
    const runtime = await createCheckoutServerRuntime(request);
    expect(runtime).not.toBeNull();
    const quoted = await runtime!.quoteCheckout({
      buyerUserId: request.principal!.actorId,
      idempotencyKey,
      request: checkoutRequest,
    });
    expect(quoted).toMatchObject({
      status: "quoted",
      quote: {
        subtotalMinor: 4_800,
        discountMinor: 480,
        shippingMinor: 500,
        taxMinor: 321,
        totalMinor: 5_141,
      },
    });
    const opened = await runtime!.startSession({
      buyerUserId: request.principal!.actorId,
      idempotencyKey,
      request: checkoutRequest,
    });
    expect(opened).toMatchObject({ status: "open" });
    if (opened.status === "open") {
      expect(opened.url.startsWith(`${origin}/__synthetic_local_checkout/`)).toBe(true);
    }
    await expect(runtime!.startSession({
      buyerUserId: request.principal!.actorId,
      idempotencyKey,
      request: checkoutRequest,
    })).resolves.toEqual(opened);
    expect(request.localDriver.commerce.inspect()).toMatchObject({
      orderCount: 1,
      attemptCount: 1,
      providerSessionCount: 1,
      reservationCount: 1,
    });
  });

  it("binds a real signed affiliate cookie through the unmodified deterministic driver", async () => {
    const fixedNow = new Date("2026-08-28T12:00:00.000Z");
    vi.useFakeTimers();
    vi.setSystemTime(fixedNow);
    const request = requestForActor("non_admin");
    const cookie = createAttributionCookie({
      schemaVersion: 1,
      program: "affiliate",
      code: localAffiliateCode,
      issuedAt: fixedNow.toISOString(),
      expiresAt: "2026-09-27T12:00:00.000Z",
    }, {
      environment: "local",
      now: fixedNow,
      secret: localEnvironment.RATE_LIMIT_SECRET,
    });
    expect(cookie).not.toBeNull();
    const runtime = await createCheckoutServerRuntime(request);
    const quoted = await runtime!.quoteCheckout({
      buyerUserId: request.principal!.actorId,
      idempotencyKey,
      attributionCookie: cookie!.value,
      request: checkoutRequest,
    });

    expect(quoted.status).toBe("quoted");
    if (quoted.status !== "quoted") throw new Error("expected affiliate runtime quote");
    expect(quoted.plan.affiliateQuote).toMatchObject({
      status: "eligible",
      code: localAffiliateCode,
      affiliateProfileId: localAffiliateProfileId,
      affiliateUserId: localAffiliateUserId,
      clickedAt: fixedNow.toISOString(),
      expiresAt: "2026-09-27T12:00:00.000Z",
    });
    expect(quoted.plan.referralQuote).toBeNull();
    expect(JSON.stringify(quoted.quote)).not.toContain(localAffiliateProfileId);
    expect(JSON.stringify(quoted.quote)).not.toContain(localAffiliateUserId);
    expect(quoted.quote).not.toHaveProperty("affiliate");
    expect(quoted.quote).not.toHaveProperty("commission");
  });

  it("applies and binds a real signed customer-referral cookie through the unmodified deterministic driver", async () => {
    const fixedNow = new Date("2026-08-28T12:00:00.000Z");
    vi.useFakeTimers();
    vi.setSystemTime(fixedNow);
    const request = requestForActor("non_admin");
    const cookie = createAttributionCookie({
      schemaVersion: 1,
      program: "customer_referral",
      code: localReferralCode,
      issuedAt: fixedNow.toISOString(),
      expiresAt: "2026-09-27T12:00:00.000Z",
    }, {
      environment: "local",
      now: fixedNow,
      secret: localEnvironment.RATE_LIMIT_SECRET,
    });
    expect(cookie).not.toBeNull();
    const runtime = await createCheckoutServerRuntime(request);
    const quoted = await runtime!.quoteCheckout({
      buyerUserId: request.principal!.actorId,
      idempotencyKey: "6b000000-0000-4000-8000-000000000002",
      attributionCookie: cookie!.value,
      request: { ...checkoutRequest, promotionIds: [] },
    });

    expect(quoted.status).toBe("quoted");
    if (quoted.status !== "quoted") throw new Error("expected referral runtime quote");
    expect(quoted.quote).toMatchObject({
      discountMinor: 480,
      referralDiscountMinor: 480,
    });
    expect(quoted.plan.referralQuote).toMatchObject({
      status: "eligible",
      code: localReferralCode,
      referralCodeId: localReferralCodeId,
      referrerUserId: localReferrerUserId,
      clickedAt: fixedNow.toISOString(),
      expiresAt: "2026-09-27T12:00:00.000Z",
    });
    expect(quoted.plan.affiliateQuote).toBeNull();
    const browserQuote = JSON.stringify(quoted.quote);
    expect(browserQuote).not.toContain(localReferralCode);
    expect(browserQuote).not.toContain(localReferralCodeId);
    expect(browserQuote).not.toContain(localReferrerUserId);
    expect(quoted.quote).not.toHaveProperty("referrer");
    expect(quoted.quote).not.toHaveProperty("reward");
    const opened = await runtime!.startSession({
      buyerUserId: request.principal!.actorId,
      idempotencyKey: "6b000000-0000-4000-8000-000000000002",
      attributionCookie: cookie!.value,
      request: { ...checkoutRequest, promotionIds: [] },
    });
    expect(opened).toMatchObject({ status: "open" });
    expect(request.localDriver.commerce.inspect()).toMatchObject({
      orderCount: 1,
      attemptCount: 1,
      providerSessionCount: 1,
    });
  });

  it("fails closed without mutation for every mismatch in the exact local commerce matrix", async () => {
    const request = requestForActor("non_admin");
    await expect(createCheckoutServerRuntime({ ...request, principal: null })).resolves.toBeNull();
    const mismatches: readonly [string, Partial<ServerEnv>][] = [
      ["APP_ENV", { APP_ENV: "preview" }],
      ["APP_ORIGIN host", { APP_ORIGIN: "http://localhost:4631" }],
      ["APP_ORIGIN port", { APP_ORIGIN: "http://127.0.0.1:4632" }],
      ["LOCAL_TEST_DRIVER", { LOCAL_TEST_DRIVER: "disabled" }],
      ["CATALOG_DEMO_MODE", { CATALOG_DEMO_MODE: "disabled" }],
      ["AUTH_MODE", { AUTH_MODE: "test" }],
      ["DATABASE_MODE", { DATABASE_MODE: "test" }],
      ["PAYMENTS_MODE", { PAYMENTS_MODE: "test" }],
      ["STORAGE_MODE", { STORAGE_MODE: "test" }],
      ["EMAIL_MODE", { EMAIL_MODE: "test" }],
      ["TAX_MODE", { TAX_MODE: "disabled" }],
      ["SHIPPING_MODE", { SHIPPING_MODE: "disabled" }],
      ["FULFILLMENT_MODE", { FULFILLMENT_MODE: "disabled" }],
      ["COMMERCE_LIVE_CAPABILITY", { COMMERCE_LIVE_CAPABILITY: "enabled" }],
      ["PAYMENTS_LIVE_CAPABILITY", { PAYMENTS_LIVE_CAPABILITY: "enabled" }],
      ["LOCAL_TEST_SECRET missing", { LOCAL_TEST_SECRET: undefined }],
      ["LOCAL_TEST_SECRET short", { LOCAL_TEST_SECRET: "short" }],
      ["RATE_LIMIT_SECRET missing", { RATE_LIMIT_SECRET: undefined }],
      ["RATE_LIMIT_SECRET short", { RATE_LIMIT_SECRET: "short" }],
      ["VERCEL_ENV", { VERCEL_ENV: "preview" }],
      ["VERCEL_TARGET_ENV", { VERCEL_TARGET_ENV: "preview" }],
    ];
    for (const [label, mismatch] of mismatches) {
      const before = request.localDriver.commerce.inspect();
      const incoherent = {
        ...request,
        environment: { ...localEnvironment, ...mismatch } as ServerEnv,
      };
      expect(isBuyerCheckoutRuntimeReady(incoherent), label).toBe(false);
      await expect(createCheckoutServerRuntime(incoherent), label).resolves.toBeNull();
      await expect(
        createStaffCommerceServerRuntime(incoherent, `matrix-${label}`),
        `${label} staff runtime`,
      ).resolves.toBeNull();
      expect(request.localDriver.commerce.inspect(), `${label} mutation`).toEqual(before);
    }
  });

  it("composes existing staff refund and fulfillment commands for the capable local actor", async () => {
    const request = requestForActor("admin");
    const runtime = await createStaffCommerceServerRuntime(request, "task6g-runtime-test");
    expect(runtime).not.toBeNull();
    const targets = request.localDriver.commerce.commandTargets();
    await expect(runtime!.submitOrRecoverRefund(targets.refundId)).resolves.toMatchObject({ status: "submitted" });
    await expect(runtime!.submitOrRecoverRefund(targets.refundId)).resolves.toMatchObject({ status: "submitted" });
    await expect(runtime!.clearFulfillmentHold(targets.fulfillmentOrderId)).resolves.toEqual({ status: "cleared" });
    await expect(runtime!.clearFulfillmentHold(targets.fulfillmentOrderId)).resolves.toEqual({ status: "already_clear" });
    await expect(runtime!.handoffFulfillment(targets.fulfillmentOrderId)).resolves.toEqual({ status: "handed_off" });
    await expect(runtime!.handoffFulfillment(targets.fulfillmentOrderId)).resolves.toEqual({ status: "already_handed_off" });
    await expect(runtime!.markShipmentDelivered(targets.fulfillmentOrderId)).resolves.toEqual({ status: "delivered" });
    await expect(runtime!.markShipmentDelivered(targets.fulfillmentOrderId)).resolves.toEqual({ status: "already_delivered" });
  });

  it("assembles the typed PostgreSQL/Stripe staff runtime without performing a provider call", async () => {
    const request = requestForActor("admin");
    const environment = {
      ...localEnvironment,
      APP_ORIGIN: "https://test.example.com",
      LOCAL_TEST_DRIVER: "disabled",
      CATALOG_DEMO_MODE: "disabled",
      AUTH_MODE: "test",
      DATABASE_MODE: "test",
      TEST_DATABASE_URL: "postgresql://slice6g.invalid/test",
      PAYMENTS_MODE: "test",
      STRIPE_SECRET_KEY: "sk_test_slice6g_offline_configuration_only",
      STRIPE_WEBHOOK_SECRET: "whsec_slice6g_offline_configuration_only",
      STRIPE_ACCOUNT_ID: "acct_Slice6GTest01",
    } satisfies ServerEnv;
    const runtime = await createStaffCommerceServerRuntime({
      ...request,
      environment,
      localDriver: null,
    }, "task6g-postgres-runtime-test");
    expect(runtime).not.toBeNull();
  });
});
