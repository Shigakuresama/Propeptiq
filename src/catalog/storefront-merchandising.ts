import { storefrontCatalogDecisionManifest } from "./storefront-catalog-manifest";

export type RelatedProductIdentity = Readonly<{
  id: string;
  slug: string;
}>;

export type RelatedProductSlugEntry = readonly [
  productSlug: string,
  relatedProductSlugs: readonly string[],
];

const CONFIGURATION_ERROR = "Invalid related-product merchandising configuration";

function failConfiguration(): never {
  throw new Error(CONFIGURATION_ERROR);
}

function denseArraySnapshot<T>(value: readonly T[]): T[] {
  if (!Array.isArray(value)) failConfiguration();
  const { length } = value;
  if (!Number.isSafeInteger(length) || length < 0) failConfiguration();
  const snapshot: T[] = [];
  for (let index = 0; index < length; index += 1) {
    if (!Object.prototype.hasOwnProperty.call(value, index)) failConfiguration();
    snapshot.push(value[index]!);
  }
  return snapshot;
}

/**
 * Owner-controlled catalog adjacency. These rows intentionally expose no
 * reason, claim, or usage guidance: they only determine card order.
 */
const configuredRelationships: readonly RelatedProductSlugEntry[] = [
  ["tirzepatide", ["retatrutide", "semaglutide", "cargrilintide", "survodutide"]],
  ["retatrutide", ["tirzepatide", "semaglutide", "survodutide", "cargrilintide"]],
  ["nad-plus", ["mots-c", "ss-31", "glutathione"]],
  ["hgh", ["tesmorelin", "sermorelin-acetate", "igf-1-lr3"]],
  ["ghk-cu", ["snap", "glow", "klow"]],
  ["tesmorelin", ["tesmorelin-ipa", "ipamorelin", "cjc-1295-no-dac-ipa", "hgh"]],
  ["tesmorelin-ipa", ["tesmorelin", "ipamorelin", "cjc-1295-no-dac-ipa", "cjc-1295-no-dac-ipa-cp20"]],
  ["bpc-157", ["tb500", "bpc-tb-blend", "bpc-tb-blend-bb20", "glow"]],
  ["tb500", ["bpc-157", "bpc-tb-blend", "bpc-tb-blend-bb20", "glow"]],
  ["bpc-tb-blend", ["bpc-157", "tb500", "bpc-tb-blend-bb20", "bpc-tb-blend-bb40"]],
  ["bpc-tb-blend-bb20", ["bpc-157", "tb500", "bpc-tb-blend", "bpc-tb-blend-bb40"]],
  ["bpc-tb-blend-bb40", ["bpc-157", "tb500", "bpc-tb-blend-bb20", "glow"]],
  ["aod-9604", ["semaglutide", "tirzepatide", "5-amino-1mq", "cargrilintide"]],
  ["mots-c", ["nad-plus", "ss-31", "epithalon"]],
  ["selank", ["semax", "semax-selank", "dsip"]],
  ["semax", ["selank", "semax-selank", "dsip"]],
  ["semax-selank", ["semax", "selank", "dsip"]],
  ["thymosin-alpha-1", ["ll37", "vip", "glutathione"]],
  ["dsip", ["selank", "semax", "pinealon"]],
  ["cjc-1295-no-dac-ipa", ["cjc-1295-no-dac-ipa-cp20", "cjc-1295-no-dac", "ipamorelin", "tesmorelin-ipa"]],
  ["cjc-1295-no-dac-ipa-cp20", ["cjc-1295-no-dac-ipa", "cjc-1295-no-dac", "ipamorelin", "tesmorelin-ipa"]],
  ["ipamorelin", ["cjc-1295-no-dac-ipa", "cjc-1295-no-dac-ipa-cp20", "tesmorelin", "sermorelin-acetate"]],
  ["hcg", ["kisspeptin", "oxytocin-acetate", "pt-141"]],
  ["cargrilintide", ["tirzepatide", "retatrutide", "semaglutide", "survodutide"]],
  ["sermorelin-acetate", ["ipamorelin", "cjc-1295-no-dac", "tesmorelin", "hgh"]],
  ["pt-141", ["oxytocin-acetate", "kisspeptin", "hcg"]],
  ["glow", ["ghk-cu", "bpc-tb-blend", "klow"]],
  ["oxytocin-acetate", ["pt-141", "kisspeptin", "hcg"]],
  ["ll37", ["thymosin-alpha-1", "kpv", "ara-290"]],
  ["glutathione", ["nad-plus", "li-po-c", "li-po-c-without-b12"]],
  ["snap", ["ghk-cu", "lemon-bottle", "mt2"]],
  ["li-po-c", ["li-po-c-without-b12", "glutathione", "nad-plus"]],
  ["li-po-c-without-b12", ["li-po-c", "glutathione", "nad-plus"]],
  ["lemon-bottle", ["snap", "ghk-cu", "mt1"]],
  ["mt1", ["mt2", "snap", "lemon-bottle"]],
  ["mt2", ["mt1", "snap", "lemon-bottle"]],
  ["ss-31", ["mots-c", "nad-plus", "epithalon"]],
  ["klow", ["glow", "ghk-cu", "kpv", "bpc-157"]],
  ["5-amino-1mq", ["aod-9604", "semaglutide", "tirzepatide", "cargrilintide"]],
  ["kisspeptin", ["hcg", "oxytocin-acetate", "pt-141"]],
  ["pinealon", ["pe-22-28", "grp-2", "dsip"]],
  ["pe-22-28", ["pinealon", "grp-2", "admax"]],
  ["igf-1-lr3", ["hgh", "tesmorelin", "sermorelin-acetate"]],
  ["ara-290", ["bpc-157", "kpv", "cartalax"]],
  ["acetic-acid", ["bac-water", "nad-plus"]],
  ["semaglutide", ["tirzepatide", "retatrutide", "cargrilintide", "aod-9604"]],
  ["kpv", ["bpc-157", "ll37", "ara-290", "cartalax"]],
  ["epithalon", ["ss-31", "nad-plus", "mots-c"]],
  ["cjc-1295-with-dac", ["cjc-1295-no-dac", "cjc-1295-no-dac-ipa", "ipamorelin"]],
  ["cjc-1295-no-dac", ["cjc-1295-with-dac", "cjc-1295-no-dac-ipa", "ipamorelin", "sermorelin-acetate"]],
  ["grp-2", ["pinealon", "pe-22-28", "admax"]],
  ["vip", ["thymosin-alpha-1", "ll37", "glutathione"]],
  ["survodutide", ["tirzepatide", "retatrutide", "semaglutide", "cargrilintide"]],
  ["admax", ["grp-2", "pe-22-28", "pinealon"]],
  ["cartalax", ["ara-290", "kpv", "bpc-157"]],
  ["bac-water", ["acetic-acid", "nad-plus"]],
];

export const storefrontRelatedProductSlugEntries: readonly RelatedProductSlugEntry[] =
  Object.freeze(configuredRelationships.map(([productSlug, relatedProductSlugs]) =>
    Object.freeze([productSlug, Object.freeze([...relatedProductSlugs])] as const),
  ));

export function buildRelatedProductIdsByProductId(
  productIdentities: readonly RelatedProductIdentity[],
  relationshipEntries: readonly RelatedProductSlugEntry[],
): Readonly<Record<string, readonly string[]>> {
  const identities = denseArraySnapshot(productIdentities);
  const relationships = denseArraySnapshot(relationshipEntries);
  const idBySlug = new Map<string, string>();
  const productIds = new Set<string>();

  for (const identity of identities) {
    if (
      !identity ||
      typeof identity.id !== "string" ||
      !identity.id.trim() ||
      typeof identity.slug !== "string" ||
      !identity.slug.trim() ||
      productIds.has(identity.id) ||
      idBySlug.has(identity.slug)
    ) failConfiguration();
    productIds.add(identity.id);
    idBySlug.set(identity.slug, identity.id);
  }

  if (identities.length === 0 || relationships.length !== identities.length) {
    failConfiguration();
  }

  const configuredSourceSlugs = new Set<string>();
  const result: Record<string, readonly string[]> = Object.create(null) as Record<string, readonly string[]>;

  for (const relationship of relationships) {
    const tuple = denseArraySnapshot<string | readonly string[]>(relationship);
    if (tuple.length !== 2) failConfiguration();
    const [productSlug, relatedProductSlugsValue] = tuple;
    if (
      typeof productSlug !== "string" ||
      configuredSourceSlugs.has(productSlug) ||
      !idBySlug.has(productSlug)
    ) failConfiguration();
    configuredSourceSlugs.add(productSlug);

    if (!Array.isArray(relatedProductSlugsValue)) failConfiguration();
    const relatedProductSlugs = denseArraySnapshot(relatedProductSlugsValue);
    if (relatedProductSlugs.length < 2 || relatedProductSlugs.length > 4) {
      failConfiguration();
    }

    const seenRelatedSlugs = new Set<string>();
    const relatedProductIds: string[] = [];
    for (const relatedSlug of relatedProductSlugs) {
      const relatedId = typeof relatedSlug === "string" ? idBySlug.get(relatedSlug) : undefined;
      if (
        !relatedId ||
        relatedSlug === productSlug ||
        seenRelatedSlugs.has(relatedSlug)
      ) failConfiguration();
      seenRelatedSlugs.add(relatedSlug);
      relatedProductIds.push(relatedId);
    }

    result[idBySlug.get(productSlug)!] = Object.freeze(relatedProductIds);
  }

  if (configuredSourceSlugs.size !== identities.length) failConfiguration();
  return Object.freeze(result);
}

const merchandisingProducts = storefrontCatalogDecisionManifest.products.map(({ browseSlug, id }) => ({
  id,
  slug: browseSlug,
}));

export const storefrontRelatedProductIdsByProductId = buildRelatedProductIdsByProductId(
  merchandisingProducts,
  storefrontRelatedProductSlugEntries,
);

export function getRelatedProductIds(productId: string): readonly string[] {
  if (!Object.prototype.hasOwnProperty.call(storefrontRelatedProductIdsByProductId, productId)) {
    throw new Error("Related products are not configured for this product");
  }
  return storefrontRelatedProductIdsByProductId[productId]!;
}
