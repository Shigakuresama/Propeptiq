import { describe, expect, it } from "vitest";

import type { ApprovedStorefrontContent } from "@/content/storefront-content";
import {
  getApprovedPublicInformation,
  type ApprovedPublicInformation,
} from "@/content/public-information";
import type {
  BrowseOnlyPublicStorefrontProduct,
  CanonicalPublicStorefrontProduct,
  PublicStorefrontProduct,
  PublicStorefrontVariant,
} from "@/catalog/storefront-public";

import { buildStorefrontSearchIndex } from "./storefront-index";
import { searchEntries } from "./storefront-search";

function approvedContent(
  overrides: Partial<ApprovedStorefrontContent> = {},
): ApprovedStorefrontContent {
  return {
    id: "synthetic-content-id",
    kind: "product_information",
    status: "approved",
    title: "Synthetic approved overview",
    body: "Synthetic approved body.",
    sourceReferences: ["synthetic-source-reference-must-not-leak"],
    approvalNote: "synthetic-approval-note-must-not-leak",
    reviewedAt: "2026-08-31T00:00:00.000Z",
    effectiveAt: null,
    ...overrides,
  };
}

function variant(
  overrides: Partial<PublicStorefrontVariant> = {},
): PublicStorefrontVariant {
  return {
    id: "20000000-0000-4000-8000-000000000001",
    sku: "SYN-SKU-5",
    label: "5 mg synthetic vial",
    amount: { value: 5, unit: "mg" },
    packageQuantity: 1,
    availability: "unavailable",
    priceStatus: "active",
    baseUnitMinor: 12_345,
    currency: "USD",
    checkoutReady: false,
    ...overrides,
  };
}

function canonicalProduct(
  overrides: Partial<CanonicalPublicStorefrontProduct> = {},
): CanonicalPublicStorefrontProduct {
  return {
    kind: "canonical",
    id: "10000000-0000-4000-8000-000000000001",
    slug: "synthetic-alpha",
    name: "Synthetic Alpha Research Item",
    sourceName: "Synthetic Owner Source",
    category: "Synthetic Peptides",
    description: "raw-description-must-not-be-searchable",
    image: {
      src: "/synthetic-image-must-not-leak.png",
      alt: "synthetic-image-alt-must-not-leak",
      width: 800,
      height: 800,
    },
    displayConfigurations: [
      {
        displayCode: "SYN-DISPLAY-5",
        packageForm: "5 mg × 10 synthetic vials",
        sourceName: "Synthetic Owner Source",
        sourcePage: 7,
      },
      {
        displayCode: "SYN-DISPLAY-10",
        packageForm: "10 mg × 10 synthetic vials",
        sourceName: "Synthetic Secondary Source",
        sourcePage: 8,
      },
      { displayCode: " ", packageForm: "", sourceName: " " },
    ],
    aliases: ["Synthetic Alias", "SYN-ALPHA", "Synthetic Alias", " "],
    popularityRank: 3,
    releasedAt: "2026-08-31T00:00:00.000Z",
    defaultVariantId: "20000000-0000-4000-8000-000000000001",
    variants: [
      variant(),
      variant({
        id: "20000000-0000-4000-8000-000000000002",
        sku: "SYN-SKU-10",
        label: "10 mg synthetic vial",
        availability: "available",
        priceStatus: "pending",
        baseUnitMinor: null,
        currency: null,
      }),
    ],
    relatedProductIds: ["10000000-0000-4000-8000-000000000099"],
    content: [
      approvedContent(),
      approvedContent({
        id: "synthetic-legal-id",
        kind: "legal_notice",
        title: "legal-title-must-not-leak",
        body: "legal-body-must-not-leak",
      }),
      approvedContent({
        id: "synthetic-calculator-id",
        kind: "calculator_copy",
        title: "calculator-title-must-not-leak",
        body: "calculator-body-must-not-leak",
      }),
      approvedContent({
        id: "synthetic-content-id-two",
        title: "Second synthetic overview",
        body: "Second synthetic approved body.",
      }),
    ],
    ...overrides,
  };
}

function browseOnlyProduct(
  overrides: Partial<BrowseOnlyPublicStorefrontProduct> = {},
): BrowseOnlyPublicStorefrontProduct {
  return {
    kind: "browse_only",
    id: null,
    slug: "synthetic-browse-only",
    name: "Synthetic Browse-only Item",
    sourceName: "Synthetic Browse Source",
    category: "Synthetic Supplies",
    image: {
      src: "/synthetic-browse-image-must-not-leak.png",
      alt: "synthetic-browse-alt-must-not-leak",
      width: 640,
      height: 640,
    },
    displayConfigurations: [
      {
        displayCode: "SYN-BROWSE-5",
        packageForm: "5 mg × 10 synthetic vials",
        sourceName: "Synthetic Browse Source",
        sourcePage: 3,
      },
      {
        displayCode: "SYN-BROWSE-10",
        packageForm: "10 mg × 10 synthetic vials",
        sourceName: "Synthetic Alternate Source",
      },
    ],
    defaultVariantId: null,
    variants: [],
    pricingState: "pricing_pending",
    ...overrides,
  };
}

function information(
  overrides: Partial<ApprovedPublicInformation> = {},
): ApprovedPublicInformation {
  return {
    id: "synthetic-quality-records",
    title: "Synthetic Quality Records",
    href: "/quality-records",
    description: "Synthetic approved public information.",
    keywords: ["synthetic quality", "records"],
    status: "approved",
    ...overrides,
  };
}

function build(
  products: readonly PublicStorefrontProduct[] = [canonicalProduct()],
  approvedInformation: readonly ApprovedPublicInformation[] = [],
) {
  return buildStorefrontSearchIndex({
    products,
    information: approvedInformation,
  });
}

function recursivelyCollectKeysAndValues(
  value: unknown,
  keys: string[] = [],
  values: unknown[] = [],
): Readonly<{ keys: readonly string[]; values: readonly unknown[] }> {
  if (Array.isArray(value)) {
    for (const item of value) recursivelyCollectKeysAndValues(item, keys, values);
    return { keys, values };
  }
  if (value !== null && typeof value === "object") {
    for (const [key, nested] of Object.entries(value)) {
      keys.push(key);
      values.push(nested);
      recursivelyCollectKeysAndValues(nested, keys, values);
    }
  }
  return { keys, values };
}

describe("buildStorefrontSearchIndex", () => {
  it("maps canonical, unavailable, and browse-only products in configured order", () => {
    const unavailable = canonicalProduct({
      slug: "synthetic-unavailable",
      name: "Synthetic Unavailable Item",
      variants: [variant({ availability: "unavailable" })],
    });
    const index = build([
      canonicalProduct(),
      unavailable,
      browseOnlyProduct(),
    ]);

    expect(index.entries.map(({ id }) => id)).toEqual([
      "product:synthetic-alpha",
      "product:synthetic-unavailable",
      "product:synthetic-browse-only",
    ]);
    expect(index.entries.map(({ href }) => href)).toEqual([
      "/catalog/items/synthetic-alpha",
      "/catalog/items/synthetic-unavailable",
      "/catalog/items/synthetic-browse-only",
    ]);
    expect(index.entries[0]).toMatchObject({
      group: "products",
      title: "Synthetic Alpha Research Item",
      popularityRank: 3,
    });
    expect(index.entries[2]).toMatchObject({
      group: "products",
      title: "Synthetic Browse-only Item",
      popularityRank: null,
      description: "",
    });
  });

  it("projects only approved search terms and removes blank exact duplicates without reordering", () => {
    const canonical = build().entries[0]!;
    const browse = build([browseOnlyProduct()]).entries[0]!;

    expect(canonical.exactTerms).toEqual([
      "synthetic-alpha",
      "Synthetic Alias",
      "SYN-ALPHA",
      "SYN-SKU-5",
      "SYN-SKU-10",
      "5 mg synthetic vial",
      "10 mg synthetic vial",
    ]);
    expect(canonical.keywords).toEqual([
      "Synthetic Peptides",
      "Synthetic Owner Source",
      "Synthetic Secondary Source",
    ]);
    expect(canonical.exactTerms).not.toContain("SYN-DISPLAY-5");
    expect(browse.exactTerms).toEqual([
      "synthetic-browse-only",
      "SYN-BROWSE-5",
      "SYN-BROWSE-10",
      "5 mg × 10 synthetic vials",
      "10 mg × 10 synthetic vials",
    ]);
    expect(browse.keywords).toEqual([
      "Synthetic Supplies",
      "Synthetic Browse Source",
      "Synthetic Alternate Source",
    ]);
  });

  it("builds descriptions only from approved product-information title/body pairs", () => {
    const entry = build().entries[0]!;

    expect(entry.description).toBe(
      "Synthetic approved overview Synthetic approved body. " +
        "Second synthetic overview Second synthetic approved body.",
    );
    expect(JSON.stringify(entry)).not.toMatch(
      /raw-description|legal-|calculator-|source-reference|approval-note|2026-08-31/iu,
    );
  });

  it("maps only supplied approved information with exact destinations and order", () => {
    const index = build([], [
      information({
        id: "synthetic-anchor",
        title: "Synthetic Approved Anchor",
        href: "/#faq-approved_fixture",
        keywords: ["first", "first", "second"],
      }),
      information({
        id: "synthetic-partners",
        title: "Synthetic Partners",
        href: "/partners",
        description: "Synthetic approved partners information.",
        keywords: ["partners"],
      }),
    ]);

    expect(index.entries).toEqual([
      {
        id: "information:synthetic-anchor",
        group: "information",
        title: "Synthetic Approved Anchor",
        href: "/#faq-approved_fixture",
        description: "Synthetic approved public information.",
        exactTerms: [],
        keywords: ["first", "first", "second"],
        popularityRank: null,
      },
      {
        id: "information:synthetic-partners",
        group: "information",
        title: "Synthetic Partners",
        href: "/partners",
        description: "Synthetic approved partners information.",
        exactTerms: [],
        keywords: ["partners"],
        popularityRank: null,
      },
    ]);
  });

  it("keeps the empty production information registry empty and synthesizes no destinations", () => {
    expect(getApprovedPublicInformation()).toEqual([]);
    const index = build([], getApprovedPublicInformation());

    expect(index).toEqual({ version: 1, entries: [] });
    expect(index.entries.some(({ href }) => href.includes("#faq"))).toBe(false);
    expect(index.entries.some(({ href }) => href.includes("#section"))).toBe(false);
  });

  it("returns deeply frozen output without mutating or freezing caller-owned input", () => {
    const aliases = ["Synthetic Alias"];
    const variantRows = [variant()];
    const contentRows = [approvedContent()];
    const displayConfigurations = [{
      displayCode: "SYN-DISPLAY",
      packageForm: "Synthetic package",
      sourceName: "Synthetic Display Source",
    }];
    const product = canonicalProduct({
      aliases,
      variants: variantRows,
      content: contentRows,
      displayConfigurations,
    });
    const keywords = ["synthetic", "records"];
    const approvedInformation = information({ keywords });
    const products = [product];
    const informationRows = [approvedInformation];
    const before = structuredClone({ products, informationRows });

    const index = build(products, informationRows);

    expect({ products, informationRows }).toEqual(before);
    expect(Object.isFrozen(products)).toBe(false);
    expect(Object.isFrozen(product)).toBe(false);
    expect(Object.isFrozen(aliases)).toBe(false);
    expect(Object.isFrozen(variantRows)).toBe(false);
    expect(Object.isFrozen(contentRows)).toBe(false);
    expect(Object.isFrozen(displayConfigurations)).toBe(false);
    expect(Object.isFrozen(informationRows)).toBe(false);
    expect(Object.isFrozen(approvedInformation)).toBe(false);
    expect(Object.isFrozen(keywords)).toBe(false);
    expect(Object.isFrozen(index)).toBe(true);
    expect(Object.isFrozen(index.entries)).toBe(true);
    for (const entry of index.entries) {
      expect(Object.isFrozen(entry)).toBe(true);
      expect(Object.isFrozen(entry.exactTerms)).toBe(true);
      expect(Object.isFrozen(entry.keywords)).toBe(true);
    }
    expect(index.entries[1]!.keywords).not.toBe(keywords);
  });

  it("returns the exact deeply frozen empty wrapper", () => {
    const index = build([], []);

    expect(index).toEqual({ version: 1, entries: [] });
    expect(Object.keys(index)).toEqual(["version", "entries"]);
    expect(Object.isFrozen(index)).toBe(true);
    expect(Object.isFrozen(index.entries)).toBe(true);
  });

  it.each([
    ["null input", null],
    ["missing products", { information: [] }],
    ["missing information", { products: [] }],
    ["non-array products", { products: {}, information: [] }],
    ["non-array information", { products: [], information: {} }],
  ])("rejects malformed %s with a TypeError", (_label, input) => {
    expect(() => buildStorefrontSearchIndex(input as never)).toThrow(TypeError);
  });

  it.each([
    ["non-object product", null],
    ["unknown kind", { ...canonicalProduct(), kind: "unknown" }],
    ["missing title", { ...canonicalProduct(), name: undefined }],
    ["uppercase slug", { ...canonicalProduct(), slug: "Synthetic-Alpha" }],
    ["path slug", { ...canonicalProduct(), slug: "synthetic/alpha" }],
    ["non-array display configurations", { ...canonicalProduct(), displayConfigurations: {} }],
    ["malformed display row", { ...canonicalProduct(), displayConfigurations: [null] }],
    ["malformed display source", { ...canonicalProduct(), displayConfigurations: [{ displayCode: "SYN", packageForm: "fixture", sourceName: 9 }] }],
    ["non-array aliases", { ...canonicalProduct(), aliases: {} }],
    ["non-string alias", { ...canonicalProduct(), aliases: [9] }],
    ["invalid popularity rank", { ...canonicalProduct(), popularityRank: Number.NaN }],
    ["non-array variants", { ...canonicalProduct(), variants: {} }],
    ["malformed variant", { ...canonicalProduct(), variants: [null] }],
    ["malformed variant SKU", { ...canonicalProduct(), variants: [{ ...variant(), sku: 9 }] }],
    ["malformed variant label", { ...canonicalProduct(), variants: [{ ...variant(), label: null }] }],
    ["non-array content", { ...canonicalProduct(), content: {} }],
    ["malformed content row", { ...canonicalProduct(), content: [null] }],
    ["non-approved product information", { ...canonicalProduct(), content: [{ ...approvedContent(), status: "draft" }] }],
    ["malformed product information", { ...canonicalProduct(), content: [{ ...approvedContent(), title: 9 }] }],
  ])("rejects a product with %s", (_label, candidate) => {
    expect(() => build([candidate as unknown as PublicStorefrontProduct])).toThrow(
      TypeError,
    );
  });

  it.each([
    ["non-object information", null],
    ["missing id", { ...information(), id: undefined }],
    ["missing title", { ...information(), title: undefined }],
    ["missing href", { ...information(), href: undefined }],
    ["missing description", { ...information(), description: undefined }],
    ["non-array keywords", { ...information(), keywords: {} }],
    ["non-string keyword", { ...information(), keywords: [9] }],
    ["non-approved status", { ...information(), status: "draft" }],
  ])("rejects malformed approved information with %s", (_label, candidate) => {
    expect(() =>
      build([], [candidate as unknown as ApprovedPublicInformation]),
    ).toThrow(TypeError);
  });

  it("rejects duplicate generated IDs and exact hrefs across the complete output", () => {
    expect(() =>
      build([
        canonicalProduct(),
        canonicalProduct({ name: "Synthetic duplicate slug" }),
      ]),
    ).toThrow(TypeError);
    expect(() =>
      build([], [
        information(),
        information({ id: "synthetic-quality-records", href: "/partners" }),
      ]),
    ).toThrow(TypeError);
    expect(() =>
      build([], [
        information(),
        information({ id: "synthetic-other", href: "/quality-records" }),
      ]),
    ).toThrow(TypeError);
    expect(() =>
      build([canonicalProduct()], [
        information({
          id: "synthetic-product-collision",
          href: "/catalog/items/synthetic-alpha",
        }),
      ]),
    ).toThrow(TypeError);
  });

  it("remains compatible with Task 1 search without making prohibited raw fields searchable", () => {
    const entryId = "product:synthetic-alpha";
    const entries = build().entries;

    for (const query of [
      "Synthetic Alpha Research Item",
      "SYN-SKU-5",
      "Synthetic Alias",
      "Synthetic Peptides",
      "Second synthetic approved body",
    ]) {
      expect(searchEntries(entries, query)[0]?.entry.id).toBe(entryId);
    }
    for (const query of [
      "raw-description-must-not-be-searchable",
      "legal-body-must-not-leak",
      "calculator-body-must-not-leak",
      "synthetic-source-reference-must-not-leak",
      "synthetic-approval-note-must-not-leak",
      "20000000-0000-4000-8000-000000000001",
      "12345",
      "synthetic-image-must-not-leak",
    ]) {
      expect(searchEntries(entries, query)).toEqual([]);
    }
  });

  it("emits only the exact wrapper and eight SearchEntry fields with no forbidden keys or values", () => {
    const index = build([canonicalProduct(), browseOnlyProduct()], [information()]);
    const expectedEntryKeys = [
      "id",
      "group",
      "title",
      "href",
      "description",
      "exactTerms",
      "keywords",
      "popularityRank",
    ];

    expect(Object.keys(index)).toEqual(["version", "entries"]);
    for (const entry of index.entries) {
      expect(Object.keys(entry)).toEqual(expectedEntryKeys);
    }

    const collected = recursivelyCollectKeysAndValues(index);
    const forbiddenKeys = [
      "status",
      "kind",
      "content",
      "sourceReferences",
      "approvalNote",
      "reviewedAt",
      "effectiveAt",
      "productId",
      "variantId",
      "relatedProductIds",
      "baseUnitMinor",
      "currency",
      "availability",
      "checkoutReady",
      "stripeProductId",
      "stripePriceId",
      "image",
    ];
    expect(collected.keys.filter((key) => forbiddenKeys.includes(key))).toEqual([]);
    const serialized = JSON.stringify(collected.values);
    expect(serialized).not.toMatch(
      /raw-description|legal-|calculator-|source-reference|approval-note|synthetic-image|10000000-0000-4000-8000-000000000001|20000000-0000-4000-8000-000000000001|12345/iu,
    );
  });
});
