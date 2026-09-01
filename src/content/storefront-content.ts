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

export type ApprovedWhyChooseItem = Readonly<{
  id: string;
  title: string;
  body: string;
}>;

export type ApprovedFaqEntry = Readonly<{
  id: string;
  question: string;
  answer: string;
  anchor: `faq-${string}`;
}>;

export type ApprovedHomepageContent = Readonly<{
  whyChoose: readonly ApprovedWhyChooseItem[];
  faqs: readonly ApprovedFaqEntry[];
}>;

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

const MAX_ARRAY_INDEX = 2 ** 32 - 2;

function ownArrayIndex(key: PropertyKey): number | null {
  if (typeof key !== "string" || key.length === 0) return null;
  const index = Number(key);
  return Number.isSafeInteger(index) &&
      index >= 0 &&
      index <= MAX_ARRAY_INDEX &&
      String(index) === key
    ? index
    : null;
}

function denseArraySnapshot(value: unknown): readonly unknown[] {
  if (!Array.isArray(value)) throw new TypeError("Invalid controlled content input.");
  const lengthDescriptor = Reflect.getOwnPropertyDescriptor(value, "length");
  if (lengthDescriptor === undefined || !("value" in lengthDescriptor)) {
    throw new TypeError("Invalid controlled content input.");
  }
  const length = lengthDescriptor.value as unknown;
  if (!Number.isSafeInteger(length) || (length as number) < 0) {
    throw new TypeError("Invalid controlled content input.");
  }

  const arrayLength = length as number;
  const ownKeys = Reflect.ownKeys(value);
  let ownIndexCount = 0;
  for (let keyIndex = 0; keyIndex < ownKeys.length; keyIndex += 1) {
    const index = ownArrayIndex(ownKeys[keyIndex]!);
    if (index === null) continue;
    if (index >= arrayLength) {
      throw new TypeError("Invalid controlled content input.");
    }
    ownIndexCount += 1;
  }
  if (ownIndexCount !== arrayLength) {
    throw new TypeError("Invalid controlled content input.");
  }

  const snapshot = new Array<unknown>(arrayLength);
  for (let index = 0; index < arrayLength; index += 1) {
    const descriptor = Reflect.getOwnPropertyDescriptor(value, String(index));
    if (descriptor === undefined) {
      throw new TypeError("Invalid controlled content input.");
    }
    snapshot[index] = "value" in descriptor
      ? descriptor.value
      : descriptor.get === undefined
        ? undefined
        : Reflect.apply(descriptor.get, value, []);
  }
  return Object.freeze(snapshot);
}

const approvedHomepageId = /^[a-z0-9][a-z0-9_-]{0,63}$/u;
const INVALID_APPROVED_HOMEPAGE_CONTENT =
  "Invalid approved homepage content.";

function invalidApprovedHomepageContent(): never {
  throw new TypeError(INVALID_APPROVED_HOMEPAGE_CONTENT);
}

type StorefrontContentRecordSnapshot = Readonly<{
  record: ApprovedStorefrontContent | null;
  invalidApprovedHomepageRecord: boolean;
}>;

function snapshotApprovedStorefrontContentRecord(
  value: unknown,
): StorefrontContentRecordSnapshot {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return { record: null, invalidApprovedHomepageRecord: false };
  }

  const record = value as Record<string, unknown>;
  let kind: unknown;
  let status: unknown;
  try {
    kind = record.kind;
    status = record.status;
  } catch {
    return { record: null, invalidApprovedHomepageRecord: false };
  }
  if (status !== "approved" || !isControlledContentKind(kind)) {
    return { record: null, invalidApprovedHomepageRecord: false };
  }
  const approvedHomepageKind = kind === "why_choose" || kind === "faq";

  let id: unknown;
  let title: unknown;
  let body: unknown;
  try {
    id = record.id;
    title = record.title;
    body = record.body;
  } catch {
    return {
      record: null,
      invalidApprovedHomepageRecord: approvedHomepageKind,
    };
  }
  if (
    typeof id !== "string" ||
    typeof title !== "string" ||
    typeof body !== "string"
  ) {
    return {
      record: null,
      invalidApprovedHomepageRecord: approvedHomepageKind,
    };
  }

  try {
    const sourceReferenceCandidates = denseArraySnapshot(record.sourceReferences);
    const approvalNote = record.approvalNote;
    const reviewedAt = record.reviewedAt;
    const effectiveAt = record.effectiveAt;
    const sourceReferences: string[] = [];
    for (let index = 0; index < sourceReferenceCandidates.length; index += 1) {
      const source = sourceReferenceCandidates[index];
      if (typeof source !== "string") {
        return { record: null, invalidApprovedHomepageRecord: false };
      }
      sourceReferences.push(source);
    }

    if (
      !isNullableString(approvalNote) ||
      !isNullableString(reviewedAt) ||
      !isNullableString(effectiveAt)
    ) {
      return { record: null, invalidApprovedHomepageRecord: false };
    }

    return {
      record: Object.freeze({
        id,
        kind,
        status: "approved",
        title,
        body,
        sourceReferences: Object.freeze(sourceReferences),
        approvalNote,
        reviewedAt,
        effectiveAt,
      }),
      invalidApprovedHomepageRecord: false,
    };
  } catch {
    return {
      record: null,
      invalidApprovedHomepageRecord: false,
    };
  }
}

const emptyApprovedStorefrontContent = Object.freeze(
  [] as ApprovedStorefrontContent[],
);

function projectApprovedStorefrontContent(
  records: readonly ControlledContentRecord[],
  rejectInvalidHomepageRecords: boolean,
): readonly ApprovedStorefrontContent[] {
  try {
    const candidates = denseArraySnapshot(records);
    const approved: ApprovedStorefrontContent[] = [];
    for (let index = 0; index < candidates.length; index += 1) {
      const snapshot = snapshotApprovedStorefrontContentRecord(candidates[index]);
      if (
        rejectInvalidHomepageRecords &&
        snapshot.invalidApprovedHomepageRecord
      ) {
        invalidApprovedHomepageContent();
      }
      if (snapshot.record !== null) approved.push(snapshot.record);
    }
    return Object.freeze(approved);
  } catch (error) {
    if (
      rejectInvalidHomepageRecords &&
      error instanceof TypeError &&
      error.message === INVALID_APPROVED_HOMEPAGE_CONTENT
    ) {
      throw error;
    }
    return emptyApprovedStorefrontContent;
  }
}

export function getApprovedStorefrontContent(
  records: readonly ControlledContentRecord[] = storefrontContentRecords,
): readonly ApprovedStorefrontContent[] {
  return projectApprovedStorefrontContent(records, false);
}

function isNonBlankTrimmed(value: string): boolean {
  return value.length > 0 && value.trim() === value;
}

export function getApprovedHomepageContent(
  records: readonly ControlledContentRecord[] = storefrontContentRecords,
): ApprovedHomepageContent {
  const approved = projectApprovedStorefrontContent(records, true);
  const whyChoose: ApprovedWhyChooseItem[] = [];
  const faqs: ApprovedFaqEntry[] = [];
  const ids = new Set<string>();

  for (const record of approved) {
    if (record.kind !== "why_choose" && record.kind !== "faq") continue;
    if (
      !approvedHomepageId.test(record.id) ||
      !isNonBlankTrimmed(record.title) ||
      !isNonBlankTrimmed(record.body) ||
      ids.has(record.id)
    ) {
      invalidApprovedHomepageContent();
    }
    ids.add(record.id);

    if (record.kind === "why_choose") {
      whyChoose.push(Object.freeze({
        id: record.id,
        title: record.title,
        body: record.body,
      }));
      continue;
    }

    faqs.push(Object.freeze({
      id: record.id,
      question: record.title,
      answer: record.body,
      anchor: `faq-${record.id}`,
    }));
  }

  return Object.freeze({
    whyChoose: Object.freeze(whyChoose),
    faqs: Object.freeze(faqs),
  });
}
