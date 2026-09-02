import { createHash } from "node:crypto";

import { browseCatalogProducts } from "./browse-catalog";
import type { BrowseCatalogProduct } from "./browse-catalog";

const DNS_NAMESPACE = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";
export const STOREFRONT_CATALOG_AUDIT_TIMESTAMP = "2026-09-02T02:04:54.0166213-07:00";
const EVIDENCE_SOURCE = "Amino Club" as const;
const EVIDENCE_BASIS = "ordinary_one_vial_list_price" as const;

export type StorefrontCatalogPriceDecision = Readonly<{
  browseSlug: string;
  browseCode: string;
  baseUnitMinor: number;
  currency: "USD";
  url: string;
  observedAt: string;
}>;

export type StorefrontCatalogEvidence = Readonly<{
  source: "Amino Club";
  url: string;
  observedAt: string;
  basis: "ordinary_one_vial_list_price";
}>;

export type StorefrontCatalogVariantDecision = Readonly<{
  browseSlug: string;
  browseCode: string;
  productId: string;
  id: string;
  sku: string;
  publicLabel: string;
  packageQuantity: 1;
  currency: "USD";
  decisionStatus: "approved_candidate" | "pending";
  baseUnitMinor: number;
  evidence: StorefrontCatalogEvidence | null;
  stripeProductId: null;
  stripePriceId: null;
}>;

export type StorefrontCatalogDecisionManifest = Readonly<{
  products: readonly Readonly<{ browseSlug: string; id: string; variantIds: readonly string[] }>[];
  variants: readonly StorefrontCatalogVariantDecision[];
}>;

const decision = (browseSlug: string, browseCode: string, baseUnitMinor: number, url: string): StorefrontCatalogPriceDecision => ({
  browseSlug, browseCode, baseUnitMinor, currency: "USD", url, observedAt: STOREFRONT_CATALOG_AUDIT_TIMESTAMP,
});

const amino = (slug: string) => `https://www.aminoclub.com/us/products/${slug}`;

export const approvedStorefrontCatalogPriceDecisions: readonly StorefrontCatalogPriceDecision[] = deepFreeze([
  decision("tirzepatide", "TR30", 5999, amino("glp-2")), decision("tirzepatide", "TR60", 10999, amino("glp-2")),
  decision("retatrutide", "RT10", 6999, amino("glp-3")), decision("retatrutide", "RT20", 13499, amino("glp-3")), decision("retatrutide", "RT30", 19999, amino("glp-3")),
  decision("nad-plus", "NJ500", 6999, amino("nad-plus")), decision("ghk-cu", "CU50", 2999, amino("ghk-cu")), decision("ghk-cu", "CU100", 5799, amino("ghk-cu")),
  decision("tesmorelin", "TESA10", 6999, amino("tesamorlin")), decision("bpc-157", "BPC10", 3999, amino("bpc-157")), decision("tb500", "TB10", 3999, amino("tb-500")),
  decision("bpc-tb-blend", "BB10", 7999, amino("wolverine-stack")), decision("bpc-tb-blend-bb20", "BB20", 14999, amino("wolverine-stack")), decision("aod-9604", "AOD5", 4999, amino("aod-9604")),
  decision("mots-c", "MS10", 3999, amino("mots-c")), decision("mots-c", "MS40", 13499, amino("mots-c")), decision("selank", "SK10", 2995, amino("selank")),
  decision("semax", "XA10", 2995, amino("semax")), decision("thymosin-alpha-1", "TA10", 3999, amino("thymosin-alpha-1")), decision("dsip", "DS5", 2999, amino("dsip")),
  decision("cjc-1295-no-dac-ipa", "CP10", 5999, amino("cjc-ipa-no-dac")), decision("ipamorelin", "IP10", 4999, amino("ipamorelin")), decision("cargrilintide", "CGL10", 6999, amino("cagrilintide")),
  decision("sermorelin-acetate", "SMO10", 5999, amino("sermorelin")), decision("pt-141", "PT141", 2999, amino("pt-141")), decision("glow", "BBG70", 8999, amino("glow")),
  decision("ll37", "LL375", 3499, amino("ll-37")), decision("glutathione", "GT1500", 5999, amino("glutathione")), decision("mt2", "MT210", 2995, amino("melanotan-ii")),
  decision("klow", "BBGK", 9999, amino("klow")), decision("5-amino-1mq", "5A50", 4999, amino("5-amino-1mq")), decision("kisspeptin", "KS10", 4999, amino("kisspeptin")),
  decision("igf-1-lr3", "IG1", 6999, amino("igf-1-lr3")), decision("ara-290", "RA10", 4999, amino("ara-290")), decision("semaglutide", "SM10", 4999, amino("glp-1")),
  decision("kpv", "KPV10", 3999, amino("kpv")), decision("epithalon", "ET10", 2999, amino("epithalon")), decision("vip", "VP10", 4999, amino("vip")),
  decision("cartalax", "Car20", 6999, amino("cartalax")),
]);

function uuidBytes(uuid: string): Buffer {
  return Buffer.from(uuid.replaceAll("-", ""), "hex");
}

function uuidV5(name: string): string {
  const digest = createHash("sha1").update(Buffer.concat([uuidBytes(DNS_NAMESPACE), Buffer.from(name)])).digest();
  digest[6] = (digest[6]! & 0x0f) | 0x50;
  digest[8] = (digest[8]! & 0x3f) | 0x80;
  const hex = digest.subarray(0, 16).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function skuPart(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]+/gu, "-").replace(/^-+|-+$/gu, "");
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function fail(message: string): never { throw new Error(message); }

function validDecision(candidate: StorefrontCatalogPriceDecision): void {
  if (!candidate || typeof candidate !== "object" || candidate.currency !== "USD" || !Number.isSafeInteger(candidate.baseUnitMinor) || candidate.baseUnitMinor <= 0) fail("Invalid storefront catalog price decision");
  if (Object.keys(candidate).sort().join(",") !== "baseUnitMinor,browseCode,browseSlug,currency,observedAt,url") fail("Invalid storefront catalog price decision shape");
  if (!/^https:\/\/www\.aminoclub\.com\/us\/products\/[a-z0-9-]+$/u.test(candidate.url)) fail("Invalid storefront catalog evidence URL");
  if (candidate.observedAt !== STOREFRONT_CATALOG_AUDIT_TIMESTAMP) fail("Invalid storefront catalog observation timestamp");
}

export function buildStorefrontCatalogDecisionManifest(
  products: readonly BrowseCatalogProduct[],
  decisions: readonly StorefrontCatalogPriceDecision[],
): StorefrontCatalogDecisionManifest {
  if (!Array.isArray(products) || !Array.isArray(decisions) || products.length !== 56 || decisions.length !== 39) fail("Invalid storefront catalog coverage");
  const rows = new Map<string, { product: BrowseCatalogProduct; variant: BrowseCatalogProduct["variants"][number] }>();
  const productIds = new Set<string>();
  for (const product of products) {
    if (!product || productIds.has(product.slug)) fail("Duplicate storefront catalog product");
    productIds.add(product.slug);
    for (const variant of product.variants) {
      const scoped = `${product.slug}:${variant.code}`;
      if (rows.has(scoped) || !variant.packageForm.endsWith(" × 10 vials")) fail("Invalid storefront catalog browse row");
      rows.set(scoped, { product, variant });
    }
  }
  if (rows.size !== 103) fail("Invalid storefront catalog variant coverage");
  const candidateSkus = new Set<string>();
  for (const { product, variant } of rows.values()) {
    const candidateSku = `PPQ-${skuPart(product.slug)}-${skuPart(variant.code)}`;
    if (candidateSkus.has(candidateSku)) fail("Storefront catalog identity collision");
    candidateSkus.add(candidateSku);
  }
  for (const [productIndex, product] of products.entries()) {
    const canonicalProduct = browseCatalogProducts[productIndex];
    if (!canonicalProduct || product.slug !== canonicalProduct.slug || product.variants.length !== canonicalProduct.variants.length) fail("Storefront catalog browse input is not canonical");
    for (const [variantIndex, variant] of product.variants.entries()) {
      const canonicalVariant = canonicalProduct.variants[variantIndex];
      if (!canonicalVariant || variant.code !== canonicalVariant.code || variant.packageForm !== canonicalVariant.packageForm) fail("Storefront catalog browse input is not canonical");
    }
  }
  const approved = new Map<string, StorefrontCatalogPriceDecision>();
  for (const item of decisions) {
    validDecision(item);
    const scoped = `${item.browseSlug}:${item.browseCode}`;
    if (approved.has(scoped) || !rows.has(scoped)) fail("Invalid storefront catalog price decision coverage");
    approved.set(scoped, item);
  }
  if (approved.size !== 39) fail("Invalid storefront catalog approved decision count");
  for (const [index, item] of decisions.entries()) {
    const canonical = approvedStorefrontCatalogPriceDecisions[index];
    if (!canonical || item.browseSlug !== canonical.browseSlug || item.browseCode !== canonical.browseCode || item.baseUnitMinor !== canonical.baseUnitMinor || item.currency !== canonical.currency || item.url !== canonical.url || item.observedAt !== canonical.observedAt) fail("Storefront catalog price decisions are not canonical");
  }
  const ids = new Set<string>();
  const skus = new Set<string>();
  const variants: StorefrontCatalogVariantDecision[] = [];
  const productRows = products.map((product) => {
    const productId = uuidV5(`propeptiq.com/storefront/product/${product.slug}`);
    if (ids.has(productId)) fail("Storefront catalog identity collision");
    ids.add(productId);
    const variantIds: string[] = [];
    for (const sourceVariant of product.variants) {
      const scoped = `${product.slug}:${sourceVariant.code}`;
      const variantId = uuidV5(`propeptiq.com/storefront/variant/${product.slug}/${sourceVariant.code}`);
      const sku = `PPQ-${skuPart(product.slug)}-${skuPart(sourceVariant.code)}`;
      if (ids.has(variantId) || skus.has(sku)) fail("Storefront catalog identity collision");
      ids.add(variantId); skus.add(sku); variantIds.push(variantId);
      const approvedDecision = approved.get(scoped);
      const publicLabel = sourceVariant.packageForm.slice(0, -" × 10 vials".length);
      if (!publicLabel.trim()) fail("Invalid storefront catalog public label");
      variants.push({
        browseSlug: product.slug, browseCode: sourceVariant.code, productId, id: variantId, sku, publicLabel,
        packageQuantity: 1, currency: "USD", decisionStatus: approvedDecision ? "approved_candidate" : "pending",
        baseUnitMinor: approvedDecision?.baseUnitMinor ?? 0,
        evidence: approvedDecision ? { source: EVIDENCE_SOURCE, url: approvedDecision.url, observedAt: approvedDecision.observedAt, basis: EVIDENCE_BASIS } : null,
        stripeProductId: null, stripePriceId: null,
      });
    }
    return { browseSlug: product.slug, id: productId, variantIds };
  });
  return deepFreeze({ products: productRows, variants });
}

export const storefrontCatalogDecisionManifest = buildStorefrontCatalogDecisionManifest(
  browseCatalogProducts,
  approvedStorefrontCatalogPriceDecisions,
);

export function getStorefrontCatalogDecision(browseSlug: string, browseCode: string): StorefrontCatalogVariantDecision {
  const result = storefrontCatalogDecisionManifest.variants.find((entry) => entry.browseSlug === browseSlug && entry.browseCode === browseCode);
  if (!result) throw new Error("Storefront catalog decision is missing");
  return result;
}
