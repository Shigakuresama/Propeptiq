"use client";

import { useState } from "react";

import type { Winter30PromotionView } from "@/catalog/storefront-promotion-banner";

type CopyState = "idle" | "copied" | "unavailable";

export function PromotionBar({
  promotion,
}: {
  promotion: Winter30PromotionView | null;
}) {
  const [copyState, setCopyState] = useState<CopyState>("idle");

  if (promotion === null) return null;

  const copyPromotionCode = async (): Promise<void> => {
    try {
      if (typeof navigator.clipboard?.writeText !== "function") {
        throw new Error("Clipboard unavailable");
      }
      await navigator.clipboard.writeText("WINTER30");
      setCopyState("copied");
    } catch {
      setCopyState("unavailable");
    }
  };

  const status = copyState === "copied"
    ? "WINTER30 copied"
    : copyState === "unavailable"
      ? "WINTER30 could not be copied."
      : "";

  return (
    <aside
      aria-label="Promotion"
      className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 bg-promotion px-4 py-2 text-center text-sm font-semibold leading-6 text-promotion-foreground"
    >
      <span aria-hidden="true" className="text-base">❄</span>
      <p>WINTER SALE: 30% OFF SITEWIDE — USE CODE WINTER30</p>
      <button
        type="button"
        aria-label="Copy promotion code WINTER30"
        className="inline-flex min-h-11 items-center justify-center rounded-md border border-promotion-foreground/70 px-4 py-2 font-semibold text-promotion-foreground transition-colors duration-200 hover:bg-promotion-foreground/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-promotion-foreground focus-visible:ring-offset-2 focus-visible:ring-offset-promotion"
        onClick={copyPromotionCode}
      >
        Copy WINTER30
      </button>
      <p role="status" aria-live="polite" aria-atomic="true" className="text-center">
        {status}
      </p>
    </aside>
  );
}
