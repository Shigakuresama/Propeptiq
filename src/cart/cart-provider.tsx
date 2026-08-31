"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  CART_STORAGE_KEY,
  LEGACY_CART_STORAGE_KEY,
  MAX_CART_ITEM_QUANTITY,
  type CartLine,
  acknowledgeLegacyCartReselection,
  loadCart,
  normalizeCart,
  persistCart,
} from "./cart-storage";

type CartContextValue = {
  items: readonly CartLine[];
  itemCount: number;
  hydrated: boolean;
  legacyItemCount: number | null;
  addVariant: (variantId: string, quantity?: number) => void;
  setQuantity: (variantId: string, quantity: number) => void;
  removeItem: (variantId: string) => void;
  clearCart: () => void;
  acknowledgeLegacyReselection: () => void;
};

const CartContext = createContext<CartContextValue | null>(null);

function itemCount(items: readonly CartLine[]): number {
  return items.reduce((total, item) => total + item.quantity, 0);
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartLine[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [legacyItemCount, setLegacyItemCount] = useState<number | null>(null);
  const [announcement, setAnnouncement] = useState("");

  useEffect(() => {
    const hydration = window.setTimeout(() => {
      const loaded = loadCart(window.localStorage);
      if (loaded.status === "ready") {
        setItems([...loaded.items]);
        setLegacyItemCount(null);
      } else {
        setItems([]);
        setLegacyItemCount(loaded.legacyItemCount);
      }
      setHydrated(true);
    }, 0);
    return () => window.clearTimeout(hydration);
  }, []);

  useEffect(() => {
    if (hydrated && legacyItemCount === null) persistCart(window.localStorage, items);
  }, [hydrated, items, legacyItemCount]);

  useEffect(() => {
    function synchronize(event: StorageEvent) {
      if (event.key === CART_STORAGE_KEY || event.key === LEGACY_CART_STORAGE_KEY) {
        const loaded = loadCart(window.localStorage);
        if (loaded.status === "ready") {
          setItems([...loaded.items]);
          setLegacyItemCount(null);
        } else {
          setItems([]);
          setLegacyItemCount(loaded.legacyItemCount);
        }
      }
    }
    window.addEventListener("storage", synchronize);
    return () => window.removeEventListener("storage", synchronize);
  }, []);

  const addVariant = useCallback((variantId: string, quantity = 1) => {
    setItems((current) => {
      const next = normalizeCart([...current, { variantId, quantity }]);
      const added = next.find((item) => item.variantId === variantId)?.quantity;
      setAnnouncement(
        added
          ? `Cart updated. ${added} unit${added === 1 ? "" : "s"} requested for this record.`
          : "The cart was not changed.",
      );
      return next;
    });
  }, []);

  const setQuantity = useCallback((variantId: string, quantity: number) => {
    setItems((current) => {
      const bounded = Math.min(MAX_CART_ITEM_QUANTITY, Math.floor(quantity));
      const next =
        bounded <= 0
          ? current.filter((item) => item.variantId !== variantId)
          : current.map((item) =>
              item.variantId === variantId ? { ...item, quantity: bounded } : item,
            );
      setAnnouncement(
        bounded <= 0
          ? "Item removed from cart."
          : `Quantity updated to ${bounded}.`,
      );
      return normalizeCart(next);
    });
  }, []);

  const removeItem = useCallback((variantId: string) => {
    setItems((current) =>
      current.filter((item) => item.variantId !== variantId),
    );
    setAnnouncement("Item removed from cart.");
  }, []);

  const clearCart = useCallback(() => {
    setItems([]);
    setAnnouncement("Cart cleared.");
  }, []);

  const acknowledgeLegacyReselection = useCallback(() => {
    acknowledgeLegacyCartReselection(window.localStorage);
    setLegacyItemCount(null);
    setItems([]);
    setAnnouncement("Choose a variant again to add it to your cart.");
  }, []);

  const value = useMemo<CartContextValue>(
    () => ({
      items,
      itemCount: itemCount(items),
      hydrated,
      legacyItemCount,
      addVariant,
      setQuantity,
      removeItem,
      clearCart,
      acknowledgeLegacyReselection,
    }),
    [items, hydrated, legacyItemCount, addVariant, setQuantity, removeItem, clearCart, acknowledgeLegacyReselection],
  );

  return (
    <CartContext.Provider value={value}>
      {children}
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </p>
    </CartContext.Provider>
  );
}

export function useCart(): CartContextValue {
  const context = useContext(CartContext);
  if (!context) throw new Error("useCart must be used within CartProvider");
  return context;
}
