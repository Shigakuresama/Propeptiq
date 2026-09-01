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

const neutralCalculatorBodyWords: ReadonlySet<string> = new Set([
  "amount",
  "amounts",
  "and",
  "are",
  "arithmetic",
  "bounded",
  "calculate",
  "calculates",
  "calculation",
  "calculations",
  "calculator",
  "concentration",
  "concentrations",
  "conversion",
  "conversions",
  "convert",
  "converts",
  "diluent",
  "divided",
  "equals",
  "for",
  "from",
  "in",
  "input",
  "inputs",
  "lab",
  "laboratory",
  "mathematical",
  "mathematics",
  "mcg",
  "mg",
  "ml",
  "multiplied",
  "only",
  "optional",
  "perform",
  "performs",
  "result",
  "results",
  "sample",
  "samples",
  "to",
  "unit",
  "units",
  "value",
  "values",
  "vial",
  "volume",
  "volumes",
]);

function calculatorCopyIsNeutral(title: string, body: string): boolean {
  if (title !== exactPublicCalculatorTitle) return false;
  const normalizedBody = body
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/[\p{Cc}\p{Cf}]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
  if (!/^[a-z0-9\s.,:;()/*+=-]+$/u.test(normalizedBody)) return false;
  if (/\b\d+(?:,\d{3})*(?:\.\d+)?\s+units?\b/u.test(normalizedBody)) {
    return false;
  }
  const tokens = normalizedBody.match(/[a-z]+|\d+(?:\.\d+)?/gu);
  return tokens !== null && tokens.every((token) =>
    /^\d+(?:\.\d+)?$/u.test(token) || neutralCalculatorBodyWords.has(token));
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
