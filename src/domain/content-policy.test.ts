import { describe, expect, it } from "vitest";

import {
  scanPublicCopy,
  type PublicationPolicy,
  type PublicCopyCandidate,
} from "@/domain/content-policy";

const policy: PublicationPolicy = {
  version: "publication-policy-v1",
  activeLotEvidenceIds: ["lot-evidence-1"],
};

function candidate(
  overrides: Partial<PublicCopyCandidate> = {},
): PublicCopyCandidate {
  return {
    text: "Reference material for controlled laboratory workflows.",
    claims: [],
    ...overrides,
  };
}

describe("scanPublicCopy", () => {
  it("allows ordinary copy without an embedded research-use disclaimer or COA", () => {
    expect(scanPublicCopy(candidate(), policy)).toEqual({
      publishable: true,
      status: "pass",
      violations: [],
      policyVersion: "publication-policy-v1",
    });
  });

  it("allows a truthful ordinary promotion without analytical evidence", () => {
    expect(
      scanPublicCopy(
        candidate({
          text: "Save 10% with the active laboratory bundle.",
          claims: [
            {
              id: "promotion-1",
              text: "Save 10% with the active laboratory bundle.",
              kind: "ordinary",
              lotEvidenceIds: [],
            },
          ],
        }),
        policy,
      ),
    ).toMatchObject({ publishable: true, status: "pass" });
  });

  it.each([
    "Earn points on eligible merchandise.",
    "Share your referral link.",
    "Payout processing remains outside this dashboard.",
    "Only the current effective terms record is shown here.",
    "Analytical reference set",
  ])("allows neutral growth copy: %s", (text) => {
    expect(scanPublicCopy(candidate({ text }), policy)).toMatchObject({
      publishable: true,
      status: "pass",
    });
  });

  it("allows ordinary administrative legal language only on the program-terms surface", () => {
    const text = "Points are administered by PROPEPTIQ and may be revoked to prevent fraud.";

    expect(scanPublicCopy(candidate({ text }), policy)).toMatchObject({
      publishable: false,
      status: "blocked",
    });
    expect(
      scanPublicCopy(candidate({ text }), policy, { surface: "program_terms" }),
    ).toMatchObject({ publishable: true, status: "pass" });
  });

  it("allows an explicit negated research-use restriction only on the program-terms surface", () => {
    const text = "Products are not intended for human or veterinary use.";

    expect(scanPublicCopy(candidate({ text }), policy)).toMatchObject({
      publishable: false,
      status: "blocked",
    });
    expect(
      scanPublicCopy(candidate({ text }), policy, { surface: "program_terms" }),
    ).toMatchObject({ publishable: true, status: "pass" });
    expect(
      scanPublicCopy(
        candidate({ text: "Products are intended for human use." }),
        policy,
        { surface: "program_terms" },
      ),
    ).toMatchObject({ publishable: false, status: "blocked" });
  });

  it.each([
    "Administer the peptide orally.",
    "This program rewards researchers when the product treats pain.",
    "Use one dose after reconstitution.",
    "Customer testimonial: this product improves human health.",
  ])("keeps unsafe positioning blocked on the program-terms surface: %s", (text) => {
    expect(
      scanPublicCopy(candidate({ text }), policy, { surface: "program_terms" }),
    ).toMatchObject({ publishable: false, status: "blocked" });
  });

  it.each([
    "Hurry — only 2 left.",
    "Join 10,000 researchers who already chose us.",
    "Was $999, now $49.",
    "Better than every competing peptide supplier.",
    "Customer testimonial: it changed my life.",
  ])("blocks unsupported commercial positioning: %s", (text) => {
    const result = scanPublicCopy(candidate({ text }), policy);
    expect(result.publishable).toBe(false);
    expect(result.violations).toContainEqual(
      expect.objectContaining({ code: "unsupported_claim" }),
    );
  });

  it("allows an analytical claim backed by active matching lot evidence", () => {
    expect(
      scanPublicCopy(
        candidate({
          text: "The current lot identity was verified by analytical testing.",
          claims: [
            {
              id: "analytical-claim-1",
              text: "The current lot identity was verified by analytical testing.",
              kind: "analytical",
              lotEvidenceIds: ["lot-evidence-1"],
            },
          ],
        }),
        policy,
      ),
    ).toMatchObject({ publishable: true, status: "pass" });
  });

  it.each([
    ["purity", "The current lot has documented purity."],
    ["percent-pure", "The current lot is 99.9% pure."],
    ["sterility", "The current lot passed sterility testing."],
    ["sterile", "The current lot is sterile."],
    ["HPLC", "The current lot was tested by HPLC."],
    ["LC-MS", "The current lot was tested by LC-MS."],
    ["mass spectrometry", "The current lot was tested by mass spectrometry."],
    ["assay", "The current lot has a documented assay result."],
    ["analytical testing", "The current lot passed analytical testing."],
    ["laboratory-tested", "The current lot is laboratory-tested."],
    ["third-party-tested", "The current lot is third-party-tested."],
    ["endotoxin", "The current lot has an endotoxin result."],
    ["COA", "A COA is available for the current lot."],
    ["certificate of analysis", "The current lot has a certificate of analysis."],
    ["accreditation", "The testing provider holds laboratory accreditation."],
    ["accredited laboratory", "The current lot was tested by an accredited laboratory."],
  ] as const)(
    "blocks an unstructured top-level %s claim",
    (_name, text) => {
      const result = scanPublicCopy(candidate({ text, claims: [] }), policy);

      expect(result).toMatchObject({ publishable: false, status: "blocked" });
      expect(result.violations).toContainEqual(
        expect.objectContaining({
          code: "unsupported_claim",
          claimId: null,
        }),
      );
    },
  );

  it("requires evidence for an ordinary-labeled analytical claim", () => {
    const text = "The current lot is 99.9% pure by HPLC testing.";
    const result = scanPublicCopy(
      candidate({
        text,
        claims: [
          {
            id: "mislabeled-analytical-claim",
            text,
            kind: "ordinary",
            lotEvidenceIds: [],
          },
        ],
      }),
      policy,
    );

    expect(result).toMatchObject({ publishable: false, status: "blocked" });
    expect(result.violations).toContainEqual({
      code: "unsupported_claim",
      match: null,
      claimId: "mislabeled-analytical-claim",
    });
  });

  it("allows structured analytical-marker coverage with active matching evidence", () => {
    const text = "The current lot is 99.9% pure by HPLC testing.";

    expect(
      scanPublicCopy(
        candidate({
          text,
          claims: [
            {
              id: "analytical-coverage-1",
              text,
              kind: "ordinary",
              lotEvidenceIds: ["lot-evidence-1"],
            },
          ],
        }),
        policy,
      ),
    ).toMatchObject({ publishable: true, status: "pass" });
  });

  it("blocks a second purity statement that lacks its own evidence-backed claim", () => {
    const result = scanPublicCopy(
      candidate({
        text: "Lot A is 99% pure. Lot B is 50% pure.",
        claims: [
          {
            id: "lot-a-purity",
            text: "Lot A is 99% pure.",
            kind: "analytical",
            lotEvidenceIds: ["lot-evidence-1"],
          },
        ],
      }),
      policy,
    );

    expect(result).toMatchObject({ publishable: false, status: "blocked" });
    expect(result.violations).toContainEqual(
      expect.objectContaining({
        code: "unsupported_claim",
        claimId: null,
      }),
    );
  });

  it("blocks one broad evidence-backed claim spanning two analytical statements", () => {
    const text = "Lot A is 99% pure. Lot B is 50% pure.";
    const result = scanPublicCopy(
      candidate({
        text,
        claims: [
          {
            id: "broad-purity-claim",
            text,
            kind: "analytical",
            lotEvidenceIds: ["lot-evidence-1"],
          },
        ],
      }),
      policy,
    );

    expect(result).toMatchObject({ publishable: false, status: "blocked" });
    expect(result.violations).toContainEqual(
      expect.objectContaining({
        code: "unsupported_claim",
        claimId: null,
      }),
    );
  });

  it("allows two purity statements when each has contained evidence-backed coverage", () => {
    expect(
      scanPublicCopy(
        candidate({
          text: "Lot A is 99% pure. Lot B is 50% pure.",
          claims: [
            {
              id: "lot-a-purity",
              text: "Lot A is 99% pure.",
              kind: "analytical",
              lotEvidenceIds: ["lot-evidence-1"],
            },
            {
              id: "lot-b-purity",
              text: "Lot B is 50% pure.",
              kind: "analytical",
              lotEvidenceIds: ["lot-evidence-1"],
            },
          ],
        }),
        policy,
      ),
    ).toMatchObject({ publishable: true, status: "pass" });
  });

  it("blocks a second HPLC statement that lacks its own evidence-backed claim", () => {
    const result = scanPublicCopy(
      candidate({
        text: "Lot A was tested by HPLC. Lot B was tested by HPLC.",
        claims: [
          {
            id: "lot-a-hplc",
            text: "Lot A was tested by HPLC.",
            kind: "ordinary",
            lotEvidenceIds: ["lot-evidence-1"],
          },
        ],
      }),
      policy,
    );

    expect(result.violations).toContainEqual(
      expect.objectContaining({
        code: "unsupported_claim",
        claimId: null,
      }),
    );
  });

  it("fails closed when one structured claim ambiguously matches repeated identical prose", () => {
    const result = scanPublicCopy(
      candidate({
        text: "The lot is pure. The lot is pure.",
        claims: [
          {
            id: "ambiguous-purity",
            text: "The lot is pure.",
            kind: "analytical",
            lotEvidenceIds: ["lot-evidence-1"],
          },
        ],
      }),
      policy,
    );

    expect(
      result.violations.filter(
        ({ code, claimId }) => code === "unsupported_claim" && claimId === null,
      ),
    ).toHaveLength(2);
  });

  it("does not treat neutral laboratory-research wording as an analytical claim", () => {
    expect(
      scanPublicCopy(
        candidate({ text: "For laboratory research workflows." }),
        policy,
      ),
    ).toMatchObject({ publishable: true, status: "pass" });
  });

  it("does not let a structured claim absent from the copy cover top-level analytical prose", () => {
    const result = scanPublicCopy(
      candidate({
        text: "The current lot was tested by HPLC.",
        claims: [
          {
            id: "foreign-copy-claim",
            text: "The current lot was tested by mass spectrometry.",
            kind: "analytical",
            lotEvidenceIds: ["lot-evidence-1"],
          },
        ],
      }),
      policy,
    );

    expect(result.violations).toContainEqual(
      expect.objectContaining({
        code: "unsupported_claim",
        claimId: null,
      }),
    );
  });

  it.each([
    ["missing", []],
    ["inactive", ["lot-evidence-inactive"]],
    ["foreign", ["lot-evidence-1", "lot-evidence-foreign"]],
  ] as const)(
    "blocks an analytical claim with %s evidence",
    (_name, lotEvidenceIds) => {
      const result = scanPublicCopy(
        candidate({
          claims: [
            {
              id: "analytical-claim-1",
              text: "The current lot identity was analytically verified.",
              kind: "analytical",
              lotEvidenceIds,
            },
          ],
        }),
        policy,
      );

      expect(result).toMatchObject({ publishable: false, status: "blocked" });
      expect(result.violations).toContainEqual({
        code: "unsupported_claim",
        match: null,
        claimId: "analytical-claim-1",
      });
    },
  );

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
    ["unsupported_claim", "Guaranteed highest purity."],
  ] as const)("blocks %s language regardless of evidence", (code, text) => {
    const result = scanPublicCopy(
      candidate({
        text,
        claims: [
          {
            id: "claim-unsafe",
            text,
            kind: "analytical",
            lotEvidenceIds: ["lot-evidence-1"],
          },
        ],
      }),
      policy,
    );

    expect(result.publishable).toBe(false);
    expect(result.violations).toContainEqual(
      expect.objectContaining({ code }),
    );
  });

  it.each([
    ["dosage", "do.sage"],
    ["injection", "in-jec-tion"],
    ["injection", "in\u0000jection"],
    ["injection", "in\u200Djection"],
    ["human_outcome", "hu\u200Bman use"],
    ["veterinary_outcome", "ani.mal con.sumption"],
    ["unsupported_claim", "guaran—teed"],
  ] as const)("blocks normalized fragmented %s language", (code, text) => {
    const result = scanPublicCopy(candidate({ text }), policy);

    expect(result.publishable).toBe(false);
    expect(result.violations).toContainEqual(
      expect.objectContaining({ code }),
    );
  });

  it.each([
    ["a null policy", null],
    ["a blank version", { version: " ", activeLotEvidenceIds: [] }],
    ["a non-array evidence list", { version: "v1", activeLotEvidenceIds: null }],
    [
      "a sparse evidence list",
      { version: "v1", activeLotEvidenceIds: new Array<string>(1) },
    ],
    ["a duplicate evidence ID", { version: "v1", activeLotEvidenceIds: ["lot-1", "lot-1"] }],
  ] as const)("fails closed for %s", (_name, malformedPolicy) => {
    expect(
      scanPublicCopy(candidate(), malformedPolicy as never),
    ).toEqual({
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

  it.each([
    ["a null candidate", null],
    ["a missing copy string", { text: null, claims: [] }],
    ["a missing claims array", { text: "Neutral copy", claims: null }],
    [
      "a sparse claims array",
      { text: "Neutral copy", claims: new Array(1) },
    ],
  ] as const)("blocks %s with an accurate input violation", (_name, value) => {
    expect(scanPublicCopy(value as never, policy)).toEqual({
      publishable: false,
      status: "blocked",
      violations: [
        { code: "copy_candidate_invalid", match: null, claimId: null },
      ],
      policyVersion: "publication-policy-v1",
    });
  });

  it("returns deeply frozen publication decisions", () => {
    const blocked = scanPublicCopy(
      candidate({ text: "Guaranteed safe and effective." }),
      policy,
    );

    expect(Object.isFrozen(blocked)).toBe(true);
    expect(Object.isFrozen(blocked.violations)).toBe(true);
    expect(Object.isFrozen(blocked.violations[0])).toBe(true);
  });
});
