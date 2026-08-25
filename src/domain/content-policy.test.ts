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
