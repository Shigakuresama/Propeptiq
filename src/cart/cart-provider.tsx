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
  MAX_CART_ITEM_QUANTITY,
  type CartLine,
  loadCart,
  normalizeCart,
  persistCart,
} from "./cart-storage";

type CartContextValue = {
  items: readonly CartLine[];
  itemCount: number;
  hydrated: boolean;
  addItem: (productId: string, quantity?: number) => void;
  setQuantity: (productId: string, quantity: number) => void;
  removeItem: (productId: string) => void;
  clearCart: () => void;
};

const CartContext = createContext<CartContextValue | null>(null);

function itemCount(items: readonly CartLine[]): number {
  return items.reduce((total, item) => total + item.quantity, 0);
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartLine[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [announcement, setAnnouncement] = useState("");

  useEffect(() => {
    const hydration = window.setTimeout(() => {
      setItems(loadCart(window.localStorage));
      setHydrated(true);
    }, 0);
    return () => window.clearTimeout(hydration);
  }, []);

  useEffect(() => {
    if (hydrated) persistCart(window.localStorage, items);
  }, [hydrated, items]);

  useEffect(() => {
    function synchronize(event: StorageEvent) {
      if (event.key === CART_STORAGE_KEY) {
        setItems(loadCart(window.localStorage));
      }
    }
    window.addEventListener("storage", synchronize);
    return () => window.removeEventListener("storage", synchronize);
  }, []);

  const addItem = useCallback((productId: string, quantity = 1) => {
    setItems((current) => {
      const next = normalizeCart([...current, { productId, quantity }]);
      const added = next.find((item) => item.productId === productId)?.quantity;
      setAnnouncement(
        added
          ? `Cart updated. ${added} unit${added === 1 ? "" : "s"} requested for this record.`
          : "The cart was not changed.",
      );
      return next;
    });
  }, []);

  const setQuantity = useCallback((productId: string, quantity: number) => {
    setItems((current) => {
      const bounded = Math.min(MAX_CART_ITEM_QUANTITY, Math.floor(quantity));
      const next =
        bounded <= 0
          ? current.filter((item) => item.productId !== productId)
          : current.map((item) =>
              item.productId === productId ? { ...item, quantity: bounded } : item,
            );
      setAnnouncement(
        bounded <= 0
          ? "Item removed from cart."
          : `Quantity updated to ${bounded}.`,
      );
      return normalizeCart(next);
    });
  }, []);

  const removeItem = useCallback((productId: string) => {
    setItems((current) =>
      current.filter((item) => item.productId !== productId),
    );
    setAnnouncement("Item removed from cart.");
  }, []);

  const clearCart = useCallback(() => {
    setItems([]);
    setAnnouncement("Cart cleared.");
  }, []);

  const value = useMemo<CartContextValue>(
    () => ({
      items,
      itemCount: itemCount(items),
      hydrated,
      addItem,
      setQuantity,
      removeItem,
      clearCart,
    }),
    [items, hydrated, addItem, setQuantity, removeItem, clearCart],
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
