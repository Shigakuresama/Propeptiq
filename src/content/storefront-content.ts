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

function projectApprovedStorefrontContent(
  record: ControlledContentRecord & Readonly<{ status: "approved" }>,
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
    records.filter(
      (record): record is ApprovedStorefrontContent =>
        record.status === "approved",
    ).map(projectApprovedStorefrontContent),
  );
}
