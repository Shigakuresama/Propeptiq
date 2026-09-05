import "server-only";

import claimsAuditJson from "../../content/claims-audit.json";
import compoundsJson from "../../content/compounds.json";
import studyCorrectionsJson from "../../content/study-corrections.json";
import studiesJson from "../../content/studies.json";
import type {
  EvidenceContext,
  PublicCompoundResearch,
  PublicCompoundResearchEntry,
  PublicCompoundStudy,
  PublicStudyCorrection,
  StrongestEvidence,
  StudyDesign,
} from "./compound-research-public";

export type {
  PublicCompoundResearch,
  PublicCompoundResearchEntry,
  PublicCompoundStudy,
  PublicStudyCorrection,
  StrongestEvidence,
} from "./compound-research-public";

const INVALID_RESEARCH_DATA = "Invalid compound research data.";
const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const PMID_PATTERN = /^[1-9][0-9]{6,8}$/u;
const DOI_PATTERN = /^10\.[0-9]{4,9}\/\S+$/u;

const studyDesigns = Object.freeze([
  "animal_experimental",
  "human_interventional",
  "human_observational",
  "human_pharmacokinetic_pharmacodynamic",
  "human_pilot",
  "human_safety_pilot",
  "multicenter_clinical_trial",
  "pooled_randomized_controlled_trials",
  "preclinical_experimental",
  "randomized_controlled_trial",
  "retrospective_observational",
] as const);

const evidenceContexts = Object.freeze([
  "animal",
  "human",
  "in_vitro",
  "preclinical",
] as const);

const strongestEvidenceValues = Object.freeze([
  "animal_only",
  "human_meta",
  "human_observational",
  "human_rct",
  "in_vitro_only",
] as const);

type ParsedStudy = Omit<PublicCompoundStudy, "corrections"> & Readonly<{
  compoundId: string;
  studiedAmount: string | null;
  route: string | null;
  outcomeSummary: string | null;
  verificationStatus: "verified_primary_source";
  publicationStatus: "public_neutral_metadata";
  reviewedOn: AuthorizedStudy["reviewedOn"];
}>;

type ParsedCorrection = Readonly<{
  recordType: "correction";
  correctionPmid: string;
  parentPmid: string;
}>;

type ParsedCompound = Readonly<{
  id: string;
  productSlug: string;
  displayName: string;
  alternateNames: readonly string[];
  studyIds: readonly string[];
  strongestEvidence: StrongestEvidence;
  identityCaveat: string | null;
  mechanism: null;
  benefitClaim: null;
}>;

type ParsedResearch = Readonly<{
  compounds: readonly ParsedCompound[];
  studies: readonly ParsedStudy[];
  corrections: readonly ParsedCorrection[];
}>;

const compatibleEvidenceContexts: Readonly<Record<StudyDesign, EvidenceContext>> =
  Object.freeze({
    animal_experimental: "animal",
    human_interventional: "human",
    human_observational: "human",
    human_pharmacokinetic_pharmacodynamic: "human",
    human_pilot: "human",
    human_safety_pilot: "human",
    multicenter_clinical_trial: "human",
    pooled_randomized_controlled_trials: "human",
    preclinical_experimental: "preclinical",
    randomized_controlled_trial: "human",
    retrospective_observational: "human",
  });

const authorizedCompoundSlugs = Object.freeze({
  "5-amino-1mq": "5-amino-1mq",
  "aod-9604": "aod-9604",
  "ara-290": "ara-290",
  "bpc-157": "bpc-157",
  cagrilintide: "cargrilintide",
  "cjc-1295-with-dac": "cjc-1295-with-dac",
  "ghk-cu": "ghk-cu",
  hcg: "hcg",
  "igf-1-lr3": "igf-1-lr3",
  ipamorelin: "ipamorelin",
  "mots-c": "mots-c",
  "nad-plus": "nad-plus",
  retatrutide: "retatrutide",
  semaglutide: "semaglutide",
  "sermorelin-acetate": "sermorelin-acetate",
  "ss-31": "ss-31",
  survodutide: "survodutide",
  tesamorelin: "tesmorelin",
  "thymosin-alpha-1": "thymosin-alpha-1",
  tirzepatide: "tirzepatide",
} as const);

const authorizedStudies = Object.freeze({
  "10496658": { compoundId: "ipamorelin", reviewedOn: "2026-09-04" },
  "11146367": { compoundId: "aod-9604", reviewedOn: "2026-09-04" },
  "11713213": { compoundId: "aod-9604", reviewedOn: "2026-09-04" },
  "12107212": { compoundId: "hcg", reviewedOn: "2026-09-04" },
  "16352683": { compoundId: "cjc-1295-with-dac", reviewedOn: "2026-09-04" },
  "16847171": { compoundId: "ghk-cu", reviewedOn: "2026-09-04" },
  "17018654": { compoundId: "cjc-1295-with-dac", reviewedOn: "2026-09-04" },
  "20554713": { compoundId: "tesamorelin", reviewedOn: "2026-09-04" },
  "21030672": { compoundId: "bpc-157", reviewedOn: "2026-09-04" },
  "23168581": { compoundId: "ara-290", reviewedOn: "2026-09-05" },
  "24136731": { compoundId: "ara-290", reviewedOn: "2026-09-05" },
  "25331030": { compoundId: "ipamorelin", reviewedOn: "2026-09-04" },
  "29593067": { compoundId: "mots-c", reviewedOn: "2026-09-04" },
  "31572171": { compoundId: "nad-plus", reviewedOn: "2026-09-04" },
  "33077895": { compoundId: "ss-31", reviewedOn: "2026-09-05" },
  "33567185": { compoundId: "semaglutide", reviewedOn: "2026-09-04" },
  "33667417": { compoundId: "semaglutide", reviewedOn: "2026-09-04" },
  "34798060": { compoundId: "cagrilintide", reviewedOn: "2026-09-04" },
  "35013352": { compoundId: "5-amino-1mq", reviewedOn: "2026-09-04" },
  "35658024": { compoundId: "tirzepatide", reviewedOn: "2026-09-04" },
  "35713670": { compoundId: "thymosin-alpha-1", reviewedOn: "2026-09-05" },
  "37268435": { compoundId: "ss-31", reviewedOn: "2026-09-05" },
  "37366315": { compoundId: "retatrutide", reviewedOn: "2026-09-04" },
  "37385275": { compoundId: "tirzepatide", reviewedOn: "2026-09-04" },
  "38330987": { compoundId: "survodutide", reviewedOn: "2026-09-04" },
  "39161060": { compoundId: "5-amino-1mq", reviewedOn: "2026-09-04" },
  "39814420": { compoundId: "thymosin-alpha-1", reviewedOn: "2026-09-05" },
  "40131143": { compoundId: "bpc-157", reviewedOn: "2026-09-04" },
  "41704678": { compoundId: "nad-plus", reviewedOn: "2026-09-04" },
  "42253238": { compoundId: "survodutide", reviewedOn: "2026-09-04" },
  "7561636": { compoundId: "igf-1-lr3", reviewedOn: "2026-09-04" },
  "8772599": { compoundId: "sermorelin-acetate", reviewedOn: "2026-09-04" },
  "9488001": { compoundId: "igf-1-lr3", reviewedOn: "2026-09-04" },
} as const);

type AuthorizedStudy = (typeof authorizedStudies)[keyof typeof authorizedStudies];

const authorizedCorrections = Object.freeze({
  "28059429": "24136731",
  "40447307": "39814420",
} as const);

const compoundKeys = Object.freeze([
  "id",
  "productSlug",
  "displayName",
  "alternateNames",
  "studyIds",
  "strongestEvidence",
  "identityCaveat",
  "mechanism",
  "benefitClaim",
] as const);

const studyKeys = Object.freeze([
  "id",
  "compoundId",
  "pmid",
  "url",
  "title",
  "firstAuthor",
  "year",
  "journal",
  "design",
  "evidenceContext",
  "sampleSize",
  "population",
  "studiedAmount",
  "duration",
  "route",
  "doi",
  "outcomeSummary",
  "verificationStatus",
  "publicationStatus",
  "reviewedOn",
] as const);

const correctionKeys = Object.freeze([
  "recordType",
  "correctionPmid",
  "parentPmid",
] as const);

function invalid(): never {
  throw new TypeError(INVALID_RESEARCH_DATA);
}

function readExactObject(
  value: unknown,
  allowedKeys: readonly string[],
): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return invalid();
  }
  const prototype = Reflect.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return invalid();

  const allowed = new Set(allowedKeys);
  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.length !== allowedKeys.length) return invalid();

  const snapshot: Record<string, unknown> = Object.create(null) as Record<
    string,
    unknown
  >;
  for (const key of ownKeys) {
    if (typeof key !== "string" || !allowed.has(key)) return invalid();
    const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !("value" in descriptor)) return invalid();
    snapshot[key] = descriptor.value;
  }
  return snapshot;
}

function parseArrayIndex(key: PropertyKey): number | null {
  if (typeof key !== "string" || key.length === 0) return null;
  const index = Number(key);
  if (
    !Number.isSafeInteger(index) ||
    index < 0 ||
    index > 2 ** 32 - 2 ||
    String(index) !== key
  ) {
    return null;
  }
  return index;
}

function readDenseArray(
  value: unknown,
  maximumLength: number,
): readonly unknown[] {
  if (!Array.isArray(value) || Reflect.getPrototypeOf(value) !== Array.prototype) {
    return invalid();
  }
  const lengthDescriptor = Reflect.getOwnPropertyDescriptor(value, "length");
  if (lengthDescriptor === undefined || !("value" in lengthDescriptor)) {
    return invalid();
  }
  const length = lengthDescriptor.value;
  if (
    typeof length !== "number" ||
    !Number.isSafeInteger(length) ||
    length < 0 ||
    length > maximumLength
  ) {
    return invalid();
  }

  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.length !== length + 1) return invalid();
  const indexes = new Set<number>();
  for (const key of ownKeys) {
    if (key === "length") continue;
    const index = parseArrayIndex(key);
    if (index === null || index >= length || indexes.has(index)) return invalid();
    indexes.add(index);
  }
  if (indexes.size !== length) return invalid();

  const snapshot = new Array<unknown>(length);
  for (let index = 0; index < length; index += 1) {
    const descriptor = Reflect.getOwnPropertyDescriptor(value, String(index));
    if (descriptor === undefined || !("value" in descriptor)) return invalid();
    snapshot[index] = descriptor.value;
  }
  return snapshot;
}

function readString(value: unknown, maximumLength = 2_000): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > maximumLength ||
    value.trim() !== value ||
    /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(value)
  ) {
    return invalid();
  }
  return value;
}

function readNullableString(
  value: unknown,
  maximumLength = 2_000,
): string | null {
  return value === null ? null : readString(value, maximumLength);
}

function readStringArray(
  value: unknown,
  maximumLength: number,
): readonly string[] {
  const candidates = readDenseArray(value, maximumLength);
  const result: string[] = [];
  const unique = new Set<string>();
  for (const candidate of candidates) {
    const parsed = readString(candidate, 300);
    if (unique.has(parsed)) return invalid();
    unique.add(parsed);
    result.push(parsed);
  }
  return result;
}

function readEnum<Value extends string>(
  value: unknown,
  values: readonly Value[],
): Value {
  if (typeof value !== "string" || !values.includes(value as Value)) {
    return invalid();
  }
  return value as Value;
}

function readSampleSize(value: unknown): number | null {
  if (value === null) return null;
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value <= 0 ||
    value > 10_000_000
  ) {
    return invalid();
  }
  return value;
}

function readYear(value: unknown): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 1800 ||
    value > 2026
  ) {
    return invalid();
  }
  return value;
}

function readDoi(value: unknown): string | null {
  const doi = readNullableString(value, 300);
  if (doi !== null && !DOI_PATTERN.test(doi)) return invalid();
  return doi;
}

function readOutcomeSummary(value: unknown): string | null {
  const summary = readNullableString(value, 1_000);
  if (summary !== null && summary.split(/\s+/u).length > 30) return invalid();
  return summary;
}

function parseCompound(value: unknown): ParsedCompound {
  const record = readExactObject(value, compoundKeys);
  const id = readString(record.id, 100);
  const productSlug = readString(record.productSlug, 100);
  if (!ID_PATTERN.test(id) || !ID_PATTERN.test(productSlug)) return invalid();
  if (!Object.hasOwn(authorizedCompoundSlugs, id)) return invalid();
  if (
    productSlug !==
      authorizedCompoundSlugs[id as keyof typeof authorizedCompoundSlugs]
  ) {
    return invalid();
  }
  if (record.mechanism !== null || record.benefitClaim !== null) return invalid();

  const studyIds = readStringArray(record.studyIds, 32);
  if (studyIds.length === 0 || studyIds.some((studyId) =>
    !/^pmid-[1-9][0-9]{6,8}$/u.test(studyId)
  )) {
    return invalid();
  }

  return {
    id,
    productSlug,
    displayName: readString(record.displayName, 200),
    alternateNames: readStringArray(record.alternateNames, 32),
    studyIds,
    strongestEvidence: readEnum(record.strongestEvidence, strongestEvidenceValues),
    identityCaveat: readNullableString(record.identityCaveat, 500),
    mechanism: null,
    benefitClaim: null,
  };
}

function parseStudy(value: unknown): ParsedStudy {
  const record = readExactObject(value, studyKeys);
  const id = readString(record.id, 100);
  const compoundId = readString(record.compoundId, 100);
  const pmid = readString(record.pmid, 20);
  if (!ID_PATTERN.test(id) || !ID_PATTERN.test(compoundId)) return invalid();
  if (!PMID_PATTERN.test(pmid) || id !== `pmid-${pmid}`) return invalid();
  if (!Object.hasOwn(authorizedStudies, pmid)) return invalid();
  const authorization = authorizedStudies[pmid as keyof typeof authorizedStudies];
  if (compoundId !== authorization.compoundId) return invalid();

  const url = readString(record.url, 200);
  if (url !== `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`) return invalid();
  if (record.verificationStatus !== "verified_primary_source") return invalid();
  if (record.publicationStatus !== "public_neutral_metadata") return invalid();
  if (record.reviewedOn !== authorization.reviewedOn) return invalid();

  const design = readEnum(record.design, studyDesigns);
  const evidenceContext = readEnum(record.evidenceContext, evidenceContexts);
  if (compatibleEvidenceContexts[design] !== evidenceContext) return invalid();

  return {
    id,
    compoundId,
    pmid,
    url,
    title: readString(record.title, 2_000),
    firstAuthor: readString(record.firstAuthor, 300),
    year: readYear(record.year),
    journal: readString(record.journal, 300),
    design,
    evidenceContext,
    sampleSize: readSampleSize(record.sampleSize),
    population: readNullableString(record.population, 500),
    studiedAmount: readNullableString(record.studiedAmount, 300),
    duration: readNullableString(record.duration, 300),
    route: readNullableString(record.route, 300),
    doi: readDoi(record.doi),
    outcomeSummary: readOutcomeSummary(record.outcomeSummary),
    verificationStatus: "verified_primary_source",
    publicationStatus: "public_neutral_metadata",
    reviewedOn: authorization.reviewedOn,
  };
}

function parseCorrections(
  input: unknown,
  studies: readonly ParsedStudy[],
): readonly ParsedCorrection[] {
  const correctionsFile = readExactObject(input, ["schemaVersion", "corrections"]);
  if (correctionsFile.schemaVersion !== 1) return invalid();
  const candidates = readDenseArray(
    correctionsFile.corrections,
    Object.keys(authorizedCorrections).length,
  );
  if (candidates.length !== Object.keys(authorizedCorrections).length) {
    return invalid();
  }

  const studyPmids = new Set(studies.map((study) => study.pmid));
  const corrections: ParsedCorrection[] = [];
  const correctionPmids = new Set<string>();
  for (const candidate of candidates) {
    const record = readExactObject(candidate, correctionKeys);
    if (record.recordType !== "correction") return invalid();
    const correctionPmid = readString(record.correctionPmid, 20);
    const parentPmid = readString(record.parentPmid, 20);
    if (
      !PMID_PATTERN.test(correctionPmid) ||
      !PMID_PATTERN.test(parentPmid) ||
      correctionPmid === parentPmid ||
      !Object.hasOwn(authorizedCorrections, correctionPmid) ||
      authorizedCorrections[
        correctionPmid as keyof typeof authorizedCorrections
      ] !== parentPmid ||
      correctionPmids.has(correctionPmid) ||
      studyPmids.has(correctionPmid) ||
      !studyPmids.has(parentPmid)
    ) {
      return invalid();
    }
    correctionPmids.add(correctionPmid);
    corrections.push({ recordType: "correction", correctionPmid, parentPmid });
  }
  for (const correctionPmid of Object.keys(authorizedCorrections)) {
    if (!correctionPmids.has(correctionPmid)) return invalid();
  }
  return corrections;
}

function expectedStrongestEvidence(
  studies: readonly ParsedStudy[],
): StrongestEvidence {
  if (studies.some((study) =>
    study.evidenceContext === "human" &&
    (study.design === "randomized_controlled_trial" ||
      study.design === "pooled_randomized_controlled_trials")
  )) {
    return "human_rct";
  }
  if (studies.some((study) => study.evidenceContext === "human")) {
    return "human_observational";
  }
  if (studies.some((study) => study.evidenceContext === "animal")) {
    return "animal_only";
  }
  return "in_vitro_only";
}

function parseResearch(input: unknown, correctionInput: unknown): ParsedResearch {
  const root = readExactObject(input, ["compounds", "studies", "claimsAudit"]);
  const compoundsFile = readExactObject(root.compounds, [
    "schemaVersion",
    "compounds",
  ]);
  const studiesFile = readExactObject(root.studies, ["schemaVersion", "studies"]);
  const claimsFile = readExactObject(root.claimsAudit, [
    "schemaVersion",
    "claims",
  ]);
  if (
    compoundsFile.schemaVersion !== 1 ||
    studiesFile.schemaVersion !== 1 ||
    claimsFile.schemaVersion !== 1
  ) {
    return invalid();
  }
  if (readDenseArray(claimsFile.claims, 0).length !== 0) return invalid();

  const compoundCandidates = readDenseArray(
    compoundsFile.compounds,
    Object.keys(authorizedCompoundSlugs).length,
  );
  const studyCandidates = readDenseArray(
    studiesFile.studies,
    Object.keys(authorizedStudies).length,
  );
  if (
    compoundCandidates.length !== Object.keys(authorizedCompoundSlugs).length ||
    studyCandidates.length !== Object.keys(authorizedStudies).length
  ) {
    return invalid();
  }

  const compounds = compoundCandidates.map(parseCompound);
  const studies = studyCandidates.map(parseStudy);
  const compoundById = new Map<string, ParsedCompound>();
  const studyById = new Map<string, ParsedStudy>();
  const pmids = new Set<string>();

  for (const compound of compounds) {
    if (compoundById.has(compound.id)) return invalid();
    compoundById.set(compound.id, compound);
  }
  for (const study of studies) {
    if (studyById.has(study.id) || pmids.has(study.pmid)) return invalid();
    studyById.set(study.id, study);
    pmids.add(study.pmid);
  }

  const referencedStudies = new Set<string>();
  for (const compound of compounds) {
    const compoundStudies: ParsedStudy[] = [];
    for (const studyId of compound.studyIds) {
      const study = studyById.get(studyId);
      if (
        study === undefined ||
        study.compoundId !== compound.id ||
        referencedStudies.has(studyId)
      ) {
        return invalid();
      }
      referencedStudies.add(studyId);
      compoundStudies.push(study);
    }
    if (compound.strongestEvidence !== expectedStrongestEvidence(compoundStudies)) {
      return invalid();
    }
  }
  if (referencedStudies.size !== studies.length) return invalid();

  return { compounds, studies, corrections: parseCorrections(correctionInput, studies) };
}

function approvedComparableResearch(parsed: ParsedResearch): string {
  const compounds = [...parsed.compounds]
    .map((compound) => ({
      ...compound,
      alternateNames: [...compound.alternateNames].sort(compareText),
      studyIds: [...compound.studyIds].sort(compareText),
    }))
    .sort((left, right) => compareText(left.id, right.id));
  const studies = [...parsed.studies]
    .sort((left, right) => compareText(left.id, right.id))
    .map((study) => ({ ...study }));
  const corrections = [...parsed.corrections]
    .sort((left, right) => compareText(left.correctionPmid, right.correctionPmid))
    .map((correction) => ({ ...correction }));
  return JSON.stringify({ compounds, studies, corrections });
}

function assertApprovedResearch(parsed: ParsedResearch): void {
  if (
    approvedComparableResearch(parsed) !==
    approvedComparableResearch(approvedParsedResearch)
  ) {
    return invalid();
  }
}

const approvedParsedResearch = deepFreeze(
  parseResearch({
    compounds: compoundsJson,
    studies: studiesJson,
    claimsAudit: claimsAuditJson,
  }, studyCorrectionsJson),
);

function compareText(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function deepFreeze<Value>(value: Value): Value {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const key of Reflect.ownKeys(value)) {
      const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
      if (descriptor !== undefined && "value" in descriptor) {
        deepFreeze(descriptor.value);
      }
    }
    Object.freeze(value);
  }
  return value;
}

function projectParsedResearch(parsed: ParsedResearch): PublicCompoundResearch {
  const studyById = new Map(parsed.studies.map((study) => [study.id, study]));
  const correctionsByParent = new Map<string, ParsedCorrection[]>();
  for (const correction of [...parsed.corrections].sort((left, right) =>
    compareText(left.correctionPmid, right.correctionPmid)
  )) {
    const parentCorrections = correctionsByParent.get(correction.parentPmid) ?? [];
    parentCorrections.push(correction);
    correctionsByParent.set(correction.parentPmid, parentCorrections);
  }
  const compounds = [...parsed.compounds]
    .sort((left, right) => compareText(left.id, right.id))
    .map((compound) => {
      const studies = compound.studyIds.map((studyId) => {
        const study = studyById.get(studyId);
        if (study === undefined) return invalid();
        const publicStudy = {
          id: study.id,
          pmid: study.pmid,
          url: study.url,
          title: study.title,
          firstAuthor: study.firstAuthor,
          year: study.year,
          journal: study.journal,
          design: study.design,
          evidenceContext: study.evidenceContext,
          sampleSize: study.sampleSize,
          population: study.population,
          duration: study.duration,
          doi: study.doi,
        };
        const corrections = correctionsByParent.get(study.pmid);
        if (corrections === undefined) {
          return publicStudy satisfies PublicCompoundStudy;
        }
        return {
          ...publicStudy,
          corrections: corrections.map((correction) => ({
            recordType: "correction",
            correctionPmid: correction.correctionPmid,
            parentPmid: correction.parentPmid,
            url: `https://pubmed.ncbi.nlm.nih.gov/${correction.correctionPmid}/`,
          }) satisfies PublicStudyCorrection),
        } satisfies PublicCompoundStudy;
      }).sort((left, right) => compareText(left.id, right.id));

      return {
        id: compound.id,
        productSlug: compound.productSlug,
        displayName: compound.displayName,
        alternateNames: [...compound.alternateNames].sort(compareText),
        strongestEvidence: compound.strongestEvidence,
        identityCaveat: compound.identityCaveat,
        studies,
      } satisfies PublicCompoundResearchEntry;
    });

  return deepFreeze({ schemaVersion: 1, compounds });
}

/**
 * Validate an untrusted, JSON-shaped research bundle and return only the
 * neutral public bibliography fields. The source is never mutated or exposed.
 */
export function projectPublicCompoundResearch(
  input: unknown,
  correctionInput: unknown = studyCorrectionsJson,
): PublicCompoundResearch {
  try {
    const parsed = parseResearch(input, correctionInput);
    assertApprovedResearch(parsed);
    return projectParsedResearch(parsed);
  } catch {
    return invalid();
  }
}

export const publicCompoundResearch = projectPublicCompoundResearch({
  compounds: compoundsJson,
  studies: studiesJson,
  claimsAudit: claimsAuditJson,
});
