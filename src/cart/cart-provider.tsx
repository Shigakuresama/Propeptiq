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
  ) => boolean;
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
  const itemsRef = useRef<CartLine[]>([]);
  const hydratedRef = useRef(false);
  const pendingAddAnnouncement = useRef<
    Readonly<{ variantId: string; labels: CartAnnouncementLabels }> | null
  >(null);

  const hydrateCart = useCallback((): CartLine[] => {
    if (hydratedRef.current) return itemsRef.current;

    const loaded = loadCart(window.localStorage);
    const nextItems = loaded.status === "ready" ? [...loaded.items] : [];
    hydratedRef.current = true;
    itemsRef.current = nextItems;
    setItems(nextItems);
    if (loaded.status === "ready") {
      setLegacyItemCount(null);
    } else {
      setLegacyItemCount(loaded.legacyItemCount);
    }
    setHydrated(true);
    return nextItems;
  }, []);

  useEffect(() => {
    const hydration = window.setTimeout(() => {
      hydrateCart();
    }, 0);
    return () => window.clearTimeout(hydration);
  }, [hydrateCart]);

  useEffect(() => {
    if (hydrated && legacyItemCount === null) persistCart(window.localStorage, items);
  }, [hydrated, items, legacyItemCount]);

  useEffect(() => {
    function synchronize(event: StorageEvent) {
      if (event.key === CART_STORAGE_KEY || event.key === LEGACY_CART_STORAGE_KEY) {
        const loaded = loadCart(window.localStorage);
        if (loaded.status === "ready") {
          const nextItems = [...loaded.items];
          itemsRef.current = nextItems;
          setItems(nextItems);
          setLegacyItemCount(null);
        } else {
          itemsRef.current = [];
          setItems([]);
          setLegacyItemCount(loaded.legacyItemCount);
        }
        hydratedRef.current = true;
        setHydrated(true);
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
      const current = hydrateCart();
      const previousQuantity = current.find(
        (item) => item.variantId === variantId,
      )?.quantity ?? 0;
      const nextItems = normalizeCart([...current, { variantId, quantity }]);
      const nextQuantity = nextItems.find(
        (item) => item.variantId === variantId,
      )?.quantity ?? 0;
      if (nextQuantity <= previousQuantity) {
        pendingAddAnnouncement.current = null;
        setAnnouncement("The cart was not changed.");
        return false;
      }

      pendingAddAnnouncement.current = {
        variantId,
        labels: announcementLabels,
      };
      itemsRef.current = nextItems;
      setItems(nextItems);
      return true;
    },
    [hydrateCart],
  );

  useEffect(() => {
    const pending = pendingAddAnnouncement.current;
    if (pending === null) return;
    const normalizedQuantity = items.find(
      (item) => item.variantId === pending.variantId,
    )?.quantity;
    if (normalizedQuantity === undefined) return;
    pendingAddAnnouncement.current = null;
    setAnnouncement(
      `Cart updated. ${announcementSubject(pending.labels)}: ${normalizedQuantity} unit${normalizedQuantity === 1 ? "" : "s"} in cart.`,
    );
  }, [items]);

  const setQuantity = useCallback((variantId: string, quantity: number) => {
    const current = hydrateCart();
    const bounded = Math.min(MAX_CART_ITEM_QUANTITY, Math.floor(quantity));
    const next =
      bounded <= 0
        ? current.filter((item) => item.variantId !== variantId)
        : current.map((item) =>
            item.variantId === variantId ? { ...item, quantity: bounded } : item,
          );
    const nextItems = normalizeCart(next);
    itemsRef.current = nextItems;
    setItems(nextItems);
    setAnnouncement(
      bounded <= 0
        ? "Item removed from cart."
        : `Quantity updated to ${bounded}.`,
    );
  }, [hydrateCart]);

  const removeItem = useCallback((variantId: string) => {
    const nextItems = hydrateCart().filter(
      (item) => item.variantId !== variantId,
    );
    itemsRef.current = nextItems;
    setItems(nextItems);
    setAnnouncement("Item removed from cart.");
  }, [hydrateCart]);

  const clearCart = useCallback(() => {
    hydrateCart();
    itemsRef.current = [];
    setItems([]);
    setAnnouncement("Cart cleared.");
  }, [hydrateCart]);

  const acknowledgeLegacyReselection = useCallback(() => {
    hydrateCart();
    acknowledgeLegacyCartReselection(window.localStorage);
    setLegacyItemCount(null);
    itemsRef.current = [];
    setItems([]);
    setAnnouncement("Choose a variant again to add it to your cart.");
  }, [hydrateCart]);

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
