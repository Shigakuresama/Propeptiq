import { describe, expect, it, vi } from "vitest";

import { parseServerEnv } from "@/config/env-schema";
import type { PaymentProvider } from "@/commerce/payment-provider";
import {
  createProviderExecutionContextV1,
  projectProviderExecutionContextV1,
} from "@/commerce/provider-context";

const buyerUserId = "73000000-0000-4000-8000-000000000001";
const now = new Date("2026-08-25T12:00:00.000Z");
const syntheticNeonAuth = {
  STORAGE_NEON_AUTH_BASE_URL:
    "https://ep-synthetic.neonauth.c-10.us-east-1.aws.neon.tech/neondb/auth",
  NEON_AUTH_COOKIE_SECRET:
    "synthetic-neon-auth-cookie-secret-at-least-32-characters",
} as const;
const identity = Object.freeze({
  clerkUserId: "user_synthetic_6d",
  primaryEmail: "Synthetic.Buyer@Example.Test",
  emailVerifiedAt: "2026-08-25T11:00:00.000Z",
  mfaConfigured: false,
  secondFactorCompleted: false,
});

function fakeProvider(
  provider: "stripe" | "local_test",
  livemode: boolean,
  scope: string,
): PaymentProvider {
  return Object.freeze({
    context: Object.freeze({ provider, livemode, scope }),
    createCheckoutSession: vi.fn(async () => ({
      status: "provider_unknown" as const,
      knownProviderSessionId: null,
      evidenceCode: "provider_sdk_unknown" as const,
    })),
    retrieveCheckoutSession: vi.fn(async () => ({
      status: "provider_unknown" as const,
      knownProviderSessionId: null,
      evidenceCode: "provider_sdk_unknown" as const,
    })),
    createRefund: vi.fn(async () => ({
      status: "provider_unknown" as const,
      knownProviderRefundId: null,
      evidenceCode: "provider_sdk_unknown" as const,
    })),
    retrieveRefund: vi.fn(async () => ({
      status: "provider_unknown" as const,
      knownProviderRefundId: null,
      evidenceCode: "provider_sdk_unknown" as const,
    })),
  });
}

async function create(
  environment: ReturnType<typeof parseServerEnv>,
  adapters: Readonly<{
    stripe?: PaymentProvider | null;
    localTest?: PaymentProvider | null;
  }> = {},
  overrides: Record<string, unknown> = {},
) {
  return createProviderExecutionContextV1({
    environment,
    identity,
    now,
    resolveDatabaseUsersByClerkId: vi.fn(async () => [buyerUserId]),
    adapters: {
      stripe: adapters.stripe ?? null,
      localTest: adapters.localTest ?? null,
    },
    ...overrides,
  });
}

describe("trusted provider execution context", () => {
  it("requires a currently verified identity bound to exactly one database user", async () => {
    const resolver = vi.fn(async () => [buyerUserId]);
    await expect(
      createProviderExecutionContextV1({
        environment: parseServerEnv({}),
        identity: { ...identity, emailVerifiedAt: "2026-08-25T12:00:00.001Z" },
        now,
        resolveDatabaseUsersByClerkId: resolver,
        adapters: { stripe: null, localTest: null },
      }),
    ).resolves.toEqual({ ok: false, reason: "identity_unavailable" });
    expect(resolver).not.toHaveBeenCalled();

    for (const rows of [[], [buyerUserId, "73000000-0000-4000-8000-000000000002"]]) {
      await expect(
        createProviderExecutionContextV1({
          environment: parseServerEnv({}),
          identity,
          now,
          resolveDatabaseUsersByClerkId: async () => rows,
          adapters: { stripe: null, localTest: null },
        }),
      ).resolves.toEqual({ ok: false, reason: "buyer_binding_unavailable" });
    }
  });

  it("mints an opaque disabled context with canonical server identity only", async () => {
    const result = await create(parseServerEnv({}));
    expect(result).toMatchObject({ ok: true });
    if (!result.ok) return;
    expect(projectProviderExecutionContextV1(result.context)).toMatchObject({
      buyerUserId,
      providerCustomerEmail: "synthetic.buyer@example.test",
      provider: null,
      providerScope: null,
      expectedLivemode: null,
      trustedOrigin: null,
      checkoutCreationAvailable: false,
      sessionRecoveryAvailable: false,
      refundProviderAvailable: false,
      eventVerificationAvailable: false,
      adapter: null,
    });
    expect(projectProviderExecutionContextV1({ ...result.context })).toBeNull();
    expect(() => JSON.stringify(result.context)).toThrow(/must never be serialized/i);
  });

  it("selects the local synthetic provider only for the validated local identity", async () => {
    const local = fakeProvider(
      "local_test",
      false,
      "local_test:synthetic-propeptiq-v1",
    );
    const environment = parseServerEnv({
      APP_ENV: "local",
      APP_ORIGIN: "http://127.0.0.1:3000/",
      LOCAL_TEST_DRIVER: "enabled",
      LOCAL_TEST_SECRET: "task6d-local-secret-at-least-32-characters",
      RATE_LIMIT_SECRET: "task6d-rate-limit-at-least-32-characters",
    });
    const result = await create(environment, { localTest: local });
    expect(result).toMatchObject({ ok: true });
    if (!result.ok) return;
    expect(projectProviderExecutionContextV1(result.context)).toMatchObject({
      provider: "local_test",
      providerScope: "local_test:synthetic-propeptiq-v1",
      expectedLivemode: false,
      trustedOrigin: "http://127.0.0.1:3000",
      checkoutCreationAvailable: true,
      sessionRecoveryAvailable: true,
      refundProviderAvailable: true,
      eventVerificationAvailable: true,
      adapter: local,
    });
  });

  it("never falls back to request or header origins when APP_ORIGIN is missing or invalid", async () => {
    const local = fakeProvider(
      "local_test",
      false,
      "local_test:synthetic-propeptiq-v1",
    );
    const result = await create(
      parseServerEnv({
        APP_ENV: "local",
        LOCAL_TEST_DRIVER: "enabled",
        LOCAL_TEST_SECRET: "task6d-local-secret-at-least-32-characters",
        RATE_LIMIT_SECRET: "task6d-rate-limit-at-least-32-characters",
      }),
      { localTest: local },
      {
        requestOrigin: "http://127.0.0.1:3000",
        forwardedHost: "127.0.0.1:3000",
      },
    );
    expect(result).toMatchObject({ ok: true });
    if (!result.ok) return;
    expect(projectProviderExecutionContextV1(result.context)).toMatchObject({
      trustedOrigin: null,
      checkoutCreationAvailable: false,
      sessionRecoveryAvailable: true,
      refundProviderAvailable: true,
    });
  });

  it("selects Stripe test only with a matching nonproduction account scope", async () => {
    const stripe = fakeProvider("stripe", false, "stripe:acct_synthetic123");
    const environment = parseServerEnv({
      APP_ENV: "preview",
      APP_ORIGIN: "https://preview.synthetic.example/",
      PAYMENTS_MODE: "test",
      STRIPE_ACCOUNT_ID: "acct_synthetic123",
      STRIPE_SECRET_KEY: "sk_test_synthetic",
      STRIPE_WEBHOOK_SECRET: "whsec_synthetic",
    });
    const selected = await create(environment, { stripe });
    expect(selected).toMatchObject({ ok: true });
    if (!selected.ok) return;
    expect(projectProviderExecutionContextV1(selected.context)).toMatchObject({
      provider: "stripe",
      providerScope: "stripe:acct_synthetic123",
      expectedLivemode: false,
      trustedOrigin: "https://preview.synthetic.example",
      checkoutCreationAvailable: true,
      sessionRecoveryAvailable: true,
      refundProviderAvailable: true,
      eventVerificationAvailable: true,
    });

    const mismatched = await create(environment, {
      stripe: fakeProvider("stripe", false, "stripe:acct_changed123"),
    });
    expect(mismatched).toMatchObject({ ok: true });
    if (!mismatched.ok) return;
    expect(projectProviderExecutionContextV1(mismatched.context)).toMatchObject({
      checkoutCreationAvailable: false,
      sessionRecoveryAvailable: false,
      refundProviderAvailable: false,
      adapter: null,
    });
  });

  it("keeps live recovery available while explicit new-creation capabilities are closed", async () => {
    const stripe = fakeProvider("stripe", true, "stripe:acct_synthetic123");
    const base = {
      APP_ENV: "production",
      APP_ORIGIN: "https://commerce.synthetic.example",
      AUTH_MODE: "live",
      AUTH_PASSWORD_RESET_SESSION_REVOCATION: "verified",
      ...syntheticNeonAuth,
      DATABASE_MODE: "live",
      PAYMENTS_MODE: "live",
      TAX_MODE: "live",
      SHIPPING_MODE: "live",
      FULFILLMENT_MODE: "live",
      RATE_LIMIT_SECRET: "task6d-rate-limit-at-least-32-characters",
      DATABASE_URL: "postgresql://synthetic.invalid/database?sslmode=require",
      STRIPE_ACCOUNT_ID: "acct_synthetic123",
      STRIPE_SECRET_KEY: "sk_live_synthetic",
      STRIPE_WEBHOOK_SECRET: "whsec_synthetic",
    } as const;
    const closed = await create(parseServerEnv(base), { stripe });
    expect(closed).toMatchObject({ ok: true });
    if (!closed.ok) return;
    expect(projectProviderExecutionContextV1(closed.context)).toMatchObject({
      checkoutCreationAvailable: false,
      sessionRecoveryAvailable: true,
      refundProviderAvailable: true,
      eventVerificationAvailable: true,
    });

    const enabled = await create(
      parseServerEnv({
        ...base,
        COMMERCE_LIVE_CAPABILITY: "enabled",
        PAYMENTS_LIVE_CAPABILITY: "enabled",
      }),
      { stripe },
    );
    expect(enabled).toMatchObject({ ok: true });
    if (!enabled.ok) return;
    expect(projectProviderExecutionContextV1(enabled.context)).toMatchObject({
      checkoutCreationAvailable: true,
      sessionRecoveryAvailable: true,
      refundProviderAvailable: true,
    });
  });
});
