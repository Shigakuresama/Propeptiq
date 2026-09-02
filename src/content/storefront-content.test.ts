import { describe, expect, it } from "vitest";

import {
  getApprovedHomepageContent,
  getApprovedStorefrontContent,
  storefrontContentRecords,
  type ControlledContentRecord,
} from "./storefront-content";

const records = [
  {
    id: "30000000-0000-4000-8000-000000000001",
    kind: "product_information",
    status: "approved",
    title: "Approved first fixture",
    body: "Neutral approved laboratory fixture copy.",
    sourceReferences: ["fixture-source-a"],
    approvalNote: "Approved test fixture",
    reviewedAt: "2026-08-30T00:00:00.000Z",
    effectiveAt: null,
  },
  {
    id: "30000000-0000-4000-8000-000000000002",
    kind: "faq",
    status: "draft",
    title: "Draft fixture",
    body: "This draft must not be public.",
    sourceReferences: [],
    approvalNote: null,
    reviewedAt: null,
    effectiveAt: null,
  },
  {
    id: "30000000-0000-4000-8000-000000000003",
    kind: "legal_notice",
    status: "retired",
    title: "Retired fixture",
    body: "This retired record must not be public.",
    sourceReferences: ["fixture-source-retired"],
    approvalNote: "Retired test fixture",
    reviewedAt: "2026-08-29T00:00:00.000Z",
    effectiveAt: null,
  },
  {
    id: "30000000-0000-4000-8000-000000000004",
    kind: "calculator_copy",
    status: "approved",
    title: "Approved second fixture",
    body: "Mathematical conversions only.",
    sourceReferences: ["fixture-source-b"],
    approvalNote: "Approved test fixture",
    reviewedAt: "2026-08-30T01:00:00.000Z",
    effectiveAt: "2026-08-31T00:00:00.000Z",
  },
] as const satisfies readonly ControlledContentRecord[];

describe("storefront controlled content", () => {
  it("publishes only approved records in configured order without mutating input", () => {
    const before = JSON.stringify(records);

    expect(getApprovedStorefrontContent(records).map((record) => record.id)).toEqual([
      "30000000-0000-4000-8000-000000000001",
      "30000000-0000-4000-8000-000000000004",
    ]);
    expect(JSON.stringify(records)).toBe(before);
  });

  it("allowlist-projects approved runtime records instead of returning loose fields", () => {
    const looseApprovedRecord = {
      ...records[0],
      stripePriceId: "price_private_content_fixture",
      availableQuantity: 12,
      provider: { name: "private-provider-fixture" },
    };

    expect(getApprovedStorefrontContent([looseApprovedRecord])).toEqual([{
      id: "30000000-0000-4000-8000-000000000001",
      kind: "product_information",
      status: "approved",
      title: "Approved first fixture",
      body: "Neutral approved laboratory fixture copy.",
      sourceReferences: ["fixture-source-a"],
      approvalNote: "Approved test fixture",
      reviewedAt: "2026-08-30T00:00:00.000Z",
      effectiveAt: null,
    }]);
  });

  it.each([
    [
      "objects in required ID strings",
      {
        ...records[0],
        id: { providerToken: "provider_nested_id_fixture" },
      },
    ],
    [
      "unknown content kinds",
      {
        ...records[0],
        kind: "provider_private_fixture",
      },
    ],
    [
      "objects in required title strings",
      {
        ...records[0],
        title: { providerToken: "provider_nested_title_fixture" },
      },
    ],
    [
      "objects in required body strings",
      {
        ...records[0],
        body: { providerToken: "provider_nested_body_fixture" },
      },
    ],
    [
      "non-array source references",
      {
        ...records[0],
        sourceReferences: { stripePriceId: "price_nested_nonarray_fixture" },
      },
    ],
    [
      "object entries in source references",
      {
        ...records[0],
        sourceReferences: [{ stripePriceId: "price_nested_private_fixture" }],
      },
    ],
    [
      "objects in nullable string fields",
      {
        ...records[0],
        approvalNote: { providerToken: "provider_nested_private_fixture" },
      },
    ],
    [
      "objects in reviewed timestamps",
      {
        ...records[0],
        reviewedAt: { providerToken: "provider_nested_reviewed_fixture" },
      },
    ],
    [
      "objects in effective timestamps",
      {
        ...records[0],
        effectiveAt: { providerToken: "provider_nested_effective_fixture" },
      },
    ],
  ])("omits an approved runtime record with %s", (_label, looseRecord) => {
    const runtimeRecords = [looseRecord] as unknown as readonly ControlledContentRecord[];

    expect(getApprovedStorefrontContent(runtimeRecords)).toEqual([]);
  });

  it("keeps the production controlled-content registry empty until owner approval", async () => {
    expect(storefrontContentRecords).toEqual([]);
  });
});

function homepageRecord(
  overrides: Partial<ControlledContentRecord> = {},
): ControlledContentRecord {
  return {
    id: "fictional-homepage-item",
    kind: "why_choose",
    status: "approved",
    title: "Fictional fixture title",
    body: "Fictional fixture body.",
    sourceReferences: ["fictional-source"],
    approvalNote: "Fictional test fixture only",
    reviewedAt: "2026-08-31T00:00:00.000Z",
    effectiveAt: null,
    ...overrides,
  };
}

describe("approved homepage content", () => {
  it("projects approved Why Choose and FAQ copy in configured order and omits other lifecycle states and kinds", () => {
    const projected = getApprovedHomepageContent([
      homepageRecord({ id: "why-one", title: "First fixture value" }),
      homepageRecord({ id: "why-draft", status: "draft" }),
      homepageRecord({
        id: "faq-one",
        kind: "faq",
        title: "First fictional question?",
        body: "First fictional answer.",
      }),
      homepageRecord({ id: "legal-one", kind: "legal_notice" }),
      homepageRecord({ id: "why-two", title: "Second fixture value" }),
      homepageRecord({ id: "faq-retired", kind: "faq", status: "retired" }),
    ]);

    expect(projected).toEqual({
      whyChoose: [
        {
          id: "why-one",
          title: "First fixture value",
          body: "Fictional fixture body.",
        },
        {
          id: "why-two",
          title: "Second fixture value",
          body: "Fictional fixture body.",
        },
      ],
      faqs: [{
        id: "faq-one",
        question: "First fictional question?",
        answer: "First fictional answer.",
        anchor: "faq-faq-one",
      }],
    });
  });

  it.each([
    ["blank ID", { id: "" }],
    ["untrimmed ID", { id: " faq-one" }],
    ["uppercase ID", { id: "FAQ-one" }],
    ["punctuated ID", { id: "faq.one" }],
    ["overlong ID", { id: `f${"a".repeat(64)}` }],
    ["blank title", { title: "" }],
    ["untrimmed title", { title: "Fictional title " }],
    ["blank body", { body: "\t" }],
    ["untrimmed body", { body: " Fictional body." }],
  ] as const)("rejects the whole projection for an approved homepage record with a %s", (_label, override) => {
    expect(() =>
      getApprovedHomepageContent([
        homepageRecord({ id: "safe-fixture" }),
        homepageRecord(override),
      ])
    ).toThrowError(new TypeError("Invalid approved homepage content."));
  });

  it("rejects duplicate IDs across both homepage kinds while ignoring non-approved duplicates", () => {
    expect(() =>
      getApprovedHomepageContent([
        homepageRecord({ id: "duplicate-fixture" }),
        homepageRecord({ id: "duplicate-fixture", kind: "faq" }),
      ])
    ).toThrowError(new TypeError("Invalid approved homepage content."));

    expect(getApprovedHomepageContent([
      homepageRecord({ id: "duplicate-fixture" }),
      homepageRecord({ id: "duplicate-fixture", kind: "faq", status: "draft" }),
    ]).whyChoose).toHaveLength(1);
  });

  it.each([
    ["missing ID", { id: undefined }],
    ["non-string ID", { id: 30 }],
    ["missing title", { title: undefined }],
    ["non-string title", { title: { text: "unsafe" } }],
    ["missing body", { body: undefined }],
    ["non-string body", { body: ["unsafe"] }],
  ] as const)("rejects the whole projection for an approved homepage record with a runtime %s", (_label, override) => {
    const unsafe = {
      ...homepageRecord({ id: "unsafe-homepage-fixture" }),
      ...override,
    } as unknown as ControlledContentRecord;

    expect(() => getApprovedHomepageContent([
      homepageRecord({ id: "safe-fixture" }),
      unsafe,
    ])).toThrowError(new TypeError("Invalid approved homepage content."));
    expect(getApprovedStorefrontContent([unsafe])).toEqual([]);
  });

  it("omits malformed draft, retired, and unrelated approved records without rejecting safe homepage content", () => {
    const malformed = (kind: ControlledContentRecord["kind"], status: ControlledContentRecord["status"]) => ({
      ...homepageRecord({ kind, status }),
      title: { unsafe: true },
    }) as unknown as ControlledContentRecord;

    expect(getApprovedHomepageContent([
      malformed("why_choose", "draft"),
      malformed("faq", "retired"),
      malformed("legal_notice", "approved"),
      homepageRecord({ id: "safe-fixture" }),
    ])).toEqual({
      whyChoose: [{
        id: "safe-fixture",
        title: "Fictional fixture title",
        body: "Fictional fixture body.",
      }],
      faqs: [],
    });
  });

  it.each([
    [
      "unsafe ID with sparse source metadata",
      () => {
        const sparseSources = new Array<string>(2);
        sparseSources[0] = "fictional-source";
        return homepageRecord({
          id: "Unsafe-ID",
          sourceReferences: sparseSources,
        });
      },
    ],
    [
      "untrimmed title with throwing source metadata",
      () => Object.defineProperty(
        homepageRecord({ id: "unsafe-title", title: " Unsafe title" }),
        "sourceReferences",
        {
          enumerable: true,
          get() {
            throw new Error("private-source-metadata-fixture");
          },
        },
      ),
    ],
    [
      "blank body with throwing approval metadata",
      () => Object.defineProperty(
        homepageRecord({ id: "unsafe-body", body: "" }),
        "approvalNote",
        {
          enumerable: true,
          get() {
            throw new Error("private-approval-metadata-fixture");
          },
        },
      ),
    ],
  ] as const)("rejects the whole projection for %s before malformed unrelated metadata can erase the strict failure", (_label, unsafeRecord) => {
    expect(() => getApprovedHomepageContent([
      homepageRecord({ id: "safe-fixture" }),
      unsafeRecord(),
    ])).toThrowError(new TypeError("Invalid approved homepage content."));
  });

  it("continues to omit a valid homepage record with malformed unrelated metadata", () => {
    const sparseSources = new Array<string>(2);
    sparseSources[0] = "fictional-source";

    expect(getApprovedHomepageContent([
      homepageRecord({ id: "safe-fixture" }),
      homepageRecord({
        id: "metadata-invalid-but-copy-safe",
        title: "Safe fictional title",
        body: "Safe fictional body.",
        sourceReferences: sparseSources,
      }),
    ])).toEqual({
      whyChoose: [{
        id: "safe-fixture",
        title: "Fictional fixture title",
        body: "Fictional fixture body.",
      }],
      faqs: [],
    });
  });

  it("allowlist-projects and deeply freezes safe output without mutating or freezing caller input", () => {
    const input = {
      ...homepageRecord({ id: "safe-fixture" }),
      providerToken: "must-not-project",
      nestedPrivateData: { stripePriceId: "must-not-project" },
    };
    const before = structuredClone(input);

    const projected = getApprovedHomepageContent([
      input as unknown as ControlledContentRecord,
    ]);

    expect(projected.whyChoose[0]).toEqual({
      id: "safe-fixture",
      title: "Fictional fixture title",
      body: "Fictional fixture body.",
    });
    expect(Object.keys(projected.whyChoose[0]!).sort()).toEqual(["body", "id", "title"]);
    expect(Object.isFrozen(projected)).toBe(true);
    expect(Object.isFrozen(projected.whyChoose)).toBe(true);
    expect(Object.isFrozen(projected.faqs)).toBe(true);
    expect(Object.isFrozen(projected.whyChoose[0])).toBe(true);
    expect(input).toEqual(before);
    expect(Object.isFrozen(input)).toBe(false);
    expect(Object.isFrozen(input.nestedPrivateData)).toBe(false);
  });

  it("returns one deeply frozen empty homepage view for the empty production registry", () => {
    const projected = getApprovedHomepageContent();

    expect(projected).toEqual({ whyChoose: [], faqs: [] });
    expect(Object.isFrozen(projected)).toBe(true);
    expect(Object.isFrozen(projected.whyChoose)).toBe(true);
    expect(Object.isFrozen(projected.faqs)).toBe(true);
  });

  it("rejects sparse top-level and nested arrays without returning partial content", () => {
    const sparseRecords = new Array<ControlledContentRecord>(2);
    sparseRecords[0] = homepageRecord({ id: "must-not-partially-project" });
    const sparseSources = new Array<string>(2);
    sparseSources[0] = "fictional-source";

    expect(getApprovedStorefrontContent(sparseRecords)).toEqual([]);
    expect(getApprovedHomepageContent(sparseRecords)).toEqual({
      whyChoose: [],
      faqs: [],
    });
    expect(getApprovedStorefrontContent([
      homepageRecord({ sourceReferences: sparseSources }),
    ])).toEqual([]);
  });

  it("ignores caller array methods and iterators while snapshotting dense own indices", () => {
    const runtimeRecords = [homepageRecord({ id: "safe-fixture" })];
    Object.defineProperties(runtimeRecords, {
      filter: { value: () => { throw new Error("must-not-call-filter"); } },
      map: { value: () => { throw new Error("must-not-call-map"); } },
      [Symbol.iterator]: {
        value: () => { throw new Error("must-not-call-iterator"); },
      },
    });

    expect(getApprovedHomepageContent(runtimeRecords).whyChoose).toEqual([{
      id: "safe-fixture",
      title: "Fictional fixture title",
      body: "Fictional fixture body.",
    }]);
  });

  it("snapshots every controlled record field once before validation and projection", () => {
    const reads = {
      id: 0,
      kind: 0,
      status: 0,
      title: 0,
      body: 0,
      sourceReferences: 0,
      approvalNote: 0,
      reviewedAt: 0,
      effectiveAt: 0,
    };
    const once = <T,>(field: keyof typeof reads, first: T, later: T) => ({
      enumerable: true,
      get() {
        reads[field] += 1;
        return reads[field] === 1 ? first : later;
      },
    });
    const hostileRecord = Object.defineProperties({}, {
      id: once("id", "stable-fixture", "MUTATED"),
      kind: once("kind", "why_choose", "legal_notice"),
      status: once("status", "approved", "retired"),
      title: once("title", "Stable fictional title", " Mutated title"),
      body: once("body", "Stable fictional body.", " Mutated body."),
      sourceReferences: once(
        "sourceReferences",
        ["stable-fictional-source"],
        [{ provider: "must-not-read" }],
      ),
      approvalNote: once("approvalNote", null, "mutated"),
      reviewedAt: once("reviewedAt", null, "mutated"),
      effectiveAt: once("effectiveAt", null, "mutated"),
    });

    expect(getApprovedHomepageContent([
      hostileRecord as unknown as ControlledContentRecord,
    ])).toEqual({
      whyChoose: [{
        id: "stable-fixture",
        title: "Stable fictional title",
        body: "Stable fictional body.",
      }],
      faqs: [],
    });
    expect(reads).toEqual({
      id: 1,
      kind: 1,
      status: 1,
      title: 1,
      body: 1,
      sourceReferences: 1,
      approvalNote: 1,
      reviewedAt: 1,
      effectiveAt: 1,
    });
  });

  it("fails a revoked records proxy closed without throwing", () => {
    const revocable = Proxy.revocable<ControlledContentRecord[]>(
      [homepageRecord()],
      {},
    );
    revocable.revoke();

    expect(() => getApprovedStorefrontContent(revocable.proxy)).not.toThrow();
    expect(getApprovedStorefrontContent(revocable.proxy)).toEqual([]);
  });
});
