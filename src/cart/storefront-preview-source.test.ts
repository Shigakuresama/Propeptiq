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
