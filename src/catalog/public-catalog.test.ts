import { describe, expect, it } from "vitest";

import { buildPublicCatalog, findPublicProduct } from "./public-catalog";
import type { CatalogProductRecord, CatalogRecordSet } from "./types";

const now = new Date("2026-08-25T12:00:00.000Z");

function createRecords(): CatalogRecordSet {
  return {
    source: "synthetic-demo",
    products: [
      {
        id: "demo-product-alpha",
        slug: "synthetic-reference-alpha",
        name: "Synthetic Reference Alpha — Demo Only",
        packageForm: "Synthetic sealed reference unit",
        materialIdentity: "Synthetic identity record",
        policyGroupId: "demo-policy-group",
        status: "active",
      },
      {
        id: "demo-product-beta",
        slug: "synthetic-reference-beta",
        name: "Synthetic Reference Beta — Demo Only",
        packageForm: "Synthetic sealed reference unit",
        materialIdentity: "Synthetic identity record",
        policyGroupId: "demo-policy-group",
        status: "active",
      },
      {
        id: "demo-product-retired",
        slug: "synthetic-retired",
        name: "Synthetic Retired Record — Demo Only",
        packageForm: "Synthetic record",
        materialIdentity: "Synthetic identity record",
        policyGroupId: "demo-policy-group",
        status: "retired",
      },
      {
        id: "demo-product-no-price",
        slug: "synthetic-no-price",
        name: "Synthetic Missing Price — Demo Only",
        packageForm: "Synthetic record",
        materialIdentity: "Synthetic identity record",
        policyGroupId: "demo-policy-group",
        status: "active",
      },
    ],
    prices: [
      {
        id: "demo-price-alpha-old",
        productId: "demo-product-alpha",
        version: 1,
        amountMinor: 1900,
        currency: "USD",
        effectiveAt: "2026-01-01T00:00:00.000Z",
        supersededAt: "2026-06-01T00:00:00.000Z",
      },
      {
        id: "demo-price-alpha",
        productId: "demo-product-alpha",
        version: 2,
        amountMinor: 2400,
        currency: "USD",
        effectiveAt: "2026-06-01T00:00:00.000Z",
        supersededAt: null,
      },
      {
        id: "demo-price-beta",
        productId: "demo-product-beta",
        version: 1,
        amountMinor: 1800,
        currency: "USD",
        effectiveAt: "2026-01-01T00:00:00.000Z",
        supersededAt: null,
      },
      {
        id: "demo-price-retired",
        productId: "demo-product-retired",
        version: 1,
        amountMinor: 1200,
        currency: "USD",
        effectiveAt: "2026-01-01T00:00:00.000Z",
        supersededAt: null,
      },
    ],
    lots: [
      {
        id: "demo-lot-alpha",
        productId: "demo-product-alpha",
        supplierName: "SYNTHETIC SUPPLIER — TEST ONLY",
        supplierLotCode: "DEMO-LOT-ALPHA",
        availableQuantity: 12,
        status: "released",
        analyticalMethod: "Synthetic analytical method record",
        manufacturedAt: null,
        expiresAt: "2099-01-01T00:00:00.000Z",
      },
      {
        id: "demo-lot-alpha-quarantined",
        productId: "demo-product-alpha",
        supplierName: "SYNTHETIC SUPPLIER — TEST ONLY",
        supplierLotCode: "DEMO-LOT-QUARANTINED",
        availableQuantity: 8,
        status: "quarantined",
        analyticalMethod: "Unreleased synthetic method",
        manufacturedAt: null,
        expiresAt: "2099-01-01T00:00:00.000Z",
      },
      {
        id: "demo-lot-beta",
        productId: "demo-product-beta",
        supplierName: "SYNTHETIC SUPPLIER — TEST ONLY",
        supplierLotCode: "DEMO-LOT-BETA",
        availableQuantity: 7,
        status: "released",
        analyticalMethod: null,
        manufacturedAt: null,
        expiresAt: "2099-01-01T00:00:00.000Z",
      },
      {
        id: "demo-lot-retired",
        productId: "demo-product-retired",
        supplierName: "SYNTHETIC SUPPLIER — TEST ONLY",
        supplierLotCode: "DEMO-LOT-RETIRED",
        availableQuantity: 3,
        status: "released",
        analyticalMethod: null,
        manufacturedAt: null,
        expiresAt: "2099-01-01T00:00:00.000Z",
      },
      {
        id: "demo-lot-no-price",
        productId: "demo-product-no-price",
        supplierName: "SYNTHETIC SUPPLIER — TEST ONLY",
        supplierLotCode: "DEMO-LOT-NO-PRICE",
        availableQuantity: 2,
        status: "released",
        analyticalMethod: null,
        manufacturedAt: null,
        expiresAt: "2099-01-01T00:00:00.000Z",
      },
    ],
    coaDocuments: [
      {
        id: "demo-coa-alpha",
        lotId: "demo-lot-alpha",
        storageKey: "synthetic-demo/alpha-record.pdf",
        active: true,
        public: true,
        issuedAt: "2026-07-01T00:00:00.000Z",
      },
      {
        id: "demo-coa-quarantined",
        lotId: "demo-lot-alpha-quarantined",
        storageKey: "synthetic-demo/quarantined-record.pdf",
        active: true,
        public: true,
        issuedAt: "2026-07-01T00:00:00.000Z",
      },
      {
        id: "demo-coa-inactive",
        lotId: "demo-lot-alpha",
        storageKey: "synthetic-demo/inactive-record.pdf",
        active: false,
        public: true,
        issuedAt: "2026-07-01T00:00:00.000Z",
      },
    ],
    claims: [
      {
        id: "demo-claim-supported",
        productId: "demo-product-alpha",
        text: "A synthetic analytical record is linked to this demo lot.",
        kind: "analytical",
        lotId: "demo-lot-alpha",
        coaDocumentId: "demo-coa-alpha",
        active: true,
      },
      {
        id: "demo-claim-unreleased",
        productId: "demo-product-alpha",
        text: "This unsupported claim must not render.",
        kind: "analytical",
        lotId: "demo-lot-alpha-quarantined",
        coaDocumentId: "demo-coa-quarantined",
        active: true,
      },
    ],
    promotions: [
      {
        id: "demo-discount",
        code: "DEMO-DISCOUNT",
        version: 1,
        name: "Synthetic percentage display — Demo Only",
        kind: "discount",
        status: "active",
        amountMinor: null,
        basisPoints: 1000,
        currency: null,
        startsAt: null,
        endsAt: null,
        configuration: {},
      },
      {
        id: "demo-bundle",
        code: "DEMO-BUNDLE",
        version: 1,
        name: "Synthetic bundle display — Demo Only",
        kind: "bundle",
        status: "active",
        amountMinor: 3600,
        basisPoints: null,
        currency: "USD",
        startsAt: null,
        endsAt: null,
        configuration: {
          productIds: ["demo-product-alpha", "demo-product-beta"],
        },
      },
      {
        id: "demo-subscription",
        code: "DEMO-SUBSCRIPTION",
        version: 1,
        name: "Synthetic subscription display — Demo Only",
        kind: "subscription",
        status: "active",
        amountMinor: null,
        basisPoints: null,
        currency: null,
        startsAt: null,
        endsAt: null,
        configuration: { interval: "month", intervalCount: 1 },
      },
      {
        id: "demo-loyalty",
        code: "DEMO-LOYALTY",
        version: 1,
        name: "Synthetic loyalty display — Demo Only",
        kind: "loyalty",
        status: "active",
        amountMinor: null,
        basisPoints: null,
        currency: null,
        startsAt: null,
        endsAt: null,
        configuration: { pointsPerDollar: 2 },
      },
      {
        id: "demo-cross-sell",
        code: "DEMO-CROSS-SELL",
        version: 1,
        name: "Synthetic related-record display — Demo Only",
        kind: "cross_sell",
        status: "active",
        amountMinor: null,
        basisPoints: null,
        currency: null,
        startsAt: null,
        endsAt: null,
        configuration: {
          productIds: ["demo-product-beta", "demo-product-no-price"],
        },
      },
      {
        id: "demo-invalid-discount",
        code: "DEMO-INVALID",
        version: 1,
        name: "Invalid synthetic discount",
        kind: "discount",
        status: "active",
        amountMinor: null,
        basisPoints: 20000,
        currency: null,
        startsAt: null,
        endsAt: null,
        configuration: {},
      },
      {
        id: "demo-ended-discount",
        code: "DEMO-ENDED",
        version: 1,
        name: "Ended synthetic discount",
        kind: "discount",
        status: "active",
        amountMinor: null,
        basisPoints: 500,
        currency: null,
        startsAt: null,
        endsAt: "2026-08-01T00:00:00.000Z",
        configuration: {},
      },
    ],
    promotionTargets: [
      ...[
        "demo-discount",
        "demo-bundle",
        "demo-subscription",
        "demo-loyalty",
        "demo-cross-sell",
        "demo-invalid-discount",
        "demo-ended-discount",
      ].map((promotionId) => ({
        promotionId,
        targetKind: "product" as const,
        productId: "demo-product-alpha",
        policyGroupId: null,
      })),
      {
        promotionId: "demo-discount",
        targetKind: "product",
        productId: "demo-product-beta",
        policyGroupId: null,
      },
    ],
  };
}

describe("public catalog projection", () => {
  it("uses canonical top-level monetary promotion facts instead of duplicating money in configuration", () => {
    const base = createRecords();
    const records = {
      ...base,
      promotions: [
        {
          ...base.promotions[0]!,
          amountMinor: null,
          basisPoints: 1000,
          currency: null,
          configuration: {},
        },
        {
          ...base.promotions[1]!,
          amountMinor: 3600,
          basisPoints: null,
          currency: "USD",
          configuration: {
            productIds: ["demo-product-alpha", "demo-product-beta"],
          },
        },
      ],
      promotionTargets: base.promotionTargets.filter((target) =>
        ["demo-discount", "demo-bundle"].includes(target.promotionId),
      ),
    } as unknown as CatalogRecordSet;

    const catalog = buildPublicCatalog(records, { now });
    expect(catalog.promotions.map((promotion) => promotion.kind)).toEqual([
      "discount",
      "bundle",
    ]);
    expect(catalog.promotions[0]?.summary).toContain("10%");
    expect(catalog.promotions[1]?.summary).toContain("$36.00");
  });

  it("filters inactive records and validates all five merchandising kinds", () => {
    const catalog = buildPublicCatalog(createRecords(), { now });

    expect(catalog.source).toBe("synthetic-demo");
    expect(catalog.products.map((product) => product.slug)).toEqual([
      "synthetic-reference-alpha",
      "synthetic-reference-beta",
    ]);

    const alpha = findPublicProduct(catalog, "synthetic-reference-alpha");
    expect(alpha?.price).toMatchObject({ amountMinor: 2400, currency: "USD" });
    expect(alpha?.merchandising.map((entry) => entry.kind)).toEqual([
      "discount",
      "bundle",
      "subscription",
      "loyalty",
      "cross_sell",
    ]);
    expect(alpha?.merchandising.map((entry) => entry.name)).not.toContain(
      "Invalid synthetic discount",
    );
    expect(alpha?.merchandising.map((entry) => entry.name)).not.toContain(
      "Ended synthetic discount",
    );
    expect(alpha?.relatedProducts.map((product) => product.slug)).toEqual([
      "synthetic-reference-beta",
    ]);
    expect(
      alpha?.merchandising.find((entry) => entry.kind === "cross_sell")?.summary,
    ).toBe("1 related public catalog record.");
    expect(
      alpha?.merchandising.find((entry) => entry.kind === "bundle")?.summary,
    ).toBe(
      "2-record bundle display at $36.00. Enrollment is not active.",
    );
    expect(catalog.promotions).toHaveLength(5);
  });

  it.each([
    {
      boundary: "a missing product",
      productIds: ["demo-product-alpha", "missing-product"],
    },
    {
      boundary: "a duplicated product",
      productIds: ["demo-product-alpha", "demo-product-alpha"],
    },
    {
      boundary: "an unsafe product",
      productIds: ["demo-product-alpha", "demo-product-beta"],
    },
    {
      boundary: "a nonpublic product",
      productIds: ["demo-product-alpha", "demo-product-retired"],
    },
    {
      boundary: "a product without a current price",
      productIds: ["demo-product-alpha", "demo-product-no-price"],
    },
  ])(
    "omits a direct active bundle configured with $boundary",
    ({ boundary, productIds }) => {
      const base = createRecords();
      const products =
        boundary === "an unsafe product"
          ? base.products.map((product) =>
              product.id === "demo-product-beta"
                ? { ...product, name: "For human use record" }
                : product,
            )
          : base.products;
      const records: CatalogRecordSet = {
        ...base,
        products,
        promotions: base.promotions.map((promotion) =>
          promotion.id === "demo-bundle"
            ? { ...promotion, configuration: { productIds } }
            : promotion,
        ),
      };

      const catalog = buildPublicCatalog(records, { now });
      const alpha = findPublicProduct(catalog, "synthetic-reference-alpha");

      expect(alpha).not.toBeNull();
      expect(alpha?.merchandising.map((entry) => entry.id)).not.toContain(
        "demo-bundle",
      );
      expect(catalog.promotions.map((promotion) => promotion.id)).not.toContain(
        "demo-bundle",
      );
    },
  );

  it.each([
    ["slug", "for-human-use"],
    ["name", "For human use reference"],
    ["packageForm", "Research dose administration unit"],
    ["materialIdentity", "Clinically proven material identity"],
  ] as const)(
    "excludes a product and its dependent public output when direct-active %s copy violates policy",
    (field, unsafeValue) => {
      const base = createRecords();
      const records: CatalogRecordSet = {
        ...base,
        products: base.products.map((product): CatalogProductRecord =>
          product.id === "demo-product-alpha"
            ? { ...product, [field]: unsafeValue }
            : product,
        ),
      };

      const catalog = buildPublicCatalog(records, { now });

      expect(catalog.products.map((product) => product.id)).not.toContain(
        "demo-product-alpha",
      );
      expect(catalog.promotions.map((promotion) => promotion.id)).not.toContain(
        "demo-bundle",
      );
      expect(catalog.qualityRecords.map((record) => record.productId)).not.toContain(
        "demo-product-alpha",
      );
    },
  );

  it("excludes a product when individually safe core fields join into prohibited public copy", () => {
    const base = createRecords();
    const records: CatalogRecordSet = {
      ...base,
      products: base.products.map((product) =>
        product.id === "demo-product-alpha"
          ? { ...product, name: "Human", packageForm: "use reference" }
          : product,
      ),
    };

    const catalog = buildPublicCatalog(records, { now });

    expect(catalog.products.map((product) => product.id)).not.toContain(
      "demo-product-alpha",
    );
    expect(catalog.promotions.map((promotion) => promotion.id)).not.toContain(
      "demo-bundle",
    );
    expect(catalog.qualityRecords.map((record) => record.productId)).not.toContain(
      "demo-product-alpha",
    );
  });

  it.each(["missing", "private", "inactive", "sibling"] as const)(
    "keeps safe product copy but hides its analytical method when exact same-lot COA evidence is %s",
    (evidenceState) => {
      const base = createRecords();
      const coaDocuments =
        evidenceState === "missing"
          ? base.coaDocuments.filter((coa) => coa.id !== "demo-coa-alpha")
          : base.coaDocuments.map((coa) => {
              if (coa.id !== "demo-coa-alpha") return coa;
              if (evidenceState === "private") return { ...coa, public: false };
              if (evidenceState === "inactive") return { ...coa, active: false };
              return { ...coa, lotId: "demo-lot-beta" };
            });
      const catalog = buildPublicCatalog({ ...base, coaDocuments }, { now });
      const alpha = findPublicProduct(catalog, "synthetic-reference-alpha");

      expect(alpha?.proof.find((node) => node.label === "Analytical method")?.state).toBe(
        "No approved public record",
      );
      expect(
        catalog.qualityRecords.filter(
          (record) => record.productId === "demo-product-alpha",
        ),
      ).toEqual([]);
    },
  );

  it("sanitizes an unsupported analytical method even with exact public same-lot evidence", () => {
    const base = createRecords();
    const records: CatalogRecordSet = {
      ...base,
      lots: base.lots.map((lot) =>
        lot.id === "demo-lot-alpha"
          ? { ...lot, analyticalMethod: "Clinically proven HPLC purity" }
          : lot,
      ),
    };

    const catalog = buildPublicCatalog(records, { now });
    const alpha = findPublicProduct(catalog, "synthetic-reference-alpha");

    expect(alpha).not.toBeNull();
    expect(alpha?.proof.find((node) => node.label === "Analytical method")?.state).toBe(
      "No approved public record",
    );
    expect(
      catalog.qualityRecords.find((record) => record.id === "demo-coa-alpha")
        ?.analyticalMethod,
    ).toBeNull();
  });

  it("keeps an individually safe lot but redacts its method when their joined public impression is prohibited", () => {
    const base = createRecords();
    const records: CatalogRecordSet = {
      ...base,
      lots: base.lots.map((lot) =>
        lot.id === "demo-lot-alpha"
          ? {
              ...lot,
              supplierLotCode: "HUMAN",
              analyticalMethod: "use reference",
            }
          : lot,
      ),
    };

    const catalog = buildPublicCatalog(records, { now });
    const alpha = findPublicProduct(catalog, "synthetic-reference-alpha");
    const qualityRecord = catalog.qualityRecords.find(
      (record) => record.id === "demo-coa-alpha",
    );

    expect(alpha?.availableQuantity).toBe(12);
    expect(alpha?.proof.find((node) => node.label === "Lot/batch")?.state).toBe(
      "HUMAN",
    );
    expect(alpha?.proof.find((node) => node.label === "Analytical method")?.state).toBe(
      "No approved public record",
    );
    expect(alpha?.proof.find((node) => node.label === "COA state")?.href).toBe(
      "/quality-records#record-demo-coa-alpha",
    );
    expect(qualityRecord).toMatchObject({
      lotCode: "HUMAN",
      analyticalMethod: null,
    });
  });

  it("excludes an unsafe released lot and keeps only a second safe lot's quantity and quality output", () => {
    const base = createRecords();
    const alphaLot = base.lots.find((lot) => lot.id === "demo-lot-alpha")!;
    const alphaCoa = base.coaDocuments.find((coa) => coa.id === "demo-coa-alpha")!;
    const records: CatalogRecordSet = {
      ...base,
      lots: [
        ...base.lots.map((lot) =>
          lot.id === "demo-lot-alpha"
            ? { ...lot, supplierLotCode: "FOR-HUMAN-USE" }
            : lot,
        ),
        {
          ...alphaLot,
          id: "demo-lot-alpha-safe",
          supplierLotCode: "DEMO-LOT-ALPHA-SAFE",
          availableQuantity: 5,
          analyticalMethod: null,
        },
      ],
      coaDocuments: [
        ...base.coaDocuments,
        {
          ...alphaCoa,
          id: "demo-coa-alpha-safe",
          lotId: "demo-lot-alpha-safe",
          storageKey: "synthetic-demo/alpha-safe-record.pdf",
        },
      ],
    };

    const catalog = buildPublicCatalog(records, { now });
    const alpha = findPublicProduct(catalog, "synthetic-reference-alpha");

    expect(alpha?.availableQuantity).toBe(5);
    expect(alpha?.proof.find((node) => node.label === "Lot/batch")?.state).toBe(
      "DEMO-LOT-ALPHA-SAFE",
    );
    expect(alpha?.proof.find((node) => node.label === "COA state")?.href).toBe(
      "/quality-records#record-demo-coa-alpha-safe",
    );
    expect(
      catalog.qualityRecords
        .filter((record) => record.productId === "demo-product-alpha")
        .map((record) => record.id),
    ).toEqual(["demo-coa-alpha-safe"]);
  });

  it("omits only an unsafe evidence-linked analytical claim", () => {
    const base = createRecords();
    const supportedClaim = base.claims.find(
      (claim) => claim.id === "demo-claim-supported",
    )!;
    const records: CatalogRecordSet = {
      ...base,
      claims: [
        ...base.claims,
        {
          ...supportedClaim,
          id: "demo-claim-unsafe",
          text: "HPLC is clinically proven for humans.",
        },
      ],
    };

    const alpha = findPublicProduct(
      buildPublicCatalog(records, { now }),
      "synthetic-reference-alpha",
    );

    expect(alpha?.claims).toEqual([
      {
        id: "demo-claim-supported",
        text: "A synthetic analytical record is linked to this demo lot.",
      },
    ]);
  });

  it("omits an unsafe discount without removing other valid merchandising", () => {
    const base = createRecords();
    const records: CatalogRecordSet = {
      ...base,
      promotions: base.promotions.map((promotion) =>
        promotion.id === "demo-discount"
          ? { ...promotion, name: "Clinically proven discount" }
          : promotion,
      ),
    };

    const alpha = findPublicProduct(
      buildPublicCatalog(records, { now }),
      "synthetic-reference-alpha",
    );

    expect(alpha?.merchandising.map((entry) => entry.kind)).toEqual([
      "bundle",
      "subscription",
      "loyalty",
      "cross_sell",
    ]);
  });

  it("omits a promotion when its individually safe final name and summary join into prohibited copy", () => {
    const base = createRecords();
    const records: CatalogRecordSet = {
      ...base,
      promotions: base.promotions.map((promotion) =>
        promotion.id === "demo-discount"
          ? {
              ...promotion,
              name: "Human",
              amountMinor: 1_000,
              basisPoints: null,
              currency: "USE",
            }
          : promotion,
      ),
    };

    const alpha = findPublicProduct(
      buildPublicCatalog(records, { now }),
      "synthetic-reference-alpha",
    );

    expect(alpha?.merchandising.map((entry) => entry.kind)).toEqual([
      "bundle",
      "subscription",
      "loyalty",
      "cross_sell",
    ]);
  });

  it("omits an unsafe cross-sell from merchandising and related products", () => {
    const base = createRecords();
    const records: CatalogRecordSet = {
      ...base,
      promotions: base.promotions.map((promotion) =>
        promotion.id === "demo-cross-sell"
          ? { ...promotion, name: "For human use related records" }
          : promotion,
      ),
    };

    const alpha = findPublicProduct(
      buildPublicCatalog(records, { now }),
      "synthetic-reference-alpha",
    );

    expect(alpha?.merchandising.map((entry) => entry.kind)).not.toContain(
      "cross_sell",
    );
    expect(alpha?.relatedProducts).toEqual([]);
  });

  it("fails closed for unknown slugs and evidence-gates analytical claims and quality records", () => {
    const catalog = buildPublicCatalog(createRecords(), { now });
    const alpha = findPublicProduct(catalog, "synthetic-reference-alpha");

    expect(findPublicProduct(catalog, "not-a-real-record")).toBeNull();
    expect(alpha?.claims.map((claim) => claim.text)).toEqual([
      "A synthetic analytical record is linked to this demo lot.",
    ]);
    expect(catalog.qualityRecords.map((record) => record.id)).toEqual([
      "demo-coa-alpha",
    ]);
    expect(alpha?.proof.map((node) => node.label)).toEqual([
      "Material identity",
      "Analytical method",
      "Lot/batch",
      "COA state",
    ]);
    expect(alpha?.proof.every((node) => node.state.length > 0)).toBe(true);
    expect(alpha?.proof.find((node) => node.label === "Analytical method")?.state).toBe(
      "Synthetic analytical method record",
    );
  });

  it("fails closed when a product has ambiguous simultaneous current prices", () => {
    const base = createRecords();
    const records: CatalogRecordSet = {
      ...base,
      prices: [
        ...base.prices,
        {
          id: "demo-price-alpha-eur",
          productId: "demo-product-alpha",
          version: 3,
          amountMinor: 2300,
          currency: "EUR",
          effectiveAt: "2026-08-01T00:00:00.000Z",
          supersededAt: null,
        },
      ],
    };

    const catalog = buildPublicCatalog(records, { now });
    expect(findPublicProduct(catalog, "synthetic-reference-alpha")).toBeNull();
  });

  it("fails closed when the one current legacy price has a null amount", () => {
    const base = createRecords();
    const records = {
      ...base,
      prices: base.prices.map((entry) =>
        entry.productId === "demo-product-alpha"
          ? { ...entry, amountMinor: null }
          : entry,
      ),
    } as CatalogRecordSet;

    expect(
      findPublicProduct(
        buildPublicCatalog(records, { now }),
        "synthetic-reference-alpha",
      ),
    ).toBeNull();
  });

  it("excludes released stock exactly at expiry and when manufacture is still future", () => {
    const base = createRecords();
    const expired: CatalogRecordSet = {
      ...base,
      lots: base.lots.map((lot) =>
        lot.id === "demo-lot-alpha"
          ? { ...lot, expiresAt: now.toISOString() }
          : lot,
      ),
    };
    expect(findPublicProduct(buildPublicCatalog(expired, { now }), "synthetic-reference-alpha")).toBeNull();

    const futureManufacture: CatalogRecordSet = {
      ...base,
      lots: base.lots.map((lot) =>
        lot.id === "demo-lot-alpha"
          ? { ...lot, manufacturedAt: "2026-08-25T12:00:00.001Z" }
          : lot,
      ),
    };
    expect(findPublicProduct(buildPublicCatalog(futureManufacture, { now }), "synthetic-reference-alpha")).toBeNull();
  });
});
