import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import claimsAuditJson from "../../content/claims-audit.json";
import compoundsJson from "../../content/compounds.json";
import studyCorrectionsJson from "../../content/study-corrections.json";
import studiesJson from "../../content/studies.json";
import {
  projectPublicCompoundResearch,
  publicCompoundResearch,
} from "./compound-research";

const expectedExistingPmids = [
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

const expectedNewStudies = [
  { id: "pmid-23168581", compoundId: "ara-290", pmid: "23168581", firstAuthor: "Heij L", reviewedOn: "2026-09-05" },
  { id: "pmid-24136731", compoundId: "ara-290", pmid: "24136731", firstAuthor: "Dahan A", reviewedOn: "2026-09-05" },
  { id: "pmid-33077895", compoundId: "ss-31", pmid: "33077895", firstAuthor: "Reid Thompson W", reviewedOn: "2026-09-05" },
  { id: "pmid-37268435", compoundId: "ss-31", pmid: "37268435", firstAuthor: "Karaa A", reviewedOn: "2026-09-05" },
  { id: "pmid-35713670", compoundId: "thymosin-alpha-1", pmid: "35713670", firstAuthor: "Ke L", reviewedOn: "2026-09-05" },
  { id: "pmid-39814420", compoundId: "thymosin-alpha-1", pmid: "39814420", firstAuthor: "Wu J", reviewedOn: "2026-09-05" },
] as const;

const approvedCorrections = {
  schemaVersion: 1,
  corrections: [
    { recordType: "correction", correctionPmid: "40447307", parentPmid: "39814420" },
    { recordType: "correction", correctionPmid: "28059429", parentPmid: "24136731" },
  ],
} as const;

const expectedCompoundOrder = [
  "5-amino-1mq",
  "aod-9604",
  "ara-290",
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
  "ss-31",
  "survodutide",
  "tesamorelin",
  "thymosin-alpha-1",
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
  expect(record, `Missing test fixture record: ${id}`).toBeDefined();
  return record!;
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

function project(source: unknown, corrections?: unknown) {
  const projector = projectPublicCompoundResearch as (
    input: unknown,
    correctionInput?: unknown,
  ) => ReturnType<typeof projectPublicCompoundResearch>;
  return corrections === undefined ? projector(source) : projector(source, corrections);
}

function expectInvalid(source: unknown, corrections?: unknown): void {
  expect(() => project(source, corrections)).toThrow(
    new TypeError("Invalid compound research data."),
  );
}

describe("verified compound research source", () => {
  it("preserves the exact existing bibliography and appends only the six authorized studies", () => {
    expect(studiesJson.schemaVersion).toBe(1);
    expect(studiesJson.studies.map((study) => study.pmid)).toEqual([
      ...expectedExistingPmids,
      ...expectedNewStudies.map((study) => study.pmid),
    ]);
    expect(new Set(studiesJson.studies.map((study) => study.pmid)).size).toBe(33);
    expect(createHash("sha256").update(JSON.stringify(studiesJson.studies.slice(0, 27))).digest("hex")).toBe(
      "13c0d57425ffcda4e861fecb10199b0e7fd83d16d8b69063b40c0ca7a80ba44f",
    );

    for (const study of studiesJson.studies.slice(0, 27)) {
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
    expect(studiesJson.studies.slice(27)).toMatchObject(expectedNewStudies);
    for (const study of studiesJson.studies.slice(27)) {
      expect(study.design).toBe("randomized_controlled_trial");
      expect(study.evidenceContext).toBe("human");
      expect(study.studiedAmount).toBeNull();
      expect(study.duration).toBeNull();
      expect(study.route).toBeNull();
      expect(study.outcomeSummary).toBeNull();
    }
  });

  it("keeps immutable catalog spelling mappings without adding excluded products", () => {
    expect(compoundsJson.schemaVersion).toBe(1);
    expect(compoundsJson.compounds).toHaveLength(20);
    expect(createHash("sha256").update(JSON.stringify(compoundsJson.compounds.slice(0, 17))).digest("hex")).toBe(
      "b23f9802f40eb3d17dc01f7ff7bf614218b060e816ceaf87261f3c32cb526f0c",
    );
    expect(compoundsJson.compounds.slice(17)).toMatchObject([
      { id: "ara-290", productSlug: "ara-290", studyIds: ["pmid-23168581", "pmid-24136731"], strongestEvidence: "human_rct", mechanism: null, benefitClaim: null },
      { id: "ss-31", productSlug: "ss-31", studyIds: ["pmid-33077895", "pmid-37268435"], strongestEvidence: "human_rct", mechanism: null, benefitClaim: null },
      { id: "thymosin-alpha-1", productSlug: "thymosin-alpha-1", studyIds: ["pmid-35713670", "pmid-39814420"], strongestEvidence: "human_rct", mechanism: null, benefitClaim: null },
    ]);

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

  it("ships exactly two linked corrections outside the study registry", () => {
    expect(studyCorrectionsJson).toEqual(approvedCorrections);
    expect(studiesJson.studies.map((study) => study.pmid)).not.toEqual(
      expect.arrayContaining(["28059429", "40447307"]),
    );
    expect(compoundsJson.compounds.flatMap((compound) => compound.studyIds)).not.toEqual(
      expect.arrayContaining(["pmid-28059429", "pmid-40447307"]),
    );
  });
});

describe("projectPublicCompoundResearch", () => {
  it("projects only neutral compound and citation metadata", () => {
    const projected = project(freshSource(), approvedCorrections);

    expect(projected.schemaVersion).toBe(1);
    expect(projected.compounds.map((compound) => compound.id)).toEqual(
      expectedCompoundOrder,
    );
    expect(projected.compounds.flatMap((compound) =>
      compound.studies.map((study) => study.pmid)
    )).toHaveLength(33);

    const compoundKeys = Object.keys(projected.compounds[0]!).sort();
    const studyKeys = Object.keys(projected.compounds.find((compound) => compound.id === "ss-31")!.studies[0]!).sort();
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

    const correctedStudies = projected.compounds.flatMap((compound) => compound.studies)
      .filter((study) => "corrections" in study);
    expect(correctedStudies).toEqual([
      expect.objectContaining({
        pmid: "24136731",
        corrections: [{
          recordType: "correction",
          correctionPmid: "28059429",
          parentPmid: "24136731",
          url: "https://pubmed.ncbi.nlm.nih.gov/28059429/",
        }],
      }),
      expect.objectContaining({
        pmid: "39814420",
        corrections: [{
          recordType: "correction",
          correctionPmid: "40447307",
          parentPmid: "39814420",
          url: "https://pubmed.ncbi.nlm.nih.gov/40447307/",
        }],
      }),
    ]);
    expect(projected.compounds.flatMap((compound) => compound.studies.map((study) => study.pmid))).not.toEqual(
      expect.arrayContaining(["28059429", "40447307"]),
    );

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

    const corrections = structuredClone(approvedCorrections);
    const correctionsBefore = structuredClone(corrections);
    const reorderedCorrections = {
      schemaVersion: approvedCorrections.schemaVersion,
      corrections: [...approvedCorrections.corrections].reverse(),
    };
    const projected = project(source, corrections);
    const reorderedProjection = project(reordered, reorderedCorrections);

    expect(source).toEqual(before);
    expect(corrections).toEqual(correctionsBefore);
    expect(Object.isFrozen(source)).toBe(false);
    expect(projected).toEqual(reorderedProjection);
    expect(project(source)).toEqual(projected);
    expect(projected).toEqual(publicCompoundResearch);
    expect(projected).not.toBe(source);
    expectDeeplyFrozen(projected);
  });

  it("binds every approved PMID to its exact compound and review date", () => {
    const wrongNewDate = freshSource();
    findRecord(wrongNewDate.studies.studies, "pmid-23168581").reviewedOn = "2026-09-04";
    expectInvalid(wrongNewDate, approvedCorrections);

    const wrongOldDate = freshSource();
    findRecord(wrongOldDate.studies.studies, "pmid-35658024").reviewedOn = "2026-09-05";
    expectInvalid(wrongOldDate, approvedCorrections);

    const wrongAuthor = freshSource();
    findRecord(wrongAuthor.studies.studies, "pmid-33077895").firstAuthor = "Thompson WR";
    expectInvalid(wrongAuthor, approvedCorrections);

    const wrongIdentity = freshSource();
    findRecord(wrongIdentity.studies.studies, "pmid-23168581").compoundId = "ss-31";
    expectInvalid(wrongIdentity, approvedCorrections);

    const omitted = freshSource();
    omitted.studies.studies.pop();
    expectInvalid(omitted, approvedCorrections);

    const extra = freshSource();
    extra.studies.studies.push({ ...extra.studies.studies[0], id: "pmid-99999999", pmid: "99999999", url: "https://pubmed.ncbi.nlm.nih.gov/99999999/" });
    expectInvalid(extra, approvedCorrections);
  });

  it.each([
    ["unknown record type", { schemaVersion: 1, corrections: [{ recordType: "erratum", correctionPmid: "40447307", parentPmid: "39814420" }, approvedCorrections.corrections[1]] }],
    ["malformed PMID", { schemaVersion: 1, corrections: [{ recordType: "correction", correctionPmid: "040447307", parentPmid: "39814420" }, approvedCorrections.corrections[1]] }],
    ["equal PMIDs", { schemaVersion: 1, corrections: [{ recordType: "correction", correctionPmid: "39814420", parentPmid: "39814420" }, approvedCorrections.corrections[1]] }],
    ["unknown key", { schemaVersion: 1, corrections: [{ ...approvedCorrections.corrections[0], title: "Not allowed" }, approvedCorrections.corrections[1]] }],
    ["duplicate correction", { schemaVersion: 1, corrections: [approvedCorrections.corrections[0], approvedCorrections.corrections[0]] }],
    ["unknown pair", { schemaVersion: 1, corrections: [{ recordType: "correction", correctionPmid: "40447307", parentPmid: "24136731" }, approvedCorrections.corrections[1]] }],
    ["absent correction", { schemaVersion: 1, corrections: [approvedCorrections.corrections[0]] }],
    ["third correction", { schemaVersion: 1, corrections: [...approvedCorrections.corrections, { recordType: "correction", correctionPmid: "99999999", parentPmid: "39814420" }] }],
  ])("rejects correction sidecars with %s", (_label, corrections) => {
    expectInvalid(freshSource(), corrections);
  });

  it("rejects orphaned, study-colliding, and compound-joined corrections", () => {
    const orphan = freshSource();
    orphan.studies.studies = orphan.studies.studies.filter((study) => study.pmid !== "39814420");
    findRecord(orphan.compounds.compounds, "thymosin-alpha-1").studyIds = ["pmid-35713670"];
    expectInvalid(orphan, approvedCorrections);

    const correctionAsStudy = freshSource();
    correctionAsStudy.studies.studies[0] = {
      ...correctionAsStudy.studies.studies[0],
      id: "pmid-40447307",
      pmid: "40447307",
      url: "https://pubmed.ncbi.nlm.nih.gov/40447307/",
    };
    expectInvalid(correctionAsStudy, approvedCorrections);

    const correctionInJoin = freshSource();
    findRecord(correctionInJoin.compounds.compounds, "thymosin-alpha-1").studyIds = [
      "pmid-35713670",
      "pmid-39814420",
      "pmid-40447307",
    ];
    expectInvalid(correctionInJoin, approvedCorrections);
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
