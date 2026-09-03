import { describe, expect, it } from "vitest";

import { browseCatalogProducts } from "./browse-catalog";
import {
  approvedStorefrontCatalogPriceDecisions,
  buildStorefrontCatalogDecisionManifest,
  getStorefrontCatalogDecision,
  storefrontCatalogDecisionManifest,
} from "./storefront-catalog-manifest";

const key = (slug: string, code: string) => `${slug}:${code}`;

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

describe("storefront catalog decision manifest", () => {
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
    expect(() => buildStorefrontCatalogDecisionManifest(structuredClone(browseCatalogProducts).toReversed(), clone)).toThrow();
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
