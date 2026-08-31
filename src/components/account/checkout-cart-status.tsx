"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { useCart } from "@/cart/cart-provider";
import type { CartPreview } from "@/cart/preview-types";

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
      body: `{"items":${requestKey},"previousPreviewToken":null}`,
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Authoritative preview unavailable");
        return (await response.json()) as CartPreview;
      })
      .then((result) => {
        setPreviewState({ key: requestKey, preview: result, error: false });
      })
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setPreviewState({ key: requestKey, preview: null, error: true });
        }
      });
    return () => controller.abort();
  }, [hydrated, requestKey, items.length]);
  if (!hydrated) return <div className="cart-loading" aria-label="Loading saved cart" />;
  const preview = previewState.key === requestKey ? previewState.preview : null;
  const previewError = previewState.key === requestKey && previewState.error;
  const quantity = items.reduce((sum, item) => sum + item.quantity, 0);
  return (
    <section className="record-card" aria-labelledby="saved-request-heading">
      <p className="eyebrow">Browser-saved request</p>
      <h2 id="saved-request-heading" className="mt-3 font-heading text-3xl">{quantity} requested unit{quantity === 1 ? "" : "s"}</h2>
      {previewError ? (
        <p className="error-record mt-5" role="alert">
          The authoritative variant preview is unavailable. Browser request identifiers below are not verified variant facts.
        </p>
      ) : null}
      {items.length > 0 ? (
        <ul className="mt-6 grid gap-3 p-0" aria-label="Saved cart lines">
          {items.map((item) => {
            const verified = preview?.items.find(
              (candidate) => candidate.variantId === item.variantId,
            );
            return (
              <li key={item.variantId} className="flex min-w-0 justify-between gap-4 border-b border-border pb-3">
                <span className="min-w-0 break-all font-medium">
                  {verified?.name ?? item.variantId}
                  {verified?.available !== true ? (
                    <span className="mt-1 block text-sm font-normal text-muted-ink">
                      {preview
                        ? "Unavailable in the current authoritative catalog preview"
                        : "Awaiting server verification"}
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
      <Link href="/cart" className="record-link mt-6 inline-flex min-h-11 items-center">Review cart details</Link>
    </section>
  );
}
