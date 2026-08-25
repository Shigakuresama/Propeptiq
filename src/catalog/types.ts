export type CatalogSource = "production" | "synthetic-demo";
export type ProductStatus = "draft" | "active" | "retired";
export type LotStatus =
  | "draft"
  | "quarantined"
  | "released"
  | "exhausted"
  | "recalled";
export type PromotionKind =
  | "discount"
  | "bundle"
  | "subscription"
  | "loyalty"
  | "cross_sell";
export type PromotionStatus = "draft" | "active" | "retired";

export type CatalogProductRecord = {
  id: string;
  slug: string;
  name: string;
  packageForm: string;
  materialIdentity: string;
  policyGroupId: string;
  status: ProductStatus;
};

export type CatalogPriceRecord = {
  id: string;
  productId: string;
  version: number;
  amountMinor: number;
  currency: string;
  effectiveAt: string;
  supersededAt: string | null;
};

export type CatalogLotRecord = {
  id: string;
  productId: string;
  supplierName: string;
  supplierLotCode: string;
  availableQuantity: number;
  status: LotStatus;
  analyticalMethod: string | null;
  manufacturedAt: string | null;
  expiresAt: string | null;
};

export type CatalogCoaRecord = {
  id: string;
  lotId: string;
  storageKey: string;
  active: boolean;
  public: boolean;
  issuedAt: string | null;
};

export type CatalogClaimRecord = {
  id: string;
  productId: string;
  text: string;
  kind: "analytical";
  lotId: string;
  coaDocumentId: string;
  active: boolean;
};

export type CatalogPromotionRecord = {
  id: string;
  name: string;
  kind: PromotionKind;
  status: PromotionStatus;
  amountMinor: number | null;
  basisPoints: number | null;
  currency: string | null;
  startsAt: string | null;
  endsAt: string | null;
  configuration: unknown;
};

export type CatalogPromotionTargetRecord = {
  promotionId: string;
  targetKind: "product" | "policy_group";
  productId: string | null;
  policyGroupId: string | null;
};

export type CatalogRecordSet = {
  source: CatalogSource;
  products: readonly CatalogProductRecord[];
  prices: readonly CatalogPriceRecord[];
  lots: readonly CatalogLotRecord[];
  coaDocuments: readonly CatalogCoaRecord[];
  claims: readonly CatalogClaimRecord[];
  promotions: readonly CatalogPromotionRecord[];
  promotionTargets: readonly CatalogPromotionTargetRecord[];
};

export type PublicPrice = {
  id: string;
  amountMinor: number;
  currency: string;
  version: number;
};

export type PublicMerchandising = {
  id: string;
  kind: PromotionKind;
  name: string;
  summary: string;
};

export type PublicProofNode = {
  label: "Material identity" | "Analytical method" | "Lot/batch" | "COA state";
  state: string;
  href?: string;
};

export type PublicProduct = {
  id: string;
  slug: string;
  name: string;
  packageForm: string;
  price: PublicPrice;
  availableQuantity: number;
  claims: readonly { id: string; text: string }[];
  merchandising: readonly PublicMerchandising[];
  relatedProducts: readonly { id: string; slug: string; name: string }[];
  proof: readonly PublicProofNode[];
};

export type PublicQualityRecord = {
  id: string;
  productId: string;
  productName: string;
  lotCode: string;
  analyticalMethod: string | null;
  issuedAt: string | null;
  href: string;
};

export type PublicCatalog = {
  source: CatalogSource;
  products: readonly PublicProduct[];
  promotions: readonly PublicMerchandising[];
  qualityRecords: readonly PublicQualityRecord[];
};
