import { z } from "zod";

import { scanPublicCopy } from "@/domain/content-policy";

export const browseCatalogCategories = [
  "metabolic",
  "repair",
  "cellular",
  "neuro",
  "endocrine",
  "cosmetic",
  "blends",
  "laboratory",
] as const;

export type BrowseCatalogCategory = (typeof browseCatalogCategories)[number];

export type BrowseCatalogVariant = Readonly<{
  code: string;
  packageForm: string;
  sourceName?: string;
  sourcePage?: number;
}>;

export type BrowseCatalogProduct = Readonly<{
  slug: string;
  name: string;
  sourceName: string;
  category: BrowseCatalogCategory;
  image: Readonly<{ src: `/catalog/${string}.webp`; alt: string }>;
  variants: readonly BrowseCatalogVariant[];
}>;

const variantSchema = z
  .object({
    code: z.string().trim().min(1),
    packageForm: z.string().trim().min(1),
    sourceName: z.string().trim().min(1).optional(),
    sourcePage: z.number().int().positive().optional(),
  })
  .strict();

const productSchema = z
  .object({
    slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u),
    name: z.string().trim().min(1),
    sourceName: z.string().trim().min(1),
    category: z.enum(browseCatalogCategories),
    image: z
      .object({
        src: z.string().regex(/^\/catalog\/[a-z0-9-]+\.webp$/u),
        alt: z.string().trim().min(1),
      })
      .strict(),
    variants: z.array(variantSchema).min(1),
  })
  .strict();

const publicationPolicy = {
  version: "owner-supplied-browse-catalog-v1",
  activeLotEvidenceIds: [],
} as const;

function copyIsPublishable(product: BrowseCatalogProduct): boolean {
  const text = [
    product.slug,
    product.name,
    product.sourceName,
    product.image.alt,
    ...product.variants.flatMap((variant) => [
      variant.code,
      variant.packageForm,
      variant.sourceName ?? "",
      variant.sourcePage?.toString() ?? "",
    ]),
  ].join(" ");
  return scanPublicCopy({ text, claims: [] }, publicationPolicy).publishable;
}

function imageFor(
  slug: string,
  name: string,
): BrowseCatalogProduct["image"] {
  return {
    src: `/catalog/${slug}.webp`,
    alt: `Original illustrative research-catalog still life for ${name}`,
  };
}

function product(
  slug: string,
  name: string,
  sourceName: string,
  category: BrowseCatalogCategory,
  variants: readonly BrowseCatalogVariant[],
): BrowseCatalogProduct {
  return { slug, name, sourceName, category, image: imageFor(slug, name), variants };
}

const ownerSuppliedProducts = [
  product("tirzepatide", "Tirzepatide", "TIRZEPATIDE", "metabolic", [
    { code: "TR5", packageForm: "5mg × 10 vials" },
    { code: "TR10", packageForm: "10mg × 10 vials" },
    { code: "TR15", packageForm: "15mg × 10 vials" },
    { code: "TR20", packageForm: "20mg × 10 vials" },
    { code: "TR30", packageForm: "30mg × 10 vials" },
    { code: "TR40", packageForm: "40mg × 10 vials" },
    { code: "TR50", packageForm: "50mg × 10 vials" },
    { code: "TR60", packageForm: "60mg × 10 vials" },
    { code: "TR100", packageForm: "100mg × 10 vials" },
  ]),
  product("retatrutide", "Retatrutide", "RETATRUTIDE", "metabolic", [
    { code: "RT5", packageForm: "5mg × 10 vials" },
    { code: "RT10", packageForm: "10mg × 10 vials" },
    { code: "RT15", packageForm: "15mg × 10 vials" },
    { code: "RT20", packageForm: "20mg × 10 vials" },
    { code: "RT30", packageForm: "30mg × 10 vials" },
    { code: "RT40", packageForm: "40mg × 10 vials" },
    { code: "RT50", packageForm: "50mg × 10 vials" },
    { code: "RT60", packageForm: "60mg × 10 vials" },
  ]),
  product("nad-plus", "NAD+", "NAD+", "cellular", [
    { code: "NJ100", packageForm: "100mg × 10 vials" },
    { code: "NJ500", packageForm: "500mg × 10 vials" },
    { code: "NJ1000", packageForm: "1000mg × 10 vials" },
  ]),
  product("hgh", "HGH", "HGH", "endocrine", [
    { code: "H10", packageForm: "10iu × 10 vials" },
    { code: "H15", packageForm: "15iu × 10 vials" },
    { code: "H24", packageForm: "24iu × 10 vials" },
  ]),
  product("ghk-cu", "GHK-CU", "GHK-CU", "cosmetic", [
    { code: "CU50", packageForm: "50mg × 10 vials" },
    { code: "CU100", packageForm: "100mg × 10 vials" },
  ]),
  product("tesmorelin", "Tesmorelin", "Tesmorelin", "endocrine", [
    { code: "TESA5", packageForm: "5mg × 10 vials" },
    { code: "TESA10", packageForm: "10mg × 10 vials" },
    { code: "TESA20", packageForm: "20mg × 10 vials" },
  ]),
  product("tesmorelin-ipa", "Tesmorelin + IPA", "Tesmorelin+IPA", "endocrine", [
    { code: "TI13", packageForm: "Tesmorelin 10mg + IPA 3mg × 10 vials" },
  ]),
  product("bpc-157", "BPC-157", "BPC-157", "repair", [
    { code: "BPC5", packageForm: "5mg × 10 vials" },
    { code: "BPC10", packageForm: "10mg × 10 vials" },
    { code: "BPC20", packageForm: "20mg × 10 vials" },
  ]),
  product("tb500", "TB500 (Thymosin B4 acetate)", "TB500 (Thymosin B4 acetate)", "repair", [
    { code: "TB5", packageForm: "5mg × 10 vials" },
    { code: "TB10", packageForm: "10mg × 10 vials" },
  ]),
  product("bpc-tb-blend", "BPC 5mg + TB 5mg", "BPC 5mg + TB 5mg", "blends", [
    { code: "BB10", packageForm: "10mg × 10 vials", sourceName: "BPC 5mg + TB 5mg", sourcePage: 2 },
  ]),
  product("bpc-tb-blend-bb20", "BPC 10mg + TB 10mg", "BPC 10mg + TB 10mg", "blends", [
    { code: "BB20", packageForm: "20mg × 10 vials", sourceName: "BPC 10mg + TB 10mg", sourcePage: 2 },
  ]),
  product("bpc-tb-blend-bb40", "BPC 20mg + TB 20mg", "BPC 20mg + TB 20mg", "blends", [
    { code: "BB40", packageForm: "40mg × 10 vials", sourceName: "BPC 20mg + TB 20mg", sourcePage: 2 },
  ]),
  product("aod-9604", "AOD 9604", "AOD 9604", "metabolic", [
    { code: "AOD5", packageForm: "5mg × 10 vials" },
    { code: "AOD10", packageForm: "10mg × 10 vials" },
  ]),
  product("mots-c", "MOTS-C", "MOTS-C", "cellular", [
    { code: "MS10", packageForm: "10mg × 10 vials" },
    { code: "MS20", packageForm: "20mg × 10 vials" },
    { code: "MS40", packageForm: "40mg × 10 vials" },
  ]),
  product("selank", "Selank", "SELANK", "neuro", [
    { code: "SK10", packageForm: "10mg × 10 vials" },
  ]),
  product("semax", "Semax", "SEMAX", "neuro", [
    { code: "XA10", packageForm: "10mg × 10 vials" },
  ]),
  product("semax-selank", "Semax + Selank", "SEMAX+SELANK", "neuro", [
    { code: "20SS", packageForm: "20mg × 10 vials" },
  ]),
  product("thymosin-alpha-1", "Thymosin Alpha-1", "Thymosin Alpha-1", "cellular", [
    { code: "TA5", packageForm: "5mg × 10 vials" },
    { code: "TA10", packageForm: "10mg × 10 vials" },
  ]),
  product("dsip", "DSIP", "DSIP", "neuro", [
    { code: "DS5", packageForm: "5mg × 10 vials" },
    { code: "DS10", packageForm: "10mg × 10 vials" },
  ]),
  product("cjc-1295-no-dac-ipa", "CJC-1295 NO DAC 5mg + IPA 5mg", "CJC-1295 NO DAC 5mg + IPA 5mg", "endocrine", [
    { code: "CP10", packageForm: "10mg × 10 vials", sourceName: "CJC-1295 NO DAC 5mg + IPA 5mg", sourcePage: 2 },
  ]),
  product("cjc-1295-no-dac-ipa-cp20", "CJC-1295 NO DAC 10mg + IPA 10mg", "CJC-1295 NO DAC 10mg + IPA 10mg", "endocrine", [
    { code: "CP20", packageForm: "20mg × 10 vials", sourceName: "CJC-1295 NO DAC 10mg + IPA 10mg", sourcePage: 2 },
  ]),
  product("ipamorelin", "Ipamorelin", "Ipamorelin", "endocrine", [
    { code: "IP5", packageForm: "5mg × 10 vials" },
    { code: "IP10", packageForm: "10mg × 10 vials" },
  ]),
  product("hcg", "HCG", "HCG", "endocrine", [
    { code: "G5K", packageForm: "5000iu × 10 vials" },
  ]),
  product("cargrilintide", "Cargrilintide", "CARGRILINTIDE", "metabolic", [
    { code: "CGL5", packageForm: "5mg × 10 vials" },
    { code: "CGL10", packageForm: "10mg × 10 vials" },
  ]),
  product("sermorelin-acetate", "Sermorelin Acetate", "Sermorelin Acetate", "endocrine", [
    { code: "SMO5", packageForm: "5mg × 10 vials" },
    { code: "SMO10", packageForm: "10mg × 10 vials" },
  ]),
  product("pt-141", "PT-141", "PT-141", "endocrine", [
    { code: "PT141", packageForm: "10mg × 10 vials" },
  ]),
  product("glow", "GLOW", "GLOW", "blends", [
    { code: "BBG50", packageForm: "GHK 35mg + TB 5mg + BPC 10mg × 10 vials" },
    { code: "BBG70", packageForm: "GHK 50mg + TB 10mg + BPC 10mg × 10 vials" },
  ]),
  product("oxytocin-acetate", "Oxytocin Acetate", "Oxytocin Acetate", "endocrine", [
    { code: "OT10", packageForm: "10mg × 10 vials" },
  ]),
  product("ll37", "LL37", "LL37", "repair", [
    { code: "LL375", packageForm: "5mg × 10 vials" },
  ]),
  product("glutathione", "Glutathione", "Glutathione", "cellular", [
    { code: "GT600", packageForm: "600mg × 10 vials" },
    { code: "GT1500", packageForm: "1500mg × 10 vials" },
  ]),
  product("snap", "SNAP", "SNAP", "cosmetic", [
    { code: "SNP10", packageForm: "10mg × 10 vials" },
  ]),
  product("li-po-c", "LI PO-C", "LI PO-C", "cellular", [
    { code: "LPC", packageForm: "10ml × 10 vials" },
  ]),
  product("li-po-c-without-b12", "LI PO-C without B12", "LI PO-C without B12", "cellular", [
    { code: "LPC", packageForm: "10ml × 10 vials" },
  ]),
  product("lemon-bottle", "Lemon bottle", "Lemon bottle", "cosmetic", [
    { code: "LB", packageForm: "10ml × 10 vials" },
  ]),
  product("mt1", "MT1", "MT1", "cosmetic", [
    { code: "MT1", packageForm: "10ml × 10 vials" },
  ]),
  product("mt2", "MT2", "MT2", "cosmetic", [
    { code: "MT210", packageForm: "10mg × 10 vials" },
  ]),
  product("ss-31", "SS-31", "SS-31", "cellular", [
    { code: "2S10", packageForm: "10mg × 10 vials" },
    { code: "2S50", packageForm: "50mg × 10 vials" },
  ]),
  product("klow", "KLOW", "KLOW", "blends", [
    { code: "BBGK", packageForm: "GHK 50mg + KPV 10mg + BPC 10mg + TB 10mg × 10 vials" },
  ]),
  product("5-amino-1mq", "5-amino-1mq", "5-amino-1mq", "metabolic", [
    { code: "5A5", packageForm: "5mg × 10 vials" },
    { code: "5A10", packageForm: "10mg × 10 vials" },
    { code: "5A20", packageForm: "20mg × 10 vials" },
    { code: "5A50", packageForm: "50mg × 10 vials" },
  ]),
  product("kisspeptin", "KissPeptin", "KissPeptin", "endocrine", [
    { code: "KS5", packageForm: "5mg × 10 vials" },
    { code: "KS10", packageForm: "10mg × 10 vials" },
  ]),
  product("pinealon", "Pinealon", "Pinealon10mg", "neuro", [
    { code: "PN5", packageForm: "5mg × 10 vials" },
  ]),
  product("pe-22-28", "PE-22-28", "PE-22-28", "neuro", [
    { code: "PE10", packageForm: "10mg × 10 vials" },
  ]),
  product("igf-1-lr3", "IGF-1 LR3", "IGF-1 LR3", "endocrine", [
    { code: "IG1", packageForm: "1mg × 10 vials" },
  ]),
  product("ara-290", "ARA-290", "ARA-290", "repair", [
    { code: "RA10", packageForm: "10mg × 10 vials" },
  ]),
  product("acetic-acid", "Acetic Acid", "Acetic Acid", "laboratory", [
    { code: "AA", packageForm: "3ml × 10 vials" },
  ]),
  product("semaglutide", "Semaglutide", "SEMAGLUTIDE", "metabolic", [
    { code: "SM5", packageForm: "5mg × 10 vials" },
    { code: "SM10", packageForm: "10mg × 10 vials" },
    { code: "SM15", packageForm: "15mg × 10 vials" },
    { code: "SM20", packageForm: "20mg × 10 vials" },
    { code: "SM30", packageForm: "30mg × 10 vials" },
  ]),
  product("kpv", "KPV", "KPV", "repair", [
    { code: "KPV10", packageForm: "10mg × 10 vials" },
  ]),
  product("epithalon", "Epithalon", "Epithalon", "cellular", [
    { code: "ET10", packageForm: "10mg × 10 vials" },
    { code: "ET50", packageForm: "50mg × 10 vials" },
  ]),
  product("cjc-1295-with-dac", "CJC-1295 with DAC", "CJC-1295 with DAC", "endocrine", [
    { code: "CD5", packageForm: "5mg × 10 vials" },
  ]),
  product("cjc-1295-no-dac", "CJC-1295 NO DAC", "CJC-1295 NO DAC", "endocrine", [
    { code: "CND5", packageForm: "5mg × 10 vials" },
    { code: "CND10", packageForm: "10mg × 10 vials" },
  ]),
  product("grp-2", "GRP-2", "GRP-2", "neuro", [
    { code: "GRP-2", packageForm: "10mg × 10 vials" },
  ]),
  product("vip", "VIP", "VIP", "cellular", [
    { code: "VP10", packageForm: "10mg × 10 vials" },
  ]),
  product("survodutide", "Survodutide", "Survodutide", "metabolic", [
    { code: "SUR10", packageForm: "10mg × 10 vials" },
  ]),
  product("admax", "Admax", "Admax", "neuro", [
    { code: "Admax", packageForm: "10mg × 10 vials" },
  ]),
  product("cartalax", "Cartalax", "Cartalax", "repair", [
    { code: "Car20", packageForm: "20mg × 10 vials" },
  ]),
  product("bac-water", "Bac water", "Bac water", "laboratory", [
    { code: "BA3", packageForm: "3ml × 10 vials" },
    { code: "BA10", packageForm: "10ml × 10 vials" },
  ]),
] as const satisfies readonly BrowseCatalogProduct[];

export function validateBrowseCatalogProduct(
  candidate: unknown,
): BrowseCatalogProduct {
  const result = productSchema.safeParse(candidate);
  if (!result.success) {
    const issuePath = result.error.issues[0]?.path.join(".") || "unknown field";
    throw new Error(`Invalid browse catalog product at ${issuePath}`);
  }

  const parsed = result.data as BrowseCatalogProduct;
  const exactSourceNames = new Set(
    parsed.variants.map((variant) => variant.sourceName ?? parsed.sourceName),
  );
  if (exactSourceNames.size !== 1 || !exactSourceNames.has(parsed.sourceName)) {
    throw new Error(
      `Browse catalog product ${parsed.slug} must contain one exact source Name`,
    );
  }
  if (!copyIsPublishable(parsed)) {
    throw new Error(`Browse catalog product ${parsed.slug} is not publishable`);
  }

  return parsed;
}

const validatedProducts = ownerSuppliedProducts.map(validateBrowseCatalogProduct);

const uniqueSlugs = new Set(validatedProducts.map(({ slug }) => slug));
if (uniqueSlugs.size !== validatedProducts.length) {
  throw new Error("Browse catalog contains duplicate product slugs");
}

export const browseCatalogProducts: readonly BrowseCatalogProduct[] =
  Object.freeze(validatedProducts);

export const browseCatalogVariantCount = browseCatalogProducts.reduce(
  (total, entry) => total + entry.variants.length,
  0,
);

export function findBrowseCatalogProduct(
  slug: string,
): BrowseCatalogProduct | null {
  return browseCatalogProducts.find((entry) => entry.slug === slug) ?? null;
}
