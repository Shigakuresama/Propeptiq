import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PublicStorefrontAutomaticPromotion } from "./storefront-price-presentation";

const { getPublicStorefrontViewMock } = vi.hoisted(() => ({
  getPublicStorefrontViewMock: vi.fn(),
}));

vi.mock("@/catalog/storefront-public-server", () => ({
  getPublicStorefrontView: getPublicStorefrontViewMock,
}));

import {
  getStorefrontPromotionBannerView,
  STOREFRONT_PROMOTION_UNAVAILABLE,
} from "./storefront-promotion-banner-server";

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

function loadedView(promotions: readonly PublicStorefrontAutomaticPromotion[]): unknown {
  return {
    catalog: { privateCatalogAuthority: "not exposed" },
    pricing: { automaticPromotions: promotions },
  };
}

describe("storefront promotion banner server boundary", () => {
  beforeEach(() => {
    getPublicStorefrontViewMock.mockReset();
  });

  it("uses the shared request-cached storefront view by default exactly once", async () => {
    getPublicStorefrontViewMock.mockResolvedValue(loadedView([promotion()]));

    await expect(getStorefrontPromotionBannerView()).resolves.toEqual({
      id: "winter30",
      code: "WINTER30",
      percentage: 30,
    });
    expect(getPublicStorefrontViewMock).toHaveBeenCalledOnce();
  });

  it("loads an injected storefront view once and exposes only the safe campaign view", async () => {
    const loadView = vi.fn(async () => loadedView([promotion()]));

    const selected = await getStorefrontPromotionBannerView({ loadView });

    expect(loadView).toHaveBeenCalledOnce();
    expect(selected).toEqual({ id: "winter30", code: "WINTER30", percentage: 30 });
    expect(JSON.stringify(selected)).not.toMatch(/display|scope|enabled|application|catalog/iu);
  });

  it("returns null when there is no matching campaign or it is product/variant scoped", async () => {
    await expect(
      getStorefrontPromotionBannerView({ loadView: async () => loadedView([]) }),
    ).resolves.toBeNull();
    await expect(
      getStorefrontPromotionBannerView({
        loadView: async () => loadedView([
          promotion({ scope: { kind: "products", productIds: ["product-alpha"] } }),
        ]),
      }),
    ).resolves.toBeNull();
    await expect(
      getStorefrontPromotionBannerView({
        loadView: async () => loadedView([
          promotion({ scope: { kind: "variants", variantIds: ["variant-alpha"] } }),
        ]),
      }),
    ).resolves.toBeNull();
  });

  it("degrades a synchronous loader throw to null and reports only the fixed diagnostic", async () => {
    const reportUnavailable = vi.fn();
    const privateFailure = new Error("private synchronous provider detail");

    await expect(
      getStorefrontPromotionBannerView({
        loadView: () => {
          throw privateFailure;
        },
        reportUnavailable,
      }),
    ).resolves.toBeNull();
    expect(reportUnavailable).toHaveBeenCalledOnce();
    expect(reportUnavailable).toHaveBeenCalledWith(STOREFRONT_PROMOTION_UNAVAILABLE);
    expect(reportUnavailable.mock.calls[0]).toEqual(["STOREFRONT_PROMOTION_UNAVAILABLE"]);
    expect(JSON.stringify(reportUnavailable.mock.calls)).not.toContain(privateFailure.message);
  });

  it("degrades a rejected loader promise to null without leaking the caught value", async () => {
    const reportUnavailable = vi.fn();
    const caughtValue = { customer: "private-customer", provider: "private-provider" };

    await expect(
      getStorefrontPromotionBannerView({
        loadView: async () => Promise.reject(caughtValue),
        reportUnavailable,
      }),
    ).resolves.toBeNull();
    expect(reportUnavailable.mock.calls).toEqual([["STOREFRONT_PROMOTION_UNAVAILABLE"]]);
    expect(JSON.stringify(reportUnavailable.mock.calls)).not.toMatch(/private-customer|private-provider/u);
  });

  it.each([
    ["missing pricing", {}],
    ["null pricing", { pricing: null }],
    ["missing automatic promotions", { pricing: {} }],
    ["non-array automatic promotions", { pricing: { automaticPromotions: {} } }],
  ] as const)("degrades a malformed loaded view with %s to null", async (_label, view) => {
    const reportUnavailable = vi.fn();

    await expect(
      getStorefrontPromotionBannerView({
        loadView: async () => view,
        reportUnavailable,
      }),
    ).resolves.toBeNull();
    expect(reportUnavailable.mock.calls).toEqual([["STOREFRONT_PROMOTION_UNAVAILABLE"]]);
  });

  it("catches selector failures caused by hostile runtime data", async () => {
    const hostilePromotion = Object.defineProperty({}, "id", {
      enumerable: true,
      get() {
        throw new Error("private hostile getter detail");
      },
    });
    const reportUnavailable = vi.fn();

    await expect(
      getStorefrontPromotionBannerView({
        loadView: async () => ({
          pricing: { automaticPromotions: [hostilePromotion] },
        }),
        reportUnavailable,
      }),
    ).resolves.toBeNull();
    expect(reportUnavailable.mock.calls).toEqual([["STOREFRONT_PROMOTION_UNAVAILABLE"]]);
  });

  it("suppresses a throwing reporter and still returns null", async () => {
    await expect(
      getStorefrontPromotionBannerView({
        loadView: async () => Promise.reject(new Error("private failure")),
        reportUnavailable: () => {
          throw new Error("reporter unavailable");
        },
      }),
    ).resolves.toBeNull();
  });

  it("uses a default reporter that emits only the fixed diagnostic literal", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      await expect(
        getStorefrontPromotionBannerView({
          loadView: async () => Promise.reject(new Error("private database stack")),
        }),
      ).resolves.toBeNull();
      expect(warn.mock.calls).toEqual([["STOREFRONT_PROMOTION_UNAVAILABLE"]]);
      expect(JSON.stringify(warn.mock.calls)).not.toContain("private database stack");
    } finally {
      warn.mockRestore();
    }
  });
});
