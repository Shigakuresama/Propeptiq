import type { CatalogSource, PublicPrice } from "@/catalog/types";
import { calculateEarnedPoints, type LoyaltyPolicy } from "@/domain/rewards";

export function EarnPoints({
  loyaltyPolicy,
  price,
  source,
}: Readonly<{
  loyaltyPolicy: LoyaltyPolicy | null;
  price: PublicPrice;
  source: CatalogSource;
}>) {
  if (
    source !== "production" ||
    price.currency !== "USD" ||
    loyaltyPolicy?.status !== "active"
  ) {
    return null;
  }

  const result = calculateEarnedPoints({
    policy: loyaltyPolicy,
    merchandiseSubtotalMinor: price.amountMinor,
    promotionDiscountMinor: 0,
    referralDiscountMinor: 0,
    redeemedPoints: 0,
    taxMinor: 0,
    shippingMinor: 0,
  });
  if (!result.ok || result.value.earnedPoints <= 0) return null;

  return (
    <p className="mt-3 text-base font-semibold tabular-nums text-moss">
      Earn {result.value.earnedPoints.toLocaleString("en-US")} points
    </p>
  );
}
