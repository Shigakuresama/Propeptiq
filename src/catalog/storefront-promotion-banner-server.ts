import "server-only";

import { connection } from "next/server";

import {
  resolveActiveConfiguredAutomaticPromotions,
  STOREFRONT_PROMOTIONS,
} from "@/config/storefront-promotions";

import {
  selectWinter30PromotionView,
  type Winter30PromotionView,
} from "./storefront-promotion-banner";

export const STOREFRONT_PROMOTION_UNAVAILABLE =
  "STOREFRONT_PROMOTION_UNAVAILABLE" as const;

export type PromotionBannerServerDependencies = Readonly<{
  connect?: () => Promise<unknown>;
  loadConfiguredPromotions?: () => unknown | Promise<unknown>;
  now?: () => Date;
  reportUnavailable?: (
    diagnostic: typeof STOREFRONT_PROMOTION_UNAVAILABLE,
  ) => void;
}>;

function reportPromotionUnavailable(
  diagnostic: typeof STOREFRONT_PROMOTION_UNAVAILABLE,
): void {
  console.warn(diagnostic);
}

function unavailable(
  reportUnavailable: (
    diagnostic: typeof STOREFRONT_PROMOTION_UNAVAILABLE,
  ) => void,
): null {
  try {
    reportUnavailable(STOREFRONT_PROMOTION_UNAVAILABLE);
  } catch {
    // A diagnostic failure must not take public information pages down.
  }
  return null;
}

export async function getStorefrontPromotionBannerView(
  dependencies: PromotionBannerServerDependencies = {},
): Promise<Winter30PromotionView | null> {
  const reportUnavailable =
    dependencies.reportUnavailable ?? reportPromotionUnavailable;
  try {
    await (dependencies.connect ?? connection)();
  } catch {
    return unavailable(reportUnavailable);
  }
  const loadConfiguredPromotions =
    dependencies.loadConfiguredPromotions ?? (() => STOREFRONT_PROMOTIONS);
  const now = dependencies.now ?? (() => new Date());
  const [loaded, evaluatedAt] = await Promise.allSettled([
    Promise.resolve().then(loadConfiguredPromotions),
    Promise.resolve().then(now),
  ]);
  if (loaded.status === "rejected" || evaluatedAt.status === "rejected") {
    return unavailable(reportUnavailable);
  }
  const active = resolveActiveConfiguredAutomaticPromotions(
    loaded.value,
    evaluatedAt.value,
  );
  if (active === null) return unavailable(reportUnavailable);
  return selectWinter30PromotionView(active);
}
