import "server-only";

import { getPublicStorefrontView } from "@/catalog/storefront-public-server";

import {
  selectWinter30PromotionView,
  type Winter30PromotionView,
} from "./storefront-promotion-banner";
import type { PublicStorefrontAutomaticPromotion } from "./storefront-price-presentation";

export const STOREFRONT_PROMOTION_UNAVAILABLE =
  "STOREFRONT_PROMOTION_UNAVAILABLE" as const;

export type PromotionBannerServerDependencies = Readonly<{
  loadView?: () => Promise<unknown>;
  reportUnavailable?: (
    diagnostic: typeof STOREFRONT_PROMOTION_UNAVAILABLE,
  ) => void;
}>;

function reportPromotionUnavailable(
  diagnostic: typeof STOREFRONT_PROMOTION_UNAVAILABLE,
): void {
  console.warn(diagnostic);
}

function isRuntimeObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export async function getStorefrontPromotionBannerView(
  dependencies: PromotionBannerServerDependencies = {},
): Promise<Winter30PromotionView | null> {
  try {
    const view = await (dependencies.loadView ?? getPublicStorefrontView)();
    if (!isRuntimeObject(view) || !isRuntimeObject(view.pricing)) {
      throw new Error("Unavailable storefront promotion projection");
    }
    const promotions = view.pricing.automaticPromotions;
    if (!Array.isArray(promotions)) {
      throw new Error("Unavailable storefront promotion projection");
    }
    return selectWinter30PromotionView(
      promotions as readonly PublicStorefrontAutomaticPromotion[],
    );
  } catch {
    try {
      (dependencies.reportUnavailable ?? reportPromotionUnavailable)(
        STOREFRONT_PROMOTION_UNAVAILABLE,
      );
    } catch {
      // A diagnostic failure must not take public information pages down.
    }
    return null;
  }
}
