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

const calculatorCopyBounds = Object.freeze({
  maxCharacters: 4_096,
  maxTokens: 256,
});

const calculatorCopyVocabulary = Object.freeze({
  functionWords: Object.freeze([
    "a",
    "an",
    "and",
    "are",
    "as",
    "at",
    "be",
    "by",
    "each",
    "for",
    "from",
    "in",
    "into",
    "is",
    "it",
    "of",
    "on",
    "only",
    "or",
    "per",
    "that",
    "the",
    "these",
    "this",
    "those",
    "to",
    "when",
    "which",
    "with",
    "without",
  ]),
  laboratoryMathNouns: Object.freeze([
    "amount",
    "amounts",
    "arithmetic",
    "calculation",
    "calculations",
    "calculator",
    "calculators",
    "concentration",
    "concentrations",
    "conversion",
    "conversions",
    "decimal",
    "decimals",
    "diluent",
    "diluents",
    "formula",
    "formulas",
    "input",
    "inputs",
    "laboratory",
    "material",
    "materials",
    "mathematics",
    "measurement",
    "measurements",
    "result",
    "results",
    "sample",
    "samples",
    "value",
    "values",
    "vial",
    "vials",
    "volume",
    "volumes",
  ]),
  safeMathVerbs: Object.freeze([
    "calculate",
    "calculated",
    "calculates",
    "calculating",
    "contain",
    "contained",
    "containing",
    "contains",
    "convert",
    "converted",
    "converting",
    "converts",
    "display",
    "displayed",
    "displaying",
    "displays",
    "divide",
    "divided",
    "divides",
    "dividing",
    "enter",
    "entered",
    "entering",
    "enters",
    "equal",
    "equaled",
    "equaling",
    "equals",
    "multiply",
    "multiplied",
    "multiplies",
    "multiplying",
    "perform",
    "performed",
    "performing",
    "performs",
    "produce",
    "produced",
    "produces",
    "producing",
    "provide",
    "provided",
    "provides",
    "providing",
    "select",
    "selected",
    "selecting",
    "selects",
    "show",
    "showing",
    "shown",
    "shows",
  ]),
  safeModifiers: Object.freeze([
    "approved",
    "bounded",
    "current",
    "exact",
    "finite",
    "first",
    "given",
    "laboratory",
    "mathematical",
    "neutral",
    "numeric",
    "optional",
    "plain",
    "positive",
    "selected",
    "supplied",
    "then",
    "total",
  ]),
  canonicalUnits: Object.freeze([
    "mcg",
    "mg",
    "microgram",
    "micrograms",
    "milligram",
    "milligrams",
    "milliliter",
    "milliliters",
    "ml",
    "unit",
    "units",
  ]),
});

const calculatorCopyNumberToken = /^\d+(?:[.,]\d+)*$/u;
const calculatorCopyToken = /[a-z]+|\d+(?:[.,]\d+)*/gu;
const calculatorCopyCharacters = /^[a-z0-9 \t\r\n.,;:!?()[\]{}+\-*/=%]*$/u;
const numericGenericUnit =
  /(?:^|[^a-z0-9])(?:\d+(?:[.,]\d+)*|\.\d+)[\s\p{P}\p{S}]*units?\b/iu;

function isOrdinaryWhitespace(value: string): boolean {
  return value === " " || value === "\t" || value === "\r" || value === "\n";
}

function hasUnexpectedControlOrWhitespace(value: string): boolean {
  for (const character of value) {
    if (/\p{Cf}/u.test(character)) return true;
    if (/\p{Cc}/u.test(character) && !isOrdinaryWhitespace(character)) {
      return true;
    }
    if (/\s/u.test(character) && !isOrdinaryWhitespace(character)) {
      return true;
    }
  }
  return false;
}

function isApprovedCalculatorCopyToken(token: string): boolean {
  if (calculatorCopyNumberToken.test(token)) return true;
  return Object.values(calculatorCopyVocabulary).some((category) =>
    category.includes(token));
}

function calculatorCopyIsNeutral(title: string, body: string): boolean {
  if (title !== exactPublicCalculatorTitle) return false;
  if (
    body.length > calculatorCopyBounds.maxCharacters ||
    hasUnexpectedControlOrWhitespace(body)
  ) {
    return false;
  }

  const normalizedBody = body.normalize("NFKC").toLocaleLowerCase("en-US");
  if (
    normalizedBody.length === 0 ||
    normalizedBody.length > calculatorCopyBounds.maxCharacters ||
    !calculatorCopyCharacters.test(normalizedBody) ||
    numericGenericUnit.test(normalizedBody)
  ) {
    return false;
  }

  const tokens = normalizedBody.match(calculatorCopyToken) ?? [];
  return tokens.length > 0 &&
    tokens.length <= calculatorCopyBounds.maxTokens &&
    tokens.every(isApprovedCalculatorCopyToken);
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
