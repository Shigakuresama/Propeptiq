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
      className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 bg-promotion px-4 py-2 text-center text-sm font-semibold leading-6 text-promotion-foreground"
    >
      <span aria-hidden="true" className="text-base">❄</span>
      <p>
        {promotion.displayName.toUpperCase()}: {promotion.percentage}% OFF
        {" "}SITEWIDE — USE CODE {promotion.code}
      </p>
      <button
        type="button"
        aria-label={`Copy promotion code ${promotion.code}`}
        className="inline-flex min-h-11 items-center justify-center rounded-md border border-promotion-foreground/70 px-4 py-2 font-semibold text-promotion-foreground transition-colors duration-200 hover:bg-promotion-foreground/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-promotion-foreground focus-visible:ring-offset-2 focus-visible:ring-offset-promotion"
        onClick={copyPromotionCode}
      >
        Copy {promotion.code}
      </button>
      <p role="status" aria-live="polite" aria-atomic="true" className="text-center">
        {status}
      </p>
    </aside>
  );
}
