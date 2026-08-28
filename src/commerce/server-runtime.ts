import "server-only";

import { createHash, randomBytes, randomUUID } from "node:crypto";

import type { RequestIdentity } from "@/auth/server";
import { createCheckoutService, type CheckoutQuoteResult } from "@/commerce/checkout-service";
import { createProviderCheckoutOrchestrator, type ProviderCheckoutRouteResult } from "@/commerce/provider-checkout-orchestration";
import { createProviderExecutionContextV1 } from "@/commerce/provider-context";
import { createProviderEventServiceV1 } from "@/commerce/provider-event-service";
import { createProviderEventAuthorityV1 } from "@/commerce/stripe-webhook-verifier";
import { createRuntimeStripePaymentProvider } from "@/commerce/stripe-payment-provider";
import { createStaffCommerceCommandRuntimeV1, type StaffCommerceCommandRuntimeV1 } from "@/commerce/staff-commerce-command-runtime";
import { isSyntheticLocalCommerceEnvironmentConfigured } from "@/config/commerce-capability";
import { createPostgresAdminRepository, type AdminTransactionRunner } from "@/db/repositories/admin-repository";
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
import { createPostgresRewardsLifecycleService } from "@/growth/rewards-service";
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
  }>) => Promise<ProviderCheckoutRouteResult>;
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

export async function createCheckoutServerRuntime(
  request: RequestIdentity,
): Promise<CheckoutServerRuntimeV1 | null> {
  if (!isBuyerCheckoutRuntimeReady(request)) {
    // PostgreSQL/live composition remains fail closed until every configured
    // shipping and tax adapter is present. Credentials alone never enable it.
    return null;
  }
  const driver = request.localDriver!;
  const now = runtimeNow();
  const contextResult = await localProviderContext(request, now);
  if (!contextResult.ok || contextResult.context.buyerUserId !== request.principal!.actorId) return null;
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
    ...(driver.commerce.affiliateService === null
      ? {}
      : { affiliateService: driver.commerce.affiliateService }),
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
