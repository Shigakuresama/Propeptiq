import type { EvidenceReference } from "@/domain/eligibility";

export type ApprovedEvidenceProjection = Readonly<{
  reference: EvidenceReference;
  approvalId: string;
  approvalVersion: string;
  integrityVerified: boolean;
}>;

export type PublicationPolicy = Readonly<{
  version: string;
  approvalId: string;
  approvalVersion: string;
  effectiveAt: string;
  expiresAt: string | null;
  integrityVerified: boolean;
  approvedNegativeDisclaimers: readonly string[];
  approvedEvidence: readonly ApprovedEvidenceProjection[];
}>;

export type PublicClaim = Readonly<{
  id: string;
  text: string;
  evidenceApprovalIds: readonly string[];
}>;

export type PublicCopyCandidate = Readonly<{
  text: string;
  claims: readonly PublicClaim[];
}>;

export type ContentViolationCode =
  | "publication_policy_unavailable"
  | "approved_disclaimer_missing"
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

function isNonBlankString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isDenseArray(value: readonly unknown[]): boolean {
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.hasOwn(value, index)) {
      return false;
    }
  }

  return true;
}

function isValidEvidenceProjection(
  value: unknown,
): value is ApprovedEvidenceProjection {
  if (
    !isRecord(value) ||
    !isNonBlankString(value.approvalId) ||
    !isNonBlankString(value.approvalVersion) ||
    value.integrityVerified !== true ||
    !isRecord(value.reference)
  ) {
    return false;
  }

  const reference = value.reference;
  return (
    isNonBlankString(reference.kind) &&
    isNonBlankString(reference.id) &&
    isNonBlankString(reference.version) &&
    (reference.sha256 === null ||
      (typeof reference.sha256 === "string" &&
        /^[a-f0-9]{64}$/.test(reference.sha256)))
  );
}

function isCurrentPublicationPolicy(
  policy: unknown,
  nowValue: unknown,
): policy is PublicationPolicy {
  if (
    !isRecord(policy) ||
    typeof nowValue !== "string" ||
    typeof policy.effectiveAt !== "string" ||
    !(policy.expiresAt === null || typeof policy.expiresAt === "string") ||
    !isNonBlankString(policy.version) ||
    !isNonBlankString(policy.approvalId) ||
    !isNonBlankString(policy.approvalVersion) ||
    policy.integrityVerified !== true ||
    !Array.isArray(policy.approvedNegativeDisclaimers) ||
    policy.approvedNegativeDisclaimers.length === 0 ||
    !isDenseArray(policy.approvedNegativeDisclaimers) ||
    !policy.approvedNegativeDisclaimers.every(
      (disclaimer) =>
        isNonBlankString(disclaimer) && normalizeText(disclaimer).length > 0,
    ) ||
    !Array.isArray(policy.approvedEvidence) ||
    !isDenseArray(policy.approvedEvidence) ||
    !policy.approvedEvidence.every(isValidEvidenceProjection)
  ) {
    return false;
  }

  const now = new Date(nowValue);
  const effectiveAt = new Date(policy.effectiveAt);
  const expiresAt = policy.expiresAt === null ? null : new Date(policy.expiresAt);
  const approvedEvidenceIds = new Set<string>();
  const approvedEvidenceIsUnique = policy.approvedEvidence.every(
    ({ approvalId }) => {
      const isUnique = !approvedEvidenceIds.has(approvalId);
      approvedEvidenceIds.add(approvalId);
      return isUnique;
    },
  );

  return (
    Number.isFinite(now.getTime()) &&
    now.toISOString() === nowValue &&
    Number.isFinite(effectiveAt.getTime()) &&
    effectiveAt.toISOString() === policy.effectiveAt &&
    effectiveAt.getTime() <= now.getTime() &&
    (expiresAt === null ||
      (Number.isFinite(expiresAt.getTime()) &&
        expiresAt.toISOString() === policy.expiresAt &&
        expiresAt.getTime() > now.getTime())) &&
    approvedEvidenceIsUnique
  );
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
  { code: "injection", pattern: /(?:inject|subcutaneous|intramuscular|intravenous)/ },
  { code: "treatment", pattern: /(?:treat|cure|prevent|diagnos)/ },
  { code: "weight_loss", pattern: /(?:weightloss|loseweight|fatburn)/ },
  { code: "bodybuilding", pattern: /(?:bodybuilding|musclegrowth|buildmuscle)/ },
  { code: "anti_aging", pattern: /antiaging/ },
  { code: "therapeutic", pattern: /therapeutic/ },
  {
    code: "structure_function",
    pattern:
      /(?:boost|enhance|improve|support|promote|maintain)(?:metabolism|immune|hormone|muscle|energy|recovery|cognition|sleep|wellness)/,
  },
  {
    code: "human_outcome",
    pattern: /(?:inhumans|forhuman|forpatient|patientoutcome|humanhealth|humanoutcome|humanuse|humanconsumption)/,
  },
  {
    code: "veterinary_outcome",
    pattern: /(?:veterinary|animalhealth|animaluse|animalconsumption|foranimal|fordog|forcat|forpet)/,
  },
  {
    code: "unsupported_claim",
    pattern:
      /(?:guaranteed|clinicallyproven|bestinclass|highestpurity|safeandeffective)/,
  },
]);

function appendProhibitedViolations(
  normalizedText: string,
  claimId: string | null,
  violations: ContentViolation[],
): void {
  for (const { code, pattern } of prohibitedPatterns) {
    const match = normalizedText.match(pattern)?.[0] ?? null;
    if (match !== null) {
      violations.push(Object.freeze({ code, match, claimId }));
    }
  }

  const compactText = normalizedText.replace(/\s+/g, "");
  for (const { code, pattern } of prohibitedCompactPatterns) {
    const match = compactText.match(pattern)?.[0] ?? null;
    const alreadyRecorded = violations.some(
      (violation) => violation.code === code && violation.claimId === claimId,
    );
    if (match !== null && !alreadyRecorded) {
      violations.push(Object.freeze({ code, match, claimId }));
    }
  }
}

export function scanPublicCopy(
  candidate: PublicCopyCandidate,
  policy: PublicationPolicy,
  now: string,
): ContentScanResult {
  if (!isCurrentPublicationPolicy(policy, now)) {
    return Object.freeze({
      publishable: false,
      status: "unknown",
      violations: Object.freeze([
        Object.freeze({
          code: "publication_policy_unavailable" as const,
          match: null,
          claimId: null,
        }),
      ]),
      policyVersion: null,
    });
  }

  if (!isRecord(candidate) || typeof candidate.text !== "string") {
    return Object.freeze({
      publishable: false,
      status: "blocked",
      violations: Object.freeze([
        Object.freeze({
          code: "approved_disclaimer_missing" as const,
          match: null,
          claimId: null,
        }),
      ]),
      policyVersion: policy.version,
    });
  }

  const normalizedCopy = normalizeText(candidate.text);
  const includesApprovedDisclaimer = policy.approvedNegativeDisclaimers.some(
    (disclaimer) => normalizedCopy.includes(normalizeText(disclaimer)),
  );
  if (!includesApprovedDisclaimer) {
    return Object.freeze({
      publishable: false,
      status: "blocked",
      violations: Object.freeze([
        Object.freeze({
          code: "approved_disclaimer_missing" as const,
          match: null,
          claimId: null,
        }),
      ]),
      policyVersion: policy.version,
    });
  }

  let scannableCopy = normalizedCopy;
  for (const disclaimer of policy.approvedNegativeDisclaimers) {
    scannableCopy = scannableCopy.replaceAll(normalizeText(disclaimer), " ");
  }

  const violations: ContentViolation[] = [];
  appendProhibitedViolations(scannableCopy, null, violations);

  const approvedEvidenceIds = new Set(
    policy.approvedEvidence.map(({ approvalId }) => approvalId),
  );
  const claims: readonly unknown[] | null = Array.isArray(candidate.claims)
    ? candidate.claims
    : null;
  if (claims === null) {
    violations.push(
      Object.freeze({
        code: "unsupported_claim" as const,
        match: null,
        claimId: null,
      }),
    );
  }

  for (const claim of claims ?? []) {
    const claimId =
      isRecord(claim) && isNonBlankString(claim.id) ? claim.id : null;
    if (!isRecord(claim)) {
      violations.push(
        Object.freeze({
          code: "unsupported_claim" as const,
          match: null,
          claimId,
        }),
      );
      continue;
    }

    const evidenceApprovalIds = Array.isArray(claim.evidenceApprovalIds)
      ? claim.evidenceApprovalIds
      : [];
    const evidenceIdsAreStrings = evidenceApprovalIds.every(isNonBlankString);
    const uniqueClaimEvidenceIds = new Set(evidenceApprovalIds);
    const isSupported =
      claimId !== null &&
      isNonBlankString(claim.text) &&
      normalizeText(claim.text).length > 0 &&
      evidenceApprovalIds.length > 0 &&
      isDenseArray(evidenceApprovalIds) &&
      evidenceIdsAreStrings &&
      uniqueClaimEvidenceIds.size === evidenceApprovalIds.length &&
      evidenceApprovalIds.every(
        (approvalId) =>
          typeof approvalId === "string" &&
          approvedEvidenceIds.has(approvalId),
      );

    if (!isSupported) {
      violations.push(
        Object.freeze({
          code: "unsupported_claim" as const,
          match: null,
          claimId,
        }),
      );
    }

    if (typeof claim.text === "string") {
      const normalizedClaim = normalizeText(claim.text);
      appendProhibitedViolations(normalizedClaim, claimId, violations);
    }
  }
  if (violations.length > 0) {
    return Object.freeze({
      publishable: false,
      status: "blocked",
      violations: Object.freeze(violations),
      policyVersion: policy.version,
    });
  }

  return Object.freeze({
    publishable: true,
    status: "pass",
    violations: Object.freeze([]),
    policyVersion: policy.version,
  });
}
