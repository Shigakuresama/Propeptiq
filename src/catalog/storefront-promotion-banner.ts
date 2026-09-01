import type { PublicStorefrontAutomaticPromotion } from "./storefront-price-presentation";

export type Winter30PromotionView = Readonly<{
  id: "winter30";
  code: "WINTER30";
  percentage: 30;
}>;

const winter30PromotionView: Winter30PromotionView = Object.freeze({
  id: "winter30",
  code: "WINTER30",
  percentage: 30,
});

function isRuntimeObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

export function selectWinter30PromotionView(
  promotions: readonly PublicStorefrontAutomaticPromotion[],
): Winter30PromotionView | null {
  if (!Array.isArray(promotions)) return null;

  const matches = promotions.filter(
    (promotion) => isRuntimeObject(promotion) && promotion.id === "winter30",
  );
  if (matches.length !== 1) return null;

  const campaign = matches[0]!;
  if (
    campaign.displayName !== "Winter Sale" ||
    campaign.displayCode !== "WINTER30" ||
    campaign.discountBps !== 3_000 ||
    campaign.enabled !== true ||
    campaign.applicationMode !== "automatic" ||
    !isRuntimeObject(campaign.scope) ||
    campaign.scope.kind !== "sitewide"
  ) {
    return null;
  }

  return winter30PromotionView;
}
