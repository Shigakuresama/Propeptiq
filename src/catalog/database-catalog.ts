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
type RawPrice = Omit<CatalogPriceRecord, "amountMinor" | "effectiveAt" | "supersededAt"> & {
  amountMinor: string | number;
  effectiveAt: Date | string;
  supersededAt: Date | string | null;
};
type RawLot = Omit<CatalogLotRecord, "manufacturedAt" | "expiresAt"> & {
  manufacturedAt: Date | string | null;
  expiresAt: Date | string | null;
};
type RawCoa = Omit<CatalogCoaRecord, "issuedAt"> & {
  issuedAt: Date | string | null;
};
type RawClaim = CatalogClaimRecord;
type RawPromotion = Omit<CatalogPromotionRecord, "amountMinor" | "startsAt" | "endsAt"> & {
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
): Promise<CatalogRecordSet> {
  const products = await database.query<RawProduct>(`
    SELECT id::text AS "id", slug, name, package_form AS "packageForm",
           material_identity AS "materialIdentity",
           policy_group_id::text AS "policyGroupId", status
    FROM products
    ORDER BY created_at, id
  `);
  const prices = await database.query<RawPrice>(`
    SELECT id::text AS "id", product_id::text AS "productId", version,
           amount_minor AS "amountMinor", currency,
           effective_at AS "effectiveAt", superseded_at AS "supersededAt"
    FROM product_prices
    ORDER BY product_id, version
  `);
  const lots = await database.query<RawLot>(`
    SELECT id::text AS "id", product_id::text AS "productId",
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
    SELECT id::text AS "id", name, kind, status,
           amount_minor AS "amountMinor", basis_points AS "basisPoints", currency,
           starts_at AS "startsAt", ends_at AS "endsAt", configuration
    FROM promotions
    ORDER BY created_at, id
  `);
  const promotionTargets = await database.query<CatalogPromotionTargetRecord>(`
    SELECT promotion_id::text AS "promotionId", target_kind AS "targetKind",
           product_id::text AS "productId", policy_group_id::text AS "policyGroupId"
    FROM promotion_targets
    ORDER BY promotion_id, id
  `);

  return Object.freeze({
    source: "production",
    products: products.rows,
    prices: prices.rows.map((price) => ({
      ...price,
      amountMinor: toSafeInteger(price.amountMinor),
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
