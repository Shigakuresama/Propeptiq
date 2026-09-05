"use client";

import type { ReactNode } from "react";

export const PUBLIC_PURCHASE_SLOT_ID = "public-mobile-purchase-slot";

/** A shared outside-main mount keeps purchase controls out of page transforms. */
export function PublicActionDock({ children }: { children: ReactNode }) {
  return (
    <div className="site-search-launcher-lane public-action-dock">
      <div className="public-action-dock__purchase-slot" id={PUBLIC_PURCHASE_SLOT_ID} />
      {children}
    </div>
  );
}
