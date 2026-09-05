"use client";

import dynamic from "next/dynamic";
import { ShoppingBag } from "lucide-react";
import { Component, type MouseEvent, type ReactNode, useCallback, useId, useRef, useState } from "react";
import { usePathname } from "next/navigation";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

function CartDrawerBodyFallback() {
  return (
    <div className="error-record m-4 text-base leading-7" role="alert">
      The cart preview could not be loaded. Close this panel or use View cart to continue.
    </div>
  );
}

const DrawerCartView = dynamic(
  () => import("./cart-view").then((module) => module.CartView),
  {
    loading: ({ error }) => error ? <CartDrawerBodyFallback /> : (
      <div
        aria-label="Loading cart preview"
        className="cart-loading m-4"
        role="status"
      >
        Loading cart preview…
      </div>
    ),
    ssr: false,
  },
);

class CartDrawerBodyBoundary extends Component<
  Readonly<{ children: ReactNode }>,
  Readonly<{ failed: boolean }>
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (this.state.failed) {
      return <CartDrawerBodyFallback />;
    }
    return this.props.children;
  }
}

function isEnhancedCartActivation(event: MouseEvent<HTMLAnchorElement>): boolean {
  return !event.defaultPrevented &&
    event.button === 0 &&
    !event.altKey &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.shiftKey;
}

export function CartDrawer({
  enabled = false,
  itemCount,
}: Readonly<{
  enabled?: boolean;
  itemCount: number;
}>) {
  const pathname = usePathname();
  const drawerEnabled = enabled && pathname !== "/cart";
  const [drawerState, setDrawerState] = useState(() => ({
    open: false,
    pathname,
  }));
  if (drawerState.pathname !== pathname) {
    setDrawerState({ open: false, pathname });
  }
  const open = drawerState.pathname === pathname && drawerState.open;
  const triggerRef = useRef<HTMLAnchorElement>(null);
  const dialogId = `cart-drawer-${useId()}`;
  const setOpen = useCallback((nextOpen: boolean) => {
    setDrawerState({ open: nextOpen, pathname });
  }, [pathname]);
  const closeDrawer = useCallback(() => setOpen(false), [setOpen]);

  function handleTriggerClick(event: MouseEvent<HTMLAnchorElement>) {
    if (!drawerEnabled || !isEnhancedCartActivation(event)) return;
    event.preventDefault();
    setOpen(true);
  }

  const trigger = (
    <a
      aria-controls={drawerEnabled ? dialogId : undefined}
      aria-expanded={drawerEnabled ? open : undefined}
      aria-haspopup={drawerEnabled ? "dialog" : undefined}
      aria-label={`Cart, ${itemCount} requested unit${itemCount === 1 ? "" : "s"}`}
      className="ml-auto inline-flex min-h-11 items-center gap-1.5 rounded-full px-2 text-sm font-semibold text-ink transition-colors duration-200 hover:bg-moss-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring xl:ml-3 sm:px-3"
      href="/cart"
      onClick={handleTriggerClick}
      ref={triggerRef}
    >
      <ShoppingBag aria-hidden="true" className="size-4" />
      <span className="hidden sm:inline">Cart</span>
      <span className="cart-count" aria-hidden="true">{itemCount}</span>
    </a>
  );

  if (!drawerEnabled) return trigger;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      {trigger}
      <SheetContent
        className="cart-drawer gap-0 border-border bg-canvas p-0"
        id={dialogId}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          triggerRef.current?.focus();
        }}
        side="right"
      >
        <SheetHeader className="cart-drawer__header border-b border-border px-5 pb-4 pt-5 text-left">
          <SheetTitle className="pr-11 text-2xl text-ink">Your cart</SheetTitle>
          <SheetDescription className="pr-11 leading-6 text-muted-ink">
            Review your items and current prices.
          </SheetDescription>
        </SheetHeader>
        <div className="cart-drawer__scroll" data-cart-drawer-scroll>
          {open ? (
            <CartDrawerBodyBoundary>
              <DrawerCartView
                checkoutIntent={null}
                onNavigate={closeDrawer}
                presentation="drawer"
              />
            </CartDrawerBodyBoundary>
          ) : null}
        </div>
        <div className="cart-drawer__footer border-t border-border bg-canvas px-5 py-4">
          <a
            className="action-secondary inline-flex min-h-11 w-full items-center justify-center text-center font-semibold"
            href="/cart"
            onClick={closeDrawer}
          >
            View cart
          </a>
        </div>
      </SheetContent>
    </Sheet>
  );
}
