import "server-only";

import { createHash, randomBytes, randomUUID } from "node:crypto";

import Stripe from "stripe";
import type { QueryResultRow } from "pg";

import type { RequestIdentity } from "@/auth/server";
import {
  createCheckoutService,
  type CheckoutQuoteResult,
  type CheckoutSessionQuoteResult,
} from "@/commerce/checkout-service";
import { createProviderCheckoutOrchestrator, type ProviderCheckoutRouteResult } from "@/commerce/provider-checkout-orchestration";
import { createProviderExecutionContextV1 } from "@/commerce/provider-context";
import { createProviderEventServiceV1 } from "@/commerce/provider-event-service";
import { createProviderEventAuthorityV1 } from "@/commerce/stripe-webhook-verifier";
import {
  STRIPE_API_VERSION,
  createRuntimeStripePaymentProvider,
} from "@/commerce/stripe-payment-provider";
import { createStripeShippingQuotePort } from "@/commerce/stripe-shipping-provider";
import { createStripeTaxQuotePort } from "@/commerce/stripe-tax-provider";
import { createStaffCommerceCommandRuntimeV1, type StaffCommerceCommandRuntimeV1 } from "@/commerce/staff-commerce-command-runtime";
import { isSyntheticLocalCommerceEnvironmentConfigured } from "@/config/commerce-capability";
import { createPostgresAdminRepository, type AdminTransactionRunner } from "@/db/repositories/admin-repository";
import { createPostgresCheckoutRepository } from "@/db/repositories/checkout-repository";
import { createProviderSessionRepository } from "@/db/repositories/provider-session-repository";
import { createFulfillmentRepository } from "@/db/repositories/fulfillment-repository";
import {
  createProviderEventRepository,
  createProviderEventTransactionRunner,
} from "@/db/repositories/provider-event-repository";
import { createPostgresRateLimitStore } from "@/db/repositories/rate-limit-store";
import { createRefundFulfillmentRepository } from "@/db/repositories/refund-fulfillment-repository";
import type { GrowthTransactionRunner } from "@/db/repositories/growth-repository";
import { connectRuntimeDatabaseSession, withRuntimeTransaction } from "@/db/runtime";
import { readServerEnv } from "@/env";
import { createAffiliateCheckoutService } from "@/growth/affiliate-service";
import { verifyAttributionCookie } from "@/growth/attribution-cookie";
import { createReferralCheckoutService } from "@/growth/referral-service";
import {
  createPostgresRewardsCheckoutAtomicPort,
  createPostgresRewardsLifecycleService,
  createRewardsService,
} from "@/growth/rewards-service";
import { createPostgresAffiliateCheckoutService } from "@/growth/affiliate-service";
import { createPostgresReferralCheckoutService } from "@/growth/referral-service";
import type { RateLimitStore } from "@/security/rate-limit";

export type CheckoutServerRuntimeV1 = Readonly<{
  buyerUserId: string;
  rateLimitStore: RateLimitStore;
  quoteCheckout: (input: Readonly<{
    buyerUserId: string;
    idempotencyKey: string;
    request: unknown;
    attributionCookie?: string | null;
  }>) => Promise<CheckoutQuoteResult>;
  startSession: (input: Readonly<{
    buyerUserId: string;
    idempotencyKey: string;
    request: unknown;
    attributionCookie?: string | null;
  }>) => Promise<ProviderCheckoutRouteResult | Extract<
    CheckoutSessionQuoteResult,
    Readonly<{ status: "PRICE_CHANGED" | "CHECKOUT_UNAVAILABLE" }>
  >>;
}>;

export type StripeWebhookServerRuntimeV1 = Readonly<{
  handleDelivery: ReturnType<typeof createProviderEventServiceV1>["handleDelivery"];
}>;

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function deterministicUuid(value: string): string {
  const bytes = Buffer.from(sha256(value).slice(0, 32), "hex");
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function runtimeNow(): Date {
  return new Date(Math.floor(Date.now() / 1_000) * 1_000);
}

const rewardsDisabledLifecycle = Object.freeze({
  async reconcileProcessedProviderEvent() {
    return Object.freeze({ status: "idempotent" as const });
  },
  async reconcileDeliveredOrder() {
    return Object.freeze({ status: "idempotent" as const });
  },
});

function createRuntimeRewardsLifecycle(environment: ReturnType<typeof readServerEnv>) {
  const runSerializableTransaction: GrowthTransactionRunner = (work, options) =>
    withRuntimeTransaction(environment, work, options);
  return createPostgresRewardsLifecycleService({
    client: {
      query: (sql, params = []) =>
        withRuntimeTransaction(environment, (client) => client.query(sql, params)),
    },
    runSerializableTransaction,
    keyedUuid: deterministicUuid,
  });
}

export function isBuyerCheckoutRuntimeReady(request: RequestIdentity): boolean {
  const environment = request.environment;
  return request.localDriver !== null &&
    request.identity !== null &&
    request.principal !== null &&
    request.principal.actorId.length === 36 &&
    request.principal.clerkUserId === request.identity.clerkUserId &&
    isSyntheticLocalCommerceEnvironmentConfigured(environment);
}

async function localProviderContext(request: RequestIdentity, now: Date) {
  const driver = request.localDriver!;
  return createProviderExecutionContextV1({
    environment: request.environment,
    identity: request.identity,
    now,
    async resolveDatabaseUsersByClerkId(clerkUserId) {
      const principal = driver.loadPrincipal(clerkUserId);
      return principal === null ? [] : [principal.actorId];
    },
    adapters: { stripe: null, localTest: driver.commerce.paymentProvider },
  });
}

/**
 * Configuration evidence for the PostgreSQL buyer path.
 *
 * Every adapter the checkout service needs must be configured before any of it
 * composes: credentials alone never enable checkout, and a partially configured
 * environment returns null rather than a runtime with a missing quote port.
 */
export function isPostgresBuyerCheckoutReady(
  request: RequestIdentity,
): boolean {
  const environment = request.environment;
  return request.localDriver === null &&
    request.identity !== null &&
    request.principal !== null &&
    request.principal.actorId.length === 36 &&
    request.principal.clerkUserId === request.identity.clerkUserId &&
    environment.DATABASE_MODE !== "disabled" &&
    environment.AUTH_MODE !== "disabled" &&
    environment.TAX_MODE !== "disabled" &&
    environment.SHIPPING_MODE !== "disabled" &&
    (environment.PAYMENTS_MODE === "test" || environment.PAYMENTS_MODE === "live") &&
    environment.STRIPE_SECRET_KEY !== undefined &&
    environment.STRIPE_ACCOUNT_ID !== undefined &&
    environment.STRIPE_SHIPPING_RATE_ID !== undefined &&
    environment.STRIPE_TAX_CODE !== undefined &&
    environment.RATE_LIMIT_SECRET !== undefined;
}

async function createPostgresCheckoutServerRuntime(
  request: RequestIdentity,
): Promise<CheckoutServerRuntimeV1 | null> {
  const environment = request.environment;
  const livemode = environment.PAYMENTS_MODE === "live";

  let paymentProvider;
  let stripeSdk;
  try {
    paymentProvider = createRuntimeStripePaymentProvider({
      secretKey: environment.STRIPE_SECRET_KEY!,
      accountId: environment.STRIPE_ACCOUNT_ID!,
      livemode,
    });
    stripeSdk = new Stripe(environment.STRIPE_SECRET_KEY!, {
      apiVersion: STRIPE_API_VERSION,
      maxNetworkRetries: 0,
    });
  } catch {
    return null;
  }

  // Reads run in their own read-committed transaction; the repositories own
  // their serializable write paths separately.
  const client = Object.freeze({
    query: <Row extends object>(sql: string, params: readonly unknown[] = []) =>
      withRuntimeTransaction(environment, (session) =>
        session.query<Row extends QueryResultRow ? Row : never>(sql, params),
      ) as Promise<Readonly<{ rows: Row[] }>>,
  });
  const runTransaction = <Value>(
    work: (transactional: typeof client) => Promise<Value>,
    options: Readonly<{ isolationLevel: "serializable" }>,
  ) =>
    withRuntimeTransaction(
      environment,
      (session) =>
        work({
          query: <Row extends object>(sql: string, params: readonly unknown[] = []) =>
            session.query<Row extends QueryResultRow ? Row : never>(sql, params) as Promise<
              Readonly<{ rows: Row[] }>
            >,
        }),
      options,
    );

  // Resolved on first use, not during composition: building the runtime must
  // stay free of I/O so a request that never reaches checkout costs no query.
  let contextPromise:
    | ReturnType<typeof createProviderExecutionContextV1>
    | null = null;
  const providerContext = () => {
    contextPromise ??= createProviderExecutionContextV1({
      environment,
      identity: request.identity,
      now: runtimeNow(),
      async resolveDatabaseUsersByClerkId(clerkUserId) {
        const result = await client.query<{ id: string }>(
          `SELECT id::text AS id FROM users WHERE clerk_id = $1 ORDER BY id`,
          [clerkUserId],
        );
        return result.rows.map((row) => row.id);
      },
      adapters: { stripe: paymentProvider, localTest: null },
    });
    return contextPromise;
  };

  const attributionSecret = environment.RATE_LIMIT_SECRET!;
  // One repository instance. The orchestrator's release path must be the same
  // repository the checkout service uses, not a second one over the same client.
  const checkoutRepository = createPostgresCheckoutRepository({
    client,
    runTransaction,
    sha256,
    keyedUuid: deterministicUuid,
  });
  const checkoutService = createCheckoutService({
    repository: checkoutRepository,
    shippingQuotePort: createStripeShippingQuotePort({
      sdk: {
        shippingRates: {
          retrieve: (id, params, options) =>
            stripeSdk.shippingRates.retrieve(
              id,
              params as Stripe.ShippingRateRetrieveParams | undefined,
              options as Stripe.RequestOptions,
            ),
        },
      },
      livemode,
      shippingRateId: environment.STRIPE_SHIPPING_RATE_ID!,
    }),
    taxQuotePort: createStripeTaxQuotePort({
      sdk: {
        tax: {
          calculations: {
            create: (params, options) =>
              stripeSdk.tax.calculations.create(
                params as Stripe.Tax.CalculationCreateParams,
                options as Stripe.RequestOptions,
              ),
          },
        },
      },
      livemode,
      taxCode: environment.STRIPE_TAX_CODE!,
    }),
    sha256,
    clock: runtimeNow,
    keyedUuid: deterministicUuid,
    moneyPolicy: {
      allowedCurrencies: ["USD"],
      maximumLineCount: 50,
      maximumQuantityPerLine: 25,
      maximumOrderAmountMinor: 100_000_000,
    },
    referralService: createPostgresReferralCheckoutService({
      client,
      environment: environment.APP_ENV,
      secret: attributionSecret,
    }),
    affiliateService: createPostgresAffiliateCheckoutService({
      client,
      environment: environment.APP_ENV,
      secret: attributionSecret,
    }),
    rewardsService: createRewardsService({
      atomicPort: createPostgresRewardsCheckoutAtomicPort({
        client,
        runSerializableTransaction: (work, options) =>
          withRuntimeTransaction(environment, work, options),
        keyedUuid: deterministicUuid,
      }),
    }),
  });

  const orchestrator = createProviderCheckoutOrchestrator({
    checkoutService,
    providerSessionRepository: createProviderSessionRepository({
      client,
      runTransaction: (work) =>
        runTransaction(work, { isolationLevel: "serializable" }),
    }),
    releaseDefiniteFailure: checkoutRepository.releaseDefiniteFailure,
    sha256,
  });

  const buyerUserId = request.principal!.actorId;
  const rateLimitStore: RateLimitStore = {
    increment: (window) =>
      withRuntimeTransaction(environment, (session) =>
        createPostgresRateLimitStore(session).increment(window),
      ),
  };
  return Object.freeze({
    buyerUserId,
    rateLimitStore,
    quoteCheckout(input) {
      if (input.buyerUserId !== buyerUserId) {
        return Promise.resolve(Object.freeze({
          status: "invalid_request" as const,
          reason: "checkout_input_invalid" as const,
        }));
      }
      return (async () => {
        const resolved = await providerContext();
        if (!resolved.ok || resolved.context.buyerUserId !== buyerUserId) {
          return Object.freeze({
            status: "invalid_request" as const,
            reason: "checkout_input_invalid" as const,
          });
        }
        return checkoutService.quote({
          buyerUserId,
          idempotencyKey: input.idempotencyKey,
          paymentProviderAvailable: resolved.context.checkoutCreationAvailable,
          request: input.request,
          ...(input.attributionCookie === undefined
            ? {}
            : { attributionCookie: input.attributionCookie }),
        });
      })();
    },
    startSession(input) {
      if (input.buyerUserId !== buyerUserId) {
        return Promise.resolve(Object.freeze({
          status: "invalid_request" as const,
          reason: "checkout_input_invalid" as const,
        }));
      }
      return (async () => {
        const resolved = await providerContext();
        if (!resolved.ok || resolved.context.buyerUserId !== buyerUserId) {
          return Object.freeze({ status: "invalid" as const });
        }
        return orchestrator.start({
          context: resolved.context,
          idempotencyKey: input.idempotencyKey,
          request: input.request,
          ...(input.attributionCookie === undefined
            ? {}
            : { attributionCookie: input.attributionCookie }),
        });
      })();
    },
  }) as CheckoutServerRuntimeV1;
}

export async function createCheckoutServerRuntime(
  request: RequestIdentity,
): Promise<CheckoutServerRuntimeV1 | null> {
  if (!isBuyerCheckoutRuntimeReady(request)) {
    return isPostgresBuyerCheckoutReady(request)
      ? createPostgresCheckoutServerRuntime(request)
      : null;
  }
  const driver = request.localDriver!;
  const now = runtimeNow();
  const contextResult = await localProviderContext(request, now);
  if (!contextResult.ok || contextResult.context.buyerUserId !== request.principal!.actorId) return null;
  const attributionSecret = request.environment.RATE_LIMIT_SECRET;
  if (attributionSecret === undefined) return null;
  const affiliateService = createAffiliateCheckoutService({
    verifyCookie(value, verifiedAt) {
      return verifyAttributionCookie(value, {
        environment: request.environment.APP_ENV,
        now: verifiedAt,
        secret: attributionSecret,
      });
    },
    loadCandidate: driver.commerce.affiliateCandidateLookup,
  });
  const referralService = createReferralCheckoutService({
    verifyCookie(value, verifiedAt) {
      return verifyAttributionCookie(value, {
        environment: request.environment.APP_ENV,
        now: verifiedAt,
        secret: attributionSecret,
      });
    },
    loadCandidate: driver.commerce.referralCandidateLookup,
  });
  const checkoutService = createCheckoutService({
    repository: driver.commerce.checkoutRepository,
    shippingQuotePort: driver.commerce.shippingQuotePort,
    taxQuotePort: driver.commerce.taxQuotePort,
    sha256,
    clock: runtimeNow,
    keyedUuid: deterministicUuid,
    moneyPolicy: {
      allowedCurrencies: ["USD"],
      maximumLineCount: 50,
      maximumQuantityPerLine: 25,
      maximumOrderAmountMinor: 100_000_000,
    },
    referralService,
    affiliateService,
    rewardsService: createRewardsService({ atomicPort: driver.growth.rewardsAtomicPort }),
  });
  const orchestrator = createProviderCheckoutOrchestrator({
    checkoutService,
    providerSessionRepository: driver.commerce.providerSessionRepository,
    releaseDefiniteFailure: driver.commerce.checkoutRepository.releaseDefiniteFailure,
    sha256,
  });
  const buyerUserId = request.principal!.actorId;
  return Object.freeze({
    buyerUserId,
    rateLimitStore: driver.commerce.rateLimitStore,
    quoteCheckout(input) {
      if (input.buyerUserId !== buyerUserId) return Promise.resolve(Object.freeze({ status: "invalid_request" as const, reason: "checkout_input_invalid" as const }));
      return checkoutService.quote({
        buyerUserId,
        idempotencyKey: input.idempotencyKey,
        paymentProviderAvailable: contextResult.context.checkoutCreationAvailable,
        request: input.request,
        ...(input.attributionCookie === undefined
          ? {}
          : { attributionCookie: input.attributionCookie }),
      });
    },
    startSession(input) {
      if (input.buyerUserId !== buyerUserId) return Promise.resolve(Object.freeze({ status: "invalid" as const }));
      return orchestrator.start({
        context: contextResult.context,
        idempotencyKey: input.idempotencyKey,
        request: input.request,
        ...(input.attributionCookie === undefined
          ? {}
          : { attributionCookie: input.attributionCookie }),
      });
    },
  });
}

export async function createStaffCommerceServerRuntime(
  request: RequestIdentity,
  correlationId: string,
): Promise<StaffCommerceCommandRuntimeV1 | null> {
  if (request.principal === null || request.identity === null) return null;
  if (isBuyerCheckoutRuntimeReady(request)) {
    const driver = request.localDriver!;
    return createStaffCommerceCommandRuntimeV1({
      environment: request.environment,
      identity: request.identity,
      principal: request.principal,
      now: runtimeNow(),
      correlationId,
      adminRepository: driver.adminRepository,
      refundRepository: driver.commerce.refundRepository,
      fulfillmentRepository: driver.commerce.fulfillmentRepository,
      rewardsLifecycle: rewardsDisabledLifecycle,
      async resolveDatabaseUsersByClerkId(clerkUserId) {
        const principal = driver.loadPrincipal(clerkUserId);
        return principal === null ? [] : [principal.actorId];
      },
      adapters: { stripe: null, localTest: driver.commerce.paymentProvider },
    });
  }
  const environment = request.environment;
  if (
    environment.DATABASE_MODE === "disabled" ||
    environment.RATE_LIMIT_SECRET === undefined ||
    request.localDriver !== null
  ) return null;
  const runSerializableTransaction = <Value>(
    work: (client: { query: <Row extends object>(sql: string, params?: readonly unknown[]) => Promise<Readonly<{ rows: Row[] }>> }) => Promise<Value>,
    options: Readonly<{ isolationLevel: "serializable" }>,
  ) => withRuntimeTransaction(environment, work, options);
  const adminTransactionRunner: AdminTransactionRunner = (work, options) =>
    withRuntimeTransaction(environment, (client) => work({
      query<Row extends object>(sql: string, params: unknown[] = []) {
        return client.query<Row>(sql, params);
      },
    }), options);
  const rateLimitStore: RateLimitStore = {
    increment: (window) => withRuntimeTransaction(environment, (client) =>
      createPostgresRateLimitStore(client).increment(window)),
  };
  const adminRepository = createPostgresAdminRepository(
    adminTransactionRunner,
    rateLimitStore,
  );
  const refundRepository = createRefundFulfillmentRepository({
    runSerializableTransaction,
    sha256,
  });
  const fulfillmentRepository = createFulfillmentRepository({
    runSerializableTransaction,
    sha256,
    keyedUuid: deterministicUuid,
  });
  const rewardsLifecycle = createRuntimeRewardsLifecycle(environment);
  let stripe = null;
  if (
    (environment.PAYMENTS_MODE === "test" || environment.PAYMENTS_MODE === "live") &&
    environment.STRIPE_SECRET_KEY !== undefined &&
    environment.STRIPE_ACCOUNT_ID !== undefined
  ) {
    try {
      stripe = createRuntimeStripePaymentProvider({
        secretKey: environment.STRIPE_SECRET_KEY,
        accountId: environment.STRIPE_ACCOUNT_ID,
        livemode: environment.PAYMENTS_MODE === "live",
      });
    } catch {
      stripe = null;
    }
  }
  return createStaffCommerceCommandRuntimeV1({
    environment,
    identity: request.identity,
    principal: request.principal,
    now: runtimeNow(),
    correlationId,
    adminRepository,
    refundRepository,
    fulfillmentRepository,
    rewardsLifecycle,
    async resolveDatabaseUsersByClerkId(clerkUserId) {
      return withRuntimeTransaction(environment, async (client) => {
        const result = await client.query<{ id: string }>(
          `SELECT id::text AS id FROM users WHERE clerk_id = $1 ORDER BY id`,
          [clerkUserId],
        );
        return result.rows.map((row) => row.id);
      });
    },
    adapters: { stripe, localTest: null },
  });
}

export async function createStripeWebhookServerRuntime(): Promise<StripeWebhookServerRuntimeV1 | null> {
  const environment = readServerEnv();
  if (
    environment.PAYMENTS_MODE === "disabled" ||
    environment.DATABASE_MODE === "disabled" ||
    environment.STRIPE_ACCOUNT_ID === undefined ||
    environment.STRIPE_WEBHOOK_SECRET === undefined
  ) {
    return null;
  }
  const authority = createProviderEventAuthorityV1(environment);
  if (authority === null) return null;
  const repository = createProviderEventRepository({
    runSerializableTransaction: createProviderEventTransactionRunner(
      () => connectRuntimeDatabaseSession(environment),
    ),
    keyedUuid: deterministicUuid,
  });
  const rewardsLifecycle = createRuntimeRewardsLifecycle(environment);
  const service = createProviderEventServiceV1({
    authority,
    repository,
    async sha256Bytes(exactPayload) {
      return createHash("sha256").update(exactPayload).digest("hex");
    },
    clock: () => new Date(),
    uuid: () => randomUUID(),
    leaseToken: () => `provider_event_${randomBytes(24).toString("hex")}`,
    rewardsLifecycle,
  });
  return Object.freeze({ handleDelivery: service.handleDelivery });
}
