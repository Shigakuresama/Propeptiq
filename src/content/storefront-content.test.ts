import { describe, expect, it } from "vitest";

import {
  getApprovedStorefrontContent,
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
    const { storefrontContentRecords } = await import("./storefront-content");

    expect(storefrontContentRecords).toEqual([]);
  });
});
