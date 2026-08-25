export const REQUIRED_GATE_KEYS = Object.freeze([
  "buyer_verification",
  "catalog_approval",
  "product_jurisdiction",
  "payment_provider",
  "tax",
  "shipping",
  "inventory_lot",
  "compliance_clearance",
  "launch_control",
] as const);

export type GateKey = (typeof REQUIRED_GATE_KEYS)[number];
export type GateStatus = "pass" | "manual_review" | "blocked" | "unknown";
export type JurisdictionState =
  | "Allowed"
  | "Manual Review"
  | "Blocked"
  | "Unknown";

export type EvidenceReference = Readonly<{
  kind: string;
  id: string;
  version: string;
  sha256: string | null;
}>;

export type GateResult = Readonly<{
  key: GateKey;
  orderLineId: string | null;
  status: GateStatus;
  reasonCode: string;
  evidenceRefs: readonly EvidenceReference[];
}>;

export type EligibilityEvaluation = Readonly<{
  decision: GateStatus;
  gates: readonly GateResult[];
  reasonCodes: readonly Readonly<{
    gate: GateKey;
    orderLineId: string | null;
    code: string;
  }>[];
  evidenceRefs: readonly EvidenceReference[];
  requiredActions: readonly EligibilityAction[];
}>;

export type CheckoutCreationDecision = Readonly<{
  permitted: boolean;
  decision: GateStatus;
  reasonCodes: EligibilityEvaluation["reasonCodes"];
  evidenceRefs: readonly EvidenceReference[];
  requiredActions: readonly EligibilityAction[];
}>;

export type EligibilityAction =
  | "deny_checkout"
  | "create_compliance_hold"
  | "route_case_review"
  | "route_policy_review";

const gateStatuses = new Set<GateStatus>([
  "pass",
  "manual_review",
  "blocked",
  "unknown",
]);
const gateKeys = new Set<GateKey>(REQUIRED_GATE_KEYS);
const serverProducedEligibilityEvaluations = new WeakSet<object>();

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

function isValidDate(value: unknown): value is Date {
  return value instanceof Date && Number.isFinite(value.getTime());
}

function isValidNullableDate(value: unknown): value is Date | null {
  return value === null || isValidDate(value);
}

function isValidEvidenceReference(value: unknown): value is EvidenceReference {
  if (!isRecord(value)) return false;
  return (
    isNonBlank(value.kind) &&
    isNonBlank(value.id) &&
    isNonBlank(value.version) &&
    (value.sha256 === null ||
      (typeof value.sha256 === "string" &&
        /^[a-f0-9]{64}$/.test(value.sha256)))
  );
}

function freezeEvidenceRefs(
  references: readonly EvidenceReference[],
): readonly EvidenceReference[] {
  return Object.freeze(
    references.map((reference) =>
      Object.freeze({
        kind: reference.kind,
        id: reference.id,
        version: reference.version,
        sha256: reference.sha256,
      }),
    ),
  );
}

function isValidGateResult(value: unknown): value is GateResult {
  if (
    !isRecord(value) ||
    !gateKeys.has(value.key as GateKey) ||
    !gateStatuses.has(value.status as GateStatus) ||
    typeof value.reasonCode !== "string" ||
    !/^[a-z0-9_]+$/.test(value.reasonCode) ||
    !isDenseArray(value.evidenceRefs) ||
    !value.evidenceRefs.every(isValidEvidenceReference) ||
    (value.status === "pass" && value.evidenceRefs.length === 0)
  ) {
    return false;
  }

  return value.key === "product_jurisdiction"
    ? isNonBlank(value.orderLineId)
    : value.orderLineId === null;
}

function freezeGate(gate: GateResult): GateResult {
  return Object.freeze({
    key: gate.key,
    orderLineId: gate.orderLineId,
    status: gate.status,
    reasonCode: gate.reasonCode,
    evidenceRefs: freezeEvidenceRefs(gate.evidenceRefs),
  });
}

export type JurisdictionRule = Readonly<{
  id: string;
  productId: string;
  destinationCode: string;
  state: JurisdictionState;
  effectiveAt: Date;
  expiresAt: Date | null;
  supersededAt: Date | null;
  integrityVerified: boolean;
  evidenceEffectiveAt: Date;
  evidenceExpiresAt: Date | null;
  evidenceIntegrityVerified: boolean;
  evidenceRefs: readonly EvidenceReference[];
}>;

export type ManualReviewCaseDecision = Readonly<{
  ruleId: string;
  orderLineId: string;
  outcome: "approved" | "rejected";
  orderId: string;
  evaluationHash: string;
  effectiveAt: Date;
  expiresAt: Date | null;
  supersededAt: Date | null;
  evidenceRefs: readonly EvidenceReference[];
}>;

export type JurisdictionEvaluationInput = Readonly<{
  now: Date;
  orderId: string;
  orderLineId: string;
  destinationCode: string;
  evaluationHash: string;
  product: Readonly<{ id: string; approved: boolean; active: boolean }>;
  rule: JurisdictionRule | null;
  caseDecision: ManualReviewCaseDecision | null;
}>;

export function jurisdictionStateToGateStatus(
  state: unknown,
): GateStatus {
  switch (state) {
    case "Allowed":
      return "pass";
    case "Manual Review":
      return "manual_review";
    case "Blocked":
      return "blocked";
    case "Unknown":
      return "unknown";
    default:
      return "unknown";
  }
}

function hasValidEvaluationInput(
  value: unknown,
): value is JurisdictionEvaluationInput {
  if (
    !isRecord(value) ||
    !isValidDate(value.now) ||
    !isNonBlank(value.orderId) ||
    !isNonBlank(value.orderLineId) ||
    !isNonBlank(value.destinationCode) ||
    typeof value.evaluationHash !== "string" ||
    !/^[a-f0-9]{64}$/.test(value.evaluationHash) ||
    !isRecord(value.product) ||
    !isNonBlank(value.product.id) ||
    typeof value.product.approved !== "boolean" ||
    typeof value.product.active !== "boolean"
  ) {
    return false;
  }

  return value.rule === null || isRecord(value.rule);
}

function isApplicableManualDecision(
  value: unknown,
  input: JurisdictionEvaluationInput,
  rule: JurisdictionRule,
  now: number,
): value is ManualReviewCaseDecision {
  if (
    !isRecord(value) ||
    !isNonBlank(value.ruleId) ||
    !isNonBlank(value.orderLineId) ||
    !isNonBlank(value.orderId) ||
    typeof value.evaluationHash !== "string" ||
    !/^[a-f0-9]{64}$/.test(value.evaluationHash) ||
    (value.outcome !== "approved" && value.outcome !== "rejected") ||
    !isValidDate(value.effectiveAt) ||
    !isValidNullableDate(value.expiresAt) ||
    value.supersededAt !== null ||
    !isDenseArray(value.evidenceRefs) ||
    value.evidenceRefs.length === 0 ||
    !value.evidenceRefs.every(isValidEvidenceReference)
  ) {
    return false;
  }

  return (
    value.ruleId === rule.id &&
    value.orderLineId === input.orderLineId &&
    value.orderId === input.orderId &&
    value.evaluationHash === input.evaluationHash &&
    value.effectiveAt.getTime() <= now &&
    (value.expiresAt === null || value.expiresAt.getTime() > now)
  );
}

export function evaluateJurisdiction(
  input: JurisdictionEvaluationInput,
): GateResult {
  const orderLineId =
    isRecord(input) && isNonBlank(input.orderLineId)
      ? input.orderLineId
      : null;
  const gate = (
    status: GateStatus,
    reasonCode: string,
    evidenceRefs: readonly EvidenceReference[] = [],
  ): GateResult =>
    Object.freeze({
      key: "product_jurisdiction",
      orderLineId,
      status,
      reasonCode,
      evidenceRefs: freezeEvidenceRefs(evidenceRefs),
    });

  if (!hasValidEvaluationInput(input)) {
    return gate("unknown", "jurisdiction_input_invalid");
  }
  if (input.product.approved === false) {
    return gate("blocked", "product_not_approved");
  }
  if (input.product.active === false) {
    return gate("blocked", "product_not_active");
  }

  const rule = input.rule;
  if (rule === null) {
    return gate("unknown", "jurisdiction_rule_missing");
  }
  if (
    !isNonBlank(rule.id) ||
    !isNonBlank(rule.productId) ||
    !isNonBlank(rule.destinationCode) ||
    !["Allowed", "Manual Review", "Blocked", "Unknown"].includes(
      rule.state,
    )
  ) {
    return gate("unknown", "jurisdiction_rule_invalid");
  }
  if (
    rule.productId !== input.product.id ||
    rule.destinationCode !== input.destinationCode
  ) {
    return gate("unknown", "jurisdiction_rule_scope_mismatch");
  }
  if (!isValidDate(rule.effectiveAt) || !isValidNullableDate(rule.expiresAt)) {
    return gate("unknown", "jurisdiction_rule_not_current");
  }

  const now = input.now.getTime();
  if (
    rule.effectiveAt.getTime() > now ||
    (rule.expiresAt !== null && rule.expiresAt.getTime() <= now) ||
    rule.supersededAt !== null
  ) {
    return gate("unknown", "jurisdiction_rule_not_current");
  }
  if (rule.integrityVerified !== true) {
    return gate("unknown", "jurisdiction_rule_integrity_failed");
  }
  if (rule.evidenceIntegrityVerified !== true) {
    return gate("unknown", "jurisdiction_rule_evidence_integrity_failed");
  }
  if (
    !isValidDate(rule.evidenceEffectiveAt) ||
    !isValidNullableDate(rule.evidenceExpiresAt) ||
    rule.evidenceEffectiveAt.getTime() > now ||
    (rule.evidenceExpiresAt !== null &&
      rule.evidenceExpiresAt.getTime() <= now)
  ) {
    return gate("unknown", "jurisdiction_rule_evidence_not_current");
  }
  if (
    !isDenseArray(rule.evidenceRefs) ||
    rule.evidenceRefs.length === 0 ||
    !rule.evidenceRefs.every(isValidEvidenceReference)
  ) {
    return gate("unknown", "jurisdiction_rule_evidence_missing");
  }

  switch (rule.state) {
    case "Allowed":
      return gate("pass", "jurisdiction_rule_allowed", rule.evidenceRefs);
    case "Blocked":
      return gate("blocked", "jurisdiction_rule_blocked", rule.evidenceRefs);
    case "Unknown":
      return gate("unknown", "jurisdiction_rule_unknown", rule.evidenceRefs);
    case "Manual Review": {
      if (input.caseDecision === null) {
        return gate(
          "manual_review",
          "jurisdiction_manual_review_required",
          rule.evidenceRefs,
        );
      }
      if (!isApplicableManualDecision(input.caseDecision, input, rule, now)) {
        return gate(
          "manual_review",
          "manual_review_case_not_applicable",
          rule.evidenceRefs,
        );
      }

      const evidenceRefs = [
        ...rule.evidenceRefs,
        ...input.caseDecision.evidenceRefs,
      ];
      if (input.caseDecision.outcome === "rejected") {
        return gate(
          "blocked",
          "manual_review_case_rejected",
          evidenceRefs,
        );
      }
      return gate("pass", "manual_review_case_approved", evidenceRefs);
    }
  }
}

type StructuralReasonCode =
  | "missing_gate_result"
  | "duplicate_gate_result"
  | "invalid_gate_result"
  | "unexpected_gate_result"
  | "invalid_order_line_scope";

function structuralUnknownGate(
  key: GateKey,
  orderLineId: string | null,
  reasonCode: StructuralReasonCode,
): GateResult {
  return Object.freeze({
    key,
    orderLineId,
    status: "unknown",
    reasonCode,
    evidenceRefs: Object.freeze([]),
  });
}

function normalizeSingleGate(
  gates: readonly unknown[],
  key: Exclude<GateKey, "product_jurisdiction">,
): GateResult {
  const matching = gates.filter(
    (gate) => isRecord(gate) && gate.key === key,
  );
  if (matching.length === 0) {
    return structuralUnknownGate(key, null, "missing_gate_result");
  }
  if (matching.length > 1) {
    return structuralUnknownGate(key, null, "duplicate_gate_result");
  }
  return isValidGateResult(matching[0])
    ? freezeGate(matching[0])
    : structuralUnknownGate(key, null, "invalid_gate_result");
}

function normalizeJurisdictionGates(
  gates: readonly unknown[],
  expectedOrderLineIds: readonly string[],
): readonly GateResult[] {
  const expectedIdsAreValid =
    isDenseArray(expectedOrderLineIds) &&
    expectedOrderLineIds.length > 0 &&
    expectedOrderLineIds.every(isNonBlank) &&
    new Set(expectedOrderLineIds).size === expectedOrderLineIds.length;
  if (!expectedIdsAreValid) {
    return Object.freeze([
      structuralUnknownGate(
        "product_jurisdiction",
        null,
        "invalid_order_line_scope",
      ),
    ]);
  }

  const normalized = expectedOrderLineIds.map((orderLineId) => {
    const matching = gates.filter(
      (gate) =>
        isRecord(gate) &&
        gate.key === "product_jurisdiction" &&
        gate.orderLineId === orderLineId,
    );
    if (matching.length === 0) {
      return structuralUnknownGate(
        "product_jurisdiction",
        orderLineId,
        "missing_gate_result",
      );
    }
    if (matching.length > 1) {
      return structuralUnknownGate(
        "product_jurisdiction",
        orderLineId,
        "duplicate_gate_result",
      );
    }
    return isValidGateResult(matching[0])
      ? freezeGate(matching[0])
      : structuralUnknownGate(
          "product_jurisdiction",
          orderLineId,
          "invalid_gate_result",
        );
  });

  const hasUnexpectedJurisdictionGate = gates.some(
    (gate) =>
      isRecord(gate) &&
      gate.key === "product_jurisdiction" &&
      !expectedOrderLineIds.includes(
        typeof gate.orderLineId === "string" ? gate.orderLineId : "",
      ),
  );
  if (hasUnexpectedJurisdictionGate) {
    normalized.push(
      structuralUnknownGate(
        "product_jurisdiction",
        null,
        "unexpected_gate_result",
      ),
    );
  }

  return Object.freeze(normalized);
}

function requiredActionsFor(
  decision: GateStatus,
): readonly EligibilityAction[] {
  if (decision === "pass") return Object.freeze([]);
  if (decision === "manual_review") {
    return Object.freeze([
      "deny_checkout",
      "create_compliance_hold",
      "route_case_review",
    ]);
  }
  if (decision === "unknown") {
    return Object.freeze([
      "deny_checkout",
      "create_compliance_hold",
      "route_policy_review",
    ]);
  }
  return Object.freeze(["deny_checkout"]);
}

export function aggregateEligibility(
  gates: readonly GateResult[],
  expectedOrderLineIds: readonly string[],
): EligibilityEvaluation {
  const runtimeGates: readonly unknown[] = Array.isArray(gates) ? gates : [];
  const runtimeExpectedOrderLineIds: readonly string[] = Array.isArray(
    expectedOrderLineIds,
  )
    ? expectedOrderLineIds
    : [];
  const normalizedGates: GateResult[] = [];

  for (const key of REQUIRED_GATE_KEYS) {
    if (key === "product_jurisdiction") {
      normalizedGates.push(
        ...normalizeJurisdictionGates(
          runtimeGates,
          runtimeExpectedOrderLineIds,
        ),
      );
    } else {
      normalizedGates.push(normalizeSingleGate(runtimeGates, key));
    }
  }

  const hasUnrecognizedGate =
    !isDenseArray(runtimeGates) ||
    runtimeGates.some(
      (gate) => !isRecord(gate) || !gateKeys.has(gate.key as GateKey),
    );
  if (hasUnrecognizedGate) {
    normalizedGates.push(
      structuralUnknownGate(
        "product_jurisdiction",
        null,
        "unexpected_gate_result",
      ),
    );
  }

  let decision: GateStatus;
  if (normalizedGates.some((gate) => gate.status === "blocked")) {
    decision = "blocked";
  } else if (normalizedGates.some((gate) => gate.status === "unknown")) {
    decision = "unknown";
  } else if (
    normalizedGates.some((gate) => gate.status === "manual_review")
  ) {
    decision = "manual_review";
  } else {
    decision = "pass";
  }

  const evaluation: EligibilityEvaluation = Object.freeze({
    decision,
    gates: Object.freeze(normalizedGates),
    reasonCodes: Object.freeze(
      normalizedGates.map((gate) =>
        Object.freeze({
          gate: gate.key,
          orderLineId: gate.orderLineId,
          code: gate.reasonCode,
        }),
      ),
    ),
    evidenceRefs: freezeEvidenceRefs(
      normalizedGates.flatMap((gate) => gate.evidenceRefs),
    ),
    requiredActions: requiredActionsFor(decision),
  });
  serverProducedEligibilityEvaluations.add(evaluation);
  return evaluation;
}

export function evaluateCheckoutCreation(
  evaluation: unknown,
): CheckoutCreationDecision {
  if (
    !isRecord(evaluation) ||
    !serverProducedEligibilityEvaluations.has(evaluation)
  ) {
    return Object.freeze({
      permitted: false,
      decision: "unknown",
      reasonCodes: Object.freeze([
        Object.freeze({
          gate: "launch_control",
          orderLineId: null,
          code: "eligibility_evaluation_not_authoritative",
        }),
      ]),
      evidenceRefs: Object.freeze([]),
      requiredActions: requiredActionsFor("unknown"),
    });
  }

  const authoritative = evaluation as EligibilityEvaluation;
  return Object.freeze({
    permitted: authoritative.decision === "pass",
    decision: authoritative.decision,
    reasonCodes: authoritative.reasonCodes,
    evidenceRefs: authoritative.evidenceRefs,
    requiredActions: authoritative.requiredActions,
  });
}
