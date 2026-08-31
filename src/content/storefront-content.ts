export type ControlledContentRecord = Readonly<{
  id: string;
  kind:
    | "why_choose"
    | "faq"
    | "legal_notice"
    | "product_information"
    | "calculator_copy";
  status: "draft" | "approved" | "retired";
  title: string;
  body: string;
  sourceReferences: readonly string[];
  approvalNote: string | null;
  reviewedAt: string | null;
  effectiveAt: string | null;
}>;

export type ApprovedStorefrontContent = ControlledContentRecord &
  Readonly<{ status: "approved" }>;

export const storefrontContentRecords: readonly ControlledContentRecord[] =
  Object.freeze([]);

function isControlledContentKind(
  value: unknown,
): value is ControlledContentRecord["kind"] {
  return value === "why_choose" ||
    value === "faq" ||
    value === "legal_notice" ||
    value === "product_information" ||
    value === "calculator_copy";
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isApprovedStorefrontContentRecord(
  value: unknown,
): value is ApprovedStorefrontContent {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return typeof record.id === "string" &&
    isControlledContentKind(record.kind) &&
    record.status === "approved" &&
    typeof record.title === "string" &&
    typeof record.body === "string" &&
    Array.isArray(record.sourceReferences) &&
    record.sourceReferences.every((source) => typeof source === "string") &&
    isNullableString(record.approvalNote) &&
    isNullableString(record.reviewedAt) &&
    isNullableString(record.effectiveAt);
}

function projectApprovedStorefrontContent(
  record: ApprovedStorefrontContent,
): ApprovedStorefrontContent {
  return Object.freeze({
    id: record.id,
    kind: record.kind,
    status: "approved",
    title: record.title,
    body: record.body,
    sourceReferences: Object.freeze([...record.sourceReferences]),
    approvalNote: record.approvalNote,
    reviewedAt: record.reviewedAt,
    effectiveAt: record.effectiveAt,
  });
}

export function getApprovedStorefrontContent(
  records: readonly ControlledContentRecord[] = storefrontContentRecords,
): readonly ApprovedStorefrontContent[] {
  return Object.freeze(
    records
      .filter(isApprovedStorefrontContentRecord)
      .map(projectApprovedStorefrontContent),
  );
}
