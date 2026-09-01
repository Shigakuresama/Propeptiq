import { describe, expect, it } from "vitest";

import type {
  CanonicalPublicStorefrontProduct,
  PublicStorefrontVariant,
} from "./storefront-public";
import {
  canAddPublicVariant,
  resolvePublicVariantPrice,
  selectCardVariant,
  summarizePublicStorefrontVariants,
  type PricePresentationMode,
  type PublicStorefrontPricingContext,
} from "./storefront-price-presentation";
import { publicVariantPurchaseState } from "./storefront-price-presentation";

const evaluatedAt = "2026-08-31T12:00:00.000Z";

function pricing(
  mode: PricePresentationMode = "preview",
  promotions: PublicStorefrontPricingContext["automaticPromotions"] = [],
): PublicStorefrontPricingContext {
  return Object.freeze({ mode, evaluatedAt, automaticPromotions: promotions });
}

const winter30 = Object.freeze({
  id: "winter30",
  displayName: "Winter Sale",
  displayCode: "WINTER30",
  discountBps: 3_000,
  enabled: true as const,
  startAt: null,
  endAt: null,
  timezone: "America/Los_Angeles",
  scope: Object.freeze({ kind: "sitewide" as const }),
  applicationMode: "automatic" as const,
});

function variant(
  overrides: Partial<PublicStorefrontVariant> = {},
): PublicStorefrontVariant {
  return Object.freeze({
    id: "variant-5mg",
    sku: "TEST-5MG",
    label: "5 mg",
    amount: Object.freeze({ value: 5, unit: "mg" as const }),
    packageQuantity: 1,
    availability: "available" as const,
    priceStatus: "active" as const,
    baseUnitMinor: 1_005,
    currency: "USD" as const,
    checkoutReady: true,
    ...overrides,
  });
}

function product(
  variants: readonly PublicStorefrontVariant[],
  defaultVariantId = variants[0]?.id ?? "missing-default",
): CanonicalPublicStorefrontProduct {
  return Object.freeze({
    kind: "canonical",
    id: "product-alpha",
    slug: "product-alpha",
    name: "Synthetic Product Alpha",
    sourceName: "Synthetic source",
    category: "test",
    description: null,
    image: Object.freeze({ src: "/catalog/tirzepatide.webp", alt: "Synthetic fixture", width: 1254, height: 1254 }),
    displayConfigurations: Object.freeze([]),
    aliases: Object.freeze([]),
    popularityRank: 1,
    releasedAt: "2026-08-30T00:00:00.000Z",
    defaultVariantId,
    variants: Object.freeze([...variants]),
    relatedProductIds: Object.freeze([]),
    content: Object.freeze([]),
  });
}

describe("canAddPublicVariant", () => {
  it.each([
    ["active ready", variant(), "production", true],
    ["active mapping missing", variant({ checkoutReady: false }), "preview", false],
    ["active zero", variant({ baseUnitMinor: 0 }), "preview", false],
    ["active null amount", variant({ baseUnitMinor: null }), "preview", false],
    ["active null currency", variant({ currency: null }), "preview", false],
    ["active unavailable", variant({ availability: "unavailable" }), "preview", false],
    ["active preview only", variant({ availability: "preview_only" }), "preview", false],
    ["pending explicit preview zero", variant({ priceStatus: "pending", availability: "preview_only", baseUnitMinor: 0, checkoutReady: false }), "preview", true],
    ["pending explicit local zero", variant({ priceStatus: "pending", availability: "preview_only", baseUnitMinor: 0, checkoutReady: false }), "local", true],
    ["pending explicit test zero", variant({ priceStatus: "pending", availability: "preview_only", baseUnitMinor: 0, checkoutReady: false }), "test", true],
    ["pending production zero", variant({ priceStatus: "pending", availability: "preview_only", baseUnitMinor: 0, checkoutReady: false }), "production", false],
    ["pending zero claiming readiness", variant({ priceStatus: "pending", availability: "preview_only", baseUnitMinor: 0, checkoutReady: true }), "preview", false],
    ["pending positive", variant({ priceStatus: "pending", availability: "preview_only", checkoutReady: false }), "preview", false],
    ["pending null", variant({ priceStatus: "pending", availability: "preview_only", baseUnitMinor: null, currency: null, checkoutReady: false }), "preview", false],
    ["pending available", variant({ priceStatus: "pending", availability: "available", baseUnitMinor: 0, checkoutReady: false }), "preview", false],
    ["unavailable price", variant({ priceStatus: "unavailable", availability: "unavailable", baseUnitMinor: null, currency: null, checkoutReady: false }), "preview", false],
  ] as const)("fails closed for %s", (_label, input, mode, expected) => {
    expect(canAddPublicVariant(input, mode)).toBe(expected);
  });
});

describe("public variant state equivalence", () => {
  it.each([
    ["available active ready", variant(), "ready", "priced"],
    ["available active mapping missing", variant({ checkoutReady: false }), "checkout_unavailable", "priced"],
    ["unavailable active", variant({ availability: "unavailable", checkoutReady: false }), "unavailable", "unavailable"],
    ["available unavailable malformed", variant({ priceStatus: "unavailable", checkoutReady: false, baseUnitMinor: null, currency: null }), "pricing_pending", "pending"],
    ["pending null", variant({ priceStatus: "pending", availability: "preview_only", baseUnitMinor: null, currency: null, checkoutReady: false }), "pricing_pending", "pending"],
    ["pending positive", variant({ priceStatus: "pending", availability: "preview_only", baseUnitMinor: 1000, currency: "USD", checkoutReady: false }), "pricing_pending", "pending"],
    ["pending zero preview", variant({ priceStatus: "pending", availability: "preview_only", baseUnitMinor: 0, currency: "USD", checkoutReady: false }), "local_preview", "priced"],
    ["active zero", variant({ baseUnitMinor: 0, checkoutReady: false }), "pricing_pending", "pending"],
    ["active non USD", variant({ currency: null, checkoutReady: false }), "pricing_pending", "pending"],
  ] as const)("agrees for %s", (_name, input, expectedState, expectedPresentation) => {
    expect(publicVariantPurchaseState(input, "preview")).toBe(expectedState);
    expect(resolvePublicVariantPrice({ variant: input, productId: "product-alpha", quantity: 1, pricing: pricing("preview", []) }).state).toBe(expectedPresentation);
  });
});

describe("resolvePublicVariantPrice", () => {
  it("renders a valid active price once with a ready purchase state", () => {
    expect(resolvePublicVariantPrice({
      variant: variant(), productId: "product-alpha", quantity: 1, pricing: pricing("production"),
    })).toEqual({
      state: "priced",
      purchaseState: "ready",
      price: {
        variantId: "variant-5mg", quantity: 1, baseUnitMinor: 1_005,
        effectiveDiscountBps: 0, effectiveUnitMinor: 1_005,
        lineSubtotalMinor: 1_005, lineSavingsMinor: 0,
        appliedPromotionIds: [],
      },
    });
  });

  it("keeps a mapping-missing active price truthful but checkout unavailable", () => {
    const presentation = resolvePublicVariantPrice({
      variant: variant({ checkoutReady: false }), productId: "product-alpha", quantity: 1,
      pricing: pricing("production", [winter30]),
    });
    expect(presentation).toMatchObject({
      state: "priced", purchaseState: "checkout_unavailable",
      price: { baseUnitMinor: 1_005, effectiveUnitMinor: 704, lineSavingsMinor: 301, effectiveDiscountBps: 3_000 },
    });
    if (presentation.state === "priced") {
      expect(presentation.price).not.toHaveProperty("checkoutReady");
    }
  });

  it.each(["local", "test", "preview"] as const)(
    "allows the explicit pending-zero sale layout in %s mode only",
    (mode) => {
      const presentation = resolvePublicVariantPrice({
        variant: variant({ priceStatus: "pending", availability: "preview_only", baseUnitMinor: 0, checkoutReady: false }),
        productId: "product-alpha", quantity: 1, pricing: pricing(mode, [winter30]),
      });
      expect(presentation).toMatchObject({
        state: "priced", purchaseState: "local_preview",
        price: { baseUnitMinor: 0, effectiveUnitMinor: 0, lineSavingsMinor: 0, effectiveDiscountBps: 3_000 },
      });
      if (presentation.state === "priced") {
        expect(presentation.price).not.toHaveProperty("checkoutReady");
      }
    },
  );

  it("suppresses preview-zero sale arithmetic in production", () => {
    expect(resolvePublicVariantPrice({
      variant: variant({ priceStatus: "pending", availability: "preview_only", baseUnitMinor: 0, checkoutReady: false }),
      productId: "product-alpha", quantity: 1, pricing: pricing("production", [winter30]),
    })).toEqual({ state: "pending", purchaseState: "pricing_pending", reason: "pricing_coming_soon" });
  });

  it.each([
    ["active zero", variant({ baseUnitMinor: 0 })],
    ["active null", variant({ baseUnitMinor: null })],
    ["active null currency", variant({ currency: null })],
    ["active unsupported currency", { ...variant(), currency: "EUR" } as unknown as PublicStorefrontVariant],
    ["active preview-only", variant({ availability: "preview_only" })],
    ["pending positive", variant({ priceStatus: "pending", availability: "preview_only", checkoutReady: false })],
    ["pending null", variant({ priceStatus: "pending", availability: "preview_only", baseUnitMinor: null, currency: null, checkoutReady: false })],
    ["pending available", variant({ priceStatus: "pending", availability: "available", baseUnitMinor: 0, checkoutReady: false })],
    ["pending false readiness claim", variant({ priceStatus: "pending", availability: "preview_only", baseUnitMinor: 0, checkoutReady: true })],
    ["unavailable price but available inventory", variant({ priceStatus: "unavailable", baseUnitMinor: null, currency: null, checkoutReady: false })],
  ] as const)("does not perform sale arithmetic for %s", (_label, input) => {
    expect(resolvePublicVariantPrice({
      variant: input, productId: "product-alpha", quantity: 1, pricing: pricing("preview", [winter30]),
    })).toEqual({ state: "pending", purchaseState: "pricing_pending", reason: "pricing_coming_soon" });
  });

  it("treats unavailable inventory as unavailable before money arithmetic", () => {
    expect(resolvePublicVariantPrice({
      variant: variant({ availability: "unavailable", baseUnitMinor: Number.NaN }),
      productId: "product-alpha", quantity: 1, pricing: pricing("preview", [winter30]),
    })).toEqual({ state: "unavailable", purchaseState: "unavailable", reason: "unavailable" });
  });

  it("uses only applicable projected promotions and never stacks them", () => {
    const excluded = { ...winter30, id: "other-product", discountBps: 4_000, scope: { kind: "products" as const, productIds: ["product-beta"] } };
    const applicable = { ...winter30, id: "variant35", discountBps: 3_500, scope: { kind: "variants" as const, variantIds: ["variant-5mg"] } };
    expect(resolvePublicVariantPrice({
      variant: variant({ baseUnitMinor: 1_000 }), productId: "product-alpha", quantity: 2,
      pricing: pricing("production", [excluded, winter30, applicable]),
    })).toMatchObject({
      state: "priced",
      price: { effectiveDiscountBps: 3_500, effectiveUnitMinor: 650, lineSubtotalMinor: 1_300, appliedPromotionIds: ["variant35"] },
    });
  });

  it("uses the serialized eligible list even if the browser clock changes", () => {
    const context = pricing("preview", [winter30]);
    const first = resolvePublicVariantPrice({ variant: variant(), productId: "product-alpha", quantity: 1, pricing: context });
    const originalNow = Date.now;
    Date.now = () => new Date("2099-01-01T00:00:00.000Z").getTime();
    try {
      expect(resolvePublicVariantPrice({ variant: variant(), productId: "product-alpha", quantity: 1, pricing: context })).toEqual(first);
    } finally {
      Date.now = originalNow;
    }
  });
});

describe("card variant presentation", () => {
  it("selects the lowest effective display price and breaks ties by label then stable ID", () => {
    const variants = [
      variant({ id: "variant-z", label: "Zeta", baseUnitMinor: 800 }),
      variant({ id: "variant-b", label: "Alpha", baseUnitMinor: 1_000 }),
      variant({ id: "variant-a", label: "Alpha", baseUnitMinor: 1_000 }),
    ];
    const scoped = { ...winter30, discountBps: 2_000, scope: { kind: "variants" as const, variantIds: ["variant-b", "variant-a"] } };
    expect(selectCardVariant({ product: product(variants, "variant-z"), pricing: pricing("production", [scoped]) })?.id).toBe("variant-a");
  });

  it("uses the explicit default only when no variant has a displayable price", () => {
    const variants = [
      variant({ id: "variant-first", label: "First", priceStatus: "pending", availability: "preview_only", baseUnitMinor: null, currency: null, checkoutReady: false }),
      variant({ id: "variant-default", label: "Default", priceStatus: "pending", availability: "preview_only", baseUnitMinor: 0, checkoutReady: false }),
    ];
    expect(selectCardVariant({ product: product(variants, "variant-default"), pricing: pricing("production", [winter30]) })?.id).toBe("variant-default");
  });

  it("selects the lowest displayable available variant ahead of a preview-only zero", () => {
    const variants = [
      variant({
        id: "variant-preview-zero",
        label: "Preview zero",
        priceStatus: "pending",
        availability: "preview_only",
        baseUnitMinor: 0,
        checkoutReady: false,
      }),
      variant({
        id: "variant-available-ten",
        label: "Available ten",
        baseUnitMinor: 1_000,
      }),
    ];

    expect(selectCardVariant({
      product: product(variants, "variant-preview-zero"),
      pricing: pricing("preview", [winter30]),
    })?.id).toBe("variant-available-ten");
  });

  it("builds structured same-unit summaries without parsing labels", () => {
    expect(summarizePublicStorefrontVariants([
      variant({ amount: { value: 10, unit: "mg" }, label: "Option A" }),
      variant({ id: "variant-5", amount: { value: 5, unit: "mg" }, label: "Option B" }),
    ])).toBe("From 5 mg");
    expect(summarizePublicStorefrontVariants([
      variant({ amount: { value: 5, unit: "mg" } }),
      variant({ id: "variant-mcg", amount: { value: 500, unit: "mcg" } }),
    ])).toBe("Multiple options");
    expect(summarizePublicStorefrontVariants([
      variant({ amount: null, label: "Option A" }),
      variant({ id: "variant-other", amount: { value: 5, unit: "mg" } }),
    ])).toBe("Multiple options");
  });
});
