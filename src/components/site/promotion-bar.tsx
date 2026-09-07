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
      className="promotion-banner bg-promotion px-4 py-5 text-center text-promotion-foreground sm:py-6"
    >
      <p className="promotion-banner__title">
        {promotion.displayName.toUpperCase()}: {promotion.percentage}% OFF
        {" "}SITEWIDE
      </p>
      <div className="promotion-code-pill mx-auto mt-3 flex w-fit max-w-full flex-wrap items-center justify-center gap-x-4 gap-y-1">
      <p className="text-sm font-semibold tracking-[0.08em]">{promotion.code}{" "}<span className="block text-[0.65rem] tracking-wider">APPLIED AUTOMATICALLY</span></p>
      <button
        type="button"
        aria-label={`${copyState === "copied" ? "Copied" : "Copy"} promotion code ${promotion.code}`}
        className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border border-promotion-foreground/70 px-2 py-1 font-semibold text-promotion-foreground transition-colors duration-200 hover:bg-promotion-foreground/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-promotion-foreground focus-visible:ring-offset-2 focus-visible:ring-offset-promotion sm:px-3"
        onClick={copyPromotionCode}
      >
        {copyState === "copied" ? "Copied" : "Copy"}
      </button>
      </div>
      <p role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {status}
      </p>
    </aside>
  );
}
