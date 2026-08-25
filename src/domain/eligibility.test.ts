import { describe, expect, it } from "vitest";

import {
  aggregateEligibility,
  evaluateCheckoutCreation,
  evaluateJurisdiction,
  jurisdictionStateToGateStatus,
  REQUIRED_GATE_KEYS,
  type GateKey,
  type GateResult,
  type JurisdictionEvaluationInput,
  type JurisdictionRule,
  type ManualReviewCaseDecision,
} from "@/domain/eligibility";

const allGateKeys = [
  "buyer_verification",
  "catalog_approval",
  "product_jurisdiction",
  "payment_provider",
  "tax",
  "shipping",
  "inventory_lot",
  "compliance_clearance",
  "launch_control",
] as const satisfies readonly GateKey[];

function passingGates(): readonly GateResult[] {
  return allGateKeys.map((key) => ({
    key,
    orderLineId:
      key === "product_jurisdiction" ? "synthetic-line-1" : null,
    status: "pass",
    reasonCode: `${key}_passed`,
    evidenceRefs: [
      {
        kind: "synthetic_test_evidence",
        id: `synthetic-${key}`,
        version: "test-v1",
        sha256: null,
      },
    ],
  }));
}

function aggregate(
  gates: readonly GateResult[],
  expectedOrderLineIds: readonly string[] = ["synthetic-line-1"],
) {
  return aggregateEligibility(gates, expectedOrderLineIds);
}

describe("aggregateEligibility", () => {
  it("allows checkout only when every required gate passes", () => {
    const gates = passingGates();

    const evaluation = aggregate(gates);

    expect(evaluation.decision).toBe("pass");
    expect(evaluation.gates).toHaveLength(9);
    expect(evaluateCheckoutCreation(evaluation)).toMatchObject({
      permitted: true,
      decision: "pass",
      reasonCodes: evaluation.reasonCodes,
      evidenceRefs: evaluation.evidenceRefs,
    });
  });

  it("allows checkout only from the immutable aggregate produced by this policy boundary", () => {
    const evaluation = aggregate(passingGates());

    for (const untrusted of [null, { decision: "pass" }, { ...evaluation }]) {
      expect(evaluateCheckoutCreation(untrusted)).toEqual({
        permitted: false,
        decision: "unknown",
        reasonCodes: [
          {
            gate: "launch_control",
            orderLineId: null,
            code: "eligibility_evaluation_not_authoritative",
          },
        ],
        evidenceRefs: [],
        requiredActions: [
          "deny_checkout",
          "create_compliance_hold",
          "route_policy_review",
        ],
      });
    }
    expect(evaluateCheckoutCreation(evaluation).permitted).toBe(true);
  });

  it("treats a sparse gate collection as structurally unknown", () => {
    const gates = [...passingGates()];
    gates.length += 1;

    const evaluation = aggregate(gates);

    expect(evaluation.decision).toBe("unknown");
    expect(evaluation.reasonCodes).toContainEqual({
      gate: "product_jurisdiction",
      orderLineId: null,
      code: "unexpected_gate_result",
    });
    expect(evaluateCheckoutCreation(evaluation).permitted).toBe(false);
  });

  it.each([
    {
      name: "blocked outranks unknown and manual review",
      overrides: {
        buyer_verification: "manual_review",
        tax: "unknown",
        shipping: "blocked",
      },
      expected: "blocked",
    },
    {
      name: "unknown outranks manual review",
      overrides: {
        buyer_verification: "manual_review",
        tax: "unknown",
      },
      expected: "unknown",
    },
    {
      name: "manual review outranks pass",
      overrides: { buyer_verification: "manual_review" },
      expected: "manual_review",
    },
  ] as const)("enforces precedence: $name", ({ overrides, expected }) => {
    const gates = passingGates().map((gate) => ({
      ...gate,
      status: overrides[gate.key as keyof typeof overrides] ?? gate.status,
    }));

    const evaluation = aggregate(gates);

    expect(evaluation.decision).toBe(expected);
    expect(evaluateCheckoutCreation(evaluation).permitted).toBe(false);
  });

  it("turns missing or duplicate gate results into structured unknown denials", () => {
    const withoutLaunchControl = passingGates().filter(
      (gate) => gate.key !== "launch_control",
    );
    const missing = aggregate(withoutLaunchControl);

    expect(missing.decision).toBe("unknown");
    expect(missing.gates).toContainEqual({
      key: "launch_control",
      orderLineId: null,
      status: "unknown",
      reasonCode: "missing_gate_result",
      evidenceRefs: [],
    });
    expect(missing.reasonCodes).toContainEqual({
      gate: "launch_control",
      orderLineId: null,
      code: "missing_gate_result",
    });
    expect(missing.requiredActions).toEqual([
      "deny_checkout",
      "create_compliance_hold",
      "route_policy_review",
    ]);

    const duplicated = aggregate([
      ...passingGates(),
      passingGates()[0]!,
    ]);

    expect(duplicated.decision).toBe("unknown");
    expect(duplicated.reasonCodes).toContainEqual({
      gate: "buyer_verification",
      orderLineId: null,
      code: "duplicate_gate_result",
    });
    expect(evaluateCheckoutCreation(duplicated).permitted).toBe(false);
  });

  it.each([
    {
      name: "blank reason code",
      replacement: { reasonCode: "   " },
    },
    {
      name: "missing evidence on a passing gate",
      replacement: { evidenceRefs: [] },
    },
    {
      name: "malformed evidence hash",
      replacement: {
        evidenceRefs: [
          {
            kind: "synthetic_test_evidence",
            id: "synthetic-evidence",
            version: "test-v1",
            sha256: "not-a-sha256",
          },
        ],
      },
    },
    {
      name: "unknown runtime status",
      replacement: { status: "surprise_status" },
    },
  ])("fails closed for a $name", ({ replacement }) => {
    const gates = passingGates().map((gate) =>
      gate.key === "tax" ? { ...gate, ...replacement } : gate,
    ) as readonly GateResult[];

    const evaluation = aggregate(gates);

    expect(evaluation.decision).toBe("unknown");
    expect(evaluation.reasonCodes).toContainEqual({
      gate: "tax",
      orderLineId: null,
      code: "invalid_gate_result",
    });
  });

  it("rejects sparse evidence on a passing gate", () => {
    const sparseEvidenceRefs = Array(1) as unknown as GateResult["evidenceRefs"];
    const gates = passingGates().map((gate) =>
      gate.key === "tax"
        ? { ...gate, evidenceRefs: sparseEvidenceRefs }
        : gate,
    );

    const evaluation = aggregate(gates);

    expect(evaluation.decision).toBe("unknown");
    expect(evaluation.reasonCodes).toContainEqual({
      gate: "tax",
      orderLineId: null,
      code: "invalid_gate_result",
    });
    expect(evaluateCheckoutCreation(evaluation).permitted).toBe(false);
  });

  it("requires exactly one jurisdiction result for every expected order line", () => {
    const nonJurisdictionGates = passingGates().filter(
      (gate) => gate.key !== "product_jurisdiction",
    );
    const jurisdictionGate = passingGates().find(
      (gate) => gate.key === "product_jurisdiction",
    )!;
    const lineOne = { ...jurisdictionGate, orderLineId: "synthetic-line-1" };
    const lineTwo = { ...jurisdictionGate, orderLineId: "synthetic-line-2" };

    expect(
      aggregate(
        [...nonJurisdictionGates, lineOne, lineTwo],
        ["synthetic-line-1", "synthetic-line-2"],
      ).decision,
    ).toBe("pass");

    const missing = aggregate(
      [...nonJurisdictionGates, lineOne],
      ["synthetic-line-1", "synthetic-line-2"],
    );
    expect(missing.decision).toBe("unknown");
    expect(missing.gates).toContainEqual({
      key: "product_jurisdiction",
      orderLineId: "synthetic-line-2",
      status: "unknown",
      reasonCode: "missing_gate_result",
      evidenceRefs: [],
    });

    const duplicate = aggregate(
      [...nonJurisdictionGates, lineOne, lineOne, lineTwo],
      ["synthetic-line-1", "synthetic-line-2"],
    );
    expect(duplicate.decision).toBe("unknown");
    expect(duplicate.reasonCodes).toContainEqual({
      gate: "product_jurisdiction",
      orderLineId: "synthetic-line-1",
      code: "duplicate_gate_result",
    });
  });

  it.each([
    ["an empty set", []],
    ["a blank line id", ["   "]],
    ["duplicate line ids", ["synthetic-line-1", "synthetic-line-1"]],
    ["a non-string line id", [17]],
  ] as const)("denies checkout for %s expected order-line ids", (_name, ids) => {
    const evaluation = aggregate(
      passingGates(),
      ids as unknown as readonly string[],
    );

    expect(evaluation.decision).toBe("unknown");
    expect(evaluation.reasonCodes).toContainEqual({
      gate: "product_jurisdiction",
      orderLineId: null,
      code: "invalid_order_line_scope",
    });
    expect(evaluateCheckoutCreation(evaluation).permitted).toBe(false);
  });

  it("denies checkout for a sparse expected order-line scope without throwing", () => {
    const sparseExpectedOrderLineIds = Array(1) as unknown as readonly string[];

    const evaluation = aggregate(
      passingGates(),
      sparseExpectedOrderLineIds,
    );

    expect(evaluation.decision).toBe("unknown");
    expect(evaluation.reasonCodes).toContainEqual({
      gate: "product_jurisdiction",
      orderLineId: null,
      code: "invalid_order_line_scope",
    });
    expect(evaluateCheckoutCreation(evaluation).permitted).toBe(false);
  });

  it("treats a missing runtime reason code as invalid rather than matching undefined", () => {
    const gates = passingGates().map((gate) =>
      gate.key === "shipping" ? { ...gate, reasonCode: undefined } : gate,
    ) as unknown as readonly GateResult[];

    const evaluation = aggregate(gates);

    expect(evaluation.decision).toBe("unknown");
    expect(evaluation.reasonCodes).toContainEqual({
      gate: "shipping",
      orderLineId: null,
      code: "invalid_gate_result",
    });
  });

  it("derives precedence only from normalized gates", () => {
    const gates = passingGates().map((gate) =>
      gate.key === "shipping"
        ? { ...gate, status: "blocked", reasonCode: undefined }
        : gate,
    ) as unknown as readonly GateResult[];

    const evaluation = aggregate(gates);

    expect(evaluation.decision).toBe("unknown");
    expect(evaluation.requiredActions).toContain("route_policy_review");
  });

  it("returns a deeply immutable evaluation snapshot", () => {
    const evaluation = aggregate(passingGates());
    const checkoutDecision = evaluateCheckoutCreation(evaluation);

    expect(Object.isFrozen(evaluation)).toBe(true);
    expect(Object.isFrozen(evaluation.gates)).toBe(true);
    expect(Object.isFrozen(evaluation.gates[0])).toBe(true);
    expect(Object.isFrozen(evaluation.gates[0]!.evidenceRefs)).toBe(true);
    expect(Object.isFrozen(evaluation.gates[0]!.evidenceRefs[0])).toBe(true);
    expect(Object.isFrozen(evaluation.reasonCodes)).toBe(true);
    expect(Object.isFrozen(evaluation.requiredActions)).toBe(true);
    expect(Object.isFrozen(checkoutDecision)).toBe(true);
    expect(Object.isFrozen(REQUIRED_GATE_KEYS)).toBe(true);
  });
});

describe("jurisdictionStateToGateStatus", () => {
  it.each([
    ["Allowed", "pass"],
    ["Manual Review", "manual_review"],
    ["Blocked", "blocked"],
    ["Unknown", "unknown"],
  ] as const)("maps %s exactly to %s", (jurisdiction, expected) => {
    expect(jurisdictionStateToGateStatus(jurisdiction)).toBe(expected);
  });

  it("maps every invalid runtime state to unknown", () => {
    expect(jurisdictionStateToGateStatus("not-a-state")).toBe("unknown");
    expect(jurisdictionStateToGateStatus(null)).toBe("unknown");
  });

  it.each([
    ["undefined", undefined],
    ["a number", 17],
    ["an object", {}],
    ["an array", []],
    ["a blank string", "   "],
    ["a lowercase allowed variant", "allowed"],
    ["a case variant", "manual review"],
    ["a padded variant", " Allowed "],
  ] as const)("maps %s to unknown", (_name, state) => {
    expect(jurisdictionStateToGateStatus(state)).toBe("unknown");
  });
});

describe("evaluateJurisdiction", () => {
  const now = new Date("2026-08-24T12:00:00.000Z");
  const policyEvidence = {
    kind: "synthetic_test_policy",
    id: "synthetic-policy-1",
    version: "test-v1",
    sha256: "b".repeat(64),
  } as const;
  const decisionEvidence = {
    kind: "synthetic_test_case_decision",
    id: "synthetic-case-1",
    version: "test-v1",
    sha256: "c".repeat(64),
  } as const;

  function currentRule(
    overrides: Partial<JurisdictionRule> = {},
  ): JurisdictionRule {
    return {
      id: "synthetic-rule-1",
      productId: "synthetic-product-1",
      destinationCode: "synthetic-destination-1",
      state: "Allowed",
      effectiveAt: new Date("2026-08-01T00:00:00.000Z"),
      expiresAt: new Date("2026-09-01T00:00:00.000Z"),
      supersededAt: null,
      integrityVerified: true,
      evidenceEffectiveAt: new Date("2026-08-01T00:00:00.000Z"),
      evidenceExpiresAt: new Date("2026-09-01T00:00:00.000Z"),
      evidenceIntegrityVerified: true,
      evidenceRefs: [policyEvidence],
      ...overrides,
    };
  }

  function jurisdictionInput(
    overrides: Partial<JurisdictionEvaluationInput> = {},
  ): JurisdictionEvaluationInput {
    return {
      now,
      orderId: "synthetic-order-1",
      orderLineId: "synthetic-line-1",
      destinationCode: "synthetic-destination-1",
      evaluationHash: "a".repeat(64),
      product: {
        id: "synthetic-product-1",
        approved: true,
        active: true,
      },
      rule: currentRule(),
      caseDecision: null,
      ...overrides,
    };
  }

  function currentCaseDecision(
    overrides: Partial<ManualReviewCaseDecision> = {},
  ): ManualReviewCaseDecision {
    return {
      ruleId: "synthetic-rule-1",
      orderLineId: "synthetic-line-1",
      outcome: "approved",
      orderId: "synthetic-order-1",
      evaluationHash: "a".repeat(64),
      effectiveAt: new Date("2026-08-24T10:00:00.000Z"),
      expiresAt: new Date("2026-08-25T10:00:00.000Z"),
      supersededAt: null,
      evidenceRefs: [decisionEvidence],
      ...overrides,
    };
  }

  it("passes an approved active product with a current evidence-backed Allowed rule", () => {
    const result = evaluateJurisdiction(jurisdictionInput());

    expect(result).toEqual({
      key: "product_jurisdiction",
      orderLineId: "synthetic-line-1",
      status: "pass",
      reasonCode: "jurisdiction_rule_allowed",
      evidenceRefs: [
        {
          ...policyEvidence,
        },
      ],
    });
  });

  it("rejects sparse evidence on an Allowed rule", () => {
    const sparseEvidenceRefs = Array(1) as unknown as JurisdictionRule["evidenceRefs"];

    const result = evaluateJurisdiction(
      jurisdictionInput({
        rule: currentRule({ evidenceRefs: sparseEvidenceRefs }),
      }),
    );

    expect(result).toMatchObject({
      status: "unknown",
      reasonCode: "jurisdiction_rule_evidence_missing",
    });
  });

  it.each([
    {
      name: "an unapproved product",
      input: jurisdictionInput({
        product: {
          id: "synthetic-product-1",
          approved: false,
          active: true,
        },
      }),
      status: "blocked",
      reasonCode: "product_not_approved",
    },
    {
      name: "an inactive product",
      input: jurisdictionInput({
        product: {
          id: "synthetic-product-1",
          approved: true,
          active: false,
        },
      }),
      status: "blocked",
      reasonCode: "product_not_active",
    },
    {
      name: "a missing exact rule",
      input: jurisdictionInput({ rule: null }),
      status: "unknown",
      reasonCode: "jurisdiction_rule_missing",
    },
    {
      name: "a rule for another product",
      input: jurisdictionInput({
        rule: currentRule({ productId: "synthetic-other-product" }),
      }),
      status: "unknown",
      reasonCode: "jurisdiction_rule_scope_mismatch",
    },
    {
      name: "a rule for another destination",
      input: jurisdictionInput({
        rule: currentRule({ destinationCode: "synthetic-other-destination" }),
      }),
      status: "unknown",
      reasonCode: "jurisdiction_rule_scope_mismatch",
    },
    {
      name: "a future rule",
      input: jurisdictionInput({
        rule: currentRule({
          effectiveAt: new Date("2026-08-25T00:00:00.000Z"),
        }),
      }),
      status: "unknown",
      reasonCode: "jurisdiction_rule_not_current",
    },
    {
      name: "an expired rule",
      input: jurisdictionInput({
        rule: currentRule({
          expiresAt: new Date("2026-08-24T12:00:00.000Z"),
        }),
      }),
      status: "unknown",
      reasonCode: "jurisdiction_rule_not_current",
    },
    {
      name: "a superseded rule",
      input: jurisdictionInput({
        rule: currentRule({
          supersededAt: new Date("2026-08-24T11:00:00.000Z"),
        }),
      }),
      status: "unknown",
      reasonCode: "jurisdiction_rule_not_current",
    },
    {
      name: "a failed rule integrity check",
      input: jurisdictionInput({
        rule: currentRule({ integrityVerified: false }),
      }),
      status: "unknown",
      reasonCode: "jurisdiction_rule_integrity_failed",
    },
    {
      name: "expired rule evidence",
      input: jurisdictionInput({
        rule: currentRule({
          evidenceExpiresAt: new Date("2026-08-24T12:00:00.000Z"),
        }),
      }),
      status: "unknown",
      reasonCode: "jurisdiction_rule_evidence_not_current",
    },
    {
      name: "failed evidence integrity",
      input: jurisdictionInput({
        rule: currentRule({ evidenceIntegrityVerified: false }),
      }),
      status: "unknown",
      reasonCode: "jurisdiction_rule_evidence_integrity_failed",
    },
    {
      name: "an evidence-free Allowed rule",
      input: jurisdictionInput({
        rule: currentRule({ evidenceRefs: [] }),
      }),
      status: "unknown",
      reasonCode: "jurisdiction_rule_evidence_missing",
    },
    {
      name: "an explicit Unknown rule",
      input: jurisdictionInput({
        rule: currentRule({ state: "Unknown" }),
      }),
      status: "unknown",
      reasonCode: "jurisdiction_rule_unknown",
    },
    {
      name: "an explicit Blocked rule",
      input: jurisdictionInput({
        rule: currentRule({ state: "Blocked" }),
      }),
      status: "blocked",
      reasonCode: "jurisdiction_rule_blocked",
    },
    {
      name: "a Manual Review rule without a case decision",
      input: jurisdictionInput({
        rule: currentRule({ state: "Manual Review" }),
      }),
      status: "manual_review",
      reasonCode: "jurisdiction_manual_review_required",
    },
  ] as const)("fails closed for $name", ({ input, status, reasonCode }) => {
    const result = evaluateJurisdiction(input);

    expect(result.status).toBe(status);
    expect(result.reasonCode).toBe(reasonCode);
  });

  it("binds a manual-review approval to the exact current order evaluation", () => {
    const manualRule = currentRule({ state: "Manual Review" });
    const applicable = evaluateJurisdiction(
      jurisdictionInput({
        rule: manualRule,
        caseDecision: currentCaseDecision(),
      }),
    );

    expect(applicable.status).toBe("pass");
    expect(applicable.reasonCode).toBe("manual_review_case_approved");
    expect(applicable.evidenceRefs).toEqual([
      policyEvidence,
      decisionEvidence,
    ]);

    for (const caseDecision of [
      currentCaseDecision({ orderId: "synthetic-other-order" }),
      currentCaseDecision({ evaluationHash: "d".repeat(64) }),
      currentCaseDecision({
        expiresAt: new Date("2026-08-24T12:00:00.000Z"),
      }),
      currentCaseDecision({
        supersededAt: new Date("2026-08-24T11:00:00.000Z"),
      }),
      currentCaseDecision({ evidenceRefs: [] }),
    ]) {
      const result = evaluateJurisdiction(
        jurisdictionInput({ rule: manualRule, caseDecision }),
      );
      expect(result.status).toBe("manual_review");
      expect(result.reasonCode).toBe("manual_review_case_not_applicable");
    }
  });

  it("denies sparse manual-review decision evidence without throwing", () => {
    const sparseEvidenceRefs = Array(1) as unknown as ManualReviewCaseDecision["evidenceRefs"];

    const result = evaluateJurisdiction(
      jurisdictionInput({
        rule: currentRule({ state: "Manual Review" }),
        caseDecision: currentCaseDecision({
          evidenceRefs: sparseEvidenceRefs,
        }),
      }),
    );

    expect(result).toMatchObject({
      status: "manual_review",
      reasonCode: "manual_review_case_not_applicable",
    });
  });

  it("blocks an exact current rejected manual-review case", () => {
    const result = evaluateJurisdiction(
      jurisdictionInput({
        rule: currentRule({ state: "Manual Review" }),
        caseDecision: currentCaseDecision({ outcome: "rejected" }),
      }),
    );

    expect(result.status).toBe("blocked");
    expect(result.reasonCode).toBe("manual_review_case_rejected");
  });

  it("does not apply a manual-review decision to another SKU rule or order line", () => {
    const rule = {
      ...currentRule({ state: "Manual Review" }),
      id: "synthetic-rule-1",
    } as JurisdictionRule;

    for (const caseDecision of [
      {
        ...currentCaseDecision(),
        ruleId: "synthetic-other-rule",
        orderLineId: "synthetic-line-1",
      },
      {
        ...currentCaseDecision(),
        ruleId: "synthetic-rule-1",
        orderLineId: "synthetic-other-line",
      },
    ] as readonly ManualReviewCaseDecision[]) {
      const result = evaluateJurisdiction(
        jurisdictionInput({ rule, caseDecision }),
      );

      expect(result.status).toBe("manual_review");
      expect(result.reasonCode).toBe("manual_review_case_not_applicable");
    }
  });

  it("never treats malformed boolean projections as approved or integrity verified", () => {
    const malformedProduct = jurisdictionInput({
      product: {
        id: "synthetic-product-1",
        approved: "false",
        active: true,
      } as unknown as JurisdictionEvaluationInput["product"],
    });
    expect(evaluateJurisdiction(malformedProduct)).toMatchObject({
      status: "unknown",
      reasonCode: "jurisdiction_input_invalid",
    });

    const malformedIntegrity = jurisdictionInput({
      rule: currentRule({
        integrityVerified: "false" as unknown as boolean,
      }),
    });
    expect(evaluateJurisdiction(malformedIntegrity)).toMatchObject({
      status: "unknown",
      reasonCode: "jurisdiction_rule_integrity_failed",
    });
  });

  it("never treats an unknown or blank-bound manual decision as approved", () => {
    const manualRule = currentRule({ state: "Manual Review" });
    for (const decision of [
      currentCaseDecision({
        outcome: "pending" as unknown as ManualReviewCaseDecision["outcome"],
      }),
      currentCaseDecision({ orderId: "   " }),
      currentCaseDecision({ evaluationHash: "   " }),
    ]) {
      expect(
        evaluateJurisdiction(
          jurisdictionInput({ rule: manualRule, caseDecision: decision }),
        ),
      ).toMatchObject({
        status: "manual_review",
        reasonCode: "manual_review_case_not_applicable",
      });
    }
  });

  it("freezes copied rule and decision evidence instead of retaining mutable inputs", () => {
    const mutableRuleEvidence: {
      kind: string;
      id: string;
      version: string;
      sha256: string | null;
    } = { ...policyEvidence };
    const result = evaluateJurisdiction(
      jurisdictionInput({
        rule: currentRule({
          state: "Manual Review",
          evidenceRefs: [mutableRuleEvidence],
        }),
        caseDecision: currentCaseDecision(),
      }),
    );

    mutableRuleEvidence.id = "mutated-after-evaluation";
    expect(result.evidenceRefs[0]!.id).toBe("synthetic-policy-1");
    expect(Object.isFrozen(result.evidenceRefs[0])).toBe(true);
  });
});
