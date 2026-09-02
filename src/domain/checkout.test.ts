import { describe, expect, it } from "vitest";

import {
  parseCheckoutQuoteRequest,
  parseCheckoutRequest,
} from "@/domain/checkout";

const variantA = "20000000-0000-4000-8000-000000000001";
const variantB = "20000000-0000-4000-8000-000000000002";
const pricingRevision = "a".repeat(64);

const destination = {
  recipientName: "Dr. Ada Lovelace",
  line1: "1 Research Way",
  line2: null as string | null,
  city: "Boston",
  stateCode: "MA",
  postalCode: "02108",
  countryCode: "US" as const,
};

function quoteRequest() {
  return {
    items: [{ variantId: variantA, quantity: 2 }],
    destination: { ...destination },
  };
}

function sessionRequest() {
  return { ...quoteRequest(), pricingRevision };
}

describe("strict variant checkout requests", () => {
  it("accepts and deeply freezes only variant lines, destination, and the session revision", () => {
    const result = parseCheckoutRequest({
      items: [
        { variantId: variantB.toUpperCase(), quantity: 1 },
        { variantId: variantA.toUpperCase(), quantity: 2 },
      ],
      destination: {
        ...destination,
        recipientName: "  Dr.  Ada   Lovelace  ",
        line1: "  1   Research Way ",
        line2: " Suite  2 ",
        city: " São  José ",
        stateCode: " ca ",
        postalCode: " 95113-1234 ",
      },
      pricingRevision,
      rewardRedemptionPoints: 500,
    });

    expect(result).toEqual({
      ok: true,
      value: {
        items: [
          { variantId: variantA, quantity: 2 },
          { variantId: variantB, quantity: 1 },
        ],
        destination: {
          recipientName: "Dr. Ada Lovelace",
          line1: "1 Research Way",
          line2: "Suite 2",
          city: "São José",
          stateCode: "CA",
          postalCode: "95113-1234",
          countryCode: "US",
        },
        pricingRevision,
        rewardRedemptionPoints: 500,
      },
    });
    if (!result.ok) return;
    expect(Object.isFrozen(result.value)).toBe(true);
    expect(Object.isFrozen(result.value.items)).toBe(true);
    expect(Object.isFrozen(result.value.items[0])).toBe(true);
    expect(Object.isFrozen(result.value.destination)).toBe(true);
  });

  it("uses a separate initial quote contract with no pricing revision", () => {
    expect(parseCheckoutQuoteRequest(quoteRequest())).toEqual({
      ok: true,
      value: quoteRequest(),
    });
    expect(parseCheckoutRequest(quoteRequest())).toEqual({
      ok: false,
      error: { code: "invalid_pricing_revision", field: "pricingRevision" },
    });
    expect(
      parseCheckoutQuoteRequest({ ...quoteRequest(), pricingRevision }),
    ).toEqual({
      ok: false,
      error: { code: "unexpected_field", field: "request.pricingRevision" },
    });
  });

  it.each([
    ["productId", "20000000-0000-4000-8000-000000000003"],
    ["baseUnitMinor", 10_000],
    ["discountBps", 3_000],
    ["totalMinor", 14_000],
    ["stripePriceId", "price_browser_claim"],
    ["currency", "USD"],
    ["promotionIds", ["20000000-0000-4000-8000-000000000004"]],
    ["automaticPromotionIds", ["winter30"]],
    ["eligiblePromotions", [{ id: "winter30", discountBps: 3_000 }]],
  ])("rejects browser authority in line field %s", (field, value) => {
    expect(
      parseCheckoutRequest({
        ...sessionRequest(),
        items: [{ ...sessionRequest().items[0], [field]: value }],
      }),
    ).toEqual({
      ok: false,
      error: { code: "unexpected_field", field: `items[0].${field}` },
    });
  });

  it.each([
    ["productId", variantB],
    ["baseUnitMinor", 10_000],
    ["discountBps", 3_000],
    ["totalMinor", 14_000],
    ["stripePriceId", "price_browser_claim"],
    ["currency", "USD"],
    ["promotionIds", [variantB]],
    ["automaticPromotion", { id: "winter30", active: true }],
  ])("rejects browser authority in request field %s", (field, value) => {
    expect(parseCheckoutRequest({ ...sessionRequest(), [field]: value })).toEqual({
      ok: false,
      error: { code: "unexpected_field", field: `request.${field}` },
    });
  });

  it.each(["", "a".repeat(63), "A".repeat(64), "g".repeat(64), null])(
    "rejects malformed pricing revision %j",
    (revision) => {
      expect(
        parseCheckoutRequest({ ...sessionRequest(), pricingRevision: revision }),
      ).toEqual({
        ok: false,
        error: { code: "invalid_pricing_revision", field: "pricingRevision" },
      });
    },
  );

  it.each([0, -1, 1.5, 26, Number.MAX_SAFE_INTEGER + 1])(
    "rejects invalid quantity %s",
    (quantity) => {
      expect(
        parseCheckoutRequest({
          ...sessionRequest(),
          items: [{ variantId: variantA, quantity }],
        }),
      ).toEqual({
        ok: false,
        error: { code: "invalid_quantity", field: "items[0].quantity" },
      });
    },
  );

  it("rejects duplicate variant IDs after normalization", () => {
    expect(
      parseCheckoutRequest({
        ...sessionRequest(),
        items: [
          { variantId: variantA, quantity: 1 },
          { variantId: variantA.toUpperCase(), quantity: 2 },
        ],
      }),
    ).toEqual({
      ok: false,
      error: { code: "duplicate_variant", field: "items[1].variantId" },
    });
  });

  it("rejects malformed roots, sparse lines, inherited fields, and symbols", () => {
    expect(parseCheckoutRequest(null)).toEqual({
      ok: false,
      error: { code: "invalid_request", field: "request" },
    });
    const sparse = [{ variantId: variantA, quantity: 1 }];
    sparse.length = 2;
    expect(parseCheckoutRequest({ ...sessionRequest(), items: sparse })).toEqual({
      ok: false,
      error: { code: "invalid_items", field: "items" },
    });
    const inherited = Object.assign(
      Object.create({ totalMinor: 1 }) as Record<string, unknown>,
      sessionRequest(),
    );
    expect(parseCheckoutRequest(inherited)).toEqual({
      ok: false,
      error: { code: "unexpected_field", field: "request.totalMinor" },
    });
    expect(
      parseCheckoutRequest({ ...sessionRequest(), [Symbol("hidden")]: true }),
    ).toEqual({
      ok: false,
      error: { code: "unexpected_field", field: "request" },
    });
  });

  it("accepts only a standard dense items array with length and numeric own keys", () => {
    const extraStringKey = [{ variantId: variantA, quantity: 1 }];
    Object.defineProperty(extraStringKey, "claimedTotal", {
      enumerable: false,
      value: 1,
    });
    const extraSymbolKey = [{ variantId: variantA, quantity: 1 }];
    Object.defineProperty(extraSymbolKey, Symbol("hidden"), {
      enumerable: false,
      value: true,
    });
    const inheritedEnumerableKey = [{ variantId: variantA, quantity: 1 }];
    const customPrototype = Object.create(Array.prototype) as unknown[] & {
      inheritedClaim?: number;
    };
    customPrototype.inheritedClaim = 1;
    Object.setPrototypeOf(inheritedEnumerableKey, customPrototype);

    for (const items of [
      extraStringKey,
      extraSymbolKey,
      inheritedEnumerableKey,
    ]) {
      expect(parseCheckoutRequest({ ...sessionRequest(), items })).toEqual({
        ok: false,
        error: { code: "invalid_items", field: "items" },
      });
    }

    expect(parseCheckoutRequest(sessionRequest())).toMatchObject({ ok: true });
  });

  it.each([0, -1, 1.5, "500", null])(
    "rejects invalid reward points %j",
    (rewardRedemptionPoints) => {
      expect(
        parseCheckoutQuoteRequest({
          ...quoteRequest(),
          rewardRedemptionPoints,
        }),
      ).toEqual({
        ok: false,
        error: {
          code: "invalid_reward_redemption_points",
          field: "rewardRedemptionPoints",
        },
      });
    },
  );

  it.each([
    ["recipientName", "", "destination.recipientName"],
    ["line1", "\u0000hidden", "destination.line1"],
    ["line2", "", "destination.line2"],
    ["city", "x".repeat(101), "destination.city"],
    ["stateCode", "PR", "destination.stateCode"],
    ["postalCode", "1234", "destination.postalCode"],
    ["countryCode", "us", "destination.countryCode"],
  ] as const)("rejects invalid destination %s", (property, value, field) => {
    expect(
      parseCheckoutRequest({
        ...sessionRequest(),
        destination: { ...destination, [property]: value },
      }),
    ).toEqual({
      ok: false,
      error: { code: "invalid_destination", field },
    });
  });
});
