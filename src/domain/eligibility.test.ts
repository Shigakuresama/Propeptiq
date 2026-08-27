import { describe, expect, it } from "vitest";

import {
  CHECKOUT_GATES,
  evaluateBuyerActivation,
  evaluateCheckout,
  isAuthoritativeCheckoutDecision,
  resolveDestination,
  type CheckoutEvaluationInput,
  type CheckoutGate,
  type DestinationRule,
} from "@/domain/eligibility";

const reviewSnapshotHash = "a".repeat(64);

function rule(
  overrides: Partial<DestinationRule> = {},
): DestinationRule {
  return {
    id: "rule-group-ca",
    version: "policy-v1",
    active: true,
    stateCode: "CA",
    status: "allowed",
    target: {
      kind: "policy_group",
      productPolicyGroupId: "group-1",
    },
    ...overrides,
  };
}

function destination(
  rules: readonly DestinationRule[] = [rule()],
  destinationCode = "ca",
) {
  return resolveDestination({
    productId: "product-1",
    productPolicyGroupId: "group-1",
    destinationCode,
    rules,
  });
}

function checkoutInput(
  overrides: Partial<CheckoutEvaluationInput> = {},
): CheckoutEvaluationInput {
  return {
    authenticated: true,
    buyerStatus: "active",
    acceptedAttestationVersion: "attestation-v1",
    currentAttestationVersion: "attestation-v1",
    items: [
      {
        productId: "product-1",
        active: true,
        catalogComplete: true,
        destination: destination(),
        inventoryAvailable: true,
      },
    ],
    paymentProviderAvailable: true,
    reviewSnapshotHash: null,
    reviewDecision: null,
    ...overrides,
  };
}

describe("evaluateBuyerActivation", () => {
  it("automatically activates a qualified buyer without staff input", () => {
    expect(
      evaluateBuyerActivation({
        emailVerified: true,
        ageConfirmed21Plus: true,
        researchPurpose: "in_vitro",
        acceptedAttestationVersion: "attestation-v1",
        currentAttestationVersion: "attestation-v1",
        statusSignal: null,
      }),
    ).toEqual({ status: "active", reasons: [] });
  });

  it("fails closed with stable reasons and applies explicit status signals", () => {
    expect(
      evaluateBuyerActivation({
        emailVerified: false,
        ageConfirmed21Plus: false,
        researchPurpose: "personal_use" as never,
        acceptedAttestationVersion: "attestation-old",
        currentAttestationVersion: "attestation-v1",
        statusSignal: "review",
      }),
    ).toEqual({
      status: null,
      reasons: [
        "email_not_verified",
        "age_not_confirmed_21_plus",
        "research_purpose_invalid",
        "attestation_not_current",
      ],
    });

    expect(
      evaluateBuyerActivation({
        emailVerified: true,
        ageConfirmed21Plus: true,
        researchPurpose: "analytical",
        acceptedAttestationVersion: "attestation-v1",
        currentAttestationVersion: "attestation-v1",
        statusSignal: "review",
      }),
    ).toEqual({ status: "review", reasons: ["buyer_review"] });

    expect(
      evaluateBuyerActivation({
        emailVerified: false,
        ageConfirmed21Plus: false,
        researchPurpose: null,
        acceptedAttestationVersion: null,
        currentAttestationVersion: "attestation-v1",
        statusSignal: "blocked",
      }),
    ).toEqual({ status: "blocked", reasons: ["buyer_blocked"] });
  });
});

describe("resolveDestination", () => {
  it("exports the exact frozen six-gate order", () => {
    const gates: readonly CheckoutGate[] = CHECKOUT_GATES;

    expect(gates).toEqual([
      "account",
      "attestation",
      "product",
      "destination",
      "inventory",
      "payment_provider",
    ]);
    expect(Object.isFrozen(CHECKOUT_GATES)).toBe(true);
  });

  it("normalizes states and prefers one exact-product rule over a group rule", () => {
    const resolution = destination([
      rule(),
      rule({
        id: "rule-product-ca",
        version: "product-v2",
        status: "blocked",
        target: { kind: "product", productId: "product-1" },
      }),
    ]);

    expect(resolution).toEqual({
      status: "blocked",
      normalizedStateCode: "CA",
      ruleId: "rule-product-ca",
      ruleVersion: "product-v2",
      scope: "product",
    });
  });

  it("fails unavailable for missing, territory, malformed, or conflicting policy", () => {
    expect(destination([]).status).toBe("unavailable");
    expect(destination([rule({ stateCode: "PR" })], "PR").status).toBe(
      "unavailable",
    );
    expect(destination([rule({ version: "" })]).status).toBe("unavailable");
    expect(
      destination([rule(), rule({ id: "rule-group-ca-2" })]).status,
    ).toBe("unavailable");
  });

  it("returns deeply frozen resolutions", () => {
    const resolution = destination();

    expect(Object.isFrozen(resolution)).toBe(true);
  });
});

describe("evaluateCheckout", () => {
  it("permits ordinary qualified checkout without routine evidence or review hashes", () => {
    const decision = evaluateCheckout(checkoutInput());

    expect(decision).toEqual({
      permitted: true,
      reviewRequired: false,
      reasons: [],
    });
    expect(isAuthoritativeCheckoutDecision(decision)).toBe(true);
  });

  it("orders and deduplicates hard denials by the six gates", () => {
    const decision = evaluateCheckout(
      checkoutInput({
        buyerStatus: "blocked",
        acceptedAttestationVersion: "attestation-old",
        items: [
          {
            productId: "product-1",
            active: false,
            catalogComplete: false,
            destination: destination([], "PR"),
            inventoryAvailable: false,
          },
          {
            productId: "product-2",
            active: false,
            catalogComplete: false,
            destination: destination([], "XX"),
            inventoryAvailable: false,
          },
        ],
        paymentProviderAvailable: false,
      }),
    );

    expect(decision).toEqual({
      permitted: false,
      reviewRequired: false,
      reasons: [
        "buyer_blocked",
        "attestation_not_current",
        "product_inactive",
        "product_catalog_incomplete",
        "destination_unavailable",
        "inventory_unavailable",
        "payment_provider_unavailable",
      ],
    });
  });

  it("requires exact complete review approval for buyer and destination review", () => {
    const reviewRule = rule({ status: "review" });
    const input = checkoutInput({
      buyerStatus: "review",
      items: [
        {
          productId: "product-1",
          active: true,
          catalogComplete: true,
          destination: destination([reviewRule]),
          inventoryAvailable: true,
        },
      ],
      reviewSnapshotHash,
      reviewDecision: {
        reviewSnapshotHash,
        outcome: "approved",
        coversBuyerReview: true,
        destinationRuleIds: ["rule-group-ca"],
      },
    });

    expect(evaluateCheckout(input)).toEqual({
      permitted: true,
      reviewRequired: false,
      reasons: [],
    });
  });

  it("leaves mismatched or incomplete explicit reviews unmet", () => {
    const reviewRule = rule({ status: "review" });
    const base = checkoutInput({
      buyerStatus: "review",
      items: [
        {
          productId: "product-1",
          active: true,
          catalogComplete: true,
          destination: destination([reviewRule]),
          inventoryAvailable: true,
        },
      ],
      reviewSnapshotHash,
    });

    expect(
      evaluateCheckout({
        ...base,
        reviewDecision: {
          reviewSnapshotHash: "b".repeat(64),
          outcome: "approved",
          coversBuyerReview: true,
          destinationRuleIds: ["rule-group-ca"],
        },
      }),
    ).toEqual({
      permitted: false,
      reviewRequired: true,
      reasons: ["buyer_review_required", "destination_review_required"],
    });

    expect(
      evaluateCheckout({
        ...base,
        reviewDecision: {
          reviewSnapshotHash,
          outcome: "approved",
          coversBuyerReview: false,
          destinationRuleIds: [],
        },
      }),
    ).toEqual({
      permitted: false,
      reviewRequired: true,
      reasons: ["buyer_review_required", "destination_review_required"],
    });
  });

  it("treats a matching rejection as a hard denial", () => {
    const decision = evaluateCheckout(
      checkoutInput({
        buyerStatus: "review",
        reviewSnapshotHash,
        reviewDecision: {
          reviewSnapshotHash,
          outcome: "rejected",
          coversBuyerReview: true,
          destinationRuleIds: [],
        },
      }),
    );

    expect(decision).toEqual({
      permitted: false,
      reviewRequired: false,
      reasons: ["review_rejected"],
    });
  });

  it("hard-denies a reviewed buyer when a matching rejection has empty coverage", () => {
    const decision = evaluateCheckout(
      checkoutInput({
        buyerStatus: "review",
        reviewSnapshotHash,
        reviewDecision: {
          reviewSnapshotHash,
          outcome: "rejected",
          coversBuyerReview: false,
          destinationRuleIds: [],
        },
      }),
    );

    expect(decision).toEqual({
      permitted: false,
      reviewRequired: false,
      reasons: ["review_rejected"],
    });
  });

  it("hard-denies an otherwise-passable checkout carrying a matching rejection", () => {
    const decision = evaluateCheckout(
      checkoutInput({
        reviewSnapshotHash,
        reviewDecision: {
          reviewSnapshotHash,
          outcome: "rejected",
          coversBuyerReview: false,
          destinationRuleIds: [],
        },
      }),
    );

    expect(decision).toEqual({
      permitted: false,
      reviewRequired: false,
      reasons: ["review_rejected"],
    });
  });

  it("leaves a mismatched rejection inapplicable", () => {
    const decision = evaluateCheckout(
      checkoutInput({
        buyerStatus: "review",
        reviewSnapshotHash,
        reviewDecision: {
          reviewSnapshotHash: "b".repeat(64),
          outcome: "rejected",
          coversBuyerReview: false,
          destinationRuleIds: [],
        },
      }),
    );

    expect(decision).toEqual({
      permitted: false,
      reviewRequired: true,
      reasons: ["buyer_review_required"],
    });
  });

  it("suppresses review work whenever another gate hard-denies checkout", () => {
    const decision = evaluateCheckout(
      checkoutInput({
        buyerStatus: "review",
        items: [
          {
            productId: "product-1",
            active: false,
            catalogComplete: true,
            destination: destination([rule({ status: "review" })]),
            inventoryAvailable: true,
          },
        ],
        reviewSnapshotHash,
      }),
    );

    expect(decision).toEqual({
      permitted: false,
      reviewRequired: false,
      reasons: ["product_inactive"],
    });
  });

  it("fails closed for malformed top-level input", () => {
    expect(evaluateCheckout({ items: [] } as never)).toEqual({
      permitted: false,
      reviewRequired: false,
      reasons: ["checkout_input_invalid"],
    });
  });

  it("rejects structurally identical browser-created decisions", () => {
    const decision = evaluateCheckout(checkoutInput());

    expect(isAuthoritativeCheckoutDecision({ ...decision })).toBe(false);
    expect(isAuthoritativeCheckoutDecision(decision)).toBe(true);
  });

  it("returns deeply immutable activation and checkout decisions", () => {
    const activation = evaluateBuyerActivation({
      emailVerified: true,
      ageConfirmed21Plus: true,
      researchPurpose: "educational",
      acceptedAttestationVersion: "attestation-v1",
      currentAttestationVersion: "attestation-v1",
      statusSignal: null,
    });
    const decision = evaluateCheckout(checkoutInput());

    expect(Object.isFrozen(activation)).toBe(true);
    expect(Object.isFrozen(activation.reasons)).toBe(true);
    expect(Object.isFrozen(decision)).toBe(true);
    expect(Object.isFrozen(decision.reasons)).toBe(true);
  });
});
