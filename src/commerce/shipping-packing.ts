import { storefrontCatalogDecisionManifest } from "@/catalog/storefront-catalog-manifest";

export type ShippingService = "ground_advantage" | "priority_mail";
export const SHIPPING_ORIGIN_ZIP = "92647";
export const FREE_GROUND_THRESHOLD_MINOR = 20_000;

/** Owner-authorized provisional packing, 2026-09-07. Bubble protection, no insulation. */
export function estimateCatalogPacking(items: readonly Readonly<{
  productId: string; quantity: number; packageQuantity?: number | undefined;
}>[]) {
  let small = 0;
  let large = 0;
  for (const item of items) {
    const variant = storefrontCatalogDecisionManifest.variants.find(v => v.id === item.productId);
    const packageQuantity = item.packageQuantity ?? variant?.packageQuantity;
    if (!variant || !Number.isSafeInteger(item.quantity) || item.quantity < 1 ||
      !Number.isSafeInteger(packageQuantity) || packageQuantity! < 1) return null;
    const count = item.quantity * packageQuantity!;
    if (/\b10\s*ml\b/i.test(variant.publicLabel)) large += count;
    else small += count;
  }
  const count = small + large;
  if (!Number.isSafeInteger(count) || count < 1 || count > 20) return null;
  const diameter = large ? 48 : 32;
  const height = large ? 85 : 55;
  const columns = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / columns);
  const paddingAndWalls = 31.4;
  const packagingGrams = count <= 4 ? 100 : count <= 10 ? 150 : 200;
  const grams = small * 10 + large * 35 + packagingGrams;
  return Object.freeze({
    policyVersion: "bubble-estimate-2026-09-07-v1",
    vialCount: count,
    length: Math.max(6, Math.ceil((columns * diameter + paddingAndWalls) / 25.4)),
    width: Math.max(4, Math.ceil((rows * diameter + paddingAndWalls) / 25.4)),
    height: Math.max(3, Math.ceil((height + paddingAndWalls) / 25.4)),
    weightPounds: Math.ceil(grams / 28.349523125) / 16,
  });
}

export function qualifiesForFreeGround(service: ShippingService, netMerchandiseMinor: number) {
  return service === "ground_advantage" && Number.isSafeInteger(netMerchandiseMinor) &&
    netMerchandiseMinor > FREE_GROUND_THRESHOLD_MINOR;
}
