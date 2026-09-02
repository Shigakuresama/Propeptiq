import { beforeEach, describe, expect, it, vi } from "vitest";

const { defaultConnect } = vi.hoisted(() => ({
  defaultConnect: vi.fn(async () => undefined),
}));

vi.mock("next/server", () => ({ connection: defaultConnect }));

import {
  STOREFRONT_PROMOTIONS,
  type StorefrontPromotionConfiguration,
} from "@/config/storefront-promotions";

import {
  getStorefrontPromotionBannerView,
  STOREFRONT_PROMOTION_UNAVAILABLE,
} from "./storefront-promotion-banner-server";

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
    scope: { kind: "sitewide" },
    applicationMode: "automatic",
    ...overrides,
  };
}

describe("storefront promotion banner server boundary", () => {
  beforeEach(() => {
    defaultConnect.mockClear();
  });

  it("uses the active owner configuration by default even without a catalog view", async () => {
    await expect(getStorefrontPromotionBannerView()).resolves.toEqual({
      id: "winter30",
      displayName: "Winter Sale",
      code: "WINTER30",
      percentage: 30,
    });
    expect(defaultConnect).toHaveBeenCalledOnce();
  });

  it("loads configured promotions once, evaluates one server-owned instant, and exposes only the safe view", async () => {
    const loadConfiguredPromotions = vi.fn(() => STOREFRONT_PROMOTIONS);
    const evaluateNow = vi.fn(() => new Date(now));
    const order: string[] = [];
    const connect = vi.fn(async () => {
      order.push("connect");
    });
    loadConfiguredPromotions.mockImplementation(() => {
      order.push("load");
      return STOREFRONT_PROMOTIONS;
    });
    evaluateNow.mockImplementation(() => {
      order.push("clock");
      return new Date(now);
    });

    const selected = await getStorefrontPromotionBannerView({
      connect,
      loadConfiguredPromotions,
      now: evaluateNow,
    });

    expect(connect).toHaveBeenCalledOnce();
    expect(loadConfiguredPromotions).toHaveBeenCalledOnce();
    expect(evaluateNow).toHaveBeenCalledOnce();
    expect(order).toEqual(["connect", "load", "clock"]);
    expect(selected).toEqual({
      id: "winter30",
      displayName: "Winter Sale",
      code: "WINTER30",
      percentage: 30,
    });
    expect(JSON.stringify(selected)).not.toMatch(
      /scope|enabled|application|record|version|uuid|provider|catalog/iu,
    );
  });

  it.each([
    ["synchronous", () => { throw new Error("private synchronous connection detail"); }],
    ["asynchronous", () => Promise.reject(new Error("private asynchronous connection detail"))],
  ] as const)("fails closed when the %s request-time connection fails before loader or clock", async (_label, connect) => {
    const loadConfiguredPromotions = vi.fn(() => STOREFRONT_PROMOTIONS);
    const evaluateNow = vi.fn(() => new Date(now));
    const reportUnavailable = vi.fn();

    await expect(getStorefrontPromotionBannerView({
      connect,
      loadConfiguredPromotions,
      now: evaluateNow,
      reportUnavailable,
    })).resolves.toBeNull();
    expect(reportUnavailable.mock.calls).toEqual([
      [STOREFRONT_PROMOTION_UNAVAILABLE],
    ]);
    expect(loadConfiguredPromotions).not.toHaveBeenCalled();
    expect(evaluateNow).not.toHaveBeenCalled();
    expect(JSON.stringify(reportUnavailable.mock.calls)).not.toContain("private");
  });

  it.each([
    ["empty", []],
    ["disabled", [configuredPromotion({ enabled: false })]],
    ["code required", [configuredPromotion({ applicationMode: "code_required" })]],
    ["scheduled", [configuredPromotion({ startAt: "2026-09-01T12:00:00.001Z" })]],
    ["expired", [configuredPromotion({ endAt: "2026-09-01T12:00:00.000Z" })]],
    ["missing WINTER30", [configuredPromotion({ id: "spring30" })]],
  ] as const)("returns null without a diagnostic for valid %s configuration", async (_label, value) => {
    const reportUnavailable = vi.fn();

    await expect(
      getStorefrontPromotionBannerView({
        loadConfiguredPromotions: () => value,
        now: () => new Date(now),
        reportUnavailable,
      }),
    ).resolves.toBeNull();
    expect(reportUnavailable).not.toHaveBeenCalled();
  });

  it.each([
    ["non-array", {}],
    ["malformed entry", [{ id: "winter30" }]],
    ["duplicate campaign ID", [configuredPromotion(), configuredPromotion()]],
  ] as const)("fails closed and reports only the fixed diagnostic for %s", async (_label, value) => {
    const reportUnavailable = vi.fn();

    await expect(
      getStorefrontPromotionBannerView({
        loadConfiguredPromotions: () => value,
        now: () => new Date(now),
        reportUnavailable,
      }),
    ).resolves.toBeNull();
    expect(reportUnavailable.mock.calls).toEqual([
      [STOREFRONT_PROMOTION_UNAVAILABLE],
    ]);
  });

  it("fails closed and reports only the fixed diagnostic for an invalid evaluation instant", async () => {
    const reportUnavailable = vi.fn();

    await expect(
      getStorefrontPromotionBannerView({
        loadConfiguredPromotions: () => STOREFRONT_PROMOTIONS,
        now: () => new Date(Number.NaN),
        reportUnavailable,
      }),
    ).resolves.toBeNull();
    expect(reportUnavailable.mock.calls).toEqual([
      [STOREFRONT_PROMOTION_UNAVAILABLE],
    ]);
  });

  it("degrades synchronous and asynchronous loader failures without leaking caught values", async () => {
    const syncReport = vi.fn();
    const asyncReport = vi.fn();

    await expect(
      getStorefrontPromotionBannerView({
        loadConfiguredPromotions: () => {
          throw new Error("private synchronous provider detail");
        },
        now: () => new Date(now),
        reportUnavailable: syncReport,
      }),
    ).resolves.toBeNull();
    await expect(
      getStorefrontPromotionBannerView({
        loadConfiguredPromotions: () =>
          Promise.reject({ customer: "private-customer", provider: "private-provider" }),
        now: () => new Date(now),
        reportUnavailable: asyncReport,
      }),
    ).resolves.toBeNull();

    expect(syncReport.mock.calls).toEqual([[STOREFRONT_PROMOTION_UNAVAILABLE]]);
    expect(asyncReport.mock.calls).toEqual([[STOREFRONT_PROMOTION_UNAVAILABLE]]);
    expect(JSON.stringify([syncReport.mock.calls, asyncReport.mock.calls])).not.toMatch(
      /private|provider|customer/iu,
    );
  });

  it("catches hostile runtime configuration without leaking getter details", async () => {
    const hostilePromotion = Object.defineProperty({}, "id", {
      enumerable: true,
      get() {
        throw new Error("private hostile getter detail");
      },
    });
    const reportUnavailable = vi.fn();

    await expect(
      getStorefrontPromotionBannerView({
        loadConfiguredPromotions: () => [hostilePromotion],
        now: () => new Date(now),
        reportUnavailable,
      }),
    ).resolves.toBeNull();
    expect(reportUnavailable.mock.calls).toEqual([
      [STOREFRONT_PROMOTION_UNAVAILABLE],
    ]);
  });

  it("suppresses a throwing reporter and still returns null", async () => {
    await expect(
      getStorefrontPromotionBannerView({
        loadConfiguredPromotions: () => Promise.reject(new Error("private failure")),
        now: () => new Date(now),
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
          loadConfiguredPromotions: () =>
            Promise.reject(new Error("private database stack")),
          now: () => new Date(now),
        }),
      ).resolves.toBeNull();
      expect(warn.mock.calls).toEqual([[STOREFRONT_PROMOTION_UNAVAILABLE]]);
      expect(JSON.stringify(warn.mock.calls)).not.toContain("private database stack");
    } finally {
      warn.mockRestore();
    }
  });
});
