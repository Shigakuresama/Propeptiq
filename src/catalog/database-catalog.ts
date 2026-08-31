import type {
  CatalogClaimRecord,
  CatalogCoaRecord,
  CatalogLotRecord,
  CatalogPriceRecord,
  CatalogProductRecord,
  CatalogPromotionRecord,
  CatalogPromotionTargetRecord,
  CatalogRecordSet,
} from "./types";

export type CatalogQueryPort = Readonly<{
  query: <T extends object>(
    sql: string,
    params?: unknown[],
  ) => Promise<Readonly<{ rows: T[] }>>;
}>;

type RawProduct = Omit<CatalogProductRecord, "status"> & {
  status: CatalogProductRecord["status"];
};
export type DatabaseCatalogVariantRecord = Readonly<{
  id: string;
  productId: string;
  sku: string;
  label: string;
  canonicalAmount: number | null;
  amountUnit: "mg" | "mcg" | "iu" | null;
  packageQuantity: number;
  status: "inactive" | "active";
  stripeProductId: string | null;
  stripePriceId: string | null;
}>;
export type DatabaseCatalogPriceRecord = CatalogPriceRecord &
  Readonly<{
    variantId: string | null;
    priceStatus: "pending" | "active" | "unavailable";
  }>;
export type DatabaseCatalogLotRecord = CatalogLotRecord &
  Readonly<{ variantId: string | null }>;
export type DatabaseCatalogRecordSet = Omit<
  CatalogRecordSet,
  "prices" | "lots"
> &
  Readonly<{
    variants: readonly DatabaseCatalogVariantRecord[];
    prices: readonly DatabaseCatalogPriceRecord[];
    lots: readonly DatabaseCatalogLotRecord[];
  }>;
type RawVariant = Omit<
  DatabaseCatalogVariantRecord,
  "canonicalAmount" | "packageQuantity"
> & {
  canonicalAmount: string | number | null;
  packageQuantity: string | number;
};
type RawPrice = Omit<CatalogPriceRecord, "amountMinor" | "effectiveAt" | "supersededAt"> & {
  variantId: string | null;
  priceStatus: "pending" | "active" | "unavailable";
  amountMinor: string | number | null;
  effectiveAt: Date | string;
  supersededAt: Date | string | null;
};
type RawLot = Omit<CatalogLotRecord, "manufacturedAt" | "expiresAt"> & {
  variantId: string | null;
  manufacturedAt: Date | string | null;
  expiresAt: Date | string | null;
};
type RawCoa = Omit<CatalogCoaRecord, "issuedAt"> & {
  issuedAt: Date | string | null;
};
type RawClaim = CatalogClaimRecord;
type RawPromotion = Omit<CatalogPromotionRecord, "amountMinor" | "startsAt" | "endsAt"> & {
  campaignKey: string | null;
  enabled: boolean;
  timezone: string | null;
  applicationMode: "automatic" | "code_required" | null;
  scope: "sitewide" | "products" | "variants" | null;
  amountMinor: string | number | null;
  startsAt: Date | string | null;
  endsAt: Date | string | null;
};

function toIso(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw new Error("Database catalog contains an invalid timestamp");
  }
  return date.toISOString();
}

function toOptionalIso(value: Date | string | null): string | null {
  return value === null ? null : toIso(value);
}

function toSafeInteger(value: string | number): number {
  const numberValue = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(numberValue)) {
    throw new Error("Database catalog contains an unsafe monetary value");
  }
  return numberValue;
}

export async function loadDatabaseCatalogRecords(
  database: CatalogQueryPort,
): Promise<DatabaseCatalogRecordSet> {
  const products = await database.query<RawProduct>(`
    SELECT id::text AS "id", slug, name, package_form AS "packageForm",
           material_identity AS "materialIdentity",
           policy_group_id::text AS "policyGroupId", status
    FROM products
    ORDER BY created_at, id
  `);
  const variants = await database.query<RawVariant>(`
    SELECT id::text AS "id", product_id::text AS "productId", sku, label,
           canonical_amount AS "canonicalAmount", amount_unit AS "amountUnit",
           package_quantity AS "packageQuantity", status,
           stripe_product_id AS "stripeProductId",
           stripe_price_id AS "stripePriceId"
    FROM product_variants
    ORDER BY created_at, id
  `);
  const prices = await database.query<RawPrice>(`
    SELECT id::text AS "id", product_id::text AS "productId",
           variant_id::text AS "variantId", version, price_status AS "priceStatus",
           amount_minor AS "amountMinor", currency,
           effective_at AS "effectiveAt", superseded_at AS "supersededAt"
    FROM product_prices
    ORDER BY product_id, version
  `);
  const lots = await database.query<RawLot>(`
    SELECT id::text AS "id", product_id::text AS "productId",
           variant_id::text AS "variantId",
           supplier_name AS "supplierName", supplier_lot_code AS "supplierLotCode",
           available_quantity AS "availableQuantity", status,
           analytical_method AS "analyticalMethod",
           manufactured_at AS "manufacturedAt", expires_at AS "expiresAt"
    FROM lots
    ORDER BY created_at, id
  `);
  const coaDocuments = await database.query<RawCoa>(`
    SELECT id::text AS "id", lot_id::text AS "lotId", storage_key AS "storageKey",
           active, public, issued_at AS "issuedAt"
    FROM coa_documents
    ORDER BY created_at, id
  `);
  const claims = await database.query<RawClaim>(`
    SELECT id::text AS "id", product_id::text AS "productId", text,
           'analytical'::text AS "kind", lot_id::text AS "lotId",
           coa_document_id::text AS "coaDocumentId", active
    FROM analytical_claims
    ORDER BY created_at, id
  `);
  const promotions = await database.query<RawPromotion>(`
    SELECT id::text AS "id", campaign_key AS "campaignKey", code, version,
           name, kind, status, enabled, timezone,
           application_mode AS "applicationMode", scope,
           amount_minor AS "amountMinor", basis_points AS "basisPoints", currency,
           starts_at AS "startsAt", ends_at AS "endsAt", configuration
    FROM promotions
    ORDER BY created_at, id
  `);
  const promotionTargets = await database.query<CatalogPromotionTargetRecord>(`
    SELECT promotion_id::text AS "promotionId", target_kind AS "targetKind",
           product_id::text AS "productId", policy_group_id::text AS "policyGroupId"
    FROM promotion_targets
    ORDER BY promotion_id, target_kind, COALESCE(product_id, policy_group_id)::text
  `);

  return Object.freeze({
    source: "production",
    products: products.rows,
    variants: variants.rows.map((variant) => ({
      ...variant,
      canonicalAmount:
        variant.canonicalAmount === null
          ? null
          : Number(variant.canonicalAmount),
      packageQuantity: toSafeInteger(variant.packageQuantity),
    })),
    prices: prices.rows.map((price) => ({
      ...price,
      amountMinor:
        price.amountMinor === null ? null : toSafeInteger(price.amountMinor),
      effectiveAt: toIso(price.effectiveAt),
      supersededAt: toOptionalIso(price.supersededAt),
    })),
    lots: lots.rows.map((lot) => ({
      ...lot,
      manufacturedAt: toOptionalIso(lot.manufacturedAt),
      expiresAt: toOptionalIso(lot.expiresAt),
    })),
    coaDocuments: coaDocuments.rows.map((coa) => ({
      ...coa,
      issuedAt: toOptionalIso(coa.issuedAt),
    })),
    claims: claims.rows,
    promotions: promotions.rows.map((promotion) => ({
      ...promotion,
      amountMinor:
        promotion.amountMinor === null
          ? null
          : toSafeInteger(promotion.amountMinor),
      startsAt: toOptionalIso(promotion.startsAt),
      endsAt: toOptionalIso(promotion.endsAt),
    })),
    promotionTargets: promotionTargets.rows,
  });
}
