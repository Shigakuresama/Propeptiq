import { storefrontProductContentRecords } from "./storefront-product-content";

export type ControlledContentRecord = Readonly<{
  id: string;
  kind:
    | "why_choose"
    | "faq"
    | "legal_notice"
    | "product_description"
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

const APPROVAL_NOTE =
  "Owner-authorized neutral placeholder copy; replace with final business-reviewed content.";

function homepageRecord(
  id: string,
  kind: "why_choose" | "faq",
  title: string,
  body: string,
  sourceReferences: readonly string[],
): ControlledContentRecord {
  return Object.freeze({
    id,
    kind,
    status: "approved",
    title,
    body,
    sourceReferences: Object.freeze([...sourceReferences]),
    approvalNote: APPROVAL_NOTE,
    reviewedAt: null,
    effectiveAt: null,
  });
}

const homepageContentRecords: readonly ControlledContentRecord[] = Object.freeze([
  homepageRecord(
    "owner-supplied-records",
    "why_choose",
    "Catalog clarity",
    "Find product names and configurations in a consistent, easy-to-compare format.",
    ["/catalog"],
  ),
  homepageRecord(
    "clear-purchase-states",
    "why_choose",
    "Clear availability",
    "See current pricing and purchase availability alongside each listed configuration.",
    ["/catalog", "/cart"],
  ),
  homepageRecord(
    "exact-variant-identity",
    "why_choose",
    "Exact variant selection",
    "Choose the configuration you need, with each variant kept separate in your cart.",
    ["/cart"],
  ),
  homepageRecord(
    "visible-quantity-pricing",
    "why_choose",
    "Transparent quantity pricing",
    "Compare per-bottle prices, discounts, savings, and totals as you adjust quantity.",
    ["/catalog"],
  ),
  homepageRecord(
    "shared-search-index",
    "why_choose",
    "Search from anywhere",
    "Find products and catalog information through search on every public page.",
    ["/catalog"],
  ),
  homepageRecord(
    "research-use-boundary",
    "why_choose",
    "Research-use focus",
    "Browse materials listed for nonclinical laboratory and research contexts under our Research-Use Policy.",
    ["/research-use-policy"],
  ),
  homepageRecord(
    "what-is-in-the-catalog",
    "faq",
    "What information is in the catalog?",
    "The catalog presents owner-supplied product names and package configurations. Price and availability appear only where current records provide them.",
    ["/catalog"],
  ),
  homepageRecord(
    "how-does-search-work",
    "faq",
    "How does storefront search work?",
    "Catalog search covers product names, categories, SKUs, variant labels, aliases, and approved descriptions. The bottom search also includes approved pages and FAQ entries.",
    ["/catalog"],
  ),
  homepageRecord(
    "how-do-i-choose-a-configuration",
    "faq",
    "How do I choose a product configuration?",
    "Choose the listed variant you want before adding a multi-variant product. The cart stores each exact variant as its own line identity.",
    ["/catalog", "/cart"],
  ),
  homepageRecord(
    "how-do-quantity-discounts-work",
    "faq",
    "How do quantity discounts work?",
    "One item has no volume discount; two receive 8%; three through nine receive 10%; and ten or more receive 30%. If an eligible promotion is higher, only the single higher percentage applies.",
    ["/catalog", "/cart"],
  ),
  homepageRecord(
    "does-the-cart-combine-configurations",
    "faq",
    "Does the cart combine different configurations?",
    "Repeated additions of the same exact variant merge and recalculate its quantity tier. Different variants remain separate and do not combine toward a tier.",
    ["/cart"],
  ),
  homepageRecord(
    "what-does-pricing-coming-soon-mean",
    "faq",
    "What does Pricing coming soon mean?",
    "It means an active price has not been approved for that variant. The item remains visible for catalog review, but it cannot open a production checkout session.",
    ["/catalog"],
  ),
  homepageRecord(
    "what-happens-before-checkout",
    "faq",
    "What happens before checkout opens?",
    "The server reloads current product, price, promotion, destination, inventory, tax, and payment facts. Checkout stays unavailable if a required fact is missing or changed.",
    ["/cart", "/research-use-policy"],
  ),
  homepageRecord(
    "where-are-research-use-restrictions",
    "faq",
    "Where can I review the research-use restrictions?",
    "Open the Research-Use Policy from the site navigation or footer. It lists the permitted nonclinical research contexts and purchaser responsibilities.",
    ["/research-use-policy"],
  ),
]);

export const storefrontContentRecords: readonly ControlledContentRecord[] =
  Object.freeze([
    ...homepageContentRecords,
    ...storefrontProductContentRecords,
  ]);

function isControlledContentKind(
  value: unknown,
): value is ControlledContentRecord["kind"] {
  return value === "why_choose" ||
    value === "faq" ||
    value === "legal_notice" ||
    value === "product_description" ||
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
  if (
    approvedHomepageKind &&
    (
      !approvedHomepageId.test(id) ||
      !isNonBlankTrimmed(title) ||
      !isNonBlankTrimmed(body)
    )
  ) {
    return { record: null, invalidApprovedHomepageRecord: true };
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
