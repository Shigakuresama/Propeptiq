export type Capability =
  | "application:read:self"
  | "application:read:organization"
  | "application:submit:self"
  | "application:review"
  | "compliance:decide"
  | "catalog:draft"
  | "catalog:publish"
  | "jurisdiction:manage"
  | "order:read:self"
  | "order:read:organization"
  | "order:read:any"
  | "payment:reconcile"
  | "refund:request"
  | "fulfillment:release:consume"
  | "membership:manage:organization"
  | "staff:manage"
  | "launch-gate:manage";

export type Principal = Readonly<{
  actorId: string;
  clerkUserId: string;
  organizationId: string | null;
  clerkOrganizationId: string | null;
  status: "active" | "incomplete" | "suspended";
  capabilities: readonly Capability[];
  authentication: Readonly<{
    authenticatedAt: Date;
    mfaSatisfied: boolean;
    reverificationAt: Date | null;
  }>;
}>;

export type AuthorizationOperation =
  | "application.read.self"
  | "application.read.organization"
  | "application.submit.self"
  | "application.review"
  | "compliance.hold.place"
  | "compliance.hold.release"
  | "compliance.case.decide"
  | "catalog.draft"
  | "catalog.publish"
  | "jurisdiction.manage"
  | "order.read.self"
  | "order.read.organization"
  | "order.read.any"
  | "payment.reconcile"
  | "refund.request"
  | "fulfillment.release.consume"
  | "membership.manage.organization"
  | "staff.manage"
  | "launch_gate.manage";

export type ResourceScope =
  | Readonly<{ relation: "owner"; ownerActorId: string }>
  | Readonly<{ relation: "organization"; organizationId: string }>
  | Readonly<{
      relation: "capability_only";
      subjectActorId: string | null;
      subjectOrganizationId: string | null;
      createdByActorId: string | null;
    }>;

export type StrongAuthPolicy = Readonly<{
  version: string;
  approvalId: string;
  approvalVersion: string;
  effectiveAt: Date;
  expiresAt: Date | null;
  integrityVerified: boolean;
  maximumAgeMs: number;
}>;

export type AuthorizationDenialCode =
  | "unauthenticated"
  | "identity_incomplete"
  | "principal_suspended"
  | "operation_policy_missing"
  | "missing_capability"
  | "relation_not_permitted"
  | "resource_scope_invalid"
  | "owner_mismatch"
  | "organization_scope_required"
  | "organization_mismatch"
  | "separation_context_required"
  | "separation_of_duties_violation"
  | "mfa_required"
  | "strong_auth_policy_unavailable"
  | "strong_auth_policy_invalid"
  | "reverification_required"
  | "reverification_invalid"
  | "reverification_expired";

export type AuthorizationResult =
  | Readonly<{
      allowed: true;
      operation: AuthorizationOperation;
      capability: Capability;
      relation: ResourceScope["relation"];
    }>
  | Readonly<{
      allowed: false;
      operation: AuthorizationOperation | "unknown";
      reasonCode: AuthorizationDenialCode;
    }>;

type OperationPolicy = Readonly<{
  capability: Capability;
  relation: ResourceScope["relation"];
  requiresStrongAuth: boolean;
  separationRule?: "subject" | "creator";
}>;

const operationPolicies: Readonly<
  Record<AuthorizationOperation, OperationPolicy>
> = Object.freeze({
  "application.read.self": Object.freeze({
    capability: "application:read:self",
    relation: "owner",
    requiresStrongAuth: false,
  }),
  "application.read.organization": Object.freeze({
    capability: "application:read:organization",
    relation: "organization",
    requiresStrongAuth: false,
  }),
  "application.review": Object.freeze({
    capability: "application:review",
    relation: "capability_only",
    requiresStrongAuth: true,
    separationRule: "subject",
  }),
  "application.submit.self": Object.freeze({
    capability: "application:submit:self",
    relation: "owner",
    requiresStrongAuth: false,
  }),
  "compliance.hold.place": Object.freeze({
    capability: "compliance:decide",
    relation: "capability_only",
    requiresStrongAuth: true,
  }),
  "compliance.hold.release": Object.freeze({
    capability: "compliance:decide",
    relation: "capability_only",
    requiresStrongAuth: true,
  }),
  "compliance.case.decide": Object.freeze({
    capability: "compliance:decide",
    relation: "capability_only",
    requiresStrongAuth: true,
  }),
  "catalog.draft": Object.freeze({
    capability: "catalog:draft",
    relation: "capability_only",
    requiresStrongAuth: false,
  }),
  "catalog.publish": Object.freeze({
    capability: "catalog:publish",
    relation: "capability_only",
    requiresStrongAuth: true,
    separationRule: "creator",
  }),
  "jurisdiction.manage": Object.freeze({
    capability: "jurisdiction:manage",
    relation: "capability_only",
    requiresStrongAuth: true,
    separationRule: "creator",
  }),
  "order.read.self": Object.freeze({
    capability: "order:read:self",
    relation: "owner",
    requiresStrongAuth: false,
  }),
  "order.read.organization": Object.freeze({
    capability: "order:read:organization",
    relation: "organization",
    requiresStrongAuth: false,
  }),
  "order.read.any": Object.freeze({
    capability: "order:read:any",
    relation: "capability_only",
    requiresStrongAuth: false,
  }),
  "payment.reconcile": Object.freeze({
    capability: "payment:reconcile",
    relation: "capability_only",
    requiresStrongAuth: true,
  }),
  "refund.request": Object.freeze({
    capability: "refund:request",
    relation: "capability_only",
    requiresStrongAuth: true,
  }),
  "fulfillment.release.consume": Object.freeze({
    capability: "fulfillment:release:consume",
    relation: "capability_only",
    requiresStrongAuth: false,
  }),
  "membership.manage.organization": Object.freeze({
    capability: "membership:manage:organization",
    relation: "organization",
    requiresStrongAuth: false,
  }),
  "staff.manage": Object.freeze({
    capability: "staff:manage",
    relation: "capability_only",
    requiresStrongAuth: true,
  }),
  "launch_gate.manage": Object.freeze({
    capability: "launch-gate:manage",
    relation: "capability_only",
    requiresStrongAuth: true,
  }),
});

export type AuthorizeOperationInput = Readonly<{
  principal: Principal | null;
  operation: AuthorizationOperation;
  resource: ResourceScope;
  now: Date;
  strongAuthPolicy: StrongAuthPolicy | null;
  strongAuthMaximumAgeCeilingMs?: number | null;
}>;

const capabilityValues = new Set<Capability>([
  "application:read:self",
  "application:read:organization",
  "application:submit:self",
  "application:review",
  "compliance:decide",
  "catalog:draft",
  "catalog:publish",
  "jurisdiction:manage",
  "order:read:self",
  "order:read:organization",
  "order:read:any",
  "payment:reconcile",
  "refund:request",
  "fulfillment:release:consume",
  "membership:manage:organization",
  "staff:manage",
  "launch-gate:manage",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonBlankString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isValidDate(value: unknown): value is Date {
  return value instanceof Date && Number.isFinite(value.getTime());
}

function isDenseArray(value: readonly unknown[]): boolean {
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.hasOwn(value, index)) return false;
  }
  return true;
}

function hasValidPrincipalProjection(
  value: unknown,
  now: Date,
): value is Principal {
  if (
    !isRecord(value) ||
    value.status !== "active" ||
    !isNonBlankString(value.actorId) ||
    !isNonBlankString(value.clerkUserId) ||
    !Array.isArray(value.capabilities) ||
    !isDenseArray(value.capabilities) ||
    !value.capabilities.every(
      (capability) =>
        typeof capability === "string" &&
        capabilityValues.has(capability as Capability),
    ) ||
    new Set(value.capabilities).size !== value.capabilities.length ||
    !isRecord(value.authentication) ||
    !isValidDate(value.authentication.authenticatedAt) ||
    typeof value.authentication.mfaSatisfied !== "boolean" ||
    !(
      value.authentication.reverificationAt === null ||
      isValidDate(value.authentication.reverificationAt)
    )
  ) {
    return false;
  }

  const hasValidOrganizationIdentity =
    (value.organizationId === null && value.clerkOrganizationId === null) ||
    (isNonBlankString(value.organizationId) &&
      isNonBlankString(value.clerkOrganizationId));
  return (
    hasValidOrganizationIdentity &&
    value.authentication.authenticatedAt.getTime() <= now.getTime()
  );
}

function hasValidResourceScope(value: unknown): value is ResourceScope {
  if (!isRecord(value)) return false;
  if (value.relation === "owner") {
    return isNonBlankString(value.ownerActorId);
  }
  if (value.relation === "organization") {
    return isNonBlankString(value.organizationId);
  }
  if (value.relation !== "capability_only") return false;

  return (
    (value.subjectActorId === null ||
      isNonBlankString(value.subjectActorId)) &&
    (value.subjectOrganizationId === null ||
      isNonBlankString(value.subjectOrganizationId)) &&
    (value.createdByActorId === null ||
      isNonBlankString(value.createdByActorId))
  );
}

function hasValidStrongAuthPolicy(
  value: unknown,
  now: Date,
  maximumAgeCeilingMs: unknown,
): value is StrongAuthPolicy {
  if (
    !isRecord(value) ||
    !isNonBlankString(value.version) ||
    !isNonBlankString(value.approvalId) ||
    !isNonBlankString(value.approvalVersion) ||
    !isValidDate(value.effectiveAt) ||
    !(value.expiresAt === null || isValidDate(value.expiresAt)) ||
    value.integrityVerified !== true ||
    !Number.isSafeInteger(value.maximumAgeMs) ||
    (value.maximumAgeMs as number) <= 0 ||
    !Number.isSafeInteger(maximumAgeCeilingMs) ||
    (maximumAgeCeilingMs as number) <= 0 ||
    (value.maximumAgeMs as number) > (maximumAgeCeilingMs as number)
  ) {
    return false;
  }

  return (
    value.effectiveAt.getTime() <= now.getTime() &&
    (value.expiresAt === null || value.expiresAt.getTime() > now.getTime())
  );
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
    Object.freeze({
      allowed: false,
      operation,
      reasonCode,
    });

  if (!isRecord(input)) {
    return deny("identity_incomplete");
  }

  const principal = input.principal;
  if (principal === null) {
    return deny("unauthenticated");
  }
  if (isRecord(principal) && principal.status === "suspended") {
    return deny("principal_suspended");
  }
  if (!isValidDate(input.now) || !hasValidPrincipalProjection(principal, input.now)) {
    return deny("identity_incomplete");
  }
  if (principal.authentication.mfaSatisfied === false) {
    return deny("mfa_required");
  }

  const policy =
    operation === "unknown" ? undefined : operationPolicies[operation];
  if (!policy) {
    return deny("operation_policy_missing");
  }
  if (!principal.capabilities.includes(policy.capability)) {
    return deny("missing_capability");
  }
  if (!isRecord(input.resource) || input.resource.relation !== policy.relation) {
    return deny("relation_not_permitted");
  }
  if (!hasValidResourceScope(input.resource)) {
    return deny("resource_scope_invalid");
  }
  if (
    input.resource.relation === "owner" &&
    input.resource.ownerActorId !== principal.actorId
  ) {
    return deny("owner_mismatch");
  }
  if (input.resource.relation === "organization") {
    if (principal.organizationId === null) {
      return deny("organization_scope_required");
    }
    if (input.resource.organizationId !== principal.organizationId) {
      return deny("organization_mismatch");
    }
  }
  if (
    input.resource.relation === "capability_only" &&
    policy.separationRule === "subject"
  ) {
    if (
      input.resource.subjectActorId === null &&
      input.resource.subjectOrganizationId === null
    ) {
      return deny("separation_context_required");
    }
    if (
      input.resource.subjectActorId === principal.actorId ||
      (principal.organizationId !== null &&
        input.resource.subjectOrganizationId === principal.organizationId)
    ) {
      return deny("separation_of_duties_violation");
    }
  }
  if (
    input.resource.relation === "capability_only" &&
    policy.separationRule === "creator"
  ) {
    if (input.resource.createdByActorId === null) {
      return deny("separation_context_required");
    }
    if (input.resource.createdByActorId === principal.actorId) {
      return deny("separation_of_duties_violation");
    }
  }

  if (policy.requiresStrongAuth) {
    const strongAuthPolicy = input.strongAuthPolicy;
    if (strongAuthPolicy === null) {
      return deny("strong_auth_policy_unavailable");
    }
    if (
      !hasValidStrongAuthPolicy(
        strongAuthPolicy,
        input.now,
        input.strongAuthMaximumAgeCeilingMs,
      )
    ) {
      return deny("strong_auth_policy_invalid");
    }

    const now = input.now.getTime();
    const reverificationAt = principal.authentication.reverificationAt;
    if (reverificationAt === null) {
      return deny("reverification_required");
    }
    const reverificationTime = reverificationAt.getTime();
    if (
      reverificationTime > now ||
      reverificationTime < principal.authentication.authenticatedAt.getTime()
    ) {
      return deny("reverification_invalid");
    }
    if (now - reverificationTime > strongAuthPolicy.maximumAgeMs) {
      return deny("reverification_expired");
    }
  }

  return Object.freeze({
    allowed: true,
    operation: input.operation,
    capability: policy.capability,
    relation: input.resource.relation,
  });
}
