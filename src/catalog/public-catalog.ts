import { z } from "zod";

import type {
  CatalogProductRecord,
  CatalogPromotionRecord,
  CatalogRecordSet,
  PublicCatalog,
  PublicMerchandising,
  PublicProduct,
  PublicProofNode,
} from "./types";

const discountConfiguration = z.object({}).strict();
const bundleConfiguration = z
  .object({
    productIds: z.array(z.string().min(1)).min(2),
  })
  .strict();
const subscriptionConfiguration = z
  .object({
    interval: z.enum(["month", "year"]),
    intervalCount: z.number().int().positive().max(12),
  })
  .strict();
const loyaltyConfiguration = z
  .object({ pointsPerDollar: z.number().int().positive().max(100) })
  .strict();
const crossSellConfiguration = z
  .object({ productIds: z.array(z.string().min(1)).min(1) })
  .strict();

function formatMoney(amountMinor: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(amountMinor / 100);
}

function projectPromotion(
  promotion: CatalogPromotionRecord,
): PublicMerchandising | null {
  switch (promotion.kind) {
    case "discount": {
      const configuration = discountConfiguration.safeParse(
        promotion.configuration,
      );
      const percentageIsValid =
        promotion.amountMinor === null &&
        promotion.currency === null &&
        Number.isInteger(promotion.basisPoints) &&
        promotion.basisPoints !== null &&
        promotion.basisPoints >= 1 &&
        promotion.basisPoints <= 10_000;
      const amountIsValid =
        promotion.basisPoints === null &&
        Number.isSafeInteger(promotion.amountMinor) &&
        promotion.amountMinor !== null &&
        promotion.amountMinor > 0 &&
        typeof promotion.currency === "string" &&
        /^[A-Z]{3}$/.test(promotion.currency);
      if (!configuration.success || (!percentageIsValid && !amountIsValid)) {
        return null;
      }
      return {
        id: promotion.id,
        kind: promotion.kind,
        name: promotion.name,
        summary: percentageIsValid
          ? `${promotion.basisPoints! / 100}% display offer. Final discount is recalculated at checkout.`
          : `${formatMoney(promotion.amountMinor!, promotion.currency!)} display offer. Final discount is recalculated at checkout.`,
      };
    }
    case "bundle": {
      const configuration = bundleConfiguration.safeParse(
        promotion.configuration,
      );
      if (
        !configuration.success ||
        !Number.isSafeInteger(promotion.amountMinor) ||
        promotion.amountMinor === null ||
        promotion.amountMinor <= 0 ||
        promotion.basisPoints !== null ||
        typeof promotion.currency !== "string" ||
        !/^[A-Z]{3}$/.test(promotion.currency)
      ) {
        return null;
      }
      return {
        id: promotion.id,
        kind: promotion.kind,
        name: promotion.name,
        summary: `${configuration.data.productIds.length}-record bundle display at ${formatMoney(promotion.amountMinor, promotion.currency)}. Enrollment is not active.`,
      };
    }
    case "subscription": {
      const configuration = subscriptionConfiguration.safeParse(
        promotion.configuration,
      );
      if (
        !configuration.success ||
        promotion.amountMinor !== null ||
        promotion.basisPoints !== null ||
        promotion.currency !== null
      ) return null;
      return {
        id: promotion.id,
        kind: promotion.kind,
        name: promotion.name,
        summary: `Every ${configuration.data.intervalCount} ${configuration.data.interval}${configuration.data.intervalCount === 1 ? "" : "s"} display option. Enrollment is not active.`,
      };
    }
    case "loyalty": {
      const configuration = loyaltyConfiguration.safeParse(
        promotion.configuration,
      );
      if (
        !configuration.success ||
        promotion.amountMinor !== null ||
        promotion.basisPoints !== null ||
        promotion.currency !== null
      ) return null;
      return {
        id: promotion.id,
        kind: promotion.kind,
        name: promotion.name,
        summary: `${configuration.data.pointsPerDollar} display points per dollar. Loyalty accounting is not active.`,
      };
    }
    case "cross_sell": {
      const configuration = crossSellConfiguration.safeParse(
        promotion.configuration,
      );
      if (
        !configuration.success ||
        promotion.amountMinor !== null ||
        promotion.basisPoints !== null ||
        promotion.currency !== null
      ) return null;
      return {
        id: promotion.id,
        kind: promotion.kind,
        name: promotion.name,
        summary: "Related public catalog records are projected below when available.",
      };
    }
  }
}

function isPromotionCurrent(
  promotion: CatalogPromotionRecord,
  now: Date,
): boolean {
  if (promotion.status !== "active") return false;
  const timestamp = now.getTime();
  if (promotion.startsAt && new Date(promotion.startsAt).getTime() > timestamp) {
    return false;
  }
  if (promotion.endsAt && new Date(promotion.endsAt).getTime() <= timestamp) {
    return false;
  }
  return true;
}

function targetApplies(
  records: CatalogRecordSet,
  promotionId: string,
  product: CatalogProductRecord,
): boolean {
  return records.promotionTargets.some(
    (target) =>
      target.promotionId === promotionId &&
      ((target.targetKind === "product" && target.productId === product.id) ||
        (target.targetKind === "policy_group" &&
          target.policyGroupId === product.policyGroupId)),
  );
}

export function buildPublicCatalog(
  records: CatalogRecordSet,
  options: { now?: Date } = {},
): PublicCatalog {
  const now = options.now ?? new Date();
  const activeProducts = records.products.filter(
    (product) => product.status === "active",
  );
  const activeProductIds = new Set(activeProducts.map((product) => product.id));
  const releasedLots = records.lots.filter(
    (lot) => {
      const manufacturedAt = lot.manufacturedAt
        ? new Date(lot.manufacturedAt).getTime()
        : null;
      const expiresAt = lot.expiresAt ? new Date(lot.expiresAt).getTime() : null;
      return (
        activeProductIds.has(lot.productId) &&
        lot.status === "released" &&
        lot.availableQuantity > 0 &&
        (manufacturedAt === null ||
          (Number.isFinite(manufacturedAt) && manufacturedAt <= now.getTime())) &&
        (expiresAt === null ||
          (Number.isFinite(expiresAt) && expiresAt > now.getTime()))
      );
    },
  );
  const releasedLotIds = new Set(releasedLots.map((lot) => lot.id));
  const activeCoas = records.coaDocuments.filter(
    (coa) => coa.active && coa.public && releasedLotIds.has(coa.lotId),
  );
  const activeCoaIds = new Set(activeCoas.map((coa) => coa.id));
  const currentPromotions = records.promotions.filter((promotion) =>
    isPromotionCurrent(promotion, now),
  );

  const products: PublicProduct[] = [];
  const relatedIdsByProduct = new Map<string, Set<string>>();
  for (const product of activeProducts) {
    const currentPrices = records.prices.filter(
      (candidate) =>
        candidate.productId === product.id &&
        candidate.supersededAt === null &&
        new Date(candidate.effectiveAt).getTime() <= now.getTime(),
    );
    const price =
      currentPrices.length === 1 && currentPrices[0]?.currency === "USD"
        ? currentPrices[0]
        : undefined;
    const productLots = releasedLots.filter(
      (lot) => lot.productId === product.id,
    );
    if (!price || productLots.length === 0) continue;

    const primaryLot = productLots[0];
    if (!primaryLot) continue;
    const primaryCoa = activeCoas.find((coa) => coa.lotId === primaryLot.id);
    const merchandising = currentPromotions.flatMap((promotion) => {
      if (!targetApplies(records, promotion.id, product)) return [];
      const projected = projectPromotion(promotion);
      return projected ? [projected] : [];
    });

    const relatedProductIds = new Set<string>();
    for (const promotion of currentPromotions) {
      if (
        promotion.kind !== "cross_sell" ||
        !targetApplies(records, promotion.id, product)
      ) {
        continue;
      }
      const configuration = crossSellConfiguration.safeParse(
        promotion.configuration,
      );
      if (configuration.success) {
        for (const productId of configuration.data.productIds) {
          relatedProductIds.add(productId);
        }
      }
    }
    relatedIdsByProduct.set(product.id, relatedProductIds);

    const proof: PublicProofNode[] = [
      { label: "Material identity", state: product.materialIdentity },
      {
        label: "Analytical method",
        state: primaryLot.analyticalMethod ?? "No approved public record",
      },
      { label: "Lot/batch", state: primaryLot.supplierLotCode },
      primaryCoa
        ? {
            label: "COA state",
            state: "Public record available",
            href: `/quality-records#record-${primaryCoa.id}`,
          }
        : { label: "COA state", state: "No approved public record" },
    ];

    products.push({
      id: product.id,
      slug: product.slug,
      name: product.name,
      packageForm: product.packageForm,
      price: {
        id: price.id,
        amountMinor: price.amountMinor,
        currency: price.currency,
        version: price.version,
      },
      availableQuantity: productLots.reduce(
        (total, lot) => total + lot.availableQuantity,
        0,
      ),
      claims: records.claims
        .filter(
          (claim) =>
            claim.active &&
            claim.productId === product.id &&
            releasedLotIds.has(claim.lotId) &&
            activeCoaIds.has(claim.coaDocumentId) &&
            activeCoas.some(
              (coa) =>
                coa.id === claim.coaDocumentId && coa.lotId === claim.lotId,
            ),
        )
        .map((claim) => ({ id: claim.id, text: claim.text })),
      merchandising,
      relatedProducts: [],
      proof,
    });
  }

  const publicProductById = new Map(
    products.map((product) => [product.id, product] as const),
  );
  const projectedProducts = products.map((product) => {
    const relatedProducts = [...(relatedIdsByProduct.get(product.id) ?? [])].flatMap(
      (relatedId) => {
        const related = publicProductById.get(relatedId);
        return related
          ? [{ id: related.id, slug: related.slug, name: related.name }]
          : [];
      },
    );
    const relatedCount = relatedProducts.length;
    return {
      ...product,
      merchandising: product.merchandising.map((entry) =>
        entry.kind === "cross_sell"
          ? {
              ...entry,
              summary: `${relatedCount} related public catalog record${relatedCount === 1 ? "" : "s"}.`,
            }
          : entry,
      ),
      relatedProducts,
    };
  });
  const publicProductIds = new Set(projectedProducts.map((product) => product.id));
  const qualityRecords = activeCoas.flatMap((coa) => {
    const lot = releasedLots.find((candidate) => candidate.id === coa.lotId);
    const product = activeProducts.find(
      (candidate) => candidate.id === lot?.productId,
    );
    if (!lot || !product || !publicProductIds.has(product.id)) return [];
    return [
      {
        id: coa.id,
        productId: product.id,
        productName: product.name,
        lotCode: lot.supplierLotCode,
        analyticalMethod: lot.analyticalMethod,
        issuedAt: coa.issuedAt,
        href: `/quality-records#record-${coa.id}`,
      },
    ];
  });

  return {
    source: records.source,
    products: projectedProducts,
    promotions: [
      ...new Map(
        projectedProducts
          .flatMap((product) => product.merchandising)
          .map((promotion) => [promotion.id, promotion] as const),
      ).values(),
    ],
    qualityRecords,
  };
}

export function findPublicProduct(
  catalog: PublicCatalog,
  slug: string,
): PublicProduct | null {
  return catalog.products.find((product) => product.slug === slug) ?? null;
}
