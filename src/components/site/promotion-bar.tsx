"use client";

import { useRef, useState } from "react";

import type { Winter30PromotionView } from "@/catalog/storefront-promotion-banner";

type CopyState = "idle" | "copied" | "unavailable";

export function PromotionBar({
  promotion,
}: {
  promotion: Winter30PromotionView | null;
}) {
  const [copyState, setCopyState] = useState<CopyState>("idle");
  const latestCopyAttempt = useRef(0);

  if (promotion === null) return null;

  const copyPromotionCode = async (): Promise<void> => {
    const attempt = latestCopyAttempt.current + 1;
    latestCopyAttempt.current = attempt;
    try {
      if (typeof navigator.clipboard?.writeText !== "function") {
        throw new Error("Clipboard unavailable");
      }
      await navigator.clipboard.writeText(promotion.code);
      if (attempt === latestCopyAttempt.current) setCopyState("copied");
    } catch {
      if (attempt === latestCopyAttempt.current) setCopyState("unavailable");
    }
  };

  const status = copyState === "copied"
    ? `${promotion.code} copied`
    : copyState === "unavailable"
      ? `${promotion.code} could not be copied.`
      : "";

  return (
    <aside
      aria-label="Promotion"
      className="grid min-h-24 grid-cols-[auto_minmax(0,1fr)_auto] items-center justify-center gap-2 bg-promotion px-3 py-1 text-center text-sm font-semibold leading-6 text-promotion-foreground sm:min-h-0 sm:grid-cols-[auto_auto_auto] sm:gap-4 sm:px-4 sm:py-2"
    >
      <span aria-hidden="true" className="text-base">❄</span>
      <p className="min-w-0 [overflow-wrap:anywhere]">
        {promotion.displayName.toUpperCase()}: {promotion.percentage}% OFF
        {" "}SITEWIDE — USE CODE {promotion.code}
      </p>
      <button
        type="button"
        aria-label={`${copyState === "copied" ? "Copied" : "Copy"} promotion code ${promotion.code}`}
        className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border border-promotion-foreground/70 px-2 py-1 font-semibold text-promotion-foreground transition-colors duration-200 hover:bg-promotion-foreground/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-promotion-foreground focus-visible:ring-offset-2 focus-visible:ring-offset-promotion sm:px-3"
        onClick={copyPromotionCode}
      >
        {copyState === "copied" ? "Copied" : "Copy"}
      </button>
      <p role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {status}
      </p>
    </aside>
  );
}
