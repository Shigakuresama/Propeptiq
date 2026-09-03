import { describe, expect, it } from "vitest";

import { browseCatalogPublicationId } from "@/catalog/browse-catalog-publication";
import { storefrontCatalogData } from "@/catalog/storefront-catalog-data";
import { buildConfiguredDisplayVariantFacts, buildPublicStorefrontCatalog, storefrontImageMetadata, type CanonicalPublicStorefrontProduct } from "@/catalog/storefront-public";
import type { PublicStorefrontView } from "@/catalog/storefront-public-server";
import type { PublicStorefrontAutomaticPromotion } from "@/catalog/storefront-price-presentation";
import { buildCartPreview } from "./preview";
import { CartPreviewProjectionError, composeCartPreviewSources, projectPublicStorefrontPreviewSource } from "./storefront-preview-source";

const catalog = buildPublicStorefrontCatalog({
  configuredPublicationId: browseCatalogPublicationId, catalogData: storefrontCatalogData,
  runtimeVariantFacts: buildConfiguredDisplayVariantFacts(storefrontCatalogData),
  controlledContent: [], verifiedImageMetadata: storefrontImageMetadata,
});
const canonical = catalog.products.find((product): product is CanonicalPublicStorefrontProduct => product.kind === "canonical")!;
const first = canonical.variants[0]!;
function view(products = catalog.products, promotions: readonly PublicStorefrontAutomaticPromotion[] = []): PublicStorefrontView {
  return { catalog: { ...catalog, products }, pricing: { mode: "production", evaluatedAt: "2026-09-03T12:00:00.000Z", automaticPromotions: promotions } };
}
const campaign: PublicStorefrontAutomaticPromotion = {
  id: "synthetic-sitewide", displayName: "Synthetic winter sale", displayCode: "WINTER30", discountBps: 3_000,
  enabled: true, startAt: null, endAt: null, timezone: "America/Los_Angeles", scope: { kind: "sitewide" }, applicationMode: "automatic",
};

function promotion(
  overrides: Record<string, unknown> = {},
): PublicStorefrontAutomaticPromotion {
  return { ...campaign, ...overrides } as PublicStorefrontAutomaticPromotion;
}

function runtimeView(
  evaluatedAt: unknown,
  promotions: unknown,
): PublicStorefrontView {
  return {
    ...view([canonical]),
    pricing: {
      mode: "production",
      evaluatedAt,
      automaticPromotions: promotions,
    },
  } as PublicStorefrontView;
}

describe("public storefront cart source", () => {
  it("projects all 103 canonical variants once with 40 reviewed positive and 63 pending prices", () => {
    const source = projectPublicStorefrontPreviewSource(view());
    expect(source.mode).toBe("production");
    expect(source.variants).toHaveLength(103);
    expect(new Set(source.variants.map((row) => row.variantId)).size).toBe(103);
    expect(new Set(source.variants.map((row) => row.name)).size).toBe(56);
    expect(source.variants.filter((row) => row.priceStatus === "active" && row.baseUnitMinor! > 0)).toHaveLength(40);
    expect(source.variants.filter((row) => row.priceStatus === "pending" && row.baseUnitMinor === 0)).toHaveLength(63);
    for (const row of source.variants) {
      expect(row.availableQuantity).toBeNull();
      expect(row.checkoutReady).toBe(false);
      expect(row.availability).toBe("preview_only");
      expect(Object.keys(row).sort()).toEqual(["variantId", "productId", "name", "variantLabel", "sku", "packageForm", "baseUnitMinor", "currency", "priceStatus", "availability", "availableQuantity", "checkoutReady", "eligiblePromotions"].sort());
    }
    expect(JSON.stringify(source)).not.toMatch(/stripe|provider|payment|inventory|browseCode|displayConfigurations/iu);
    const items = [];
    for (let start = 0; start < source.variants.length; start += 50) {
      items.push(...buildCartPreview(source.variants.slice(start, start + 50).map((row) => ({ variantId: row.variantId, quantity: 1 })), source).items);
    }
    expect(items).toHaveLength(103);
    expect(items.filter((item) => item.purchaseState === "checkout_unavailable")).toHaveLength(40);
    expect(items.filter((item) => item.purchaseState === "pricing_pending")).toHaveLength(63);
  });

  it("uses exact canonical identity and structured bottle counts, never positional display joins", () => {
    const product = { ...canonical, name: "Synthetic exact name", displayConfigurations: [{ displayCode: "IGNORE", packageForm: "Wrong positional label" }], variants: [
      { ...first, id: "synthetic-one", label: "Exact opaque label", sku: "SYNTHETIC-ONE", packageQuantity: 1, availability: "available" as const, checkoutReady: true },
      { ...first, id: "synthetic-three", label: "Do not parse 900 bottles", sku: "SYNTHETIC-THREE", packageQuantity: 3 },
    ] };
    const rows = projectPublicStorefrontPreviewSource(view([product])).variants;
    expect(rows).toMatchObject([
      { variantId: "synthetic-one", name: "Synthetic exact name", variantLabel: "Exact opaque label", sku: "SYNTHETIC-ONE", packageForm: "1 bottle", availability: "preview_only", checkoutReady: false, availableQuantity: null },
      { variantId: "synthetic-three", variantLabel: "Do not parse 900 bottles", packageForm: "3 bottles" },
    ]);
    const browseOnly = { ...canonical, kind: "browse_only" as const, id: null, defaultVariantId: null, variants: [] as const, pricingState: "pricing_pending" as const };
    expect(projectPublicStorefrontPreviewSource(view([browseOnly])).variants).toEqual([]);
  });

  it("filters sitewide, product and variant campaigns and projects only approved public labels", () => {
    const promotions: PublicStorefrontAutomaticPromotion[] = [campaign,
      { ...campaign, id: "synthetic-product", displayCode: null, displayName: "Product display name", scope: { kind: "products", productIds: [canonical.id] } },
      { ...campaign, id: "synthetic-variant", scope: { kind: "variants", variantIds: [first.id] } },
      { ...campaign, id: "synthetic-nonmatch", scope: { kind: "products", productIds: ["not-this-product"] } },
    ];
    expect(projectPublicStorefrontPreviewSource(view([canonical], promotions)).variants[0]?.eligiblePromotions).toEqual([
      { id: "synthetic-sitewide", discountBps: 3_000, displayLabel: "WINTER30" },
      { id: "synthetic-product", discountBps: 3_000, displayLabel: "Product display name" },
      { id: "synthetic-variant", discountBps: 3_000, displayLabel: "WINTER30" },
    ]);
  });

  it("uses evaluatedAt with inclusive start, exclusive end, null bounds, and offset nanosecond equivalence", () => {
    const evaluatedAt = "2026-09-03T12:00:00.123456789Z";
    const promotions = [
      promotion({
        id: "exact-start",
        startAt: "2026-09-03T05:00:00.123456789-07:00",
        endAt: "2026-09-03T12:00:00.123456790Z",
      }),
      promotion({
        id: "product-null-bounds",
        displayCode: null,
        displayName: "Product display name",
        scope: { kind: "products", productIds: [canonical.id] },
      }),
      promotion({
        id: "variant-offset-window",
        startAt: "2026-09-03T13:59:59.123456789+02:00",
        endAt: "2026-09-03T14:00:01.123456789+02:00",
        scope: { kind: "variants", variantIds: [first.id] },
      }),
    ];

    expect(projectPublicStorefrontPreviewSource(runtimeView(evaluatedAt, promotions)).variants[0]?.eligiblePromotions)
      .toEqual([
        { id: "exact-start", discountBps: 3_000, displayLabel: "WINTER30" },
        { id: "product-null-bounds", discountBps: 3_000, displayLabel: "Product display name" },
        { id: "variant-offset-window", discountBps: 3_000, displayLabel: "WINTER30" },
      ]);
  });

  it.each([
    ["scheduled", { startAt: "2026-09-03T12:00:00.000000001Z" }],
    ["expired", { endAt: "2026-09-03T11:59:59.999999999Z" }],
    ["at the exclusive end", { endAt: "2026-09-03T12:00:00.000000000Z" }],
  ] as const)("rejects a %s promotion from the promised active-only set", (_label, overrides) => {
    expect(() => projectPublicStorefrontPreviewSource(runtimeView(
      "2026-09-03T12:00:00.000000000Z",
      [promotion(overrides)],
    ))).toThrowError(new CartPreviewProjectionError("invalid_source"));
  });

  it.each([
    ["invalid ID", { id: "not a stable id" }],
    ["blank display name", { displayName: " " }],
    ["blank display code", { displayCode: "" }],
    ["zero discount", { discountBps: 0 }],
    ["oversized discount", { discountBps: 10_001 }],
    ["fractional discount", { discountBps: 1.5 }],
    ["disabled lifecycle", { enabled: false }],
    ["code-required mode", { applicationMode: "code_required" }],
    ["invalid timezone", { timezone: "Mars/Olympus" }],
    ["invalid start instant", { startAt: "2026-09-03 12:00:00Z" }],
    ["invalid end instant", { endAt: "2026-09-03T12:00:00" }],
    ["equal interval", { startAt: "2026-09-03T11:00:00Z", endAt: "2026-09-03T11:00:00Z" }],
    ["reversed interval", { startAt: "2026-09-03T11:00:00.000000001Z", endAt: "2026-09-03T11:00:00Z" }],
  ] as const)("rejects a promotion with %s", (_label, overrides) => {
    expect(() => projectPublicStorefrontPreviewSource(runtimeView(
      "2026-09-03T12:00:00Z",
      [promotion(overrides)],
    ))).toThrowError(new CartPreviewProjectionError("invalid_source"));
  });

  it.each([
    ["sitewide extra data", { kind: "sitewide", productIds: [canonical.id] }],
    ["empty product targets", { kind: "products", productIds: [] }],
    ["duplicate product targets", { kind: "products", productIds: [canonical.id, canonical.id] }],
    ["unstable product target", { kind: "products", productIds: ["not stable"] }],
    ["empty variant targets", { kind: "variants", variantIds: [] }],
    ["duplicate variant targets", { kind: "variants", variantIds: [first.id, first.id] }],
    ["unknown scope kind", { kind: "collections", collectionIds: ["one"] }],
  ] as const)("rejects a promotion with %s", (_label, scope) => {
    expect(() => projectPublicStorefrontPreviewSource(runtimeView(
      "2026-09-03T12:00:00Z",
      [promotion({ scope })],
    ))).toThrowError(new CartPreviewProjectionError("invalid_source"));
  });

  it("rejects sparse and over-bounded promotion scope snapshots", () => {
    const sparseTargets = [canonical.id, "other-product"];
    delete sparseTargets[0];
    const overBoundedTargets = Array.from({ length: 1_001 }, (_, index) => `product-${index}`);
    for (const scope of [
      { kind: "products", productIds: sparseTargets },
      { kind: "products", productIds: overBoundedTargets },
    ]) {
      expect(() => projectPublicStorefrontPreviewSource(runtimeView(
        "2026-09-03T12:00:00Z",
        [promotion({ scope })],
      ))).toThrowError(new CartPreviewProjectionError("invalid_source"));
    }
  });

  it("rejects duplicate promotion IDs even when only one duplicate scope matches", () => {
    expect(() => projectPublicStorefrontPreviewSource(runtimeView(
      "2026-09-03T12:00:00Z",
      [
        promotion({ id: "duplicate-active" }),
        promotion({
          id: "duplicate-active",
          scope: { kind: "products", productIds: ["other-product"] },
        }),
      ],
    ))).toThrowError(new CartPreviewProjectionError("invalid_source"));
  });

  it("rejects sparse and over-bounded active promotion lists before variant projection", () => {
    const sparse = [promotion({ id: "promotion-one" }), promotion({ id: "promotion-two" })];
    delete sparse[0];
    const overBounded = Array.from(
      { length: 1_001 },
      (_, index) => promotion({ id: `promotion-${index}` }),
    );
    for (const promotions of [sparse, overBounded]) {
      expect(() => projectPublicStorefrontPreviewSource(runtimeView(
        "2026-09-03T12:00:00Z",
        promotions,
      ))).toThrowError(new CartPreviewProjectionError("invalid_source"));
    }
  });

  it.each([
    ["non-string", 0],
    ["date without time", "2026-09-03"],
    ["local timestamp", "2026-09-03T12:00:00"],
    ["invalid instant", "2026-13-03T12:00:00Z"],
  ] as const)("rejects %s evaluatedAt instead of consulting another clock", (_label, evaluatedAt) => {
    expect(() => projectPublicStorefrontPreviewSource(runtimeView(
      evaluatedAt,
      [campaign],
    ))).toThrowError(new CartPreviewProjectionError("invalid_source"));
  });

  it.each(["availability", "priceStatus"] as const)("marks explicit %s unavailability without adding authority", (field) => {
    expect(projectPublicStorefrontPreviewSource(view([{ ...canonical, variants: [{ ...first, [field]: "unavailable" }] }])).variants[0])
      .toMatchObject({ availability: "unavailable", checkoutReady: false, availableQuantity: null });
  });

  it("rejects duplicate identities within one public product and across products", () => {
    for (const products of [
      [{ ...canonical, variants: [first, first] }],
      [canonical, { ...canonical, id: "other-product", variants: [first] }],
    ]) expect(() => projectPublicStorefrontPreviewSource(view(products))).toThrow(CartPreviewProjectionError);
  });

  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])("rejects invalid package count %s", (packageQuantity) => {
    expect(() => projectPublicStorefrontPreviewSource(view([{ ...canonical, variants: [{ ...first, packageQuantity }] }]))).toThrow(CartPreviewProjectionError);
  });

  it("rejects sparse trusted view arrays instead of silently omitting rows", () => {
    const products = [canonical, canonical];
    delete products[0];
    expect(() => projectPublicStorefrontPreviewSource(view(products))).toThrow(CartPreviewProjectionError);
  });

  it("rejects malformed public availability instead of upgrading it to preview-only", () => {
    const input = view([{ ...canonical, variants: [{ ...first, availability: "invalid" as typeof first.availability }] }]);
    expect(() => projectPublicStorefrontPreviewSource(input)).toThrow(CartPreviewProjectionError);
  });

  it("freezes projected and composed rows without mutating or freezing caller input", () => {
    const input = structuredClone(view([canonical], [campaign]));
    const before = JSON.stringify(input);
    const projected = projectPublicStorefrontPreviewSource(input);
    const local = { variants: [{ ...projected.variants[0]!, variantId: "synthetic-local", eligiblePromotions: [{ ...projected.variants[0]!.eligiblePromotions[0]! }] }] };
    const composed = composeCartPreviewSources(projected, local);
    expect(composed.mode).toBe("production");
    expect(Object.isFrozen(composed)).toBe(true);
    expect(Object.isFrozen(composed.variants)).toBe(true);
    expect(Object.isFrozen(composed.variants.at(-1))).toBe(true);
    expect(Object.isFrozen(composed.variants.at(-1)?.eligiblePromotions)).toBe(true);
    expect(Object.isFrozen(composed.variants.at(-1)?.eligiblePromotions[0])).toBe(true);
    expect(Object.isFrozen(input.catalog.products)).toBe(false);
    expect(Object.isFrozen(local.variants[0])).toBe(false);
    local.variants[0]!.name = "Changed caller name";
    local.variants[0]!.eligiblePromotions[0]!.displayLabel = "Changed caller label";
    expect(composed.variants.at(-1)?.name).toBe(canonical.name);
    expect(composed.variants.at(-1)?.eligiblePromotions[0]?.displayLabel).toBe("WINTER30");
    expect(JSON.stringify(input)).toBe(before);
  });

  it("rejects collisions within another source, the primary source, and between public/local sources", () => {
    const source = projectPublicStorefrontPreviewSource(view([canonical]));
    const local = { ...source.variants[0]!, variantId: "synthetic-local" };
    expect(() => composeCartPreviewSources(source, { variants: [source.variants[0]!] })).toThrow(CartPreviewProjectionError);
    expect(() => composeCartPreviewSources(source, { variants: [local, local] })).toThrow(CartPreviewProjectionError);
    expect(() => composeCartPreviewSources({ ...source, variants: [local, local] })).toThrow(CartPreviewProjectionError);
  });
});
