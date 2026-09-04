import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { browseCatalogProducts } from "./browse-catalog";
import { storefrontCatalogData } from "./storefront-catalog-data";
import {
  approvedStorefrontCatalogDefaultDecisions,
  approvedStorefrontCatalogPriceDecisions,
  buildStorefrontCatalogDecisionManifest,
  getStorefrontCatalogDecision,
  storefrontCatalogDecisionManifest,
} from "./storefront-catalog-manifest";

const key = (slug: string, code: string) => `${slug}:${code}`;
// Captured from the 5bdc52f4 pre-refactor owner rows and legacy mapping.
const BASE_CATALOG_DIGEST = "f4ee84248ccafb701a7c7420fd584889a3d1e8eec4e7085ee335a886e6d8aaf8";

type ExpectedDefaultDecision = Readonly<{
  browseSlug: string;
  browseCode: string;
  defaultVariantId: string;
}>;

const expectedDefaultDecisions: readonly ExpectedDefaultDecision[] = [
  { browseSlug: "tirzepatide", browseCode: "TR30", defaultVariantId: "5ff78cc3-c541-5bf4-9f3b-12be2222cc75" },
  { browseSlug: "retatrutide", browseCode: "RT10", defaultVariantId: "e10294a1-d79c-51a1-9137-ff69d2a9e762" },
  { browseSlug: "nad-plus", browseCode: "NJ500", defaultVariantId: "edc81516-bf06-582a-a1cf-1421d6bb3068" },
  { browseSlug: "hgh", browseCode: "H10", defaultVariantId: "c7907155-bca4-58e1-8e9e-b97bc3caa3e4" },
  { browseSlug: "ghk-cu", browseCode: "CU50", defaultVariantId: "24c833de-f4f8-53c1-8b89-667fa10a0e5f" },
  { browseSlug: "tesmorelin", browseCode: "TESA10", defaultVariantId: "b162f82c-8d1c-5665-87c8-d370c5c1ac9f" },
  { browseSlug: "tesmorelin-ipa", browseCode: "TI13", defaultVariantId: "1710b19e-78dc-5ae9-9ee3-4151b1c4b8b7" },
  { browseSlug: "bpc-157", browseCode: "BPC10", defaultVariantId: "b0447a0a-6da0-5209-a273-cdb0035a5d97" },
  { browseSlug: "tb500", browseCode: "TB10", defaultVariantId: "d6f3dbef-459b-5bbe-bbeb-e097973174bc" },
  { browseSlug: "bpc-tb-blend", browseCode: "BB10", defaultVariantId: "a09ac646-5e3b-515b-8ae3-04624282ee8c" },
  { browseSlug: "bpc-tb-blend-bb20", browseCode: "BB20", defaultVariantId: "76108f01-80e6-5f11-968b-4ba69d762320" },
  { browseSlug: "bpc-tb-blend-bb40", browseCode: "BB40", defaultVariantId: "552bcdae-13f0-54e9-8adb-5e686a5c0bf3" },
  { browseSlug: "aod-9604", browseCode: "AOD5", defaultVariantId: "2d3efed4-2c53-5593-9dec-0931bd2f1c44" },
  { browseSlug: "mots-c", browseCode: "MS10", defaultVariantId: "844c60d7-36b7-526f-89a6-82ec1d501050" },
  { browseSlug: "selank", browseCode: "SK10", defaultVariantId: "89f0742c-30ef-5196-a15b-1cb1e03426e9" },
  { browseSlug: "semax", browseCode: "XA10", defaultVariantId: "005059ad-dd45-504c-b3e9-cfde386bbd2b" },
  { browseSlug: "semax-selank", browseCode: "20SS", defaultVariantId: "3305a442-cc1d-5049-a7d2-097bdc41dd32" },
  { browseSlug: "thymosin-alpha-1", browseCode: "TA10", defaultVariantId: "cd66cb9a-e2f9-5971-9a01-0dbd1d9f6450" },
  { browseSlug: "dsip", browseCode: "DS5", defaultVariantId: "8bc743dd-ddf2-54d7-9858-587b4b762605" },
  { browseSlug: "cjc-1295-no-dac-ipa", browseCode: "CP10", defaultVariantId: "bbffa403-e0e5-53a4-a144-a60cc1fa8cf1" },
  { browseSlug: "cjc-1295-no-dac-ipa-cp20", browseCode: "CP20", defaultVariantId: "2c3211f2-34a5-5f05-b8e4-4813b7a50e42" },
  { browseSlug: "ipamorelin", browseCode: "IP10", defaultVariantId: "e410a116-8f12-582d-890e-22dd9318fc56" },
  { browseSlug: "hcg", browseCode: "G5K", defaultVariantId: "f3106b5d-ef6a-5d8d-937a-536de87e4f05" },
  { browseSlug: "cargrilintide", browseCode: "CGL10", defaultVariantId: "3b0273b9-3b5c-5111-b09a-b8419b5adc89" },
  { browseSlug: "sermorelin-acetate", browseCode: "SMO10", defaultVariantId: "e1d9205b-4fbf-5bfc-95da-7c12f3bb63a7" },
  { browseSlug: "pt-141", browseCode: "PT141", defaultVariantId: "b3947bde-0c8a-5c54-91fc-45d2f12c1ad4" },
  { browseSlug: "glow", browseCode: "BBG70", defaultVariantId: "5ffb2718-6989-55b4-a72d-01ff197ffdbc" },
  { browseSlug: "oxytocin-acetate", browseCode: "OT10", defaultVariantId: "cdcc5a32-201a-5467-9dd8-aca915cc55df" },
  { browseSlug: "ll37", browseCode: "LL375", defaultVariantId: "5edfccec-11c5-5000-9cb0-7141dd144278" },
  { browseSlug: "glutathione", browseCode: "GT1500", defaultVariantId: "05e9617d-8d17-5525-b8ba-2ef30ea1213d" },
  { browseSlug: "snap", browseCode: "SNP10", defaultVariantId: "964bb892-b516-5d08-93c2-3e13ba47afad" },
  { browseSlug: "li-po-c", browseCode: "LPC", defaultVariantId: "49a95c80-1230-57db-8d74-f97b12d80dd7" },
  { browseSlug: "li-po-c-without-b12", browseCode: "LPC", defaultVariantId: "db2c79d4-942d-5708-bbdd-0cd020641efd" },
  { browseSlug: "lemon-bottle", browseCode: "LB", defaultVariantId: "fe5ff5df-c740-5fe6-8a53-6e1e317590cd" },
  { browseSlug: "mt1", browseCode: "MT1", defaultVariantId: "c0a4886e-0762-54db-bb11-447dc673fa30" },
  { browseSlug: "mt2", browseCode: "MT210", defaultVariantId: "43e37aab-c03f-5376-bd16-7ea75e9e4e9f" },
  { browseSlug: "ss-31", browseCode: "2S10", defaultVariantId: "dcf29255-da96-588f-804e-442a336cbe69" },
  { browseSlug: "klow", browseCode: "BBGK", defaultVariantId: "c12d3994-0164-52cc-a4fd-71d8b7720eb1" },
  { browseSlug: "5-amino-1mq", browseCode: "5A50", defaultVariantId: "1c56b823-848e-5d8c-aaca-056168a033a2" },
  { browseSlug: "kisspeptin", browseCode: "KS10", defaultVariantId: "513745eb-55bd-5baf-87fb-4915a6aee5a6" },
  { browseSlug: "pinealon", browseCode: "PN5", defaultVariantId: "7881fc75-3c25-5bb6-b235-89b4a7baaa44" },
  { browseSlug: "pe-22-28", browseCode: "PE10", defaultVariantId: "b63653f8-a84d-556f-9e71-6643c6080a0d" },
  { browseSlug: "igf-1-lr3", browseCode: "IG1", defaultVariantId: "8f9bb57e-0355-566f-adde-2474a9c3efbc" },
  { browseSlug: "ara-290", browseCode: "RA10", defaultVariantId: "14520cb5-06ff-50c0-bebd-bf6c147f0cd8" },
  { browseSlug: "acetic-acid", browseCode: "AA", defaultVariantId: "ee0b5072-6daf-5cbb-917c-8dc81c92486d" },
  { browseSlug: "semaglutide", browseCode: "SM10", defaultVariantId: "a6181236-9de5-55b3-ab83-0d7524f371b6" },
  { browseSlug: "kpv", browseCode: "KPV10", defaultVariantId: "a9402071-c149-5af5-95f2-ad6588604210" },
  { browseSlug: "epithalon", browseCode: "ET10", defaultVariantId: "f9dfb304-780f-5bdb-af82-660f5d6fe1d2" },
  { browseSlug: "cjc-1295-with-dac", browseCode: "CD5", defaultVariantId: "ab7a14bf-9b9a-56b9-aca6-16ac31fb3d12" },
  { browseSlug: "cjc-1295-no-dac", browseCode: "CND5", defaultVariantId: "37f13254-0e24-52ab-8cf0-5095d9ff5982" },
  { browseSlug: "grp-2", browseCode: "GRP-2", defaultVariantId: "bc60b820-f680-5376-b618-31a3d7be9ee7" },
  { browseSlug: "vip", browseCode: "VP10", defaultVariantId: "a321b5e3-d39a-5b73-a26f-1614b4523d40" },
  { browseSlug: "survodutide", browseCode: "SUR10", defaultVariantId: "c0b57d84-558c-541a-b6a0-189babae6fc4" },
  { browseSlug: "admax", browseCode: "Admax", defaultVariantId: "b6e9d630-8131-5e4b-bbb5-ca04abf087c2" },
  { browseSlug: "cartalax", browseCode: "Car20", defaultVariantId: "5b420c28-d963-5673-9778-0730d0cae4de" },
  { browseSlug: "bac-water", browseCode: "BA3", defaultVariantId: "3e70c3a4-a773-539d-a9b8-4e51427be8c4" },
];

const expectedPositive = new Map([
  [key("snap", "SNP10"), 2999],
  [key("tirzepatide", "TR30"), 5999], [key("tirzepatide", "TR60"), 10999],
  [key("retatrutide", "RT10"), 6999], [key("retatrutide", "RT20"), 13499], [key("retatrutide", "RT30"), 19999],
  [key("nad-plus", "NJ500"), 6999], [key("ghk-cu", "CU50"), 2999], [key("ghk-cu", "CU100"), 5799],
  [key("tesmorelin", "TESA10"), 6999], [key("bpc-157", "BPC10"), 3999], [key("tb500", "TB10"), 3999],
  [key("bpc-tb-blend", "BB10"), 7999], [key("bpc-tb-blend-bb20", "BB20"), 14999], [key("aod-9604", "AOD5"), 4999],
  [key("mots-c", "MS10"), 3999], [key("mots-c", "MS40"), 13499], [key("selank", "SK10"), 2995],
  [key("semax", "XA10"), 2995], [key("thymosin-alpha-1", "TA10"), 3999], [key("dsip", "DS5"), 2999],
  [key("cjc-1295-no-dac-ipa", "CP10"), 5999], [key("ipamorelin", "IP10"), 4999], [key("cargrilintide", "CGL10"), 6999],
  [key("sermorelin-acetate", "SMO10"), 5999], [key("pt-141", "PT141"), 2999], [key("glow", "BBG70"), 8999],
  [key("ll37", "LL375"), 3499], [key("glutathione", "GT1500"), 5999], [key("mt2", "MT210"), 2995],
  [key("klow", "BBGK"), 9999], [key("5-amino-1mq", "5A50"), 4999], [key("kisspeptin", "KS10"), 4999],
  [key("igf-1-lr3", "IG1"), 6999], [key("ara-290", "RA10"), 4999], [key("semaglutide", "SM10"), 4999],
  [key("kpv", "KPV10"), 3999], [key("epithalon", "ET10"), 2999], [key("vip", "VP10"), 4999],
  [key("cartalax", "Car20"), 6999],
]);

const expectedEvidence = new Map([
  [key("snap", "SNP10"), { baseUnitMinor: 2999, url: "https://www.aminoclub.com/us/products/snap-8", observedAt: "2026-09-02T19:03:51.9477748-07:00" }],
  [key("tirzepatide", "TR30"), { baseUnitMinor: 5999, url: "https://www.aminoclub.com/us/products/glp-2", observedAt: "2026-09-02T02:04:54.0166213-07:00" }],
  [key("tirzepatide", "TR60"), { baseUnitMinor: 10999, url: "https://www.aminoclub.com/us/products/glp-2", observedAt: "2026-09-02T02:04:54.0166213-07:00" }],
  [key("retatrutide", "RT10"), { baseUnitMinor: 6999, url: "https://www.aminoclub.com/us/products/glp-3", observedAt: "2026-09-02T02:04:54.0166213-07:00" }],
  [key("retatrutide", "RT20"), { baseUnitMinor: 13499, url: "https://www.aminoclub.com/us/products/glp-3", observedAt: "2026-09-02T02:04:54.0166213-07:00" }],
  [key("retatrutide", "RT30"), { baseUnitMinor: 19999, url: "https://www.aminoclub.com/us/products/glp-3", observedAt: "2026-09-02T02:04:54.0166213-07:00" }],
  [key("nad-plus", "NJ500"), { baseUnitMinor: 6999, url: "https://www.aminoclub.com/us/products/nad-plus", observedAt: "2026-09-02T02:04:54.0166213-07:00" }],
  [key("ghk-cu", "CU50"), { baseUnitMinor: 2999, url: "https://www.aminoclub.com/us/products/ghk-cu", observedAt: "2026-09-02T02:04:54.0166213-07:00" }],
  [key("ghk-cu", "CU100"), { baseUnitMinor: 5799, url: "https://www.aminoclub.com/us/products/ghk-cu", observedAt: "2026-09-02T02:04:54.0166213-07:00" }],
  [key("tesmorelin", "TESA10"), { baseUnitMinor: 6999, url: "https://www.aminoclub.com/us/products/tesamorlin", observedAt: "2026-09-02T02:04:54.0166213-07:00" }],
  [key("bpc-157", "BPC10"), { baseUnitMinor: 3999, url: "https://www.aminoclub.com/us/products/bpc-157", observedAt: "2026-09-02T02:04:54.0166213-07:00" }],
  [key("tb500", "TB10"), { baseUnitMinor: 3999, url: "https://www.aminoclub.com/us/products/tb-500", observedAt: "2026-09-02T02:04:54.0166213-07:00" }],
  [key("bpc-tb-blend", "BB10"), { baseUnitMinor: 7999, url: "https://www.aminoclub.com/us/products/wolverine-stack", observedAt: "2026-09-02T02:04:54.0166213-07:00" }],
  [key("bpc-tb-blend-bb20", "BB20"), { baseUnitMinor: 14999, url: "https://www.aminoclub.com/us/products/wolverine-stack", observedAt: "2026-09-02T02:04:54.0166213-07:00" }],
  [key("aod-9604", "AOD5"), { baseUnitMinor: 4999, url: "https://www.aminoclub.com/us/products/aod-9604", observedAt: "2026-09-02T02:04:54.0166213-07:00" }],
  [key("mots-c", "MS10"), { baseUnitMinor: 3999, url: "https://www.aminoclub.com/us/products/mots-c", observedAt: "2026-09-02T02:04:54.0166213-07:00" }],
  [key("mots-c", "MS40"), { baseUnitMinor: 13499, url: "https://www.aminoclub.com/us/products/mots-c", observedAt: "2026-09-02T02:04:54.0166213-07:00" }],
  [key("selank", "SK10"), { baseUnitMinor: 2995, url: "https://www.aminoclub.com/us/products/selank", observedAt: "2026-09-02T02:04:54.0166213-07:00" }],
  [key("semax", "XA10"), { baseUnitMinor: 2995, url: "https://www.aminoclub.com/us/products/semax", observedAt: "2026-09-02T02:04:54.0166213-07:00" }],
  [key("thymosin-alpha-1", "TA10"), { baseUnitMinor: 3999, url: "https://www.aminoclub.com/us/products/thymosin-alpha-1", observedAt: "2026-09-02T02:04:54.0166213-07:00" }],
  [key("dsip", "DS5"), { baseUnitMinor: 2999, url: "https://www.aminoclub.com/us/products/dsip", observedAt: "2026-09-02T02:04:54.0166213-07:00" }],
  [key("cjc-1295-no-dac-ipa", "CP10"), { baseUnitMinor: 5999, url: "https://www.aminoclub.com/us/products/cjc-ipa-no-dac", observedAt: "2026-09-02T02:04:54.0166213-07:00" }],
  [key("ipamorelin", "IP10"), { baseUnitMinor: 4999, url: "https://www.aminoclub.com/us/products/ipamorelin", observedAt: "2026-09-02T02:04:54.0166213-07:00" }],
  [key("cargrilintide", "CGL10"), { baseUnitMinor: 6999, url: "https://www.aminoclub.com/us/products/cagrilintide", observedAt: "2026-09-02T02:04:54.0166213-07:00" }],
  [key("sermorelin-acetate", "SMO10"), { baseUnitMinor: 5999, url: "https://www.aminoclub.com/us/products/sermorelin", observedAt: "2026-09-02T02:04:54.0166213-07:00" }],
  [key("pt-141", "PT141"), { baseUnitMinor: 2999, url: "https://www.aminoclub.com/us/products/pt-141", observedAt: "2026-09-02T02:04:54.0166213-07:00" }],
  [key("glow", "BBG70"), { baseUnitMinor: 8999, url: "https://www.aminoclub.com/us/products/glow", observedAt: "2026-09-02T02:04:54.0166213-07:00" }],
  [key("ll37", "LL375"), { baseUnitMinor: 3499, url: "https://www.aminoclub.com/us/products/ll-37", observedAt: "2026-09-02T02:04:54.0166213-07:00" }],
  [key("glutathione", "GT1500"), { baseUnitMinor: 5999, url: "https://www.aminoclub.com/us/products/glutathione", observedAt: "2026-09-02T02:04:54.0166213-07:00" }],
  [key("mt2", "MT210"), { baseUnitMinor: 2995, url: "https://www.aminoclub.com/us/products/melanotan-ii", observedAt: "2026-09-02T02:04:54.0166213-07:00" }],
  [key("klow", "BBGK"), { baseUnitMinor: 9999, url: "https://www.aminoclub.com/us/products/klow", observedAt: "2026-09-02T02:04:54.0166213-07:00" }],
  [key("5-amino-1mq", "5A50"), { baseUnitMinor: 4999, url: "https://www.aminoclub.com/us/products/5-amino-1mq", observedAt: "2026-09-02T02:04:54.0166213-07:00" }],
  [key("kisspeptin", "KS10"), { baseUnitMinor: 4999, url: "https://www.aminoclub.com/us/products/kisspeptin", observedAt: "2026-09-02T02:04:54.0166213-07:00" }],
  [key("igf-1-lr3", "IG1"), { baseUnitMinor: 6999, url: "https://www.aminoclub.com/us/products/igf-1-lr3", observedAt: "2026-09-02T02:04:54.0166213-07:00" }],
  [key("ara-290", "RA10"), { baseUnitMinor: 4999, url: "https://www.aminoclub.com/us/products/ara-290", observedAt: "2026-09-02T02:04:54.0166213-07:00" }],
  [key("semaglutide", "SM10"), { baseUnitMinor: 4999, url: "https://www.aminoclub.com/us/products/glp-1", observedAt: "2026-09-02T02:04:54.0166213-07:00" }],
  [key("kpv", "KPV10"), { baseUnitMinor: 3999, url: "https://www.aminoclub.com/us/products/kpv", observedAt: "2026-09-02T02:04:54.0166213-07:00" }],
  [key("epithalon", "ET10"), { baseUnitMinor: 2999, url: "https://www.aminoclub.com/us/products/epithalon", observedAt: "2026-09-02T02:04:54.0166213-07:00" }],
  [key("vip", "VP10"), { baseUnitMinor: 4999, url: "https://www.aminoclub.com/us/products/vip", observedAt: "2026-09-02T02:04:54.0166213-07:00" }],
  [key("cartalax", "Car20"), { baseUnitMinor: 6999, url: "https://www.aminoclub.com/us/products/cartalax", observedAt: "2026-09-02T02:04:54.0166213-07:00" }],
]);

function uuidV5(name: string): string {
  const namespace = Buffer.from("6ba7b8109dad11d180b400c04fd430c8", "hex");
  const digest = createHash("sha1")
    .update(Buffer.concat([namespace, Buffer.from(name)]))
    .digest();
  digest[6] = (digest[6]! & 0x0f) | 0x50;
  digest[8] = (digest[8]! & 0x3f) | 0x80;
  const hex = digest.subarray(0, 16).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function legacyAmountFromPackageForm(packageForm: string): { value: number; unit: "mg" | "mcg" | "iu" } | null {
  const label = packageForm.slice(0, -" × 10 vials".length);
  if (label.includes("+")) return null;
  const match = /^(\d+(?:\.\d+)?)(mg|mcg|iu)$/iu.exec(label);
  return match === null
    ? null
    : { value: Number(match[1]), unit: match[2]!.toLowerCase() as "mg" | "mcg" | "iu" };
}

function baselineDigest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function expectedBaseCatalog() {
  const products = browseCatalogProducts.map((product) => {
    const id = uuidV5(`propeptiq.com/storefront/product/${product.slug}`);
    const variants = product.variants.map((variant) => ({
      browseSlug: product.slug,
      browseCode: variant.code,
      id: uuidV5(`propeptiq.com/storefront/variant/${product.slug}/${variant.code}`),
      sku: `PPQ-${product.slug.toUpperCase().replace(/[^A-Z0-9]+/gu, "-")}-${variant.code.toUpperCase().replace(/[^A-Z0-9]+/gu, "-")}`,
      amount: legacyAmountFromPackageForm(variant.packageForm),
    }));
    const defaultVariant = variants.find((variant) => (
      expectedPositive.has(key(variant.browseSlug, variant.browseCode))
    )) ?? variants[0]!;
    return { slug: product.slug, id, defaultVariantId: defaultVariant.id, variants };
  });

  return {
    products: products.map(({ slug, id, defaultVariantId }) => ({ slug, id, defaultVariantId })),
    variants: products.flatMap(({ variants }) => variants),
  };
}

function actualCatalog() {
  const productById = new Map(
    storefrontCatalogData.products.map((product) => [product.id, product] as const),
  );
  return {
    products: storefrontCatalogData.products.map((product) => ({
      slug: product.slug,
      id: product.id,
      defaultVariantId: product.defaultVariantId,
    })),
    variants: storefrontCatalogData.bindings.variants.map((variant) => ({
      browseSlug: productById.get(variant.productId)?.slug,
      browseCode: variant.browseCode,
      id: variant.id,
      sku: variant.sku,
      amount: variant.amount,
    })),
  };
}

describe("storefront catalog decision manifest", () => {
  it("publishes the exact 56 owner-authorized default decisions and audited UUID mapping", () => {
    const defaults = approvedStorefrontCatalogDefaultDecisions;
    const exactDecisions = expectedDefaultDecisions.map(({ browseSlug, browseCode }) => ({
      browseSlug,
      browseCode,
    }));

    expect(defaults).toEqual(exactDecisions);
    expect(defaults).toHaveLength(56);
    expect(new Set(defaults.map((entry) => entry.browseSlug)).size).toBe(56);
    expect(new Set(defaults.map((entry) => key(entry.browseSlug, entry.browseCode))).size).toBe(56);
    expect(Object.isFrozen(defaults)).toBe(true);
    expect(defaults.every((entry) => Object.isFrozen(entry))).toBe(true);

    const products = new Map(
      storefrontCatalogDecisionManifest.products.map((product) => [product.browseSlug, product]),
    );
    for (const expected of expectedDefaultDecisions) {
      expect(products.get(expected.browseSlug)?.defaultVariantId).toBe(expected.defaultVariantId);
      expect(storefrontCatalogDecisionManifest.variants).toContainEqual(
        expect.objectContaining({
          browseSlug: expected.browseSlug,
          browseCode: expected.browseCode,
          id: expected.defaultVariantId,
        }),
      );
    }
  });

  it("rejects incomplete, duplicate, unknown, malformed, sparse, and cross-product default decisions", () => {
    const defaults = expectedDefaultDecisions.map(({ browseSlug, browseCode }) => ({
      browseSlug,
      browseCode,
    }));
    const amounts = storefrontCatalogDecisionManifest.variants.map((variant) => ({
      browseSlug: variant.browseSlug,
      browseCode: variant.browseCode,
      amount: variant.amount,
    }));
    const duplicate = [...defaults.slice(0, -1), defaults[0]!];
    const unknown = [{ ...defaults[0]!, browseSlug: "unknown-product" }, ...defaults.slice(1)];
    const malformed = defaults.map((entry, index) => (
      index === 0 ? { ...entry, extra: true } : entry
    ));
    const sparse = [...defaults];
    delete sparse[0];
    const crossProduct = [
      { ...defaults[0]!, browseCode: "RT10" },
      ...defaults.slice(1),
    ];

    expect(() => buildStorefrontCatalogDecisionManifest(browseCatalogProducts, approvedStorefrontCatalogPriceDecisions, amounts, defaults.slice(1))).toThrow();
    expect(() => buildStorefrontCatalogDecisionManifest(browseCatalogProducts, approvedStorefrontCatalogPriceDecisions, amounts, duplicate)).toThrow();
    expect(() => buildStorefrontCatalogDecisionManifest(browseCatalogProducts, approvedStorefrontCatalogPriceDecisions, amounts, unknown)).toThrow();
    expect(() => buildStorefrontCatalogDecisionManifest(browseCatalogProducts, approvedStorefrontCatalogPriceDecisions, amounts, malformed)).toThrow();
    expect(() => buildStorefrontCatalogDecisionManifest(browseCatalogProducts, approvedStorefrontCatalogPriceDecisions, amounts, sparse)).toThrow();
    expect(() => buildStorefrontCatalogDecisionManifest(browseCatalogProducts, approvedStorefrontCatalogPriceDecisions, amounts, crossProduct)).toThrow();
  });

  it("keeps explicit default UUIDs stable when products and variants are reordered", () => {
    const reorderedProducts = structuredClone(browseCatalogProducts)
      .map((product) => ({ ...product, variants: product.variants.toReversed() }))
      .toReversed() as unknown as typeof browseCatalogProducts;
    const amounts = storefrontCatalogDecisionManifest.variants.map((variant) => ({
      browseSlug: variant.browseSlug,
      browseCode: variant.browseCode,
      amount: variant.amount,
    }));
    const defaults = expectedDefaultDecisions.map(({ browseSlug, browseCode }) => ({
      browseSlug,
      browseCode,
    })).toReversed();

    const reordered = buildStorefrontCatalogDecisionManifest(
      reorderedProducts,
      approvedStorefrontCatalogPriceDecisions,
      amounts.toReversed(),
      defaults,
    );
    expect(new Map(reordered.products.map((product) => [product.browseSlug, product.defaultVariantId]))).toEqual(
      new Map(expectedDefaultDecisions.map((entry) => [entry.browseSlug, entry.defaultVariantId])),
    );
  });

  it("preserves the complete fixed pre-refactor identity, default, SKU, and amount baseline", () => {
    expect(baselineDigest(expectedBaseCatalog())).toBe(BASE_CATALOG_DIGEST);
    expect(baselineDigest(actualCatalog())).toBe(BASE_CATALOG_DIGEST);
  });

  it("covers the exact browse order and reverse scoped coverage", () => {
    expect(storefrontCatalogDecisionManifest.products.map((p) => p.browseSlug)).toEqual(
      browseCatalogProducts.map((p) => p.slug),
    );
    expect(storefrontCatalogDecisionManifest.products).toHaveLength(56);
    expect(storefrontCatalogDecisionManifest.variants).toHaveLength(103);
    expect(new Set(storefrontCatalogDecisionManifest.variants.map((v) => key(v.browseSlug, v.browseCode))).size).toBe(103);
    expect(storefrontCatalogDecisionManifest.products.flatMap((p) => p.variantIds)).toHaveLength(103);
  });

  it("locks the 40 approved cents and leaves 63 rows pending", () => {
    expect(approvedStorefrontCatalogPriceDecisions).toHaveLength(40);
    expect(new Set(approvedStorefrontCatalogPriceDecisions.map((d) => key(d.browseSlug, d.browseCode))).size).toBe(40);
    expect(new Map(storefrontCatalogDecisionManifest.variants.map((v) => [key(v.browseSlug, v.browseCode), v.baseUnitMinor]))).toEqual(
      new Map<string, number>([...expectedPositive.entries(), ...storefrontCatalogDecisionManifest.variants.filter((v) => !expectedPositive.has(key(v.browseSlug, v.browseCode))).map((v) => [key(v.browseSlug, v.browseCode), 0] as const)]),
    );
    expect(storefrontCatalogDecisionManifest.variants.filter((v) => v.decisionStatus === "approved_candidate")).toHaveLength(40);
    expect(storefrontCatalogDecisionManifest.variants.filter((v) => v.decisionStatus === "pending")).toHaveLength(63);
  });

  it("uses stable UUIDv5/SKU identity and preserves one-vial labels", () => {
    const rebuilt = buildStorefrontCatalogDecisionManifest(browseCatalogProducts, approvedStorefrontCatalogPriceDecisions);
    expect(rebuilt).toEqual(storefrontCatalogDecisionManifest);
    const lpc = storefrontCatalogDecisionManifest.variants.filter((v) => v.browseCode === "LPC");
    expect(new Set(lpc.map((v) => v.id)).size).toBe(2);
    expect(new Set(lpc.map((v) => v.sku)).size).toBe(2);
    for (const variant of storefrontCatalogDecisionManifest.variants) {
      const source = browseCatalogProducts.find((p) => p.slug === variant.browseSlug)?.variants.find((v) => v.code === variant.browseCode);
      expect(variant.publicLabel).toBe(source?.packageForm.slice(0, -" × 10 vials".length));
      expect(variant.packageQuantity).toBe(1);
      expect(variant.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u);
      expect(variant.stripeProductId).toBeNull();
      expect(variant.stripePriceId).toBeNull();
    }
  });

  it("requires exact evidence for positive rows and freezes every result", () => {
    for (const variant of storefrontCatalogDecisionManifest.variants) {
      if (variant.decisionStatus === "approved_candidate") {
        const expected = expectedEvidence.get(key(variant.browseSlug, variant.browseCode))!;
        expect(variant.baseUnitMinor).toBe(expected.baseUnitMinor);
        expect(variant.evidence).toMatchObject({ url: expected.url, observedAt: expected.observedAt });
        expect(variant.evidence).toEqual({
          source: "Amino Club",
          url: expect.stringMatching(/^https:\/\/www\.aminoclub\.com\/us\/products\/[a-z0-9-]+$/u),
          observedAt: expected.observedAt,
          basis: "ordinary_one_vial_list_price",
        });
        expect(Object.keys(variant.evidence ?? {}).sort()).toEqual(["basis", "observedAt", "source", "url"]);
      } else expect(variant.evidence).toBeNull();
      expect(Object.isFrozen(variant)).toBe(true);
      expect(Object.isFrozen(storefrontCatalogDecisionManifest.products.find((p) => p.browseSlug === variant.browseSlug)?.variantIds)).toBe(true);
      if (variant.evidence) expect(Object.isFrozen(variant.evidence)).toBe(true);
    }
    expect(Object.isFrozen(storefrontCatalogDecisionManifest)).toBe(true);
    expect(Object.isFrozen(storefrontCatalogDecisionManifest.products)).toBe(true);
    for (const product of storefrontCatalogDecisionManifest.products) expect(Object.isFrozen(product)).toBe(true);
    expect(Object.isFrozen(storefrontCatalogDecisionManifest.variants)).toBe(true);
  });

  it("looks up exact scoped rows and fails closed when absent", () => {
    expect(getStorefrontCatalogDecision("li-po-c", "LPC")).toBe(
      storefrontCatalogDecisionManifest.variants.find((v) => v.browseSlug === "li-po-c"),
    );
    expect(() => getStorefrontCatalogDecision("missing", "NOPE")).toThrow("Storefront catalog decision is missing");
  });

  it("projects the reviewed literal amount for single-unit rows and preserves null for composite or volume-only rows", () => {
    expect(getStorefrontCatalogDecision("tirzepatide", "TR30").amount).toEqual({
      value: 30,
      unit: "mg",
    });
    expect(getStorefrontCatalogDecision("nad-plus", "NJ500").amount).toEqual({
      value: 500,
      unit: "mg",
    });
    expect(getStorefrontCatalogDecision("hcg", "G5K").amount).toEqual({
      value: 5000,
      unit: "iu",
    });
    expect(getStorefrontCatalogDecision("glow", "BBG70").amount).toBeNull();
    expect(getStorefrontCatalogDecision("li-po-c", "LPC").amount).toBeNull();
  });

  it("fails closed when explicit amount coverage is incomplete, duplicated, or unknown", () => {
    const amounts = storefrontCatalogDecisionManifest.variants.map((variant) => ({
      browseSlug: variant.browseSlug,
      browseCode: variant.browseCode,
      amount: variant.amount,
    }));

    expect(() => buildStorefrontCatalogDecisionManifest(
      browseCatalogProducts,
      approvedStorefrontCatalogPriceDecisions,
      amounts.slice(1),
    )).toThrow();
    expect(() => buildStorefrontCatalogDecisionManifest(
      browseCatalogProducts,
      approvedStorefrontCatalogPriceDecisions,
      [...amounts, amounts[0]!],
    )).toThrow();
    expect(() => buildStorefrontCatalogDecisionManifest(
      browseCatalogProducts,
      approvedStorefrontCatalogPriceDecisions,
      [...amounts.slice(1), { ...amounts[0]!, browseCode: "UNKNOWN" }],
    )).toThrow();
    expect(() => buildStorefrontCatalogDecisionManifest(
      browseCatalogProducts,
      approvedStorefrontCatalogPriceDecisions,
      amounts.map((entry, index) => index === 0
        ? { ...entry, amount: { value: 0, unit: "mg" } }
        : entry),
    )).toThrow();
  });

  it("rejects malformed or incomplete decisions and browse data", () => {
    const clone = structuredClone(approvedStorefrontCatalogPriceDecisions);
    const browseClone = structuredClone(browseCatalogProducts);
    const browseSnapshot = structuredClone(browseClone);
    const decisionSnapshot = structuredClone(clone);
    expect(() => buildStorefrontCatalogDecisionManifest(browseCatalogProducts, clone.slice(1))).toThrow();
    expect(() => buildStorefrontCatalogDecisionManifest(browseCatalogProducts, [...clone, clone[0]!])).toThrow();
    expect(() => buildStorefrontCatalogDecisionManifest(browseCatalogProducts, [{ ...clone[0]!, baseUnitMinor: 0 }, ...clone.slice(1)])).toThrow();
    expect(() => buildStorefrontCatalogDecisionManifest([{ ...browseCatalogProducts[0]!, variants: [] }, ...browseCatalogProducts.slice(1)], clone)).toThrow();
    const changedLabel = structuredClone(browseCatalogProducts);
    Object.assign(changedLabel[0]!.variants[0]!, { packageForm: "5mg x 10 vials" });
    expect(() => buildStorefrontCatalogDecisionManifest(changedLabel, clone)).toThrow();
    const swappedDecision = structuredClone(clone);
    Object.assign(swappedDecision[0]!, { url: "https://www.aminoclub.com/us/products/glp-3" });
    expect(() => buildStorefrontCatalogDecisionManifest(browseCatalogProducts, swappedDecision)).toThrow();
    const extraKey = structuredClone(clone) as Array<typeof clone[number] & { extra?: boolean }>;
    Object.assign(extraKey[0]!, { extra: true });
    expect(() => buildStorefrontCatalogDecisionManifest(browseCatalogProducts, extraKey)).toThrow();
    const collision = structuredClone(browseCatalogProducts);
    const collisionProduct = collision.find((product) => product.slug === "li-po-c-without-b12")!;
    Object.assign(collisionProduct, { slug: "li_po_c" });
    expect(() => buildStorefrontCatalogDecisionManifest(collision, clone)).toThrow("identity collision");
    const wrongTimestamp = structuredClone(clone);
    Object.assign(wrongTimestamp[0]!, { observedAt: "2026-09-02T02:04:54.0166214-07:00" });
    expect(() => buildStorefrontCatalogDecisionManifest(browseCatalogProducts, wrongTimestamp)).toThrow();
    const pendingKey = structuredClone(clone);
    Object.assign(pendingKey[0]!, { browseSlug: "tirzepatide", browseCode: "TR5" });
    expect(() => buildStorefrontCatalogDecisionManifest(browseCatalogProducts, pendingKey)).toThrow();
    expect(buildStorefrontCatalogDecisionManifest(browseClone, clone)).toEqual(storefrontCatalogDecisionManifest);
    expect(browseClone).toEqual(browseSnapshot);
    expect(clone).toEqual(decisionSnapshot);
    expect(Object.isFrozen(browseCatalogProducts[0])).toBe(false);
    expect(Object.isFrozen(clone)).toBe(false);
    expect(Object.isFrozen(browseClone)).toBe(false);
    expect(Object.isFrozen(browseClone[0])).toBe(false);
    expect(Object.isFrozen(clone[0])).toBe(false);
  });
});
