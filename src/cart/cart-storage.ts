import {
  deserializeLegacyCart,
  type CartLoadResult,
} from "./cart-migration";

export const CART_STORAGE_KEY = "propeptiq.cart.v2";
export const LEGACY_CART_STORAGE_KEY = "propeptiq.cart.v1";
export const MAX_CART_ITEM_QUANTITY = 25;
export const MAX_CART_DISTINCT_ITEMS = 50;

export type CartLine = Readonly<{
  variantId: string;
  quantity: number;
}>;

export type { CartLoadResult } from "./cart-migration";

const validVariantId = /^[A-Za-z0-9_-]{1,128}$/;

export function isValidCartVariantId(value: unknown): value is string {
  return typeof value === "string" && validVariantId.test(value);
}

export function normalizeCart(input: unknown): CartLine[] {
  if (!Array.isArray(input)) return [];

  const quantities = new Map<string, number>();
  for (const value of input) {
    if (!value || typeof value !== "object") continue;
    const variantId = Reflect.get(value, "variantId");
    const quantity = Reflect.get(value, "quantity");
    if (
      !isValidCartVariantId(variantId) ||
      typeof quantity !== "number" ||
      !Number.isInteger(quantity) ||
      quantity <= 0
    ) continue;

    if (!quantities.has(variantId) && quantities.size >= MAX_CART_DISTINCT_ITEMS) {
      continue;
    }
    quantities.set(
      variantId,
      Math.min(MAX_CART_ITEM_QUANTITY, (quantities.get(variantId) ?? 0) + quantity),
    );
  }

  return [...quantities].map(([variantId, quantity]) => ({ variantId, quantity }));
}

export function serializeCart(items: readonly CartLine[]): string {
  return JSON.stringify({ version: 2, items: normalizeCart(items) });
}

export function deserializeCart(serialized: string | null): CartLoadResult {
  if (!serialized) return { status: "ready", items: [] };
  try {
    const parsed: unknown = JSON.parse(serialized);
    if (!parsed || typeof parsed !== "object") return { status: "ready", items: [] };
    if (Reflect.get(parsed, "version") === 1) return deserializeLegacyCart(parsed);
    if (Reflect.get(parsed, "version") !== 2) return { status: "ready", items: [] };
    const rawItems = Reflect.get(parsed, "items");
    if (!Array.isArray(rawItems)) return { status: "ready", items: [] };
    const normalized = normalizeCart(rawItems);
    return normalized.length === rawItems.length
      ? { status: "ready", items: normalized }
      : { status: "ready", items: [] };
  } catch {
    return { status: "ready", items: [] };
  }
}

export function persistCart(storage: Storage, items: readonly CartLine[]): void {
  storage.setItem(CART_STORAGE_KEY, serializeCart(items));
}

export function loadCart(storage: Storage): CartLoadResult {
  const current = storage.getItem(CART_STORAGE_KEY);
  return current === null
    ? deserializeCart(storage.getItem(LEGACY_CART_STORAGE_KEY))
    : deserializeCart(current);
}

export function acknowledgeLegacyCartReselection(storage: Storage): void {
  storage.removeItem(LEGACY_CART_STORAGE_KEY);
}

export function prepareCheckoutHandoff(
  storage: Storage,
  items: readonly CartLine[],
): { returnTo: "/checkout"; itemCount: number } {
  const normalized = normalizeCart(items);
  persistCart(storage, normalized);
  return {
    returnTo: "/checkout",
    itemCount: normalized.reduce((total, item) => total + item.quantity, 0),
  };
}

export function restoreCheckoutHandoff(storage: Storage): CartLoadResult {
  return loadCart(storage);
}
