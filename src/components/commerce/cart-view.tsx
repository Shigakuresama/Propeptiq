"use client";

import { AlertTriangle, CircleAlert, Minus, Plus, ShoppingBag, Trash2 } from "lucide-react";
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
import { DataLabel, EmptyState, Notice, RecordPanel } from "@/components/design-system/archive-primitives";
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
    setQuantity,
    removeItem,
    clearCart,
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
      ...item,
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

  if (items.length === 0) {
    return (
      <EmptyState
        description={(
          <>
          Add an active catalog record to create a local request. Prices and availability
          will be reloaded from the server.
          </>
        )}
        eyebrow="Saved request"
        icon={ShoppingBag}
        title="Your cart is empty."
        action={(
          <Button asChild className="action-primary">
            <Link href="/catalog">Continue to catalog</Link>
          </Button>
        )}
      />
    );
  }

  return (
    <div className="cart-layout">
      <section aria-labelledby="cart-items-heading">
        <RecordPanel className="overflow-hidden">
          <div className="flex flex-wrap items-end justify-between gap-4 border-b border-border p-5 sm:p-6">
            <div>
              <DataLabel>Local cart</DataLabel>
              <h2 id="cart-items-heading" className="mt-2 font-heading text-3xl text-ink">
                Requested records
              </h2>
            </div>
            <Button type="button" variant="ghost" className="min-h-11" onClick={clearCart}>
              Clear cart
            </Button>
          </div>

        {error ? (
          <Notice className="mx-5 mt-5 text-base sm:mx-6" icon={CircleAlert} tone="danger" title="Server preview unavailable">
            <p>The authoritative cart preview is unavailable. Retry before continuing.</p>
            <Button
              type="button"
              variant="outline"
              className="mt-4 min-h-11"
              onClick={() => setPreviewReload((current) => current + 1)}
            >
              Retry current cart facts
            </Button>
          </Notice>
        ) : null}
        {loading ? (
          <div className="cart-loading mx-5 mt-5 sm:mx-6" aria-label="Refreshing authoritative cart preview" />
        ) : null}

        <ul className="divide-y divide-border px-5 sm:px-6" aria-live="polite">
          {displayedItems.map((item) => {
            const label = item.name ?? item.productId;
            return (
              <li className="py-6" key={item.productId}>
                <div className="grid gap-5 sm:grid-cols-[1fr_auto] sm:items-start">
                  <div className="min-w-0">
                    <DataLabel>Catalog record</DataLabel>
                    <div className="mt-2 flex min-w-0 flex-wrap items-center gap-3">
                      <p className="min-w-0 break-words font-heading text-2xl text-ink">{label}</p>
                      {!loading && preview ? (
                        <span className="status-pill">
                          {item.available ? "Server confirmed" : "Unavailable"}
                        </span>
                      ) : !loading ? (
                        <span className="status-pill">Not verified</span>
                      ) : null}
                    </div>
                    {item.packageForm ? (
                      <p className="mt-2 text-base text-muted-ink">{item.packageForm}</p>
                    ) : null}
                    {!loading && preview && !item.available ? (
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
                        htmlFor={`quantity-${item.productId}`}
                      >
                        Quantity
                      </label>
                      <div className="quantity-control">
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          aria-label={`Decrease quantity for ${label}`}
                          onClick={() => setQuantity(item.productId, item.quantity - 1)}
                        >
                          <Minus aria-hidden="true" />
                        </Button>
                        <input
                          id={`quantity-${item.productId}`}
                          aria-label={`Quantity for ${label}`}
                          inputMode="numeric"
                          min="1"
                          max="25"
                          type="number"
                          value={item.quantity}
                          onChange={(event) => {
                            const quantity = event.currentTarget.valueAsNumber;
                            if (Number.isFinite(quantity)) {
                              setQuantity(item.productId, quantity);
                            }
                          }}
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          aria-label={`Increase quantity for ${label}`}
                          onClick={() => setQuantity(item.productId, item.quantity + 1)}
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
                      onClick={() => removeItem(item.productId)}
                    >
                      <Trash2 aria-hidden="true" />
                    </Button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
        </RecordPanel>
      </section>

      <aside className="cart-summary" aria-labelledby="cart-summary-heading">
        <DataLabel>Server preview</DataLabel>
        <h2 id="cart-summary-heading" className="mt-3 font-heading text-3xl text-ink">
          Order summary
        </h2>
        <dl className="mt-7 divide-y divide-border border-y border-border text-base">
          <div className="flex justify-between gap-5 py-3">
            <dt>Merchandise subtotal</dt>
            <dd className="text-right font-semibold tabular-nums">
              {preview?.currency
                ? formatMoney(preview.subtotalMinor, preview.currency)
                : "Unavailable"}
            </dd>
          </div>
          <div className="flex justify-between gap-5 py-3">
            <dt>Promotion</dt>
            <dd className="text-right">Calculated at checkout</dd>
          </div>
          <div className="flex justify-between gap-5 py-3">
            <dt>Referral benefit</dt>
            <dd className="text-right">Available after checkout quote</dd>
          </div>
          <div className="flex justify-between gap-5 py-3">
            <dt>Points redemption</dt>
            <dd className="text-right">Available after checkout quote</dd>
          </div>
          <div className="flex justify-between gap-5 py-3">
            <dt>Tax</dt>
            <dd className="text-right">Not yet calculated</dd>
          </div>
          <div className="flex justify-between gap-5 py-3">
            <dt>Shipping</dt>
            <dd className="text-right">Not yet calculated</dd>
          </div>
          <div className="flex justify-between gap-5 py-4 font-semibold">
            <dt>Total</dt>
            <dd className="text-right">Available after checkout quote</dd>
          </div>
        </dl>

        {preview?.requiresAcknowledgement ? (
          <Notice className="mt-6" icon={AlertTriangle} tone="warning" title="Cart facts changed or became unavailable">
            <p>
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
          </Notice>
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
