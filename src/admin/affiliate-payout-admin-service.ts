import { assertStaffCommandAccess } from "@/admin/admin-policy";
import type { AdminCommandContext } from "@/admin/admin-service";
import {
  createAffiliatePayoutService,
  type AffiliatePayoutCreateTransaction,
  type AffiliatePayoutPaidTransaction,
} from "@/growth/affiliate-service";
import {
  consumeFixedWindowLimit,
  createRateLimitScope,
  type RateLimitStore,
} from "@/security/rate-limit";

const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const mutationLimit = 30;
const mutationWindowMs = 60_000;

export type AffiliatePayoutAdminRepository = Readonly<{
  rateLimitStore: RateLimitStore;
  createInTransaction: AffiliatePayoutCreateTransaction;
  markPaidInTransaction: AffiliatePayoutPaidTransaction;
}>;

function exactRecord(
  value: unknown,
  keys: readonly string[],
): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const actual = Object.keys(value);
  return actual.length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

function boundedText(value: unknown, maximum: number): value is string {
  return typeof value === "string" && value === value.trim() &&
    value.length > 0 && value.length <= maximum &&
    !/[\p{Cc}\p{Cf}]/u.test(value);
}

async function authorizeAndLimit(
  repository: AffiliatePayoutAdminRepository,
  context: AdminCommandContext,
) {
  const principal = assertStaffCommandAccess({
    principal: context.principal,
    identity: context.identity,
    operation: "affiliate.payout",
    now: context.now,
  });
  if (!boundedText(context.correlationId, 200) || context.correlationId.length < 16) {
    throw new Error("Admin command context is invalid");
  }
  const decision = await consumeFixedWindowLimit({
    store: repository.rateLimitStore,
    scope: createRateLimitScope(principal.actorId, "affiliate.payout", context.rateLimitSecret),
    limit: mutationLimit,
    windowMs: mutationWindowMs,
    now: context.now,
  });
  if (!decision.allowed) {
    throw new Error(`Admin mutation rate limit exceeded until ${decision.retryAt}`);
  }
  return principal;
}

export async function createAffiliatePayoutBatch(
  repository: AffiliatePayoutAdminRepository,
  context: AdminCommandContext,
  value: unknown,
) {
  if (
    !exactRecord(value, ["profileId", "payoutId", "idempotencyKey"]) ||
    typeof value.profileId !== "string" || !UUID_V4_PATTERN.test(value.profileId) ||
    typeof value.payoutId !== "string" || !UUID_V4_PATTERN.test(value.payoutId) ||
    !boundedText(value.idempotencyKey, 200)
  ) {
    throw new Error("Affiliate payout batch command is invalid");
  }
  const principal = await authorizeAndLimit(repository, context);
  return createAffiliatePayoutService({
    clock: () => new Date(context.now),
    createPayoutId: () => value.payoutId as string,
    createInTransaction: repository.createInTransaction,
    markPaidInTransaction: repository.markPaidInTransaction,
  }).createBatch({
    principal,
    profileId: value.profileId,
    idempotencyKey: value.idempotencyKey,
    correlationId: context.correlationId,
  });
}

export async function recordAffiliatePayoutPaid(
  repository: AffiliatePayoutAdminRepository,
  context: AdminCommandContext,
  value: unknown,
) {
  if (
    !exactRecord(value, [
      "payoutId",
      "expectedVersion",
      "idempotencyKey",
      "providerName",
      "externalReference",
    ]) ||
    typeof value.payoutId !== "string" || !UUID_V4_PATTERN.test(value.payoutId) ||
    typeof value.expectedVersion !== "number" ||
    !Number.isSafeInteger(value.expectedVersion) || value.expectedVersion < 1 ||
    !boundedText(value.idempotencyKey, 200) ||
    !boundedText(value.providerName, 120) ||
    !boundedText(value.externalReference, 200)
  ) {
    throw new Error("Affiliate payout paid command is invalid");
  }
  const principal = await authorizeAndLimit(repository, context);
  return createAffiliatePayoutService({
    clock: () => new Date(context.now),
    createPayoutId: () => value.payoutId as string,
    createInTransaction: repository.createInTransaction,
    markPaidInTransaction: repository.markPaidInTransaction,
  }).markPaid({
    principal,
    payoutId: value.payoutId,
    expectedVersion: value.expectedVersion,
    idempotencyKey: value.idempotencyKey,
    providerName: value.providerName,
    externalReference: value.externalReference,
    correlationId: context.correlationId,
  });
}
