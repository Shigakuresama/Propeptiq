"use client";

import { CircleAlert, ScrollText } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { useCart } from "@/cart/cart-provider";
import { parsePreviewPresentation } from "@/cart/preview-presentation";
import type {
  CartPreview,
  CartPreviewPurchaseState,
} from "@/cart/preview-types";
import { DataLabel, Notice, RecordPanel } from "@/components/design-system/archive-primitives";

const purchaseStateCopy: Readonly<Record<CartPreviewPurchaseState, string | null>> = {
  ready: null,
  checkout_unavailable: "Display price available. Checkout is not yet available for this variant.",
  local_preview: "Local cart preview only. No payment will be created.",
  pricing_pending: "Pricing coming soon.",
  unavailable: "This variant is unavailable.",
  insufficient_quantity: "The requested quantity is not currently available.",
  unknown_variant: "This saved variant is no longer recognized. Choose it again from the catalog.",
};

function responseMatchesRequest(
  preview: CartPreview,
  requested: readonly Readonly<{ variantId: string; quantity: number }>[],
): boolean {
  return preview.items.length === requested.length &&
    preview.items.every((line, index) =>
      line.variantId === requested[index]?.variantId &&
      line.quantity === requested[index]?.quantity);
}

export function CheckoutCartStatus() {
  const { items, hydrated } = useCart();
  const requestKey = JSON.stringify(items);
  const [previewState, setPreviewState] = useState<Readonly<{
    key: string;
    preview: CartPreview | null;
    error: boolean;
  }>>({ key: "", preview: null, error: false });

  useEffect(() => {
    if (!hydrated || items.length === 0) return;
    const controller = new AbortController();
    void fetch("/api/catalog/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items, previousPreviewToken: null }),
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Authoritative preview unavailable");
        const parsed = parsePreviewPresentation(await response.json());
        if (parsed === null || !responseMatchesRequest(parsed, items)) {
          throw new Error("Authoritative preview is incoherent");
        }
        return parsed;
      })
      .then((result) => {
        if (controller.signal.aborted) return;
        setPreviewState({ key: requestKey, preview: result, error: false });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted ||
          (error instanceof DOMException && error.name === "AbortError")) return;
        setPreviewState({ key: requestKey, preview: null, error: true });
      });
    return () => controller.abort();
  }, [hydrated, items, requestKey]);

  if (!hydrated) return <div className="cart-loading" aria-label="Loading saved cart" />;
  const preview = previewState.key === requestKey ? previewState.preview : null;
  const previewError = previewState.key === requestKey && previewState.error;
  const quantity = items.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <section aria-labelledby="saved-request-heading">
      <RecordPanel className="p-5 sm:p-6">
        <div className="flex items-center gap-3">
          <div className="grid size-10 place-items-center rounded-full border border-moss/25 bg-moss-soft text-accent-readable">
            <ScrollText aria-hidden="true" className="size-4" />
          </div>
          <div>
            <DataLabel>Browser-saved request</DataLabel>
            <h2 id="saved-request-heading" className="mt-2 font-heading text-3xl">
              {quantity} requested unit{quantity === 1 ? "" : "s"}
            </h2>
          </div>
        </div>
        {items.length > 0 && preview === null && !previewError ? (
          <p className="mt-5 text-base leading-7 text-muted-ink" role="status">
            Awaiting server verification.
          </p>
        ) : null}
        {previewError ? (
          <Notice className="mt-5" icon={CircleAlert} tone="danger" title="Server preview unavailable">
            The authoritative variant preview is unavailable. Browser request identifiers below are not verified variant facts.
          </Notice>
        ) : null}
        {items.length > 0 ? (
          <ul className="mt-6 grid gap-3 p-0" aria-label="Saved cart lines">
            {items.map((item, index) => {
              const verified = preview?.items[index] ?? null;
              const verifiedIdentity = verified?.name !== null &&
                verified?.name !== undefined &&
                verified.variantLabel !== null;
              const fallback = `Unverified saved variant: ${item.variantId}`;
              const status = verified === null
                ? null
                : purchaseStateCopy[verified.purchaseState];
              return (
                <li
                  key={item.variantId}
                  className="flex min-w-0 items-start justify-between gap-4 border-b border-border pb-3"
                >
                  <span className="min-w-0 font-medium">
                    {verifiedIdentity ? (
                      <>
                        <span className="block break-words">{verified.name}</span>
                        <span className="mt-1 block break-words text-sm font-normal text-muted-ink">
                          {verified.variantLabel}
                        </span>
                      </>
                    ) : (
                      <span className="block break-all" aria-label={fallback}>{fallback}</span>
                    )}
                    {status ? (
                      <span className="mt-2 block text-sm font-normal leading-6 text-muted-ink">
                        {status}
                      </span>
                    ) : null}
                  </span>
                  <span className="shrink-0 tabular-nums">× {item.quantity}</span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mt-5 text-base leading-7 text-muted-ink">No request is saved in this browser.</p>
        )}
        <Link href="/cart" className="record-link mt-6 inline-flex min-h-11 items-center">
          Review cart details
        </Link>
      </RecordPanel>
    </section>
  );
}
