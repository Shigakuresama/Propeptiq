import { describe, expect, it } from "vitest";

import claimsAuditJson from "../../content/claims-audit.json";
import compoundsJson from "../../content/compounds.json";
import studiesJson from "../../content/studies.json";
import {
  projectPublicCompoundResearch,
  publicCompoundResearch,
} from "./compound-research";

const expectedPmids = [
  "35658024",
  "37385275",
  "33567185",
  "33667417",
  "37366315",
  "38330987",
  "42253238",
  "34798060",
  "11146367",
  "11713213",
  "29593067",
  "31572171",
  "41704678",
  "39161060",
  "35013352",
  "40131143",
  "21030672",
  "16847171",
  "20554713",
  "10496658",
  "25331030",
  "16352683",
  "17018654",
  "8772599",
  "7561636",
  "9488001",
  "12107212",
] as const;

const expectedCompoundOrder = [
  "5-amino-1mq",
  "aod-9604",
  "bpc-157",
  "cagrilintide",
  "cjc-1295-with-dac",
  "ghk-cu",
  "hcg",
  "igf-1-lr3",
  "ipamorelin",
  "mots-c",
  "nad-plus",
  "retatrutide",
  "semaglutide",
  "sermorelin-acetate",
  "survodutide",
  "tesamorelin",
  "tirzepatide",
] as const;

type MutableRecord = Record<PropertyKey, unknown>;

type MutableResearchSource = {
  compounds: {
    schemaVersion: unknown;
    compounds: MutableRecord[];
  };
  studies: {
    schemaVersion: unknown;
    studies: MutableRecord[];
  };
  claimsAudit: {
    schemaVersion: unknown;
    claims: unknown[];
  };
};

function freshSource(): MutableResearchSource {
  return structuredClone({
    compounds: compoundsJson,
    studies: studiesJson,
    claimsAudit: claimsAuditJson,
  }) as unknown as MutableResearchSource;
}

function findRecord(
  records: readonly MutableRecord[],
  id: string,
): MutableRecord {
  const record = records.find((candidate) => candidate.id === id);
  if (record === undefined) throw new Error(`Missing test fixture record: ${id}`);
  return record;
}

function expectDeeplyFrozen(value: unknown): void {
  if (value === null || typeof value !== "object") return;
  expect(Object.isFrozen(value)).toBe(true);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
    if (descriptor !== undefined && "value" in descriptor) {
      expectDeeplyFrozen(descriptor.value);
    }
  }
}

function expectInvalid(source: unknown): void {
  expect(() => projectPublicCompoundResearch(source)).toThrow(
    new TypeError("Invalid compound research data."),
  );
}

describe("verified compound research source", () => {
  it("contains exactly the 27 owner-authorized PMIDs in source order", () => {
    expect(studiesJson.schemaVersion).toBe(1);
    expect(studiesJson.studies.map((study) => study.pmid)).toEqual(expectedPmids);
    expect(new Set(studiesJson.studies.map((study) => study.pmid)).size).toBe(27);

    for (const study of studiesJson.studies) {
      expect(study.id).toBe(`pmid-${study.pmid}`);
      expect(study.url).toBe(
        `https://pubmed.ncbi.nlm.nih.gov/${study.pmid}/`,
      );
      expect(study.title.trim()).toBe(study.title);
      expect(study.title.length).toBeGreaterThan(0);
      expect(study.firstAuthor.length).toBeGreaterThan(0);
      expect(study.journal.length).toBeGreaterThan(0);
      expect(study.year).toBeGreaterThanOrEqual(1900);
      expect(study.verificationStatus).toBe("verified_primary_source");
      expect(study.publicationStatus).toBe("public_neutral_metadata");
      expect(study.reviewedOn).toBe("2026-09-04");
      if (study.outcomeSummary !== null) {
        expect(study.outcomeSummary.trim().split(/\s+/u).length).toBeLessThanOrEqual(
          30,
        );
      }
    }
  });

  it("keeps immutable catalog spelling mappings without adding excluded products", () => {
    expect(compoundsJson.schemaVersion).toBe(1);
    expect(compoundsJson.compounds).toHaveLength(17);

    const cagrilintide = compoundsJson.compounds.find(
      (compound) => compound.id === "cagrilintide",
    );
    const tesamorelin = compoundsJson.compounds.find(
      (compound) => compound.id === "tesamorelin",
    );
    expect(cagrilintide).toMatchObject({
      productSlug: "cargrilintide",
      displayName: "Cagrilintide",
    });
    expect(tesamorelin).toMatchObject({
      productSlug: "tesmorelin",
      displayName: "Tesamorelin",
    });

    const identities = compoundsJson.compounds.flatMap((compound) => [
      compound.id,
      compound.productSlug,
      ...compound.alternateNames,
    ]).map((identity) => identity.toLowerCase());
    expect(identities).not.toContain("tb-500");
    expect(identities).not.toContain("tb500");
    expect(identities).not.toContain("cjc-1295-no-dac");
    expect(identities).not.toContain("hgh");
    expect(identities).not.toContain("somatropin");

    for (const compound of compoundsJson.compounds) {
      expect(compound.id).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u);
      expect(compound.productSlug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u);
      expect(compound.mechanism).toBeNull();
      expect(compound.benefitClaim).toBeNull();
      expect(compound).not.toHaveProperty("amount_in_catalog");
      expect(compound).not.toHaveProperty("price");
      expect(compound).not.toHaveProperty("stripePriceId");
    }
  });

  it("ships an explicitly empty claims audit", () => {
    expect(claimsAuditJson).toEqual({ schemaVersion: 1, claims: [] });
  });
});

describe("projectPublicCompoundResearch", () => {
  it("projects only neutral compound and citation metadata", () => {
    const projected = projectPublicCompoundResearch(freshSource());

    expect(projected.schemaVersion).toBe(1);
    expect(projected.compounds.map((compound) => compound.id)).toEqual(
      expectedCompoundOrder,
    );
    expect(projected.compounds.flatMap((compound) =>
      compound.studies.map((study) => study.pmid)
    )).toHaveLength(27);

    const compoundKeys = Object.keys(projected.compounds[0]!).sort();
    const studyKeys = Object.keys(projected.compounds[0]!.studies[0]!).sort();
    expect(compoundKeys).toEqual([
      "alternateNames",
      "displayName",
      "id",
      "identityCaveat",
      "productSlug",
      "strongestEvidence",
      "studies",
    ]);
    expect(studyKeys).toEqual([
      "design",
      "doi",
      "duration",
      "evidenceContext",
      "firstAuthor",
      "id",
      "journal",
      "pmid",
      "population",
      "sampleSize",
      "title",
      "url",
      "year",
    ]);

    const serialized = JSON.stringify(projected);
    for (const privateKey of [
      "benefitClaim",
      "mechanism",
      "outcomeSummary",
      "studiedAmount",
      "route",
      "verificationStatus",
      "publicationStatus",
      "reviewedOn",
      "reviewNote",
      "claims",
    ]) {
      expect(serialized).not.toContain(`\"${privateKey}\"`);
    }
    expect(serialized).not.toMatch(
      /\b(?:recommended|dosage|take|self-inject|administer|protocol|stacking?|cycle|for human use|human consumption)\b/iu,
    );
  });

  it("is deterministic, preserves its input, and deeply freezes new output", () => {
    const source = freshSource();
    const before = structuredClone(source);
    const reordered = freshSource();
    reordered.compounds.compounds.reverse();
    reordered.studies.studies.reverse();
    for (const compound of reordered.compounds.compounds) {
      (compound.alternateNames as unknown[]).reverse();
      (compound.studyIds as unknown[]).reverse();
    }

    const projected = projectPublicCompoundResearch(source);
    const reorderedProjection = projectPublicCompoundResearch(reordered);

    expect(source).toEqual(before);
    expect(Object.isFrozen(source)).toBe(false);
    expect(projected).toEqual(reorderedProjection);
    expect(projected).toEqual(publicCompoundResearch);
    expect(projected).not.toBe(source);
    expectDeeplyFrozen(projected);
  });

  it("rejects sparse, accessor-backed, and trap-throwing hostile shapes", () => {
    const sparse = freshSource();
    sparse.compounds.compounds = new Array<MutableRecord>(1);
    expectInvalid(sparse);

    const extraArrayKey = freshSource();
    Object.defineProperty(extraArrayKey.studies.studies, "hidden", {
      value: true,
      enumerable: false,
    });
    expectInvalid(extraArrayKey);

    const accessor = freshSource();
    let getterCalled = false;
    Object.defineProperty(accessor.compounds.compounds[0]!, "displayName", {
      enumerable: true,
      get() {
        getterCalled = true;
        return "Hostile";
      },
    });
    expectInvalid(accessor);
    expect(getterCalled).toBe(false);

    const trapped = freshSource();
    trapped.studies.studies[0] = new Proxy(trapped.studies.studies[0]!, {
      ownKeys() {
        throw new Error("proxy trap ran");
      },
    });
    expectInvalid(trapped);
  });

  it("rejects duplicate IDs and broken two-way study references", () => {
    const duplicateCompound = freshSource();
    const duplicateCompoundRecord = findRecord(
      duplicateCompound.compounds.compounds,
      "tirzepatide",
    );
    duplicateCompoundRecord.id = "semaglutide";
    duplicateCompoundRecord.productSlug = "semaglutide";
    expectInvalid(duplicateCompound);

    const duplicateStudy = freshSource();
    const duplicateStudyRecord = findRecord(
      duplicateStudy.studies.studies,
      "pmid-35658024",
    );
    duplicateStudy.studies.studies[1] = {
      ...duplicateStudy.studies.studies[1],
      ...duplicateStudyRecord,
    };
    expectInvalid(duplicateStudy);

    const missingStudy = freshSource();
    findRecord(missingStudy.compounds.compounds, "tirzepatide").studyIds = [
      "pmid-00000000",
    ];
    expectInvalid(missingStudy);

    const wrongCompound = freshSource();
    findRecord(wrongCompound.studies.studies, "pmid-35658024").compoundId =
      "semaglutide";
    expectInvalid(wrongCompound);
  });

  it("rejects noncanonical PubMed links and PMID path mismatches", () => {
    const wrongHost = freshSource();
    findRecord(wrongHost.studies.studies, "pmid-35658024").url =
      "https://example.com/35658024/";
    expectInvalid(wrongHost);

    const wrongPath = freshSource();
    findRecord(wrongPath.studies.studies, "pmid-35658024").url =
      "https://pubmed.ncbi.nlm.nih.gov/35658024/?tracking=1";
    expectInvalid(wrongPath);

    const mismatchedPmid = freshSource();
    findRecord(mismatchedPmid.studies.studies, "pmid-35658024").pmid =
      "37385275";
    expectInvalid(mismatchedPmid);
  });

  it("rejects claims, mechanisms, overlong summaries, and unknown keys", () => {
    const benefitClaim = freshSource();
    findRecord(benefitClaim.compounds.compounds, "tirzepatide").benefitClaim =
      "A claim";
    expectInvalid(benefitClaim);

    const mechanism = freshSource();
    findRecord(mechanism.compounds.compounds, "tirzepatide").mechanism =
      "A mechanism";
    expectInvalid(mechanism);

    const overlong = freshSource();
    findRecord(overlong.studies.studies, "pmid-35658024").outcomeSummary =
      Array.from({ length: 31 }, (_, index) => `word${index + 1}`).join(" ");
    expectInvalid(overlong);

    const claims = freshSource();
    claims.claimsAudit.claims.push({ wording: "Not authorized" });
    expectInvalid(claims);

    const unknownRootKey = freshSource() as MutableResearchSource & MutableRecord;
    unknownRootKey.unexpected = true;
    expectInvalid(unknownRootKey);

    const unknownStudyKey = freshSource();
    findRecord(unknownStudyKey.studies.studies, "pmid-35658024").reviewNote =
      "Must remain private";
    expectInvalid(unknownStudyKey);
  });

  it("rejects incompatible evidence contexts and altered approved metadata", () => {
    const hostileContext = freshSource();
    findRecord(hostileContext.studies.studies, "pmid-35658024").evidenceContext =
      "animal";
    expectInvalid(hostileContext);

    const alteredNames = freshSource();
    const compound = findRecord(
      alteredNames.compounds.compounds,
      "tirzepatide",
    );
    compound.alternateNames = [...(compound.alternateNames as string[]), "altered"];
    expectInvalid(alteredNames);

    const alteredDuration = freshSource();
    findRecord(alteredDuration.studies.studies, "pmid-35658024").duration =
      "999 years";
    expectInvalid(alteredDuration);
  });
});
