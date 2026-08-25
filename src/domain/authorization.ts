import type { BuyerStatus } from "@/domain/eligibility";

export type Capability =
  | "review:decide"
  | "catalog:publish"
  | "destination:manage"
  | "promotion:manage"
  | "order:read:any"
  | "payment:reconcile"
  | "refund:request"
  | "fulfillment:release:consume"
  | "staff:manage";

export type Principal = Readonly<{
  actorId: string;
  clerkUserId: string;
  buyerStatus: BuyerStatus;
  capabilities: readonly Capability[];
  mfaSatisfied: boolean;
}>;

export type AuthorizationOperation =
  | "account.read.self"
  | "account.update.self"
  | "checkout.request"
  | "order.read.self"
  | "review.decide"
  | "catalog.publish"
  | "destination.manage"
  | "promotion.manage"
  | "order.read.any"
  | "payment.reconcile"
  | "refund.request"
  | "fulfillment.release.consume"
  | "staff.manage";

export type ResourceScope =
  | Readonly<{ relation: "owner"; ownerActorId: string }>
  | Readonly<{ relation: "capability_only" }>;

export type AuthorizationDenialCode =
  | "unauthenticated"
  | "identity_incomplete"
  | "principal_blocked"
  | "operation_policy_missing"
  | "missing_capability"
  | "relation_not_permitted"
  | "resource_scope_invalid"
  | "owner_mismatch"
  | "mfa_required";

export type AuthorizationResult =
  | Readonly<{
      allowed: true;
      operation: AuthorizationOperation;
      capability: Capability | null;
      relation: ResourceScope["relation"];
    }>
  | Readonly<{
      allowed: false;
      operation: AuthorizationOperation | "unknown";
      reasonCode: AuthorizationDenialCode;
    }>;

type OperationPolicy = Readonly<{
  capability: Capability | null;
  relation: ResourceScope["relation"];
  staff: boolean;
}>;

const operationPolicies: Readonly<
  Record<AuthorizationOperation, OperationPolicy>
> = Object.freeze({
  "account.read.self": Object.freeze({
    capability: null,
    relation: "owner",
    staff: false,
  }),
  "account.update.self": Object.freeze({
    capability: null,
    relation: "owner",
    staff: false,
  }),
  "checkout.request": Object.freeze({
    capability: null,
    relation: "owner",
    staff: false,
  }),
  "order.read.self": Object.freeze({
    capability: null,
    relation: "owner",
    staff: false,
  }),
  "review.decide": Object.freeze({
    capability: "review:decide",
    relation: "capability_only",
    staff: true,
  }),
  "catalog.publish": Object.freeze({
    capability: "catalog:publish",
    relation: "capability_only",
    staff: true,
  }),
  "destination.manage": Object.freeze({
    capability: "destination:manage",
    relation: "capability_only",
    staff: true,
  }),
  "promotion.manage": Object.freeze({
    capability: "promotion:manage",
    relation: "capability_only",
    staff: true,
  }),
  "order.read.any": Object.freeze({
    capability: "order:read:any",
    relation: "capability_only",
    staff: true,
  }),
  "payment.reconcile": Object.freeze({
    capability: "payment:reconcile",
    relation: "capability_only",
    staff: true,
  }),
  "refund.request": Object.freeze({
    capability: "refund:request",
    relation: "capability_only",
    staff: true,
  }),
  "fulfillment.release.consume": Object.freeze({
    capability: "fulfillment:release:consume",
    relation: "capability_only",
    staff: true,
  }),
  "staff.manage": Object.freeze({
    capability: "staff:manage",
    relation: "capability_only",
    staff: true,
  }),
});

export type AuthorizeOperationInput = Readonly<{
  principal: Principal | null;
  operation: AuthorizationOperation;
  resource: ResourceScope;
}>;

const capabilityValues = new Set<Capability>([
  "review:decide",
  "catalog:publish",
  "destination:manage",
  "promotion:manage",
  "order:read:any",
  "payment:reconcile",
  "refund:request",
  "fulfillment:release:consume",
  "staff:manage",
]);

const buyerStatuses = new Set<BuyerStatus>([
  "active",
  "review",
  "blocked",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonBlank(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isDenseArray(value: unknown): value is readonly unknown[] {
  if (!Array.isArray(value)) return false;
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.hasOwn(value, index)) return false;
  }
  return true;
}

function isValidPrincipal(value: unknown): value is Principal {
  return (
    isRecord(value) &&
    isNonBlank(value.actorId) &&
    isNonBlank(value.clerkUserId) &&
    buyerStatuses.has(value.buyerStatus as BuyerStatus) &&
    isDenseArray(value.capabilities) &&
    value.capabilities.every(
      (capability) =>
        typeof capability === "string" &&
        capabilityValues.has(capability as Capability),
    ) &&
    new Set(value.capabilities).size === value.capabilities.length &&
    typeof value.mfaSatisfied === "boolean"
  );
}

function isValidResource(value: unknown): value is ResourceScope {
  if (!isRecord(value)) return false;
  if (value.relation === "owner") return isNonBlank(value.ownerActorId);
  return value.relation === "capability_only";
}

export function authorizeOperation(
  input: AuthorizeOperationInput,
): AuthorizationResult {
  const operation =
    isRecord(input) &&
    typeof input.operation === "string" &&
    Object.hasOwn(operationPolicies, input.operation)
      ? (input.operation as AuthorizationOperation)
      : "unknown";
  const deny = (reasonCode: AuthorizationDenialCode): AuthorizationResult =>
    Object.freeze({ allowed: false, operation, reasonCode });

  if (!isRecord(input)) return deny("identity_incomplete");
  if (input.principal === null) return deny("unauthenticated");
  if (!isValidPrincipal(input.principal)) return deny("identity_incomplete");
  if (input.principal.buyerStatus === "blocked") {
    return deny("principal_blocked");
  }
  if (operation === "unknown") return deny("operation_policy_missing");

  const policy = operationPolicies[operation];
  if (!isRecord(input.resource) || input.resource.relation !== policy.relation) {
    return deny("relation_not_permitted");
  }
  if (!isValidResource(input.resource)) return deny("resource_scope_invalid");
  if (
    input.resource.relation === "owner" &&
    input.resource.ownerActorId !== input.principal.actorId
  ) {
    return deny("owner_mismatch");
  }

  if (
    policy.capability !== null &&
    !input.principal.capabilities.includes(policy.capability)
  ) {
    return deny("missing_capability");
  }
  if (policy.staff && !input.principal.mfaSatisfied) {
    return deny("mfa_required");
  }

  return Object.freeze({
    allowed: true,
    operation,
    capability: policy.capability,
    relation: input.resource.relation,
  });
}
