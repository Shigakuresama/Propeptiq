export const CART_STORAGE_KEY = "propeptiq.cart.v1";
export const MAX_CART_ITEM_QUANTITY = 25;
export const MAX_CART_DISTINCT_ITEMS = 50;

export type CartLine = Readonly<{
  productId: string;
  quantity: number;
}>;

const validProductId = /^[A-Za-z0-9_-]{1,128}$/;

export function normalizeCart(input: unknown): CartLine[] {
  if (!Array.isArray(input)) return [];

  const quantities = new Map<string, number>();
  for (const value of input) {
    if (!value || typeof value !== "object") continue;
    const productId = Reflect.get(value, "productId");
    const quantity = Reflect.get(value, "quantity");
    if (
      typeof productId !== "string" ||
      !validProductId.test(productId) ||
      typeof quantity !== "number" ||
      !Number.isInteger(quantity) ||
      quantity <= 0
    ) {
      continue;
    }

    const next = Math.min(
      MAX_CART_ITEM_QUANTITY,
      (quantities.get(productId) ?? 0) + quantity,
    );
    quantities.set(productId, next);
    if (quantities.size >= MAX_CART_DISTINCT_ITEMS) break;
  }

  return [...quantities].map(([productId, quantity]) => ({
    productId,
    quantity,
  }));
}

export function serializeCart(items: readonly CartLine[]): string {
  return JSON.stringify({ version: 1, items: normalizeCart(items) });
}

export function deserializeCart(serialized: string | null): CartLine[] {
  if (!serialized) return [];
  try {
    const parsed: unknown = JSON.parse(serialized);
    if (!parsed || typeof parsed !== "object") return [];
    if (Reflect.get(parsed, "version") !== 1) return [];
    const rawItems = Reflect.get(parsed, "items");
    if (!Array.isArray(rawItems)) return [];
    const normalized = normalizeCart(rawItems);
    return normalized.length === rawItems.length ? normalized : [];
  } catch {
    return [];
  }
}

export function persistCart(storage: Storage, items: readonly CartLine[]): void {
  storage.setItem(CART_STORAGE_KEY, serializeCart(items));
}

export function loadCart(storage: Storage): CartLine[] {
  return deserializeCart(storage.getItem(CART_STORAGE_KEY));
}

export function prepareCheckoutHandoff(
  storage: Storage,
  items: readonly CartLine[],
): { returnTo: "/cart?checkout=resume"; itemCount: number } {
  const normalized = normalizeCart(items);
  persistCart(storage, normalized);
  return {
    returnTo: "/cart?checkout=resume",
    itemCount: normalized.reduce((total, item) => total + item.quantity, 0),
  };
}

export function restoreCheckoutHandoff(storage: Storage): CartLine[] {
  return loadCart(storage);
}
