"use client";

import type { ReactNode } from "react";

export const PUBLIC_PURCHASE_SLOT_ID = "public-mobile-purchase-slot";

/** Search stays in header flow; the independent purchase slot stays outside main. */
export function PublicActionDock({ children }: { children: ReactNode }) {
  return (
    <div className="public-action-dock">
      <div className="public-action-dock__purchase-slot" id={PUBLIC_PURCHASE_SLOT_ID} />
      {children}
    </div>
  );
}
