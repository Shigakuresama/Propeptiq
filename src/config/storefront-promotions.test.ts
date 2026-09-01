import { describe, expect, it } from "vitest";

import {
  resolveActiveConfiguredAutomaticPromotions,
  STOREFRONT_PROMOTIONS,
  storefrontPromotionMatchesOwnerConfiguration,
  WINTER30_STOREFRONT_PROMOTION,
  type StorefrontPromotionConfiguration,
} from "./storefront-promotions";

const now = new Date("2026-09-01T12:00:00.000Z");

function configuredPromotion(
  overrides: Partial<StorefrontPromotionConfiguration> = {},
): StorefrontPromotionConfiguration {
  return {
    id: "winter30",
    displayName: "Winter Sale",
    displayCode: "WINTER30",
    discountBps: 3_000,
    enabled: true,
    startAt: null,
    endAt: null,
    timezone: "America/Los_Angeles",
    applicationMode: "automatic",
    scope: { kind: "sitewide" },
    ...overrides,
  };
}

describe("storefront promotion owner configuration", () => {
  it("exports the exact deeply frozen owner-authorized WINTER30 contract without provider authority", () => {
    expect(WINTER30_STOREFRONT_PROMOTION).toEqual(configuredPromotion());
    expect(STOREFRONT_PROMOTIONS).toEqual([WINTER30_STOREFRONT_PROMOTION]);
    expect(Object.isFrozen(STOREFRONT_PROMOTIONS)).toBe(true);
    expect(Object.isFrozen(WINTER30_STOREFRONT_PROMOTION)).toBe(true);
    expect(Object.isFrozen(WINTER30_STOREFRONT_PROMOTION.scope)).toBe(true);

    const serialized = JSON.stringify(STOREFRONT_PROMOTIONS);
    expect(serialized).not.toMatch(
      /recordId|version|uuid|stripe|provider|price|inventory|generated/iu,
    );
  });

  it("resolves the enabled unbounded automatic campaign at one supplied instant", () => {
    expect(
      resolveActiveConfiguredAutomaticPromotions(STOREFRONT_PROMOTIONS, now),
    ).toEqual([configuredPromotion()]);
  });

  it.each([
    ["disabled", { enabled: false }],
    ["code-required", { applicationMode: "code_required" }],
    ["invalid timezone", { timezone: "Mars/Olympus" }],
    [
      "invalid interval",
      {
        startAt: "2026-09-02T00:00:00.000Z",
        endAt: "2026-09-01T00:00:00.000Z",
      },
    ],
    [
      "empty interval",
      {
        startAt: "2026-09-01T12:00:00.000Z",
        endAt: "2026-09-01T12:00:00.000Z",
      },
    ],
    ["future start", { startAt: "2026-09-01T12:00:00.001Z" }],
    ["end at now", { endAt: "2026-09-01T12:00:00.000Z" }],
  ] as const)("omits or rejects %s configuration", (_label, overrides) => {
    const result = resolveActiveConfiguredAutomaticPromotions(
      [configuredPromotion(overrides)],
      now,
    );

    if (_label === "invalid timezone" || _label.includes("interval")) {
      expect(result).toBeNull();
    } else {
      expect(result).toEqual([]);
    }
  });

  it("uses inclusive starts and exclusive ends", () => {
    const startAtNow = configuredPromotion({
      id: "starts-now",
      startAt: "2026-09-01T12:00:00.000Z",
    });
    const endAfterNow = configuredPromotion({
      id: "ends-later",
      endAt: "2026-09-01T12:00:00.001Z",
    });

    expect(
      resolveActiveConfiguredAutomaticPromotions(
        [startAtNow, endAfterNow],
        now,
      )?.map((promotion) => promotion.id),
    ).toEqual(["ends-later", "starts-now"]);
  });

  it("fails closed for an invalid evaluation instant and malformed or duplicate lists", () => {
    expect(
      resolveActiveConfiguredAutomaticPromotions(
        STOREFRONT_PROMOTIONS,
        new Date(Number.NaN),
      ),
    ).toBeNull();
    expect(resolveActiveConfiguredAutomaticPromotions({}, now)).toBeNull();
    expect(
      resolveActiveConfiguredAutomaticPromotions(
        [configuredPromotion(), configuredPromotion()],
        now,
      ),
    ).toBeNull();

    const sparse = new Array<StorefrontPromotionConfiguration>(1);
    expect(resolveActiveConfiguredAutomaticPromotions(sparse, now)).toBeNull();
  });

  it.each([
    ["display name", { displayName: "Changed Winter Sale" }],
    ["display code", { displayCode: "CHANGED30" }],
    ["discount", { discountBps: 2_999 }],
    ["enabled state", { enabled: false }],
    ["start", { startAt: "2026-08-01T00:00:00.000Z" }],
    ["end", { endAt: "2026-10-01T00:00:00.000Z" }],
    ["timezone", { timezone: "UTC" }],
    ["mode", { applicationMode: "code_required" }],
    ["product scope", { scope: { kind: "products", productIds: ["product-a"] } }],
    ["variant scope", { scope: { kind: "variants", variantIds: ["variant-a"] } }],
  ] as const)("rejects configured WINTER30 %s drift", (_label, overrides) => {
    expect(
      storefrontPromotionMatchesOwnerConfiguration(
        configuredPromotion(overrides as Partial<StorefrontPromotionConfiguration>),
      ),
    ).toBe(false);
  });

  it("accepts exact configured terms and preserves an otherwise-valid unconfigured campaign", () => {
    expect(
      storefrontPromotionMatchesOwnerConfiguration(configuredPromotion()),
    ).toBe(true);
    expect(
      storefrontPromotionMatchesOwnerConfiguration(
        configuredPromotion({
          id: "spring15",
          displayName: "Spring Offer",
          displayCode: "SPRING15",
          discountBps: 1_500,
        }),
      ),
    ).toBe(true);
  });

  it("does not mutate caller data and returns frozen cloned entries and nested scopes", () => {
    const scope = { kind: "products" as const, productIds: ["product-b", "product-a"] };
    const entry = configuredPromotion({
      id: "products15",
      displayName: "Products Offer",
      displayCode: null,
      discountBps: 1_500,
      scope,
    });
    const input = [entry];
    const before = JSON.stringify(input);

    const result = resolveActiveConfiguredAutomaticPromotions(input, now);

    expect(JSON.stringify(input)).toBe(before);
    expect(scope.productIds).toEqual(["product-b", "product-a"]);
    expect(result).toEqual([
      expect.objectContaining({
        id: "products15",
        scope: { kind: "products", productIds: ["product-a", "product-b"] },
      }),
    ]);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result?.[0])).toBe(true);
    expect(Object.isFrozen(result?.[0]?.scope)).toBe(true);
    expect(Object.isFrozen((result?.[0]?.scope as { productIds?: unknown }).productIds)).toBe(true);
    expect(result?.[0]).not.toBe(entry);
    expect(result?.[0]?.scope).not.toBe(scope);
  });
});
