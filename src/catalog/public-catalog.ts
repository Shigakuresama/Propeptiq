import { z } from "zod";

import {
  scanPublicCopy,
  type PublicationPolicy,
} from "@/domain/content-policy";

import type {
  CatalogCoaRecord,
  CatalogLotRecord,
  CatalogPriceRecord,
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

const ordinaryPublicationPolicy: PublicationPolicy = {
  version: "public-catalog-read-v1",
  activeLotEvidenceIds: [],
};

function passesOrdinaryPublicCopy(text: string): boolean {
  return scanPublicCopy(
    { text, claims: [] },
    ordinaryPublicationPolicy,
  ).publishable;
}

function passesExactEvidenceAnalyticalCopy(
  text: string,
  claimId: string,
  evidenceId: string,
  policy: PublicationPolicy,
  overallText: string = text,
): boolean {
  return scanPublicCopy(
    {
      text: overallText,
      claims: [
        {
          id: claimId,
          text,
          kind: "analytical",
          lotEvidenceIds: [evidenceId],
        },
      ],
    },
    policy,
  ).publishable;
}

function formatMoney(amountMinor: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(amountMinor / 100);
}

function projectPromotion(
  promotion: CatalogPromotionRecord,
  validatedBundleProductCount?: number,
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
        !/^[A-Z]{3}$/.test(promotion.currency) ||
        !Number.isSafeInteger(validatedBundleProductCount) ||
        validatedBundleProductCount === undefined ||
        validatedBundleProductCount < 2
      ) {
        return null;
      }
      return {
        id: promotion.id,
        kind: promotion.kind,
        name: promotion.name,
        summary: `${validatedBundleProductCount}-record bundle display at ${formatMoney(promotion.amountMinor, promotion.currency)}. Enrollment is not active.`,
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
    (product) => {
      const corePublicCopy = [
        product.slug,
        product.name,
        product.packageForm,
        product.materialIdentity,
      ];
      return (
        product.status === "active" &&
        corePublicCopy.every(passesOrdinaryPublicCopy) &&
        passesOrdinaryPublicCopy(corePublicCopy.join(" "))
      );
    },
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
        passesOrdinaryPublicCopy(lot.supplierLotCode) &&
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
  const publicationPolicy: PublicationPolicy = {
    version: "public-catalog-read-v1",
    activeLotEvidenceIds: [...new Set(activeCoas.map((coa) => coa.id))],
  };
  const activeCoaById = new Map(
    activeCoas.map((coa) => [coa.id, coa] as const),
  );
  const activeCoaByLotId = new Map<string, CatalogCoaRecord>();
  for (const coa of activeCoas) {
    if (!activeCoaByLotId.has(coa.lotId)) {
      activeCoaByLotId.set(coa.lotId, coa);
    }
  }
  const releasedLotById = new Map(
    releasedLots.map((lot) => [lot.id, lot] as const),
  );
  const analyticalMethodByLotId = new Map<string, string | null>();
  for (const lot of releasedLots) {
    const evidence = activeCoaByLotId.get(lot.id);
    const analyticalMethod = lot.analyticalMethod;
    analyticalMethodByLotId.set(
      lot.id,
      analyticalMethod !== null &&
        evidence !== undefined &&
        passesExactEvidenceAnalyticalCopy(
          analyticalMethod,
          `lot-method:${lot.id}`,
          evidence.id,
          publicationPolicy,
          `${lot.supplierLotCode} ${analyticalMethod}`,
        )
        ? analyticalMethod
        : null,
    );
  }
  const currentPromotions = records.promotions.filter((promotion) =>
    isPromotionCurrent(promotion, now),
  );

  const productFacts = new Map<
    string,
    {
      price: CatalogPriceRecord;
      lots: CatalogLotRecord[];
      primaryLot: CatalogLotRecord;
    }
  >();
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
    const lots = releasedLots.filter((lot) => lot.productId === product.id);
    const primaryLot = lots[0];
    if (!price || !primaryLot) continue;
    productFacts.set(product.id, { price, lots, primaryLot });
  }
  const publicCandidateProductIds = new Set(productFacts.keys());

  const products: PublicProduct[] = [];
  const relatedIdsByProduct = new Map<string, Set<string>>();
  for (const product of activeProducts) {
    const facts = productFacts.get(product.id);
    if (!facts) continue;
    const { price, lots: productLots, primaryLot } = facts;
    const primaryCoa = activeCoaByLotId.get(primaryLot.id);

    const merchandising: PublicMerchandising[] = [];
    const relatedProductIds = new Set<string>();
    for (const promotion of currentPromotions) {
      if (!targetApplies(records, promotion.id, product)) continue;
      let validatedBundleProductCount: number | undefined;
      if (promotion.kind === "bundle") {
        const configuration = bundleConfiguration.safeParse(
          promotion.configuration,
        );
        if (!configuration.success) continue;
        const uniqueProductIds = new Set(configuration.data.productIds);
        if (
          uniqueProductIds.size !== configuration.data.productIds.length ||
          configuration.data.productIds.some(
            (productId) => !publicCandidateProductIds.has(productId),
          )
        ) continue;
        validatedBundleProductCount = uniqueProductIds.size;
      }
      const projected = projectPromotion(
        promotion,
        validatedBundleProductCount,
      );
      if (!projected) continue;

      const candidateRelatedIds = new Set<string>();
      let finalProjection = projected;
      if (promotion.kind === "cross_sell") {
        const configuration = crossSellConfiguration.safeParse(
          promotion.configuration,
        );
        if (!configuration.success) continue;
        for (const relatedId of configuration.data.productIds) {
          if (publicCandidateProductIds.has(relatedId)) {
            candidateRelatedIds.add(relatedId);
          }
        }
        const relatedCount = candidateRelatedIds.size;
        finalProjection = {
          ...projected,
          summary: `${relatedCount} related public catalog record${relatedCount === 1 ? "" : "s"}.`,
        };
      }

      if (
        !passesOrdinaryPublicCopy(finalProjection.name) ||
        !passesOrdinaryPublicCopy(finalProjection.summary) ||
        !passesOrdinaryPublicCopy(
          `${finalProjection.name} ${finalProjection.summary}`,
        )
      ) continue;

      merchandising.push(finalProjection);
      for (const relatedId of candidateRelatedIds) {
        relatedProductIds.add(relatedId);
      }
    }
    relatedIdsByProduct.set(product.id, relatedProductIds);

    const proof: PublicProofNode[] = [
      { label: "Material identity", state: product.materialIdentity },
      {
        label: "Analytical method",
        state:
          analyticalMethodByLotId.get(primaryLot.id) ??
          "No approved public record",
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
          (claim) => {
            if (!claim.active || claim.productId !== product.id) return false;
            const lot = releasedLotById.get(claim.lotId);
            const evidence = activeCoaById.get(claim.coaDocumentId);
            return (
              lot?.productId === product.id &&
              evidence?.lotId === lot.id &&
              passesExactEvidenceAnalyticalCopy(
                claim.text,
                claim.id,
                evidence.id,
                publicationPolicy,
              )
            );
          },
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
    return {
      ...product,
      relatedProducts,
    };
  });
  const publicProductIds = new Set(projectedProducts.map((product) => product.id));
  const qualityRecords = activeCoas.flatMap((coa) => {
    const lot = releasedLotById.get(coa.lotId);
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
        analyticalMethod: analyticalMethodByLotId.get(lot.id) ?? null,
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
