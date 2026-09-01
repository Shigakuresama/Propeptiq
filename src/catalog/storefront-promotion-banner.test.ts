import { describe, expect, it } from "vitest";

import type { PublicStorefrontAutomaticPromotion } from "./storefront-price-presentation";
import { selectWinter30PromotionView } from "./storefront-promotion-banner";

function promotion(
  overrides: Record<string, unknown> = {},
): PublicStorefrontAutomaticPromotion {
  return {
    id: "winter30",
    displayName: "Winter Sale",
    displayCode: "WINTER30",
    discountBps: 3_000,
    enabled: true,
    startAt: null,
    endAt: null,
    timezone: "America/Los_Angeles",
    scope: { kind: "sitewide" },
    applicationMode: "automatic",
    ...overrides,
  } as PublicStorefrontAutomaticPromotion;
}

describe("WINTER30 promotion banner selector", () => {
  it("projects the exact frozen safe literal for one exact active automatic sitewide campaign", () => {
    const selected = selectWinter30PromotionView([promotion()]);

    expect(selected).toEqual({ id: "winter30", code: "WINTER30", percentage: 30 });
    expect(Object.isFrozen(selected)).toBe(true);
  });

  it.each([
    ["display name", { displayName: "Winter Promotion" }],
    ["display code", { displayCode: "WINTER20" }],
    ["missing display code", { displayCode: null }],
    ["percentage", { discountBps: 2_999 }],
    ["enabled state", { enabled: false }],
    ["application mode", { applicationMode: "code_required" }],
    ["malformed campaign id", { id: "winter30 " }],
  ] as const)("fails closed for a mismatched %s", (_label, override) => {
    expect(selectWinter30PromotionView([promotion(override)])).toBeNull();
  });

  it.each([
    ["product", { kind: "products", productIds: ["product-alpha"] }],
    ["variant", { kind: "variants", variantIds: ["variant-alpha"] }],
  ] as const)("rejects %s-scoped WINTER30", (_label, scope) => {
    expect(selectWinter30PromotionView([promotion({ scope })])).toBeNull();
  });

  it("fails closed when the WINTER30 campaign ID is duplicated", () => {
    expect(selectWinter30PromotionView([promotion(), promotion()])).toBeNull();
    expect(
      selectWinter30PromotionView([
        promotion(),
        promotion({ displayCode: "MALFORMED" }),
      ]),
    ).toBeNull();
  });

  it("ignores unrelated campaigns without mutating or reordering the input", () => {
    const unrelatedBefore = promotion({ id: "spring10", displayName: "Spring", displayCode: "SPRING10", discountBps: 1_000 });
    const winter = promotion();
    const unrelatedAfter = promotion({ id: "summer20", displayName: "Summer", displayCode: "SUMMER20", discountBps: 2_000 });
    const input = [unrelatedBefore, winter, unrelatedAfter];
    const before = [...input];

    expect(selectWinter30PromotionView(input)).toEqual({
      id: "winter30",
      code: "WINTER30",
      percentage: 30,
    });
    expect(input).toEqual(before);
    expect(input[0]).toBe(unrelatedBefore);
    expect(input[1]).toBe(winter);
    expect(input[2]).toBe(unrelatedAfter);
    expect(Object.isFrozen(input)).toBe(false);
  });

  it("returns null when the campaign is absent", () => {
    expect(selectWinter30PromotionView([])).toBeNull();
    expect(
      selectWinter30PromotionView([
        promotion({ id: "spring10", displayName: "Spring", displayCode: "SPRING10", discountBps: 1_000 }),
      ]),
    ).toBeNull();
  });
});
