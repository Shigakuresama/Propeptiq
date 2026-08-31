"use client";

import { Minus, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { useCart } from "@/cart/cart-provider";
import { prepareCheckoutHandoff } from "@/cart/cart-storage";
import {
  loadPreviewPresentation,
  savePreviewPresentation,
} from "@/cart/preview-presentation";
import {
  type CartPreview,
  type CartPreviewItem,
  canContinueFromPreview,
} from "@/cart/preview-types";
import { Button } from "@/components/ui/button";

function formatMoney(amountMinor: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(amountMinor / 100);
}

export function CartView({
  checkoutIntent,
}: {
  checkoutIntent: string | null;
}) {
  const {
    items,
    hydrated,
    legacyItemCount,
    setQuantity,
    removeItem,
    clearCart,
    acknowledgeLegacyReselection,
  } = useCart();
  const cartKey = JSON.stringify(items);
  const [previewState, setPreviewState] = useState<{
    cartKey: string;
    preview: CartPreview;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [previewReload, setPreviewReload] = useState(0);
  const [acknowledgedToken, setAcknowledgedToken] = useState<string | null>(null);
  const [handoffMessage, setHandoffMessage] = useState("");
  const previousPreviewToken = useRef<string | null>(null);
  const presentationLoaded = useRef(false);

  useEffect(() => {
    if (!hydrated || items.length === 0) {
      previousPreviewToken.current = null;
      return;
    }
    if (!presentationLoaded.current) {
      presentationLoaded.current = true;
      previousPreviewToken.current = loadPreviewPresentation(window.sessionStorage)?.previewToken ?? null;
    }

    const controller = new AbortController();
    queueMicrotask(() => {
      if (!controller.signal.aborted) {
        setLoading(true);
        setError(false);
        setPreviewState((current) => current?.cartKey === cartKey ? current : null);
      }
    });
    void fetch("/api/catalog/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items,
        previousPreviewToken: previousPreviewToken.current,
      }),
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Cart preview unavailable");
        return (await response.json()) as CartPreview;
      })
      .then((nextPreview) => {
        previousPreviewToken.current = nextPreview.previewToken;
        savePreviewPresentation(window.sessionStorage, nextPreview);
        setAcknowledgedToken((current) =>
          current === nextPreview.previewToken ? current : null,
        );
        setPreviewState({ cartKey, preview: nextPreview });
      })
      .catch((caught: unknown) => {
        if (caught instanceof DOMException && caught.name === "AbortError") return;
        setError(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [cartKey, hydrated, items, previewReload]);

  const preview = previewState?.cartKey === cartKey
    ? previewState.preview
    : null;

  const canContinue = !loading && !error && preview
    ? canContinueFromPreview(preview, acknowledgedToken)
    : false;
  const displayedItems: readonly CartPreviewItem[] =
    preview?.items ??
    items.map((item) => ({
      quantity: item.quantity,
      variantId: item.variantId,
      available: false,
      name: null,
      packageForm: null,
      unitAmountMinor: null,
      lineSubtotalMinor: null,
      currency: null,
    }));

  function beginCheckoutHandoff() {
    const handoff = prepareCheckoutHandoff(window.localStorage, items);
    setHandoffMessage(`Saving ${handoff.itemCount} requested unit${handoff.itemCount === 1 ? "" : "s"} for checkout.`);
    window.location.assign(handoff.returnTo);
  }

  if (!hydrated) {
    return <div className="cart-loading" aria-label="Loading saved cart" />;
  }

  if (legacyItemCount !== null) {
    return (
      <section className="empty-record" aria-labelledby="cart-reselection-heading">
        <h2 id="cart-reselection-heading" className="font-heading text-section text-ink">
          Choose your variants again.
        </h2>
        <p className="mt-4 max-w-[60ch] leading-7 text-muted-ink">
          Your saved cart contains {legacyItemCount} requested unit{legacyItemCount === 1 ? "" : "s"} from an older cart format. Choose each exact variant again before continuing.
        </p>
        <div className="mt-7 flex flex-wrap gap-3">
          <Button type="button" className="action-primary" onClick={acknowledgeLegacyReselection}>
            Clear old cart and choose variants
          </Button>
          <Button asChild variant="outline">
            <Link href="/catalog">Return to catalog</Link>
          </Button>
        </div>
      </section>
    );
  }

  if (items.length === 0) {
    return (
      <section className="empty-record">
        <h2 className="font-heading text-section text-ink">Your cart is empty.</h2>
        <p className="mt-4 max-w-[60ch] leading-7 text-muted-ink">
          Add an exact active catalog variant to create a local request. Prices and availability
          will be reloaded from the server.
        </p>
        <Button asChild className="action-primary mt-7">
          <Link href="/catalog">Continue to catalog</Link>
        </Button>
      </section>
    );
  }

  return (
    <div className="cart-layout">
      <section aria-labelledby="cart-items-heading">
        <div className="flex items-end justify-between gap-4 border-b border-border pb-5">
          <h2 id="cart-items-heading" className="font-heading text-3xl text-ink">
            Requested records
          </h2>
          <Button type="button" variant="ghost" className="min-h-11" onClick={clearCart}>
            Clear cart
          </Button>
        </div>

        {error ? (
          <div className="error-record mt-6 text-base leading-7" role="alert">
            <p>The authoritative cart preview is unavailable. Retry before continuing.</p>
            <Button
              type="button"
              variant="outline"
              className="mt-4 min-h-11"
              onClick={() => setPreviewReload((current) => current + 1)}
            >
              Retry current cart facts
            </Button>
          </div>
        ) : null}
        {loading ? (
          <div className="cart-loading mt-6" aria-label="Refreshing authoritative cart preview" />
        ) : null}

        <ul className="divide-y divide-border" aria-live="polite">
          {displayedItems.map((item) => {
            const label = item.name ?? item.variantId;
            return (
              <li className="py-7" key={item.variantId}>
                <div className="grid gap-5 sm:grid-cols-[1fr_auto] sm:items-start">
                  <div>
                    <p className="font-heading text-2xl text-ink">{label}</p>
                    {item.packageForm ? (
                      <p className="mt-2 text-base text-muted-ink">{item.packageForm}</p>
                    ) : null}
                    {!loading && !item.available ? (
                      <p className="mt-3 text-base font-semibold text-danger">
                        This requested record or quantity is no longer available.
                      </p>
                    ) : null}
                    {item.unitAmountMinor !== null && item.currency ? (
                      <p className="mt-3 text-base tabular-nums text-ink">
                        {formatMoney(item.unitAmountMinor, item.currency)} each
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap items-end gap-2">
                    <div>
                      <label
                        className="mb-2 block text-xs font-semibold text-muted-ink"
                        htmlFor={`quantity-${item.variantId}`}
                      >
                        Quantity
                      </label>
                      <div className="quantity-control">
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          aria-label={`Decrease quantity for ${label}`}
                          onClick={() => setQuantity(item.variantId, item.quantity - 1)}
                        >
                          <Minus aria-hidden="true" />
                        </Button>
                        <input
                          id={`quantity-${item.variantId}`}
                          aria-label={`Quantity for ${label}`}
                          inputMode="numeric"
                          min="1"
                          max="25"
                          type="number"
                          value={item.quantity}
                          onChange={(event) => {
                            const quantity = event.currentTarget.valueAsNumber;
                            if (Number.isFinite(quantity)) {
                              setQuantity(item.variantId, quantity);
                            }
                          }}
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          aria-label={`Increase quantity for ${label}`}
                          onClick={() => setQuantity(item.variantId, item.quantity + 1)}
                        >
                          <Plus aria-hidden="true" />
                        </Button>
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Remove ${label} from cart`}
                      onClick={() => removeItem(item.variantId)}
                    >
                      <Trash2 aria-hidden="true" />
                    </Button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <aside className="cart-summary" aria-labelledby="cart-summary-heading">
        <p className="eyebrow">Server preview</p>
        <h2 id="cart-summary-heading" className="mt-3 font-heading text-3xl text-ink">
          Order summary
        </h2>
        <dl className="mt-7 space-y-3 border-y border-border py-5 text-base">
          <div className="flex justify-between gap-5">
            <dt>Merchandise subtotal</dt>
            <dd className="tabular-nums">
              {preview?.currency
                ? formatMoney(preview.subtotalMinor, preview.currency)
                : "Unavailable"}
            </dd>
          </div>
          <div className="flex justify-between gap-5">
            <dt>Promotion</dt>
            <dd>Calculated at checkout</dd>
          </div>
          <div className="flex justify-between gap-5">
            <dt>Referral benefit</dt>
            <dd>Available after checkout quote</dd>
          </div>
          <div className="flex justify-between gap-5">
            <dt>Points redemption</dt>
            <dd>Available after checkout quote</dd>
          </div>
          <div className="flex justify-between gap-5">
            <dt>Tax</dt>
            <dd>Not yet calculated</dd>
          </div>
          <div className="flex justify-between gap-5">
            <dt>Shipping</dt>
            <dd>Not yet calculated</dd>
          </div>
          <div className="flex justify-between gap-5 border-t border-border pt-3 font-semibold">
            <dt>Total</dt>
            <dd>Available after checkout quote</dd>
          </div>
        </dl>

        {preview?.requiresAcknowledgement ? (
          <div className="warning-record mt-6">
            <p className="font-semibold">Cart facts changed or became unavailable.</p>
            <p className="mt-2 text-base leading-7">
              Requested IDs and quantities were preserved. Review the server facts before continuing.
            </p>
            {preview.items.every((item) => item.available) ? (
              <Button
                type="button"
                variant="outline"
                className="mt-4 min-h-11"
                onClick={() => setAcknowledgedToken(preview.previewToken)}
              >
                Acknowledge server changes
              </Button>
            ) : null}
          </div>
        ) : null}

        {checkoutIntent ? (
          <p className="info-record mt-6 text-base leading-7">
            Your saved request is ready to continue at checkout.
          </p>
        ) : null}
        {handoffMessage ? (
          <p className="info-record mt-6 text-base leading-7" role="status">
            {handoffMessage}
          </p>
        ) : null}

        <Button
          type="button"
          className="action-primary mt-7 w-full"
          disabled={!canContinue}
          onClick={beginCheckoutHandoff}
        >
          Continue to sign in
        </Button>
        <p className="mt-4 text-base leading-7 text-muted-ink">
          Account verification continues at checkout. Destination, promotion, referral benefit, points redemption, tax, shipping, total, and payment remain unavailable until the next commerce step.
        </p>
        <Link className="record-link mt-6 inline-block" href="/catalog">
          Continue shopping
        </Link>
      </aside>
    </div>
  );
}
