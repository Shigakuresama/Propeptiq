export type CartLoadResult =
  | Readonly<{ status: "ready"; items: readonly Readonly<{ variantId: string; quantity: number }>[] }>
  | Readonly<{ status: "variant_reselection_required"; legacyItemCount: number }>;

const validLegacyProductId = /^[A-Za-z0-9_-]{1,128}$/;

function legacyItemCount(items: unknown): number | null {
  if (!Array.isArray(items)) return null;
  let count = 0;
  for (const item of items) {
    if (!item || typeof item !== "object") return null;
    const productId = Reflect.get(item, "productId");
    const quantity = Reflect.get(item, "quantity");
    if (
      typeof productId !== "string" ||
      !validLegacyProductId.test(productId) ||
      typeof quantity !== "number" ||
      !Number.isInteger(quantity) ||
      quantity < 1 ||
      quantity > 25
    ) return null;
    count += quantity;
  }
  return count;
}

export function deserializeLegacyCart(value: object): CartLoadResult {
  const count = legacyItemCount(Reflect.get(value, "items"));
  return count === null || count === 0 || Reflect.get(value, "version") !== 1
    ? { status: "ready", items: [] }
    : { status: "variant_reselection_required", legacyItemCount: count };
}
