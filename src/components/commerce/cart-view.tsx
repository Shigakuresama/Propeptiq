"use client";

import { Minus, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { useCart } from "@/cart/cart-provider";
import { prepareCheckoutHandoff } from "@/cart/cart-storage";
import {
  loadPreviewPresentation,
  parsePreviewPresentation,
  savePreviewPresentation,
} from "@/cart/preview-presentation";
import {
  type CartPreview,
  type CartPreviewItem,
  type CartPreviewPurchaseState,
  canContinueFromPreview,
} from "@/cart/preview-types";
import { Button } from "@/components/ui/button";

const purchaseStateCopy: Readonly<Record<CartPreviewPurchaseState, string | null>> = {
  ready: null,
  checkout_unavailable: "Display price available. Checkout is not yet available for this variant.",
  local_preview: "Local cart preview only. No payment will be created.",
  pricing_pending: "Pricing coming soon.",
  unavailable: "This variant is unavailable.",
  insufficient_quantity: "The requested quantity is not currently available.",
  unknown_variant: "This saved variant is no longer recognized. Choose it again from the catalog.",
};

function formatMoney(amountMinor: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(amountMinor / 100);
}

function formatDiscount(effectiveDiscountBps: number): string {
  return `${effectiveDiscountBps / 100}%`;
}

function responseMatchesRequest(
  preview: CartPreview,
  requested: readonly Readonly<{ variantId: string; quantity: number }>[],
): boolean {
  return preview.items.length === requested.length &&
    preview.items.every((line, index) =>
      line.variantId === requested[index]?.variantId &&
      line.quantity === requested[index]?.quantity);
}

function unverifiedLine(
  item: Readonly<{ variantId: string; quantity: number }>,
): CartPreviewItem {
  return {
    quantity: item.quantity,
    variantId: item.variantId,
    available: false,
    purchaseState: "unknown_variant",
    name: null,
    variantLabel: null,
    sku: null,
    packageForm: null,
    baseUnitMinor: null,
    unitAmountMinor: null,
    lineSubtotalMinor: null,
    lineSavingsMinor: null,
    effectiveDiscountBps: null,
    appliedPromotions: [],
    currency: null,
  };
}

export function CartView({
  checkoutIntent,
  navigate = (url) => window.location.assign(url),
}: {
  checkoutIntent: string | null;
  navigate?: (url: string) => void;
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
        setPreviewState(null);
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
        const parsed = parsePreviewPresentation(await response.json());
        if (parsed === null || !responseMatchesRequest(parsed, items)) {
          throw new Error("Cart preview is incoherent");
        }
        return parsed;
      })
      .then((nextPreview) => {
        if (controller.signal.aborted) return;
        previousPreviewToken.current = nextPreview.previewToken;
        savePreviewPresentation(window.sessionStorage, nextPreview);
        setAcknowledgedToken((current) =>
          current === nextPreview.previewToken ? current : null,
        );
        setPreviewState({ cartKey, preview: nextPreview });
      })
      .catch((caught: unknown) => {
        if (controller.signal.aborted ||
          (caught instanceof DOMException && caught.name === "AbortError")) return;
        setPreviewState((current) => current?.cartKey === cartKey ? null : current);
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
  const canContinue = !loading && !error && preview !== null
    ? canContinueFromPreview(preview, acknowledgedToken)
    : false;
  const displayedItems: readonly CartPreviewItem[] =
    preview?.items ?? items.map(unverifiedLine);
  const hasDisplayOnlyLine = preview?.items.some(
    (item) => item.purchaseState !== "ready",
  ) ?? false;
  const hasAppliedPromotion = preview?.items.some(
    (item) => item.appliedPromotions.length > 0,
  ) ?? false;
  const hasQuantityDiscount = preview?.items.some(
    (item) => item.appliedPromotions.length === 0 &&
      (item.effectiveDiscountBps ?? 0) > 0 &&
      (item.lineSavingsMinor ?? 0) > 0,
  ) ?? false;
  const promotionSummary = preview === null
    ? error
      ? "Unavailable"
      : "Awaiting server preview"
    : hasAppliedPromotion
      ? "Included in displayed merchandise prices"
      : hasQuantityDiscount
        ? "Quantity discount included in displayed prices"
        : "No automatic promotion applied";

  function beginCheckoutHandoff() {
    const handoff = prepareCheckoutHandoff(window.localStorage, items);
    setHandoffMessage(`Saving ${handoff.itemCount} requested unit${handoff.itemCount === 1 ? "" : "s"} for checkout.`);
    navigate(handoff.returnTo);
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
          Add an exact eligible catalog variant to create a browser-saved request. Display prices
          and purchase state will be reloaded from the server.
        </p>
        <Button asChild className="action-primary mt-7">
          <Link href="/catalog">Continue to catalog</Link>
        </Button>
      </section>
    );
  }

  return (
    <div className="cart-layout">
      <section aria-labelledby="cart-items-heading" className="min-w-0">
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

        <ul className="divide-y divide-border" aria-label="Cart lines" aria-live="polite">
          {displayedItems.map((item) => {
            const verifiedIdentity = item.name !== null && item.variantLabel !== null;
            const accessibleLabel = verifiedIdentity
              ? `${item.name}, ${item.variantLabel}`
              : `Unverified saved variant: ${item.variantId}`;
            const status = preview === null ? null : purchaseStateCopy[item.purchaseState];
            const priced = item.baseUnitMinor !== null &&
              item.unitAmountMinor !== null &&
              item.lineSubtotalMinor !== null &&
              item.lineSavingsMinor !== null &&
              item.effectiveDiscountBps !== null &&
              item.currency !== null;
            const discounted = priced && item.effectiveDiscountBps > 0;
            const hasSavings = discounted && item.lineSavingsMinor > 0;
            return (
              <li className="min-w-0 py-7" key={item.variantId}>
                <div className="grid min-w-0 gap-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
                  <div className="min-w-0">
                    {verifiedIdentity ? (
                      <>
                        <h3 className="font-heading text-2xl text-ink">{item.name}</h3>
                        <dl className="mt-2 flex min-w-0 flex-wrap gap-x-4 gap-y-1 text-base text-muted-ink">
                          <div className="min-w-0">
                            <dt className="sr-only">Variant</dt>
                            <dd className="break-words">{item.variantLabel}</dd>
                          </div>
                          {item.packageForm ? (
                            <div>
                              <dt className="sr-only">Package</dt>
                              <dd>{item.packageForm}</dd>
                            </div>
                          ) : null}
                          {item.sku ? (
                            <div className="min-w-0">
                              <dt className="sr-only">SKU identifier</dt>
                              <dd className="break-all">SKU {item.sku}</dd>
                            </div>
                          ) : null}
                        </dl>
                      </>
                    ) : (
                      <p className="break-all font-semibold text-ink" aria-label={accessibleLabel}>
                        {accessibleLabel}
                      </p>
                    )}

                    {priced ? (
                      <div className="mt-4 grid gap-3 text-base tabular-nums text-ink sm:grid-cols-2">
                        {discounted ? (
                          <>
                            <p>
                              <span className="block text-xs font-semibold text-muted-ink">Standard unit price</span>
                              <del>{formatMoney(item.baseUnitMinor, item.currency)}</del>
                            </p>
                            <p>
                              <span className="block text-xs font-semibold text-muted-ink">Current unit price</span>
                              <strong>{formatMoney(item.unitAmountMinor, item.currency)}</strong>
                            </p>
                          </>
                        ) : (
                          <p>
                            <span className="block text-xs font-semibold text-muted-ink">Unit price</span>
                            <strong>{formatMoney(item.unitAmountMinor, item.currency)}</strong>
                          </p>
                        )}
                      </div>
                    ) : null}

                    {hasSavings ? (
                      <p className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-sm font-semibold text-accent-readable">
                        <span>Save {formatMoney(item.lineSavingsMinor, item.currency)}</span>
                        <span>-{formatDiscount(item.effectiveDiscountBps)}</span>
                      </p>
                    ) : null}

                    {priced ? (
                      <dl className="mt-4 grid gap-2 text-base">
                        {item.appliedPromotions.length > 0 ? (
                          <div className="flex min-w-0 flex-wrap justify-between gap-x-4 gap-y-1">
                            <dt className="text-muted-ink">Promotion</dt>
                            <dd className="min-w-0 break-words font-semibold text-ink">
                              {item.appliedPromotions.map((promotion) => promotion.label).join(", ")}
                            </dd>
                          </div>
                        ) : null}
                        <div className="flex min-w-0 flex-wrap justify-between gap-x-4 gap-y-1">
                          <dt className="text-muted-ink">Line subtotal</dt>
                          <dd className="font-semibold tabular-nums text-ink">
                            {formatMoney(item.lineSubtotalMinor, item.currency)}
                          </dd>
                        </div>
                      </dl>
                    ) : null}

                    {status ? (
                      <p className="mt-4 text-base font-semibold leading-7 text-muted-ink">
                        {status}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex min-w-0 flex-wrap items-end gap-2">
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
                          aria-label={`Decrease quantity for ${accessibleLabel}`}
                          onClick={() => setQuantity(item.variantId, item.quantity - 1)}
                        >
                          <Minus aria-hidden="true" />
                        </Button>
                        <input
                          id={`quantity-${item.variantId}`}
                          aria-label={`Quantity for ${accessibleLabel}`}
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
                          aria-label={`Increase quantity for ${accessibleLabel}`}
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
                      className="min-h-11 min-w-11"
                      aria-label={`Remove ${accessibleLabel} from cart`}
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

      <aside className="cart-summary min-w-0" aria-labelledby="cart-summary-heading">
        <p className="eyebrow">Server preview</p>
        <h2 id="cart-summary-heading" className="mt-3 font-heading text-3xl text-ink">
          Order summary
        </h2>
        <dl className="mt-7 space-y-3 border-y border-border py-5 text-base">
          <div className="flex min-w-0 flex-wrap justify-between gap-x-5 gap-y-1">
            <dt>Merchandise preview subtotal</dt>
            <dd className="tabular-nums">
              {preview?.currency
                ? formatMoney(preview.subtotalMinor, preview.currency)
                : "Unavailable"}
            </dd>
          </div>
          <div className="flex min-w-0 flex-wrap justify-between gap-x-5 gap-y-1">
            <dt>Promotion</dt>
            <dd className="text-right">{promotionSummary}</dd>
          </div>
          <div className="flex min-w-0 flex-wrap justify-between gap-x-5 gap-y-1">
            <dt>Referral benefit</dt>
            <dd>Not yet calculated</dd>
          </div>
          <div className="flex min-w-0 flex-wrap justify-between gap-x-5 gap-y-1">
            <dt>Points redemption</dt>
            <dd>Not yet calculated</dd>
          </div>
          <div className="flex min-w-0 flex-wrap justify-between gap-x-5 gap-y-1">
            <dt>Tax</dt>
            <dd>Not yet calculated</dd>
          </div>
          <div className="flex min-w-0 flex-wrap justify-between gap-x-5 gap-y-1">
            <dt>Shipping</dt>
            <dd>Not yet calculated</dd>
          </div>
          <div className="flex min-w-0 flex-wrap justify-between gap-x-5 gap-y-1 border-t border-border pt-3 font-semibold">
            <dt>Final total</dt>
            <dd>Unavailable</dd>
          </div>
        </dl>

        {hasDisplayOnlyLine ? (
          <section className="warning-record mt-6 text-base leading-7" aria-labelledby="display-preview-heading">
            <h3 id="display-preview-heading" className="font-semibold">Display-price cart preview</h3>
            <p className="mt-2">
              These server-calculated merchandise amounts are for display only. No order or payment can be submitted from this cart.
            </p>
          </section>
        ) : null}

        {preview?.reasons.includes("server_facts_changed") ? (
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

        {checkoutIntent && canContinue ? (
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
          {canContinue ? "Continue to sign in" : "Checkout unavailable"}
        </Button>
        <p className="mt-4 text-base leading-7 text-muted-ink">
          Displayed merchandise discounts are already included. Account verification, referral benefits, points redemption, tax, shipping, final total, and payment remain unavailable until a separately authorized checkout step.
        </p>
        <Link className="record-link mt-6 inline-block" href="/catalog">
          Continue shopping
        </Link>
      </aside>
    </div>
  );
}
