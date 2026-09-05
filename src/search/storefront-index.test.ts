import { describe, expect, it, vi } from "vitest";

import {
  getApprovedPublicInformation,
  type ApprovedPublicInformation,
} from "@/content/public-information";
import type {
  BrowseOnlyPublicStorefrontProduct,
  CanonicalPublicStorefrontProduct,
  PublicStorefrontContent,
  PublicStorefrontProduct,
  PublicStorefrontVariant,
} from "@/catalog/storefront-public";

import { buildStorefrontSearchIndex } from "./storefront-index";
import { searchEntries } from "./storefront-search";

function approvedContent(
  overrides: Partial<PublicStorefrontContent> = {},
): PublicStorefrontContent {
  return {
    id: "synthetic-content-id",
    kind: "product_information",
    status: "approved",
    title: "Synthetic approved overview",
    body: "Synthetic approved body.",
    literatureReferences: [{
      href: "https://pubmed.ncbi.nlm.nih.gov/?term=synthetic",
      term: "synthetic",
    }],
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
  it("accepts canonical products with explicit unknown popularity metadata", () => {
    const index = buildStorefrontSearchIndex({
      products: [canonicalProduct({ popularityRank: null, releasedAt: null })],
      information: [],
    });

    expect(index.entries).toEqual([
      expect.objectContaining({
        id: "product:synthetic-alpha",
        popularityRank: null,
      }),
    ]);
  });

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

  it("indexes approved homepage destinations as ordinary information and finds approved title and body text", () => {
    const index = build([], [
      information({
        id: "homepage:why-choose-propeptiq",
        title: "Why choose Fictional PropeptIQ",
        href: "/#why-choose-propeptiq",
        description:
          "Fictional laboratory value: Fictional approved value body.",
        keywords: ["Fictional laboratory value"],
      }),
      information({
        id: "homepage:faq:fictional-question",
        title: "What is the fictional research question?",
        href: "/#faq-fictional-question",
        description: "Fictional approved answer without use guidance.",
        keywords: [],
      }),
    ]);

    expect(index.entries.map(({ id, group, href }) => ({ id, group, href }))).toEqual([
      {
        id: "information:homepage:why-choose-propeptiq",
        group: "information",
        href: "/#why-choose-propeptiq",
      },
      {
        id: "information:homepage:faq:fictional-question",
        group: "information",
        href: "/#faq-fictional-question",
      },
    ]);
    expect(
      searchEntries(index.entries, "Fictional laboratory value body")[0]
        ?.entry.id,
    ).toBe("information:homepage:why-choose-propeptiq");
    expect(
      searchEntries(index.entries, "fictional research question")[0]?.entry.id,
    ).toBe("information:homepage:faq:fictional-question");
    expect(
      searchEntries(index.entries, "approved answer without use guidance")[0]
        ?.entry.id,
    ).toBe("information:homepage:faq:fictional-question");
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
    [
      "products",
      () => ({
        products: new Array<PublicStorefrontProduct>(1),
        information: [],
      }),
    ],
    [
      "information",
      () => ({
        products: [],
        information: new Array<ApprovedPublicInformation>(1),
      }),
    ],
  ] as const)("rejects a sparse top-level %s array", (_label, input) => {
    expect(() => buildStorefrontSearchIndex(input())).toThrow(TypeError);
  });

  it.each([
    [
      "displayConfigurations",
      () => canonicalProduct({
        displayConfigurations: new Array(1) as never,
      }),
    ],
    [
      "aliases",
      () => canonicalProduct({ aliases: new Array(1) as never }),
    ],
    [
      "variants",
      () => canonicalProduct({ variants: new Array(1) as never }),
    ],
    [
      "content",
      () => canonicalProduct({ content: new Array(1) as never }),
    ],
  ] as const)("rejects sparse product %s", (_label, candidate) => {
    expect(() => build([candidate()])).toThrow(TypeError);
  });

  it("rejects sparse approved-information keywords instead of serializing a null hole", () => {
    const keywords = new Array<string>(1);

    expect(() => build([], [information({ keywords })])).toThrow(TypeError);
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

  it("ignores own top-level map overrides instead of suppressing approved rows", () => {
    const products = [canonicalProduct()];
    const approvedInformation = [information()];
    const productMap = vi.fn(() => []);
    const informationMap = vi.fn(() => []);
    Object.defineProperty(products, "map", { value: productMap });
    Object.defineProperty(approvedInformation, "map", {
      value: informationMap,
    });

    const index = buildStorefrontSearchIndex({
      products,
      information: approvedInformation,
    });

    expect(index.entries.map(({ id }) => id)).toEqual([
      "product:synthetic-alpha",
      "information:synthetic-quality-records",
    ]);
    expect(productMap).not.toHaveBeenCalled();
    expect(informationMap).not.toHaveBeenCalled();
  });

  it("ignores own map and flatMap overrides on display configurations", () => {
    const displays = [
      {
        displayCode: "SYN-DENSE-5",
        packageForm: "Dense 5 mg package",
        sourceName: "Synthetic Dense Source",
      },
    ];
    const flatMapOverride = vi.fn(() => ["override-injected-term"]);
    const mapOverride = vi.fn(
      (callback: (value: (typeof displays)[number], index: number) => unknown) => {
        const projected = [callback(displays[0]!, 0)];
        Object.defineProperty(projected, "flatMap", {
          value: flatMapOverride,
        });
        return projected;
      },
    );
    Object.defineProperty(displays, "map", { value: mapOverride });

    const entry = build([
      canonicalProduct({ displayConfigurations: displays }),
    ]).entries[0]!;

    expect(entry.keywords).toEqual([
      "Synthetic Peptides",
      "Synthetic Owner Source",
      "Synthetic Dense Source",
    ]);
    expect(entry.keywords).not.toContain("override-injected-term");
    expect(mapOverride).not.toHaveBeenCalled();
    expect(flatMapOverride).not.toHaveBeenCalled();
  });

  it("ignores own some overrides and still rejects blank information keywords", () => {
    const keywords = ["records", " "];
    const someOverride = vi.fn(() => false);
    const mapOverride = vi.fn(() => keywords);
    Object.defineProperty(keywords, "map", { value: mapOverride });
    Object.defineProperty(keywords, "some", { value: someOverride });

    expect(() => build([], [information({ keywords })])).toThrow(TypeError);
    expect(mapOverride).not.toHaveBeenCalled();
    expect(someOverride).not.toHaveBeenCalled();
  });

  it("does not invoke a caller-owned iterator while snapshotting content", () => {
    const content = [approvedContent()];
    const iterator = vi.fn(() => {
      throw new Error("caller iterator must not run");
    });
    Object.defineProperty(content, Symbol.iterator, { value: iterator });

    const entry = build([canonicalProduct({ content })]).entries[0]!;

    expect(entry.description).toBe(
      "Synthetic approved overview Synthetic approved body.",
    );
    expect(iterator).not.toHaveBeenCalled();
  });

  it("reads each own array index once and projects only the snapshotted value", () => {
    const aliases: string[] = [];
    let lengthDescriptorReads = 0;
    let indexReads = 0;
    Object.defineProperty(aliases, "0", {
      configurable: true,
      enumerable: true,
      get() {
        indexReads += 1;
        return indexReads === 1 ? "Stable Synthetic Alias" : "TOCTOU Alias";
      },
    });
    aliases.length = 1;
    const mapOverride = vi.fn(
      (callback: (value: string, index: number, array: string[]) => string) => [
        callback(aliases[0]!, 0, aliases),
        callback(aliases[0]!, 0, aliases),
      ],
    );
    Object.defineProperty(aliases, "map", { value: mapOverride });
    const proxiedAliases = new Proxy(aliases, {
      getOwnPropertyDescriptor(target, property) {
        if (property === "length") lengthDescriptorReads += 1;
        return Reflect.getOwnPropertyDescriptor(target, property);
      },
    });

    const entry = build([
      canonicalProduct({ aliases: proxiedAliases }),
    ]).entries[0]!;

    expect(entry.exactTerms).toContain("Stable Synthetic Alias");
    expect(entry.exactTerms).not.toContain("TOCTOU Alias");
    expect(lengthDescriptorReads).toBe(1);
    expect(indexReads).toBe(1);
    expect(mapOverride).not.toHaveBeenCalled();
  });

  it("rejects a sparse large array before probing numeric membership", () => {
    const sparse = new Array<PublicStorefrontProduct>(1_000_000);
    sparse[999_999] = canonicalProduct();
    let numericHasCalls = 0;
    const products = new Proxy(sparse, {
      has(target, property) {
        if (typeof property === "string" && /^\d+$/u.test(property)) {
          numericHasCalls += 1;
          throw new Error("numeric membership probe must not run");
        }
        return Reflect.has(target, property);
      },
    });

    expect(() => build(products)).toThrow(TypeError);
    expect(numericHasCalls).toBe(0);
  });

  it("does not let a proxy-spoofed length suppress later own rows", () => {
    const products = [
      canonicalProduct(),
      canonicalProduct({
        slug: "synthetic-beta",
        name: "Synthetic Beta Research Item",
      }),
    ];
    const lengthOverride = vi.fn(() => 1);
    const proxiedProducts = new Proxy(products, {
      get(target, property, receiver) {
        if (property === "length") return lengthOverride();
        return Reflect.get(target, property, receiver);
      },
    });

    const index = build(proxiedProducts);

    expect(index.entries.map(({ id }) => id)).toEqual([
      "product:synthetic-alpha",
      "product:synthetic-beta",
    ]);
    expect(lengthOverride).not.toHaveBeenCalled();
  });

  it("normalizes a revoked array proxy to the deterministic TypeError", () => {
    const revocable = Proxy.revocable([canonicalProduct()], {});
    revocable.revoke();

    expect(() => build(revocable.proxy)).toThrow(
      new TypeError("Invalid storefront search index input."),
    );
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
