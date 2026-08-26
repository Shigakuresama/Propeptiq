import "server-only";

import { isCanonicalUuid } from "@/commerce/checkout-identity";
import { LOCAL_PAYMENT_PROVIDER_SCOPE } from "@/commerce/checkout-ports";
import type {
  ExpectedProviderContextV1,
  PaymentProvider,
} from "@/commerce/payment-provider";
import { isVerifiedIdentityAt, type VerifiedIdentity } from "@/auth/identity";
import { isLiveCheckoutEnvironmentConfigured } from "@/config/commerce-capability";
import {
  hasProductionIdentity,
  type ServerEnv,
} from "@/config/env-schema";

export type ProviderExecutionContextDataV1 = Readonly<{
  buyerUserId: string;
  providerCustomerEmail: string;
  provider: "stripe" | "local_test" | null;
  providerScope: string | null;
  expectedLivemode: boolean | null;
  trustedOrigin: string | null;
  checkoutCreationAvailable: boolean;
  sessionRecoveryAvailable: boolean;
  refundProviderAvailable: boolean;
  eventVerificationAvailable: boolean;
  adapter: PaymentProvider | null;
}>;

declare const opaqueProviderExecutionContext: unique symbol;
export type ProviderExecutionContextV1 = ProviderExecutionContextDataV1 & {
  readonly [opaqueProviderExecutionContext]: true;
};

type ProviderContextResult =
  | Readonly<{ ok: true; context: ProviderExecutionContextV1 }>
  | Readonly<{
      ok: false;
      reason: "identity_unavailable" | "buyer_binding_unavailable";
    }>;

const contexts = new WeakSet<object>();

function loopbackHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return (
    normalized === "localhost" ||
    normalized === "127.0.0.1" ||
    normalized === "[::1]"
  );
}

function unsafeStripeOriginHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/\.+$/u, "");
  return (
    loopbackHost(normalized) ||
    normalized.endsWith(".localhost") ||
    normalized.endsWith(".local") ||
    normalized.endsWith(".internal") ||
    normalized.includes(":") ||
    /^\d{1,3}(?:\.\d{1,3}){3}$/u.test(normalized)
  );
}

function trustedOrigin(
  rawOrigin: string | undefined,
  provider: "stripe" | "local_test" | null,
): string | null {
  if (provider === null || rawOrigin === undefined || !URL.canParse(rawOrigin)) {
    return null;
  }
  const url = new URL(rawOrigin);
  if (
    url.username !== "" ||
    url.password !== "" ||
    url.pathname !== "/" ||
    url.search !== "" ||
    url.hash !== ""
  ) {
    return null;
  }
  if (provider === "local_test") {
    return url.protocol === "http:" && loopbackHost(url.hostname)
      ? url.origin
      : null;
  }
  return url.protocol === "https:" && !unsafeStripeOriginHost(url.hostname)
    ? url.origin
    : null;
}

function exactAdapter(
  adapter: PaymentProvider | null,
  expected: ExpectedProviderContextV1,
): PaymentProvider | null {
  return adapter !== null &&
    adapter.context.provider === expected.provider &&
    adapter.context.livemode === expected.livemode &&
    adapter.context.scope === expected.scope
    ? adapter
    : null;
}

function localConfigurationCoherent(environment: ServerEnv): boolean {
  return (
    environment.LOCAL_TEST_DRIVER === "enabled" &&
    environment.APP_ENV === "local" &&
    !hasProductionIdentity(environment) &&
    environment.LOCAL_TEST_SECRET !== undefined &&
    environment.RATE_LIMIT_SECRET !== undefined &&
    (environment.VERCEL_ENV === undefined ||
      environment.VERCEL_ENV === "development") &&
    (environment.VERCEL_TARGET_ENV === undefined ||
      environment.VERCEL_TARGET_ENV.trim().toLowerCase() === "development")
  );
}

function stripeConfigurationCoherent(
  environment: ServerEnv,
  livemode: boolean,
): boolean {
  const accountId = environment.STRIPE_ACCOUNT_ID;
  const secretKey = environment.STRIPE_SECRET_KEY;
  const production = hasProductionIdentity(environment);
  return (
    accountId !== undefined &&
    /^acct_[A-Za-z0-9]{8,64}$/u.test(accountId) &&
    environment.STRIPE_WEBHOOK_SECRET?.startsWith("whsec_") === true &&
    (livemode
      ? production &&
        environment.PAYMENTS_MODE === "live" &&
        secretKey?.startsWith("sk_live_") === true
      : !production &&
        environment.PAYMENTS_MODE === "test" &&
        secretKey?.startsWith("sk_test_") === true)
  );
}

function mintContext(
  data: ProviderExecutionContextDataV1,
): ProviderExecutionContextV1 {
  const value = { ...data };
  Object.defineProperty(value, "toJSON", {
    enumerable: false,
    value() {
      throw new Error("Provider execution contexts must never be serialized");
    },
  });
  const context = Object.freeze(value) as ProviderExecutionContextV1;
  contexts.add(context);
  return context;
}

export function projectProviderExecutionContextV1(
  value: unknown,
): ProviderExecutionContextDataV1 | null {
  return typeof value === "object" &&
    value !== null &&
    contexts.has(value)
    ? (value as ProviderExecutionContextDataV1)
    : null;
}

export async function createProviderExecutionContextV1(input: Readonly<{
  environment: ServerEnv;
  identity: VerifiedIdentity | null;
  now: Date;
  resolveDatabaseUsersByClerkId: (
    clerkUserId: string,
  ) => Promise<readonly string[]>;
  adapters: Readonly<{
    stripe: PaymentProvider | null;
    localTest: PaymentProvider | null;
  }>;
}>): Promise<ProviderContextResult> {
  if (input.identity === null || !isVerifiedIdentityAt(input.identity, input.now)) {
    return Object.freeze({ ok: false, reason: "identity_unavailable" });
  }
  const providerCustomerEmail = input.identity.primaryEmail!.toLowerCase();
  if (
    providerCustomerEmail.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(providerCustomerEmail) ||
    /[\u0000-\u001f\u007f]/u.test(providerCustomerEmail)
  ) {
    return Object.freeze({ ok: false, reason: "identity_unavailable" });
  }
  const buyerRows = await input.resolveDatabaseUsersByClerkId(
    input.identity.clerkUserId,
  );
  if (
    !Array.isArray(buyerRows) ||
    buyerRows.length !== 1 ||
    !isCanonicalUuid(buyerRows[0])
  ) {
    return Object.freeze({ ok: false, reason: "buyer_binding_unavailable" });
  }
  let provider: "stripe" | "local_test" | null = null;
  let expectedLivemode: boolean | null = null;
  let providerScope: string | null = null;
  let selectedAdapter: PaymentProvider | null = null;
  let recoveryConfigured = false;

  if (localConfigurationCoherent(input.environment)) {
    provider = "local_test";
    expectedLivemode = false;
    providerScope = LOCAL_PAYMENT_PROVIDER_SCOPE;
    recoveryConfigured = true;
    selectedAdapter = exactAdapter(input.adapters.localTest, {
      provider,
      livemode: expectedLivemode,
      scope: providerScope,
    });
  } else if (
    input.environment.PAYMENTS_MODE === "test" ||
    input.environment.PAYMENTS_MODE === "live"
  ) {
    provider = "stripe";
    expectedLivemode = input.environment.PAYMENTS_MODE === "live";
    providerScope = input.environment.STRIPE_ACCOUNT_ID === undefined
      ? null
      : `stripe:${input.environment.STRIPE_ACCOUNT_ID}`;
    recoveryConfigured =
      providerScope !== null &&
      stripeConfigurationCoherent(input.environment, expectedLivemode);
    selectedAdapter = providerScope === null
      ? null
      : exactAdapter(input.adapters.stripe, {
          provider,
          livemode: expectedLivemode,
          scope: providerScope,
        });
  }

  const origin = trustedOrigin(input.environment.APP_ORIGIN, provider);
  const recoveryAvailable = recoveryConfigured && selectedAdapter !== null;
  const checkoutCreationAvailable =
    recoveryAvailable &&
    origin !== null &&
    (provider === "local_test" ||
      (provider === "stripe" &&
        expectedLivemode === false &&
        !hasProductionIdentity(input.environment)) ||
      (provider === "stripe" &&
        expectedLivemode === true &&
        isLiveCheckoutEnvironmentConfigured(input.environment)));
  return Object.freeze({
    ok: true as const,
    context: mintContext({
      buyerUserId: buyerRows[0]!,
      providerCustomerEmail,
      provider,
      providerScope,
      expectedLivemode,
      trustedOrigin: origin,
      checkoutCreationAvailable,
      sessionRecoveryAvailable: recoveryAvailable,
      refundProviderAvailable: recoveryAvailable,
      eventVerificationAvailable: recoveryAvailable,
      adapter: recoveryAvailable ? selectedAdapter : null,
    }),
  });
}
