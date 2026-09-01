import {
  getApprovedStorefrontContent,
  type ControlledContentRecord,
} from "@/content/storefront-content";
import {
  scanPublicCopy,
  type PublicationPolicy,
} from "@/domain/content-policy";
import type {
  PublicConcentrationCalculatorConfiguration,
} from "@/domain/concentration";

export type ConcentrationCalculatorMode = "disabled" | "preview" | "approved";

export type ControlledConcentrationCalculatorConfiguration = Readonly<{
  status: "draft" | "approved" | "retired";
  maxVialMg: number;
  maxDiluentMl: number;
  maxSampleMl: number;
  placementApproved: boolean;
  approvalNote: string;
  reviewedAt: string;
  publicationPolicy: PublicationPolicy;
  contentId: string;
}>;

export const concentrationCalculatorConfiguration: ControlledConcentrationCalculatorConfiguration | null = null;

const exactPublicCalculatorTitle = "Laboratory concentration calculator";

const calculatorSpecificProhibitedPatterns: readonly RegExp[] = Object.freeze([
  /\b(?:draw(?:n|s|ing)?|withdraw(?:n|s|ing)?|syringes?)\b/u,
  /\b(?:human|patient)\s+(?:use|dose|dosage|dosing|advice|guidance)\b/u,
  /\b(?:dose|dosage|dosing|treat(?:s|ed|ing|ment)?|advice|recommend(?:ation|ations|ed|ing|s)?|protocols?|administration|administer(?:ed|ing)?|inject(?:ion|ed|ing)?|routes?)\b/u,
  /\b(?:take|takes|taking|consume[sd]?|consuming|swallow(?:s|ed|ing)?|ingest(?:s|ed|ing)?|inject(?:s|ed|ing)?|administer(?:s|ed|ing)?)\b/u,
  /\b(?:use|apply)\s+(?:\p{N}|a\b|an\b|the\b|this\b)/u,
  /\b(?:once|twice|daily|weekly|monthly|hourly|frequency|schedules?|morning|evening|nightly|bedtime)\b/u,
  /\b(?:every|each|per)\s+(?:other\s+)?(?:days?|weeks?|months?|hours?)\b/u,
  /\b(?:days?|weeks?|months?|hours?)\b/u,
]);

function calculatorCopyIsNeutral(title: string, body: string): boolean {
  if (title !== exactPublicCalculatorTitle) return false;
  const semanticBody = body
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/[\p{Cc}\p{Cf}\p{P}\p{S}]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
  if (semanticBody.length === 0) return false;
  if (/\b\p{N}+(?:\s+\p{N}+)*\s*units?\b/u.test(semanticBody)) {
    return false;
  }
  return !calculatorSpecificProhibitedPatterns.some((pattern) =>
    pattern.test(semanticBody));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonBlank(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isPositiveFinite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function isCanonicalUtcTimestamp(value: unknown): value is string {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)
  ) {
    return false;
  }
  try {
    return new Date(value).toISOString() === value;
  } catch {
    return false;
  }
}

function isStructurallyApprovedConfiguration(
  value: unknown,
): value is ControlledConcentrationCalculatorConfiguration {
  return isRecord(value) &&
    value.status === "approved" &&
    value.placementApproved === true &&
    isPositiveFinite(value.maxVialMg) &&
    isPositiveFinite(value.maxDiluentMl) &&
    isPositiveFinite(value.maxSampleMl) &&
    isNonBlank(value.approvalNote) &&
    isCanonicalUtcTimestamp(value.reviewedAt) &&
    isNonBlank(value.contentId) &&
    isRecord(value.publicationPolicy);
}

export type ResolveConcentrationCalculatorInput = Readonly<{
  mode: ConcentrationCalculatorMode;
  productionIdentity: boolean;
  configuration: ControlledConcentrationCalculatorConfiguration | null;
  content: readonly ControlledContentRecord[];
}>;

export function resolvePublicConcentrationCalculatorConfiguration({
  mode,
  productionIdentity,
  configuration,
  content,
}: ResolveConcentrationCalculatorInput): PublicConcentrationCalculatorConfiguration | null {
  if (mode === "disabled" || (mode === "preview" && productionIdentity)) {
    return null;
  }
  if (!isStructurallyApprovedConfiguration(configuration)) return null;

  const matchingRecords = (content as readonly unknown[]).filter(
    (record) => isRecord(record) && record.id === configuration.contentId,
  );
  if (matchingRecords.length !== 1) return null;

  const approvedRecord = getApprovedStorefrontContent(content).find(
    (record) => record.id === configuration.contentId,
  );
  if (
    approvedRecord?.kind !== "calculator_copy" ||
    !isCanonicalUtcTimestamp(approvedRecord.reviewedAt) ||
    !isNonBlank(approvedRecord.title) ||
    !isNonBlank(approvedRecord.body)
  ) {
    return null;
  }
  if (!calculatorCopyIsNeutral(approvedRecord.title, approvedRecord.body)) {
    return null;
  }

  const scan = scanPublicCopy(
    { text: `${approvedRecord.title}\n${approvedRecord.body}`, claims: [] },
    configuration.publicationPolicy,
  );
  if (!scan.publishable || scan.status !== "pass") return null;

  return Object.freeze({
    title: approvedRecord.title,
    body: approvedRecord.body,
    limits: Object.freeze({
      maxVialMg: configuration.maxVialMg,
      maxDiluentMl: configuration.maxDiluentMl,
      maxSampleMl: configuration.maxSampleMl,
    }),
  });
}
