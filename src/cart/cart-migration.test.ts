import { describe, expect, it } from "vitest";

import {
  LEGACY_CART_STORAGE_KEY,
  acknowledgeLegacyCartReselection,
  deserializeCart,
  loadCart,
} from "./cart-storage";

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

describe("v1 cart migration", () => {
  it("requires reselection for a v1 product-only cart", () => {
    expect(deserializeCart(JSON.stringify({
      version: 1,
      items: [{ productId: "10000000-0000-4000-8000-000000000001", quantity: 2 }],
    }))).toEqual({ status: "variant_reselection_required", legacyItemCount: 2 });
  });

  it("reads the old key only to request reselection", () => {
    const storage = new MemoryStorage();
    storage.setItem(LEGACY_CART_STORAGE_KEY, JSON.stringify({
      version: 1,
      items: [{ productId: "10000000-0000-4000-8000-000000000001", quantity: 2 }],
    }));
    expect(loadCart(storage)).toEqual({ status: "variant_reselection_required", legacyItemCount: 2 });
  });

  it("clears only the old cart after explicit acknowledgement", () => {
    const storage = new MemoryStorage();
    storage.setItem(LEGACY_CART_STORAGE_KEY, "legacy");
    storage.setItem("unrelated-key", "preserve");
    acknowledgeLegacyCartReselection(storage);
    expect(storage.getItem(LEGACY_CART_STORAGE_KEY)).toBeNull();
    expect(storage.getItem("unrelated-key")).toBe("preserve");
  });
});
