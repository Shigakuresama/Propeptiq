"use client";

import { CircleAlert, ScrollText } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { useCart } from "@/cart/cart-provider";
import type { CartPreview } from "@/cart/preview-types";
import { DataLabel, Notice, RecordPanel } from "@/components/design-system/archive-primitives";

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
    <section aria-labelledby="saved-request-heading">
      <RecordPanel className="p-5 sm:p-6">
      <div className="flex items-center gap-3">
        <div className="grid size-10 place-items-center rounded-full border border-moss/25 bg-moss-soft text-accent-readable">
          <ScrollText aria-hidden="true" className="size-4" />
        </div>
        <div>
          <DataLabel>Browser-saved request</DataLabel>
          <h2 id="saved-request-heading" className="mt-2 font-heading text-3xl">{quantity} requested unit{quantity === 1 ? "" : "s"}</h2>
        </div>
      </div>
      {previewError ? (
        <Notice className="mt-5" icon={CircleAlert} tone="danger" title="Server preview unavailable">
          The authoritative product preview is unavailable. Browser request identifiers below are not verified product facts.
        </Notice>
      ) : null}
      {items.length > 0 ? (
        <ul className="mt-6 grid gap-3 p-0" aria-label="Saved cart lines">
          {items.map((item) => {
            const verified = preview?.items.find(
              (candidate) => candidate.productId === item.productId,
            );
            return (
              <li key={item.productId} className="flex min-w-0 justify-between gap-4 border-b border-border pb-3">
                <span className="min-w-0 break-all font-medium">
                  {verified?.name ?? item.productId}
                  {!verified ? (
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
      </RecordPanel>
    </section>
  );
}
