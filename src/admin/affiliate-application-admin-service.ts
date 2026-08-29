import { assertStaffCommandAccess } from "@/admin/admin-policy";
import type { AdminCommandContext } from "@/admin/admin-service";
import {
  createAffiliateAdminService,
  type AffiliateAdminMutationTransaction,
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

export type AffiliateApplicationAdminRepository = Readonly<{
  rateLimitStore: RateLimitStore;
  mutateInTransaction: AffiliateAdminMutationTransaction;
}>;

function exactRecord(
  value: unknown,
  keys: readonly string[],
): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const actual = Object.keys(value);
  return actual.length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

function parseBase(value: unknown, keys: readonly string[]) {
  if (
    !exactRecord(value, keys) ||
    typeof value.profileId !== "string" ||
    !UUID_V4_PATTERN.test(value.profileId) ||
    typeof value.expectedVersion !== "number" ||
    !Number.isSafeInteger(value.expectedVersion) ||
    value.expectedVersion < 1
  ) {
    throw new Error("Affiliate administrator command is invalid");
  }
  return {
    profileId: value.profileId,
    expectedVersion: value.expectedVersion,
  };
}

async function authorizeAndLimit(
  repository: AffiliateApplicationAdminRepository,
  context: AdminCommandContext,
) {
  const principal = assertStaffCommandAccess({
    principal: context.principal,
    identity: context.identity,
    operation: "growth.manage",
    now: context.now,
  });
  if (!context.correlationId.trim()) throw new Error("Admin command context is invalid");
  const decision = await consumeFixedWindowLimit({
    store: repository.rateLimitStore,
    scope: createRateLimitScope(principal.actorId, "growth.manage", context.rateLimitSecret),
    limit: mutationLimit,
    windowMs: mutationWindowMs,
    now: context.now,
  });
  if (!decision.allowed) {
    throw new Error(`Admin mutation rate limit exceeded until ${decision.retryAt}`);
  }
  return principal;
}

export async function decideAffiliateApplication(
  repository: AffiliateApplicationAdminRepository,
  context: AdminCommandContext,
  value: unknown,
) {
  const command = parseBase(value, ["profileId", "expectedVersion", "decision"]);
  if (
    !exactRecord(value, ["profileId", "expectedVersion", "decision"]) ||
    (value.decision !== "active" && value.decision !== "rejected")
  ) {
    throw new Error("Affiliate administrator command is invalid");
  }
  const principal = await authorizeAndLimit(repository, context);
  return createAffiliateAdminService({
    clock: () => new Date(context.now),
    mutateInTransaction: repository.mutateInTransaction,
  }).decideApplication({
    principal,
    profileId: command.profileId,
    expectedVersion: command.expectedVersion,
    decision: value.decision,
    correlationId: context.correlationId,
  });
}

export async function suspendAffiliateApplication(
  repository: AffiliateApplicationAdminRepository,
  context: AdminCommandContext,
  value: unknown,
) {
  const command = parseBase(value, ["profileId", "expectedVersion"]);
  const principal = await authorizeAndLimit(repository, context);
  return createAffiliateAdminService({
    clock: () => new Date(context.now),
    mutateInTransaction: repository.mutateInTransaction,
  }).suspendAffiliate({
    principal,
    profileId: command.profileId,
    expectedVersion: command.expectedVersion,
    correlationId: context.correlationId,
  });
}
