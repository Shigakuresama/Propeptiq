import {
  storefrontPromotionMatchesOwnerConfiguration,
  WINTER30_STOREFRONT_PROMOTION,
} from "@/config/storefront-promotions";

export type Winter30PromotionView = Readonly<{
  id: "winter30";
  displayName: string;
  code: string;
  percentage: number;
}>;

const winter30PromotionView: Winter30PromotionView = Object.freeze({
  id: WINTER30_STOREFRONT_PROMOTION.id,
  displayName: WINTER30_STOREFRONT_PROMOTION.displayName,
  code: WINTER30_STOREFRONT_PROMOTION.displayCode,
  percentage: WINTER30_STOREFRONT_PROMOTION.discountBps / 100,
});

function isRuntimeObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

export function selectWinter30PromotionView(
  promotions: unknown,
): Winter30PromotionView | null {
  try {
    if (!Array.isArray(promotions)) return null;
    const matches: Record<string, unknown>[] = [];
    for (let index = 0; index < promotions.length; index += 1) {
      if (!Object.hasOwn(promotions, index)) return null;
      const promotion = promotions[index];
      if (isRuntimeObject(promotion) && promotion.id === "winter30") {
        matches.push(promotion);
      }
    }
    if (matches.length !== 1) return null;
    if (!storefrontPromotionMatchesOwnerConfiguration(matches[0])) return null;
    return winter30PromotionView;
  } catch {
    return null;
  }
}
