import { describe, expect, it } from "vitest";

import {
  isStrictStorefrontPromotionInstant,
  resolveActiveConfiguredAutomaticPromotions,
  resolveUnreconciledActiveConfiguredAutomaticPromotions,
  STOREFRONT_PROMOTIONS,
  storefrontPromotionMatchesConfiguration,
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

function authoritativePromotion(
  overrides: Partial<StorefrontPromotionConfiguration> = {},
): StorefrontPromotionConfiguration {
  return configuredPromotion(overrides);
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

  it("keeps starts inclusive and ends exclusive at the exact persisted millisecond sample", () => {
    expect(
      resolveActiveConfiguredAutomaticPromotions(
        [
          configuredPromotion({
            id: "starts-exactly",
            startAt: "2026-09-01T12:00:00.000Z",
          }),
          configuredPromotion({
            id: "ends-exactly",
            endAt: "2026-09-01T12:00:00.000Z",
          }),
        ],
        now,
      )?.map((promotion) => promotion.id),
    ).toEqual(["starts-exactly"]);
  });

  it.each([
    "2026-09-01T12:00:00.1Z",
    "2026-09-01T12:00:00.12Z",
    "2026-09-01T12:00:00.123Z",
    "2026-09-01T12:00:00.1234Z",
    "2026-09-01T12:00:00.12345Z",
    "2026-09-01T12:00:00.123456Z",
    "2026-09-01T12:00:00.1234567Z",
    "2026-09-01T12:00:00.12345678Z",
    "2026-09-01T12:00:00.123456789Z",
  ])("keeps the strict input parser's 1-9 digit grammar for %s", (instant) => {
    expect(isStrictStorefrontPromotionInstant(instant)).toBe(true);
  });

  it.each([
    ["omitted fraction", "2026-09-01T12:00:00Z"],
    ["one digit", "2026-09-01T12:00:00.1Z"],
    ["two digits", "2026-09-01T12:00:00.12Z"],
    ["three digits", "2026-09-01T12:00:00.123Z"],
    ["zero-padded nine digits", "2026-09-01T12:00:00.123000000Z"],
    ["offset", "2026-09-01T05:00:00.123000000-07:00"],
  ] as const)("accepts persistence-compatible owner %s", (_label, startAt) => {
    expect(
      resolveActiveConfiguredAutomaticPromotions(
        [configuredPromotion({ startAt })],
        new Date("2026-09-01T12:00:00.123Z"),
      ),
    ).toHaveLength(1);
  });

  it.each([
    ["start", { startAt: "2026-09-01T12:00:00.123000001Z" }],
    ["end", { endAt: "2026-09-01T12:00:00.123000001Z" }],
    [
      "short interval",
      {
        startAt: "2026-09-01T12:00:00.000000001Z",
        endAt: "2026-09-01T12:00:00.000000002Z",
      },
    ],
  ] as const)("rejects nonzero sub-millisecond owner %s without rounding", (_label, overrides) => {
    expect(
      resolveActiveConfiguredAutomaticPromotions(
        [configuredPromotion(overrides)],
        now,
      ),
    ).toBeNull();
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

  it("matches equivalent offset and UTC start/end instants without mutating either input", () => {
    const configured = configuredPromotion({
      startAt: "2026-09-01T05:00:00-07:00",
      endAt: "2026-09-30T17:00:00-07:00",
    });
    const candidate = configuredPromotion({
      startAt: "2026-09-01T12:00:00Z",
      endAt: "2026-10-01T00:00:00.000Z",
    });
    const configuredBefore = JSON.stringify(configured);
    const candidateBefore = JSON.stringify(candidate);

    expect(
      storefrontPromotionMatchesConfiguration(candidate, configured),
    ).toBe(true);
    expect(JSON.stringify(configured)).toBe(configuredBefore);
    expect(JSON.stringify(candidate)).toBe(candidateBefore);
  });

  it("matches omitted fractional seconds with the corresponding .000Z instant", () => {
    const configured = configuredPromotion({
      startAt: "2026-09-01T12:00:00Z",
      endAt: "2026-10-01T00:00:00Z",
    });
    const candidate = configuredPromotion({
      startAt: "2026-09-01T12:00:00.000Z",
      endAt: "2026-10-01T00:00:00.000Z",
    });

    expect(
      storefrontPromotionMatchesConfiguration(candidate, configured),
    ).toBe(true);
  });

  it.each([
    [
      "a candidate one nanosecond after the configured millisecond",
      "2026-09-01T12:00:00.000Z",
      "2026-09-01T12:00:00.000000001Z",
    ],
    [
      "a candidate with nonzero fourth-through-ninth digits",
      "2026-09-01T12:00:00.123000000Z",
      "2026-09-01T12:00:00.123999999Z",
    ],
  ] as const)("rejects %s", (_label, configuredStart, candidateStart) => {
    expect(
      storefrontPromotionMatchesConfiguration(
        configuredPromotion({ startAt: candidateStart }),
        configuredPromotion({ startAt: configuredStart }),
      ),
    ).toBe(false);
  });

  it("matches the same nanosecond instant expressed with an offset and with Z", () => {
    expect(
      storefrontPromotionMatchesConfiguration(
        configuredPromotion({
          startAt: "2026-09-01T12:00:00.123000000Z",
          endAt: "2026-10-01T00:00:00.987000000Z",
        }),
        configuredPromotion({
          startAt: "2026-09-01T05:00:00.123-07:00",
          endAt: "2026-09-30T17:00:00.987-07:00",
        }),
      ),
    ).toBe(true);
  });

  it("matches equivalent offset and Z representations before the Unix epoch", () => {
    expect(
      storefrontPromotionMatchesConfiguration(
        configuredPromotion({
          startAt: "1969-12-31T23:59:59.123000000Z",
        }),
        configuredPromotion({
          startAt: "1969-12-31T15:59:59.123-08:00",
        }),
      ),
    ).toBe(true);
  });

  it.each([
    ["omitted and zero-padded fractions", "2026-09-01T12:00:00Z", "2026-09-01T12:00:00.000000000Z"],
    ["short and padded fractions", "2026-09-01T12:00:00.1Z", "2026-09-01T12:00:00.100000000Z"],
  ] as const)("matches equivalent %s", (_label, configuredStart, candidateStart) => {
    expect(
      storefrontPromotionMatchesConfiguration(
        configuredPromotion({ startAt: candidateStart }),
        configuredPromotion({ startAt: configuredStart }),
      ),
    ).toBe(true);
  });

  it.each([
    ["different start", { startAt: "2026-09-01T12:00:00.001Z" }],
    ["different end", { endAt: "2026-10-01T00:00:00.001Z" }],
  ] as const)("rejects a genuinely %s instant", (_label, override) => {
    const configured = configuredPromotion({
      startAt: "2026-09-01T12:00:00.000Z",
      endAt: "2026-10-01T00:00:00.000Z",
    });
    const candidate = configuredPromotion({
      startAt: configured.startAt,
      endAt: configured.endAt,
      ...override,
    });

    expect(
      storefrontPromotionMatchesConfiguration(candidate, configured),
    ).toBe(false);
  });

  it("matches two null bounds and rejects either null/non-null pairing", () => {
    const unbounded = configuredPromotion();
    expect(
      storefrontPromotionMatchesConfiguration(configuredPromotion(), unbounded),
    ).toBe(true);
    expect(
      storefrontPromotionMatchesConfiguration(
        configuredPromotion({ startAt: "2026-09-01T12:00:00.000Z" }),
        unbounded,
      ),
    ).toBe(false);
    expect(
      storefrontPromotionMatchesConfiguration(
        configuredPromotion(),
        configuredPromotion({ endAt: "2026-10-01T00:00:00.000Z" }),
      ),
    ).toBe(false);
  });

  it.each([
    [
      "malformed start",
      { startAt: "09/01/2026 12:00:00" },
      { startAt: "2026-09-01T12:00:00.000Z" },
    ],
    [
      "impossible start",
      { startAt: "2026-02-31T12:00:00.000Z" },
      { startAt: "2026-03-03T12:00:00.000Z" },
    ],
    [
      "malformed end",
      { endAt: "not-an-instant" },
      { endAt: "2026-10-01T00:00:00.000Z" },
    ],
  ] as const)("fails closed for a %s candidate bound", (
    _label,
    candidateOverride,
    configuredOverride,
  ) => {
    expect(
      storefrontPromotionMatchesConfiguration(
        configuredPromotion(candidateOverride),
        configuredPromotion(configuredOverride),
      ),
    ).toBe(false);
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

  describe("active owner-to-authority reconciliation", () => {
    it("accepts exactly one matching candidate while ignoring a differently named valid campaign", () => {
      const result = resolveUnreconciledActiveConfiguredAutomaticPromotions(
        [configuredPromotion()],
        [
          authoritativePromotion({
            id: "spring15",
            displayName: "Spring Offer",
            displayCode: "SPRING15",
            discountBps: 1_500,
          }),
          authoritativePromotion(),
        ],
        now,
      );

      expect(result).toEqual([]);
      expect(Object.isFrozen(result)).toBe(true);
    });

    it.each([
      ["absent", []],
      ["duplicate", [authoritativePromotion(), authoritativePromotion()]],
      ["malformed", [{ ...authoritativePromotion(), displayName: "" }]],
      ["disabled", [authoritativePromotion({ enabled: false })]],
      ["scheduled", [authoritativePromotion({ startAt: "2026-09-01T12:00:00.001Z" })]],
      ["expired", [authoritativePromotion({ endAt: "2026-09-01T12:00:00.000Z" })]],
      ["name drift", [authoritativePromotion({ displayName: "Changed" })]],
      ["code drift", [authoritativePromotion({ displayCode: "CHANGED30" })]],
      ["discount drift", [authoritativePromotion({ discountBps: 2_999 })]],
      ["start drift", [authoritativePromotion({ startAt: "2026-08-01T00:00:00.000Z" })]],
      ["end drift", [authoritativePromotion({ endAt: "2026-10-01T00:00:00.000Z" })]],
      ["timezone drift", [authoritativePromotion({ timezone: "UTC" })]],
      ["mode drift", [authoritativePromotion({ applicationMode: "code_required" })]],
      ["product scope drift", [authoritativePromotion({ scope: { kind: "products", productIds: ["product-a"] } })]],
      ["variant scope drift", [authoritativePromotion({ scope: { kind: "variants", variantIds: ["variant-a"] } })]],
    ] as const)("leaves an active configured campaign unreconciled when its candidate is %s", (_label, candidates) => {
      expect(
        resolveUnreconciledActiveConfiguredAutomaticPromotions(
          [configuredPromotion()],
          candidates,
          now,
        ),
      ).toEqual([configuredPromotion()]);
    });

    it.each([
      configuredPromotion({ enabled: false }),
      configuredPromotion({ applicationMode: "code_required" }),
      configuredPromotion({ startAt: "2026-09-01T12:00:00.001Z" }),
      configuredPromotion({ endAt: "2026-09-01T12:00:00.000Z" }),
    ])("does not require authority for an inactive or nonautomatic owner entry", (configuration) => {
      expect(
        resolveUnreconciledActiveConfiguredAutomaticPromotions(
          [configuration],
          [],
          now,
        ),
      ).toEqual([]);
    });

    it("returns a sorted deeply frozen clone without mutating inputs", () => {
      const scoped = configuredPromotion({
        id: "alpha10",
        displayName: "Alpha Offer",
        displayCode: null,
        discountBps: 1_000,
        scope: { kind: "products", productIds: ["product-b", "product-a"] },
      });
      const sitewide = configuredPromotion({ id: "zulu30" });
      const configurations = [sitewide, scoped];
      const candidates = [authoritativePromotion({ id: "unconfigured" })];
      const before = JSON.stringify({ configurations, candidates });

      const result = resolveUnreconciledActiveConfiguredAutomaticPromotions(
        configurations,
        candidates,
        now,
      );

      expect(JSON.stringify({ configurations, candidates })).toBe(before);
      expect(result?.map((entry) => entry.id)).toEqual(["alpha10", "zulu30"]);
      expect(result?.[0]?.scope).toEqual({
        kind: "products",
        productIds: ["product-a", "product-b"],
      });
      expect(Object.isFrozen(result)).toBe(true);
      expect(Object.isFrozen(result?.[0])).toBe(true);
      expect(Object.isFrozen(result?.[0]?.scope)).toBe(true);
      expect(Object.isFrozen((result?.[0]?.scope as { productIds?: unknown }).productIds)).toBe(true);
      expect(result?.[0]).not.toBe(scoped);
    });

    it("fails closed for malformed or hostile authority array boundaries", () => {
      const sparse = new Array<StorefrontPromotionConfiguration>(1);
      const overridden = [authoritativePromotion()] as StorefrontPromotionConfiguration[] & {
        map?: unknown;
      };
      overridden.map = () => [];
      const iteratorOverride = [authoritativePromotion()];
      Object.defineProperty(iteratorOverride, Symbol.iterator, {
        value() {
          throw new Error("private iterator detail");
        },
      });
      const accessor = [authoritativePromotion()];
      Object.defineProperty(accessor, "0", {
        get() {
          throw new Error("private getter detail");
        },
      });
      const hostileProxy = new Proxy([authoritativePromotion()], {
        ownKeys() {
          throw new Error("private proxy detail");
        },
      });

      for (const boundary of [
        {},
        sparse,
        overridden,
        iteratorOverride,
        accessor,
        hostileProxy,
      ]) {
        expect(
          resolveUnreconciledActiveConfiguredAutomaticPromotions(
            [configuredPromotion()],
            boundary,
            now,
          ),
        ).toBeNull();
      }
    });

    it("fails closed for malformed owner input or evaluation instant", () => {
      expect(
        resolveUnreconciledActiveConfiguredAutomaticPromotions(
          {},
          [],
          now,
        ),
      ).toBeNull();
      expect(
        resolveUnreconciledActiveConfiguredAutomaticPromotions(
          [configuredPromotion()],
          [],
          new Date(Number.NaN),
        ),
      ).toBeNull();
    });
  });
});
