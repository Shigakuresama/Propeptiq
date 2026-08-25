import { describe, expect, it } from "vitest";

import {
  scanPublicCopy,
  type PublicCopyCandidate,
  type PublicationPolicy,
} from "@/domain/content-policy";

const syntheticPublicationPolicy: PublicationPolicy = {
  version: "synthetic-publication-policy-v1",
  approvalId: "synthetic-publication-approval-1",
  approvalVersion: "test-v1",
  effectiveAt: "2026-08-01T00:00:00.000Z",
  expiresAt: "2026-09-01T00:00:00.000Z",
  integrityVerified: true,
  approvedNegativeDisclaimers: [
    "For laboratory research use only. Not for human or veterinary use.",
  ],
  approvedEvidence: [],
};

const approvedEvidence = {
  reference: {
    kind: "synthetic_test_lot_evidence",
    id: "synthetic-evidence-1",
    version: "test-v1",
    sha256: "d".repeat(64),
  },
  approvalId: "synthetic-evidence-approval-1",
  approvalVersion: "test-v1",
  integrityVerified: true,
} as const;

describe("scanPublicCopy", () => {
  it("allows neutral research copy with the exact approved negative disclaimer", () => {
    const result = scanPublicCopy(
      {
        text: "Reference material for controlled laboratory workflows. For laboratory research use only. Not for human or veterinary use.",
        claims: [],
      },
      syntheticPublicationPolicy,
      "2026-08-24T12:00:00.000Z",
    );

    expect(result).toEqual({
      publishable: true,
      status: "pass",
      violations: [],
      policyVersion: "synthetic-publication-policy-v1",
    });
  });

  it.each([
    ["unverified", { integrityVerified: false }],
    [
      "expired",
      { expiresAt: "2026-08-24T12:00:00.000Z" },
    ],
    [
      "not yet effective",
      { effectiveAt: "2026-08-25T00:00:00.000Z" },
    ],
    ["unapproved", { approvalId: "   " }],
    ["missing disclaimers", { approvedNegativeDisclaimers: [] }],
    ["punctuation-only disclaimers", { approvedNegativeDisclaimers: ["..."] }],
    [
      "format-character-only disclaimers",
      { approvedNegativeDisclaimers: ["\u200B"] },
    ],
  ] as const)("blocks when the publication policy is %s", (_name, override) => {
    const result = scanPublicCopy(
      { text: "Neutral laboratory reference material.", claims: [] },
      { ...syntheticPublicationPolicy, ...override },
      "2026-08-24T12:00:00.000Z",
    );

    expect(result).toEqual({
      publishable: false,
      status: "unknown",
      violations: [
        {
          code: "publication_policy_unavailable",
          match: null,
          claimId: null,
        },
      ],
      policyVersion: null,
    });
  });

  it("blocks otherwise neutral copy when the approved disclaimer is absent", () => {
    const result = scanPublicCopy(
      { text: "Neutral laboratory reference material.", claims: [] },
      syntheticPublicationPolicy,
      "2026-08-24T12:00:00.000Z",
    );

    expect(result).toEqual({
      publishable: false,
      status: "blocked",
      violations: [
        {
          code: "approved_disclaimer_missing",
          match: null,
          claimId: null,
        },
      ],
      policyVersion: "synthetic-publication-policy-v1",
    });
  });

  it.each([
    ["dosage", "Suggested dosage is 5 mg daily."],
    ["administration", "Administer orally before meals."],
    ["reconstitution", "Reconstitution instructions are included."],
    ["injection", "Inject subcutaneously."],
    ["treatment", "Treats a chronic condition."],
    ["weight_loss", "Promotes weight loss."],
    ["bodybuilding", "Designed for bodybuilding and muscle growth."],
    ["anti_aging", "Provides anti-aging benefits."],
    ["therapeutic", "Offers therapeutic benefits."],
    ["structure_function", "Boosts metabolism."],
    ["human_outcome", "Improves outcomes in humans."],
    ["human_outcome", "For human use."],
    ["human_outcome", "Intended for human consumption."],
    ["veterinary_outcome", "Supports animal health."],
    ["veterinary_outcome", "For veterinary use."],
    ["veterinary_outcome", "Intended for animal consumption."],
  ] as const)("blocks %s language", (code, prohibitedText) => {
    const disclaimer =
      syntheticPublicationPolicy.approvedNegativeDisclaimers[0]!;
    const result = scanPublicCopy(
      {
        text: `${prohibitedText} ${disclaimer}`,
        claims: [],
      },
      syntheticPublicationPolicy,
      "2026-08-24T12:00:00.000Z",
    );

    expect(result.publishable).toBe(false);
    expect(result.status).toBe("blocked");
    expect(result.violations).toContainEqual(
      expect.objectContaining({ code }),
    );
  });

  it.each([
    ["dosage", "do.sage"],
    ["injection", "in-jec-tion"],
    ["injection", "in\u0000jection"],
    ["human_outcome", "hu man use"],
    ["veterinary_outcome", "ani.mal con.sumption"],
    ["unsupported_claim", "guaran—teed"],
  ] as const)("blocks punctuation-fragmented %s language", (code, text) => {
    const disclaimer =
      syntheticPublicationPolicy.approvedNegativeDisclaimers[0]!;
    const result = scanPublicCopy(
      { text: `${text}. ${disclaimer}`, claims: [] },
      syntheticPublicationPolicy,
      "2026-08-24T12:00:00.000Z",
    );

    expect(result.publishable).toBe(false);
    expect(result.violations).toContainEqual(
      expect.objectContaining({ code }),
    );
  });

  it.each([
    ["injection", "in\u200Djection"],
    ["human_outcome", "hu\u200Bman use"],
    ["veterinary_outcome", "animal\u2060 use"],
    ["unsupported_claim", "guaran\u200Bteed"],
  ] as const)(
    "blocks Unicode-format-fragmented %s language",
    (code, text) => {
      const disclaimer =
        syntheticPublicationPolicy.approvedNegativeDisclaimers[0]!;
      const result = scanPublicCopy(
        { text: `${text}. ${disclaimer}`, claims: [] },
        syntheticPublicationPolicy,
        "2026-08-24T12:00:00.000Z",
      );

      expect(result.publishable).toBe(false);
      expect(result.violations).toContainEqual(
        expect.objectContaining({ code }),
      );
    },
  );

  it.each([
    ["injection", "in\u200Bjection"],
    ["human_outcome", "human\u200B use"],
    ["veterinary_outcome", "animal\u200B use"],
  ] as const)(
    "blocks zero-width-space-fragmented %s language",
    (code, text) => {
      const disclaimer =
        syntheticPublicationPolicy.approvedNegativeDisclaimers[0]!;
      const result = scanPublicCopy(
        { text: `${text}. ${disclaimer}`, claims: [] },
        syntheticPublicationPolicy,
        "2026-08-24T12:00:00.000Z",
      );

      expect(result.publishable).toBe(false);
      expect(result.violations).toContainEqual(
        expect.objectContaining({ code }),
      );
    },
  );

  it("requires every structured factual claim to reference approved evidence", () => {
    const policy: PublicationPolicy = {
      ...syntheticPublicationPolicy,
      approvedEvidence: [approvedEvidence],
    };
    const disclaimer = policy.approvedNegativeDisclaimers[0]!;

    const supported = scanPublicCopy(
      {
        text: `Verified reference identity is recorded. ${disclaimer}`,
        claims: [
          {
            id: "synthetic-claim-1",
            text: "Verified reference identity is recorded.",
            evidenceApprovalIds: ["synthetic-evidence-approval-1"],
          },
        ],
      },
      policy,
      "2026-08-24T12:00:00.000Z",
    );
    expect(supported.publishable).toBe(true);

    for (const evidenceApprovalIds of [
      [],
      ["synthetic-unapproved-evidence"],
    ]) {
      const result = scanPublicCopy(
        {
          text: `Verified reference identity is recorded. ${disclaimer}`,
          claims: [
            {
              id: "synthetic-claim-1",
              text: "Verified reference identity is recorded.",
              evidenceApprovalIds,
            },
          ],
        },
        policy,
        "2026-08-24T12:00:00.000Z",
      );

      expect(result).toMatchObject({ publishable: false, status: "blocked" });
      expect(result.violations).toContainEqual({
        code: "unsupported_claim",
        match: null,
        claimId: "synthetic-claim-1",
      });
    }
  });

  it("blocks structured claim text that normalizes to an empty value", () => {
    const policy: PublicationPolicy = {
      ...syntheticPublicationPolicy,
      approvedEvidence: [approvedEvidence],
    };

    const result = scanPublicCopy(
      {
        text: policy.approvedNegativeDisclaimers[0]!,
        claims: [
          {
            id: "synthetic-empty-claim-1",
            text: "...\u200B",
            evidenceApprovalIds: ["synthetic-evidence-approval-1"],
          },
        ],
      },
      policy,
      "2026-08-24T12:00:00.000Z",
    );

    expect(result).toMatchObject({ publishable: false, status: "blocked" });
    expect(result.violations).toContainEqual({
      code: "unsupported_claim",
      match: null,
      claimId: "synthetic-empty-claim-1",
    });
  });

  it("blocks a structured claim with a sparse evidence-approval projection", () => {
    const disclaimer =
      syntheticPublicationPolicy.approvedNegativeDisclaimers[0]!;
    const sparseEvidenceApprovalIds = new Array<string>(1);

    const result = scanPublicCopy(
      {
        text: `Verified reference identity is recorded. ${disclaimer}`,
        claims: [
          {
            id: "synthetic-claim-sparse-evidence-1",
            text: "Verified reference identity is recorded.",
            evidenceApprovalIds: sparseEvidenceApprovalIds,
          },
        ],
      },
      syntheticPublicationPolicy,
      "2026-08-24T12:00:00.000Z",
    );

    expect(result).toMatchObject({ publishable: false, status: "blocked" });
    expect(result.violations).toContainEqual({
      code: "unsupported_claim",
      match: null,
      claimId: "synthetic-claim-sparse-evidence-1",
    });
  });

  it("fails closed when an approved-evidence projection is not integrity verified", () => {
    const policy: PublicationPolicy = {
      ...syntheticPublicationPolicy,
      approvedEvidence: [{ ...approvedEvidence, integrityVerified: false }],
    };

    const result = scanPublicCopy(
      {
        text: syntheticPublicationPolicy.approvedNegativeDisclaimers[0]!,
        claims: [],
      },
      policy,
      "2026-08-24T12:00:00.000Z",
    );

    expect(result).toMatchObject({
      publishable: false,
      status: "unknown",
      policyVersion: null,
      violations: [{ code: "publication_policy_unavailable" }],
    });
  });

  it("scans structured claim text and preserves the claim identity", () => {
    const policy: PublicationPolicy = {
      ...syntheticPublicationPolicy,
      approvedEvidence: [approvedEvidence],
    };

    const result = scanPublicCopy(
      {
        text: policy.approvedNegativeDisclaimers[0]!,
        claims: [
          {
            id: "synthetic-claim-unsafe-1",
            text: "Guaranteed safe and effective.",
            evidenceApprovalIds: ["synthetic-evidence-approval-1"],
          },
        ],
      },
      policy,
      "2026-08-24T12:00:00.000Z",
    );

    expect(result).toMatchObject({ publishable: false, status: "blocked" });
    expect(result.violations).toContainEqual({
      code: "unsupported_claim",
      match: "guaranteed",
      claimId: "synthetic-claim-unsafe-1",
    });
  });

  it.each([
    ["a null policy", null],
    [
      "a non-array disclaimer projection",
      { ...syntheticPublicationPolicy, approvedNegativeDisclaimers: null },
    ],
    [
      "a sparse disclaimer projection",
      {
        ...syntheticPublicationPolicy,
        approvedNegativeDisclaimers: new Array<string>(1),
      },
    ],
    [
      "a null approved-evidence projection",
      { ...syntheticPublicationPolicy, approvedEvidence: [null] },
    ],
    [
      "a sparse approved-evidence projection",
      {
        ...syntheticPublicationPolicy,
        approvedEvidence: new Array<typeof approvedEvidence>(1),
      },
    ],
    [
      "a malformed evidence reference",
      {
        ...syntheticPublicationPolicy,
        approvedEvidence: [
          {
            ...approvedEvidence,
            reference: { ...approvedEvidence.reference, sha256: "bad-hash" },
          },
        ],
      },
    ],
  ] as const)("returns policy unavailable for %s", (_name, malformedPolicy) => {
    const candidate: PublicCopyCandidate = {
      text: syntheticPublicationPolicy.approvedNegativeDisclaimers[0]!,
      claims: [],
    };

    expect(() =>
      scanPublicCopy(
        candidate,
        malformedPolicy as unknown as PublicationPolicy,
        "2026-08-24T12:00:00.000Z",
      ),
    ).not.toThrow();
    expect(
      scanPublicCopy(
        candidate,
        malformedPolicy as unknown as PublicationPolicy,
        "2026-08-24T12:00:00.000Z",
      ),
    ).toMatchObject({
      publishable: false,
      status: "unknown",
      policyVersion: null,
      violations: [{ code: "publication_policy_unavailable" }],
    });
  });

  it.each([
    ["a null candidate", null],
    ["an array candidate", []],
    ["a scalar candidate", "laboratory reference material"],
  ] as const)("blocks %s without throwing", (_name, candidate) => {
    expect(() =>
      scanPublicCopy(
        candidate as unknown as PublicCopyCandidate,
        syntheticPublicationPolicy,
        "2026-08-24T12:00:00.000Z",
      ),
    ).not.toThrow();
    expect(
      scanPublicCopy(
        candidate as unknown as PublicCopyCandidate,
        syntheticPublicationPolicy,
        "2026-08-24T12:00:00.000Z",
      ),
    ).toMatchObject({
      publishable: false,
      status: "blocked",
      policyVersion: syntheticPublicationPolicy.version,
      violations: [{ code: "approved_disclaimer_missing" }],
    });
  });

  it.each([
    [
      "a missing claims array",
      {
        text: syntheticPublicationPolicy.approvedNegativeDisclaimers[0],
        claims: null,
      },
      "unsupported_claim",
    ],
    ["a missing copy string", { text: null, claims: [] }, "approved_disclaimer_missing"],
  ] as const)("blocks %s without throwing", (_name, malformedCandidate, code) => {
    expect(() =>
      scanPublicCopy(
        malformedCandidate as unknown as PublicCopyCandidate,
        syntheticPublicationPolicy,
        "2026-08-24T12:00:00.000Z",
      ),
    ).not.toThrow();
    expect(
      scanPublicCopy(
        malformedCandidate as unknown as PublicCopyCandidate,
        syntheticPublicationPolicy,
        "2026-08-24T12:00:00.000Z",
      ),
    ).toMatchObject({
      publishable: false,
      status: "blocked",
      violations: [expect.objectContaining({ code })],
    });
  });

  it("returns deeply frozen publication decisions", () => {
    const result = scanPublicCopy(
      {
        text: syntheticPublicationPolicy.approvedNegativeDisclaimers[0]!,
        claims: [],
      },
      syntheticPublicationPolicy,
      "2026-08-24T12:00:00.000Z",
    );

    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.violations)).toBe(true);
  });
});
