"use client";

import { useRef, useState } from "react";
import { Check, Copy } from "lucide-react";

import type { Winter30PromotionView } from "@/catalog/storefront-promotion-banner";

type CopyState = "idle" | "copying" | "copied" | "unavailable";

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
    setCopyState("copying");
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

  const status = copyState === "copying"
    ? `Copying ${promotion.code}…`
    : copyState === "copied"
    ? `${promotion.code} copied`
    : copyState === "unavailable"
      ? `${promotion.code} could not be copied.`
      : "";

  return (
    <aside
      aria-label="Promotion"
      className="promotion-banner bg-promotion px-4 py-2 text-center text-promotion-foreground"
    >
      <div className="promotion-banner__molecules" aria-hidden="true">
        <svg className="promotion-banner__molecule promotion-banner__molecule--first" focusable="false" viewBox="0 0 180 100" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="m38 59 18-28 33 5 16 29-20 23-31-4Z M89 36l26-20 28 12m-38 37 33 8 19-22" />
          <circle cx="56" cy="31" r="3" /><circle cx="105" cy="65" r="4" /><circle cx="143" cy="28" r="3" />
        </svg>
        <svg className="promotion-banner__molecule promotion-banner__molecule--second" focusable="false" viewBox="800 0 180 100" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="m818 32 27 15 27-17 28 16 27-17 33 17m-115 1v26m55-27v27m-73-42 13-18" />
          <circle cx="818" cy="32" r="3" /><circle cx="872" cy="30" r="4" /><circle cx="927" cy="29" r="3" /><circle cx="900" cy="73" r="3" />
        </svg>
      </div>
      <p className="promotion-banner__title">
        {promotion.displayName.toUpperCase()}: {promotion.percentage}% OFF
        {" "}SITEWIDE
      </p>
      <div className="promotion-banner__code-row mx-auto mt-1 flex w-fit max-w-full flex-wrap items-center justify-center gap-x-2 gap-y-0">
      <p className="promotion-code-pill text-sm font-semibold tracking-[0.08em]">{promotion.code}</p>
      <button
        type="button"
        aria-busy={copyState === "copying"}
        aria-label={`${copyState === "copied" ? "Copied" : "Copy"} promotion code ${promotion.code}`}
        className="promotion-banner__copy inline-flex min-h-11 min-w-11 items-center justify-center rounded-md px-2 py-1 text-promotion-foreground transition-colors duration-200 hover:bg-promotion-foreground/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-promotion-foreground focus-visible:ring-offset-2 focus-visible:ring-offset-promotion"
        onClick={copyPromotionCode}
      >
        {copyState === "copied" ? <Check aria-hidden="true" className="size-4" /> : <Copy aria-hidden="true" className="size-4" />}
      </button>
      <p className="promotion-banner__automatic text-[0.65rem] font-semibold tracking-wider">APPLIED AUTOMATICALLY</p>
      </div>
      <p role="status" aria-live="polite" aria-atomic="true" className="promotion-banner__copy-status">
        {status}
      </p>
    </aside>
  );
}
