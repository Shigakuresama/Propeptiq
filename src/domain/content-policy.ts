export type PublicationPolicy = Readonly<{
  version: string;
  activeLotEvidenceIds: readonly string[];
}>;

export type PublicClaim = Readonly<{
  id: string;
  text: string;
  kind: "ordinary" | "analytical";
  lotEvidenceIds: readonly string[];
}>;

export type PublicCopyCandidate = Readonly<{
  text: string;
  claims: readonly PublicClaim[];
}>;

export type ContentViolationCode =
  | "publication_policy_unavailable"
  | "copy_candidate_invalid"
  | "dosage"
  | "administration"
  | "reconstitution"
  | "injection"
  | "treatment"
  | "weight_loss"
  | "bodybuilding"
  | "anti_aging"
  | "therapeutic"
  | "structure_function"
  | "human_outcome"
  | "veterinary_outcome"
  | "unsupported_claim";

export type ContentViolation = Readonly<{
  code: ContentViolationCode;
  match: string | null;
  claimId: string | null;
}>;

export type ContentScanResult = Readonly<{
  publishable: boolean;
  status: "pass" | "blocked" | "unknown";
  violations: readonly ContentViolation[];
  policyVersion: string | null;
}>;

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

function normalizeText(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/[\p{Cc}\p{Cf}]+/gu, " ")
    .replace(/[\p{P}\p{S}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isValidPolicy(value: unknown): value is PublicationPolicy {
  return (
    isRecord(value) &&
    isNonBlank(value.version) &&
    isDenseArray(value.activeLotEvidenceIds) &&
    value.activeLotEvidenceIds.every(isNonBlank) &&
    new Set(value.activeLotEvidenceIds).size ===
      value.activeLotEvidenceIds.length
  );
}

const prohibitedPatterns: readonly Readonly<{
  code: ContentViolationCode;
  pattern: RegExp;
}>[] = Object.freeze([
  { code: "dosage", pattern: /\b(?:dose|dosage|dosing)\b/ },
  {
    code: "administration",
    pattern: /\b(?:administer(?:ed|ing)?|administration|orally|sublingual)\b/,
  },
  {
    code: "reconstitution",
    pattern: /\breconstitut(?:e|ed|ing|ion)\b/,
  },
  {
    code: "injection",
    pattern:
      /\b(?:inject(?:ion|ed|ing)?|subcutaneous(?:ly)?|intramuscular(?:ly)?|intravenous(?:ly)?)\b/,
  },
  {
    code: "treatment",
    pattern:
      /\b(?:treat(?:s|ed|ing|ment)?|cure[sd]?|prevent(?:s|ed|ing|ion)?|diagnos(?:e|ed|is|ing))\b/,
  },
  {
    code: "weight_loss",
    pattern: /\b(?:weight loss|lose weight|fat burn(?:ing)?)\b/,
  },
  {
    code: "bodybuilding",
    pattern: /\b(?:bodybuilding|muscle growth|build muscle)\b/,
  },
  { code: "anti_aging", pattern: /\banti aging\b/ },
  { code: "therapeutic", pattern: /\btherapeutic(?:s| benefit(?:s)?)?\b/ },
  {
    code: "structure_function",
    pattern:
      /\b(?:boosts?|enhances?|improves?|supports?|promotes?|maintains?)\s+(?:metabolism|immune|hormone|muscle|energy|recovery|cognition|sleep|wellness)\b/,
  },
  {
    code: "human_outcome",
    pattern:
      /\b(?:in humans|for humans?|for patients?|patient outcomes?|human (?:health|outcomes?|use|consumption))\b/,
  },
  {
    code: "veterinary_outcome",
    pattern:
      /\b(?:veterinary|animal health|for animals?|for (?:dogs?|cats?|pets?))\b/,
  },
  {
    code: "unsupported_claim",
    pattern:
      /\b(?:guaranteed|clinically proven|best in class|highest purity|safe and effective)\b/,
  },
]);

const prohibitedCompactPatterns: readonly Readonly<{
  code: ContentViolationCode;
  pattern: RegExp;
}>[] = Object.freeze([
  { code: "dosage", pattern: /(?:dose|dosage|dosing)/ },
  {
    code: "administration",
    pattern: /(?:administer|administration|orally|sublingual)/,
  },
  { code: "reconstitution", pattern: /reconstitut/ },
  {
    code: "injection",
    pattern: /(?:inject|subcutaneous|intramuscular|intravenous)/,
  },
  { code: "treatment", pattern: /(?:treat|cure|prevent|diagnos)/ },
  { code: "weight_loss", pattern: /(?:weightloss|loseweight|fatburn)/ },
  {
    code: "bodybuilding",
    pattern: /(?:bodybuilding|musclegrowth|buildmuscle)/,
  },
  { code: "anti_aging", pattern: /antiaging/ },
  { code: "therapeutic", pattern: /therapeutic/ },
  {
    code: "structure_function",
    pattern:
      /(?:boost|enhance|improve|support|promote|maintain)(?:metabolism|immune|hormone|muscle|energy|recovery|cognition|sleep|wellness)/,
  },
  {
    code: "human_outcome",
    pattern:
      /(?:inhumans|forhuman|forpatient|patientoutcome|humanhealth|humanoutcome|humanuse|humanconsumption)/,
  },
  {
    code: "veterinary_outcome",
    pattern:
      /(?:veterinary|animalhealth|animaluse|animalconsumption|foranimal|fordog|forcat|forpet)/,
  },
  {
    code: "unsupported_claim",
    pattern:
      /(?:guaranteed|clinicallyproven|bestinclass|highestpurity|safeandeffective)/,
  },
]);

function violation(
  code: ContentViolationCode,
  match: string | null,
  claimId: string | null,
): ContentViolation {
  return Object.freeze({ code, match, claimId });
}

function appendProhibitedViolations(
  normalizedText: string,
  claimId: string | null,
  violations: ContentViolation[],
): void {
  for (const { code, pattern } of prohibitedPatterns) {
    const match = normalizedText.match(pattern)?.[0] ?? null;
    if (match !== null) violations.push(violation(code, match, claimId));
  }

  const compactText = normalizedText.replace(/\s+/g, "");
  for (const { code, pattern } of prohibitedCompactPatterns) {
    const match = compactText.match(pattern)?.[0] ?? null;
    const alreadyRecorded = violations.some(
      (current) => current.code === code && current.claimId === claimId,
    );
    if (match !== null && !alreadyRecorded) {
      violations.push(violation(code, match, claimId));
    }
  }
}

function result(
  publishable: boolean,
  status: ContentScanResult["status"],
  violations: readonly ContentViolation[],
  policyVersion: string | null,
): ContentScanResult {
  return Object.freeze({
    publishable,
    status,
    violations: Object.freeze([...violations]),
    policyVersion,
  });
}

function isValidCandidateShell(value: unknown): value is PublicCopyCandidate {
  return (
    isRecord(value) &&
    typeof value.text === "string" &&
    normalizeText(value.text).length > 0 &&
    isDenseArray(value.claims)
  );
}

export function scanPublicCopy(
  candidate: PublicCopyCandidate,
  policy: PublicationPolicy,
): ContentScanResult {
  if (!isValidPolicy(policy)) {
    return result(
      false,
      "unknown",
      [violation("publication_policy_unavailable", null, null)],
      null,
    );
  }
  if (!isValidCandidateShell(candidate)) {
    return result(
      false,
      "blocked",
      [violation("copy_candidate_invalid", null, null)],
      policy.version,
    );
  }

  const violations: ContentViolation[] = [];
  appendProhibitedViolations(normalizeText(candidate.text), null, violations);

  const activeLotEvidenceIds = new Set(policy.activeLotEvidenceIds);
  for (const claim of candidate.claims as readonly unknown[]) {
    const claimId =
      isRecord(claim) && isNonBlank(claim.id) ? claim.id : null;
    if (!isRecord(claim)) {
      violations.push(violation("unsupported_claim", null, claimId));
      continue;
    }

    const lotEvidenceIds = claim.lotEvidenceIds;
    const evidenceProjectionIsValid =
      isDenseArray(lotEvidenceIds) &&
      lotEvidenceIds.every(isNonBlank) &&
      new Set(lotEvidenceIds).size === lotEvidenceIds.length;
    const claimTextIsValid =
      typeof claim.text === "string" && normalizeText(claim.text).length > 0;
    const kindIsValid = claim.kind === "ordinary" || claim.kind === "analytical";
    const analyticalEvidenceIsValid =
      claim.kind !== "analytical" ||
      (evidenceProjectionIsValid &&
        lotEvidenceIds.length > 0 &&
        lotEvidenceIds.every((id) => activeLotEvidenceIds.has(id)));

    if (
      claimId === null ||
      !claimTextIsValid ||
      !kindIsValid ||
      !evidenceProjectionIsValid ||
      !analyticalEvidenceIsValid
    ) {
      violations.push(violation("unsupported_claim", null, claimId));
    }
    if (typeof claim.text === "string") {
      appendProhibitedViolations(
        normalizeText(claim.text),
        claimId,
        violations,
      );
    }
  }

  if (violations.length > 0) {
    return result(false, "blocked", violations, policy.version);
  }
  return result(true, "pass", [], policy.version);
}
