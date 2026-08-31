"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
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

export type CartAnnouncementLabels = Readonly<{
  productName?: string;
  variantLabel?: string;
}>;

type CartContextValue = {
  items: readonly CartLine[];
  itemCount: number;
  hydrated: boolean;
  legacyItemCount: number | null;
  addVariant: (
    variantId: string,
    quantity?: number,
    announcementLabels?: CartAnnouncementLabels,
  ) => void;
  setQuantity: (variantId: string, quantity: number) => void;
  removeItem: (variantId: string) => void;
  clearCart: () => void;
  acknowledgeLegacyReselection: () => void;
};

const CartContext = createContext<CartContextValue | null>(null);

function itemCount(items: readonly CartLine[]): number {
  return items.reduce((total, item) => total + item.quantity, 0);
}

function safeAnnouncementLabel(value: string | undefined): string | null {
  if (value === undefined) return null;
  const normalized = value.trim().replace(/\s+/gu, " ").slice(0, 100);
  return normalized.length > 0 ? normalized : null;
}

function announcementSubject(labels: CartAnnouncementLabels): string {
  const productName = safeAnnouncementLabel(labels.productName);
  const variantLabel = safeAnnouncementLabel(labels.variantLabel);
  return [productName, variantLabel].filter((value) => value !== null).join(", ") || "This item";
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartLine[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [legacyItemCount, setLegacyItemCount] = useState<number | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const pendingAddAnnouncement = useRef<
    Readonly<{ variantId: string; labels: CartAnnouncementLabels }> | null
  >(null);

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

  const addVariant = useCallback(
    (
      variantId: string,
      quantity = 1,
      announcementLabels: CartAnnouncementLabels = {},
    ) => {
      pendingAddAnnouncement.current = {
        variantId,
        labels: announcementLabels,
      };
      setItems((current) => normalizeCart([...current, { variantId, quantity }]));
    },
    [],
  );

  useEffect(() => {
    const pending = pendingAddAnnouncement.current;
    if (pending === null) return;
    pendingAddAnnouncement.current = null;
    const normalizedQuantity = items.find(
      (item) => item.variantId === pending.variantId,
    )?.quantity;
    setAnnouncement(
      normalizedQuantity === undefined
        ? "The cart was not changed."
        : `Cart updated. ${announcementSubject(pending.labels)}: ${normalizedQuantity} unit${normalizedQuantity === 1 ? "" : "s"} in cart.`,
    );
  }, [items]);

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
      <p
        aria-atomic="true"
        aria-label="Cart updates"
        aria-live="polite"
        className="sr-only"
        role="status"
      >
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
