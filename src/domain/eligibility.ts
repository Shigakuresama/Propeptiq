export type BuyerStatus = "active" | "review" | "blocked";

export type ResearchPurpose =
  | "in_vitro"
  | "analytical"
  | "educational"
  | "other_laboratory";

export type CheckoutGate =
  | "account"
  | "attestation"
  | "product"
  | "destination"
  | "inventory"
  | "payment_provider";

export const CHECKOUT_GATES = Object.freeze([
  "account",
  "attestation",
  "product",
  "destination",
  "inventory",
  "payment_provider",
] as const satisfies readonly CheckoutGate[]);

export type CheckoutDecision = Readonly<{
  permitted: boolean;
  reviewRequired: boolean;
  reasons: readonly string[];
}>;

export type BuyerActivationInput = Readonly<{
  emailVerified: boolean;
  ageConfirmed21Plus: boolean;
  researchPurpose: ResearchPurpose | null;
  acceptedAttestationVersion: string | null;
  currentAttestationVersion: string;
  statusSignal: "review" | "blocked" | null;
}>;

export type BuyerActivationDecision = Readonly<{
  status: BuyerStatus | null;
  reasons: readonly string[];
}>;

export type DestinationRuleStatus = "allowed" | "review" | "blocked";

export type DestinationRule = Readonly<{
  id: string;
  version: string;
  active: boolean;
  stateCode: string;
  status: DestinationRuleStatus;
  target:
    | Readonly<{ kind: "product"; productId: string }>
    | Readonly<{
        kind: "policy_group";
        productPolicyGroupId: string;
      }>;
}>;

export type DestinationResolution = Readonly<{
  status: DestinationRuleStatus | "unavailable";
  normalizedStateCode: string | null;
  ruleId: string | null;
  ruleVersion: string | null;
  scope: "product" | "policy_group" | null;
}>;

export type DestinationResolutionInput = Readonly<{
  productId: string;
  productPolicyGroupId: string;
  destinationCode: string;
  rules: readonly DestinationRule[];
}>;

export type ReviewDecision = Readonly<{
  reviewSnapshotHash: string;
  outcome: "approved" | "rejected";
  coversBuyerReview: boolean;
  destinationRuleIds: readonly string[];
}>;

export type CheckoutItemFacts = Readonly<{
  productId: string;
  active: boolean;
  catalogComplete: boolean;
  destination: DestinationResolution;
  inventoryAvailable: boolean;
}>;

export type CheckoutEvaluationInput = Readonly<{
  authenticated: boolean;
  buyerStatus: BuyerStatus | null;
  acceptedAttestationVersion: string | null;
  currentAttestationVersion: string;
  items: readonly CheckoutItemFacts[];
  paymentProviderAvailable: boolean;
  reviewSnapshotHash: string | null;
  reviewDecision: ReviewDecision | null;
}>;

const researchPurposes = new Set<ResearchPurpose>([
  "in_vitro",
  "analytical",
  "educational",
  "other_laboratory",
]);

const buyerStatuses = new Set<BuyerStatus>([
  "active",
  "review",
  "blocked",
]);

const destinationStatuses = new Set<DestinationRuleStatus>([
  "allowed",
  "review",
  "blocked",
]);

const usStateCodes = new Set([
  "AL",
  "AK",
  "AZ",
  "AR",
  "CA",
  "CO",
  "CT",
  "DE",
  "DC",
  "FL",
  "GA",
  "HI",
  "ID",
  "IL",
  "IN",
  "IA",
  "KS",
  "KY",
  "LA",
  "ME",
  "MD",
  "MA",
  "MI",
  "MN",
  "MS",
  "MO",
  "MT",
  "NE",
  "NV",
  "NH",
  "NJ",
  "NM",
  "NY",
  "NC",
  "ND",
  "OH",
  "OK",
  "OR",
  "PA",
  "RI",
  "SC",
  "SD",
  "TN",
  "TX",
  "UT",
  "VT",
  "VA",
  "WA",
  "WV",
  "WI",
  "WY",
]);

const authoritativeCheckoutDecisions = new WeakSet<object>();

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

function isSha256(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

function frozenStrings(values: readonly string[]): readonly string[] {
  return Object.freeze([...values]);
}

function frozenActivation(
  status: BuyerStatus | null,
  reasons: readonly string[],
): BuyerActivationDecision {
  return Object.freeze({ status, reasons: frozenStrings(reasons) });
}

export function evaluateBuyerActivation(
  input: BuyerActivationInput,
): BuyerActivationDecision {
  if (isRecord(input) && input.statusSignal === "blocked") {
    return frozenActivation("blocked", ["buyer_blocked"]);
  }

  const reasons: string[] = [];
  if (!isRecord(input) || input.emailVerified !== true) {
    reasons.push("email_not_verified");
  }
  if (!isRecord(input) || input.ageConfirmed21Plus !== true) {
    reasons.push("age_not_confirmed_21_plus");
  }
  if (
    !isRecord(input) ||
    !researchPurposes.has(input.researchPurpose as ResearchPurpose)
  ) {
    reasons.push("research_purpose_invalid");
  }
  if (
    !isRecord(input) ||
    !isNonBlank(input.currentAttestationVersion) ||
    input.acceptedAttestationVersion !== input.currentAttestationVersion
  ) {
    reasons.push("attestation_not_current");
  }

  if (reasons.length > 0) return frozenActivation(null, reasons);
  if (input.statusSignal === "review") {
    return frozenActivation("review", ["buyer_review"]);
  }
  if (input.statusSignal !== null) return frozenActivation(null, []);
  return frozenActivation("active", []);
}

function unavailableResolution(
  normalizedStateCode: string | null,
): DestinationResolution {
  return Object.freeze({
    status: "unavailable",
    normalizedStateCode,
    ruleId: null,
    ruleVersion: null,
    scope: null,
  });
}

function isValidDestinationRule(value: unknown): value is DestinationRule {
  if (
    !isRecord(value) ||
    !isNonBlank(value.id) ||
    !isNonBlank(value.version) ||
    typeof value.active !== "boolean" ||
    typeof value.stateCode !== "string" ||
    !destinationStatuses.has(value.status as DestinationRuleStatus) ||
    !isRecord(value.target)
  ) {
    return false;
  }

  if (value.target.kind === "product") {
    return isNonBlank(value.target.productId);
  }
  if (value.target.kind === "policy_group") {
    return isNonBlank(value.target.productPolicyGroupId);
  }
  return false;
}

export function resolveDestination(
  input: DestinationResolutionInput,
): DestinationResolution {
  const normalizedStateCode =
    isRecord(input) && typeof input.destinationCode === "string"
      ? input.destinationCode.trim().toUpperCase()
      : null;

  if (
    !isRecord(input) ||
    !isNonBlank(input.productId) ||
    !isNonBlank(input.productPolicyGroupId) ||
    normalizedStateCode === null ||
    !usStateCodes.has(normalizedStateCode) ||
    !isDenseArray(input.rules) ||
    !input.rules.every(isValidDestinationRule)
  ) {
    return unavailableResolution(
      normalizedStateCode !== null && usStateCodes.has(normalizedStateCode)
        ? normalizedStateCode
        : null,
    );
  }

  const activeForState = input.rules.filter(
    (candidate) =>
      candidate.active &&
      candidate.stateCode.trim().toUpperCase() === normalizedStateCode,
  );
  const exactRules = activeForState.filter(
    (candidate) =>
      candidate.target.kind === "product" &&
      candidate.target.productId === input.productId,
  );
  const groupRules = activeForState.filter(
    (candidate) =>
      candidate.target.kind === "policy_group" &&
      candidate.target.productPolicyGroupId === input.productPolicyGroupId,
  );

  if (exactRules.length > 1 || groupRules.length > 1) {
    return unavailableResolution(normalizedStateCode);
  }

  const chosen = exactRules[0] ?? groupRules[0];
  if (chosen === undefined) {
    return unavailableResolution(normalizedStateCode);
  }

  return Object.freeze({
    status: chosen.status,
    normalizedStateCode,
    ruleId: chosen.id,
    ruleVersion: chosen.version,
    scope: chosen.target.kind,
  });
}

function isValidDestinationResolution(
  value: unknown,
): value is DestinationResolution {
  if (
    !isRecord(value) ||
    !["allowed", "review", "blocked", "unavailable"].includes(
      value.status as string,
    ) ||
    (value.normalizedStateCode !== null &&
      (typeof value.normalizedStateCode !== "string" ||
        !usStateCodes.has(value.normalizedStateCode)))
  ) {
    return false;
  }

  if (value.status === "unavailable") {
    return (
      value.ruleId === null &&
      value.ruleVersion === null &&
      value.scope === null
    );
  }

  return (
    isNonBlank(value.ruleId) &&
    isNonBlank(value.ruleVersion) &&
    (value.scope === "product" || value.scope === "policy_group") &&
    typeof value.normalizedStateCode === "string"
  );
}

function isValidReviewDecision(value: unknown): value is ReviewDecision {
  return (
    isRecord(value) &&
    isSha256(value.reviewSnapshotHash) &&
    (value.outcome === "approved" || value.outcome === "rejected") &&
    typeof value.coversBuyerReview === "boolean" &&
    isDenseArray(value.destinationRuleIds) &&
    value.destinationRuleIds.every(isNonBlank) &&
    new Set(value.destinationRuleIds).size === value.destinationRuleIds.length
  );
}

function isValidCheckoutInput(
  value: unknown,
): value is CheckoutEvaluationInput {
  if (
    !isRecord(value) ||
    typeof value.authenticated !== "boolean" ||
    (value.buyerStatus !== null &&
      !buyerStatuses.has(value.buyerStatus as BuyerStatus)) ||
    (value.acceptedAttestationVersion !== null &&
      !isNonBlank(value.acceptedAttestationVersion)) ||
    !isNonBlank(value.currentAttestationVersion) ||
    !isDenseArray(value.items) ||
    value.items.length === 0 ||
    typeof value.paymentProviderAvailable !== "boolean" ||
    (value.reviewSnapshotHash !== null &&
      !isSha256(value.reviewSnapshotHash)) ||
    (value.reviewDecision !== null &&
      !isValidReviewDecision(value.reviewDecision))
  ) {
    return false;
  }

  return value.items.every(
    (item) =>
      isRecord(item) &&
      isNonBlank(item.productId) &&
      typeof item.active === "boolean" &&
      typeof item.catalogComplete === "boolean" &&
      isValidDestinationResolution(item.destination) &&
      typeof item.inventoryAvailable === "boolean",
  );
}

function pushUnique(target: string[], reason: string): void {
  if (!target.includes(reason)) target.push(reason);
}

function checkoutDecision(
  permitted: boolean,
  reviewRequired: boolean,
  reasons: readonly string[],
): CheckoutDecision {
  const decision = Object.freeze({
    permitted,
    reviewRequired,
    reasons: frozenStrings(reasons),
  });
  authoritativeCheckoutDecisions.add(decision);
  return decision;
}

export function evaluateCheckout(
  input: CheckoutEvaluationInput,
): CheckoutDecision {
  if (!isValidCheckoutInput(input)) {
    return checkoutDecision(false, false, ["checkout_input_invalid"]);
  }

  const hardReasonsByGate = new Map<CheckoutGate, string[]>(
    CHECKOUT_GATES.map((gate) => [gate, []]),
  );
  const addHard = (gate: CheckoutGate, reason: string) => {
    pushUnique(hardReasonsByGate.get(gate)!, reason);
  };

  if (!input.authenticated || input.buyerStatus === null) {
    addHard("account", "account_required");
  } else if (input.buyerStatus === "blocked") {
    addHard("account", "buyer_blocked");
  }

  if (
    input.acceptedAttestationVersion !== input.currentAttestationVersion
  ) {
    addHard("attestation", "attestation_not_current");
  }

  for (const item of input.items) {
    if (!item.active) addHard("product", "product_inactive");
    if (!item.catalogComplete) {
      addHard("product", "product_catalog_incomplete");
    }
    if (item.destination.status === "blocked") {
      addHard("destination", "destination_blocked");
    } else if (item.destination.status === "unavailable") {
      addHard("destination", "destination_unavailable");
    }
    if (!item.inventoryAvailable) {
      addHard("inventory", "inventory_unavailable");
    }
  }

  if (!input.paymentProviderAvailable) {
    addHard("payment_provider", "payment_provider_unavailable");
  }

  const buyerNeedsReview = input.buyerStatus === "review";
  const destinationReviewRuleIds = [
    ...new Set(
      input.items.flatMap((item) =>
        item.destination.status === "review" &&
        item.destination.ruleId !== null
          ? [item.destination.ruleId]
          : [],
      ),
    ),
  ];
  const reviewDecisionMatches =
    input.reviewSnapshotHash !== null &&
    input.reviewDecision !== null &&
    input.reviewDecision.reviewSnapshotHash === input.reviewSnapshotHash;
  const buyerCovered =
    buyerNeedsReview &&
    reviewDecisionMatches &&
    input.reviewDecision!.coversBuyerReview;
  const coveredDestinationRuleIds = new Set(
    reviewDecisionMatches ? input.reviewDecision!.destinationRuleIds : [],
  );
  const destinationCovered = destinationReviewRuleIds.every((id) =>
    coveredDestinationRuleIds.has(id),
  );

  if (
    reviewDecisionMatches &&
    input.reviewDecision!.outcome === "rejected"
  ) {
    if (buyerCovered) {
      addHard("account", "review_rejected");
    } else if (
      destinationReviewRuleIds.some((id) =>
        coveredDestinationRuleIds.has(id),
      )
    ) {
      addHard("destination", "review_rejected");
    }
  }

  const hardReasons = CHECKOUT_GATES.flatMap(
    (gate) => hardReasonsByGate.get(gate)!,
  );
  if (hardReasons.length > 0) {
    return checkoutDecision(false, false, hardReasons);
  }

  const reviewReasons: string[] = [];
  const approvalMatches =
    reviewDecisionMatches && input.reviewDecision!.outcome === "approved";
  if (buyerNeedsReview && !(approvalMatches && buyerCovered)) {
    reviewReasons.push("buyer_review_required");
  }
  if (
    destinationReviewRuleIds.length > 0 &&
    !(approvalMatches && destinationCovered)
  ) {
    reviewReasons.push("destination_review_required");
  }

  if (reviewReasons.length > 0) {
    return checkoutDecision(false, true, reviewReasons);
  }
  return checkoutDecision(true, false, []);
}

export function isAuthoritativeCheckoutDecision(
  value: unknown,
): value is CheckoutDecision {
  return isRecord(value) && authoritativeCheckoutDecisions.has(value);
}
