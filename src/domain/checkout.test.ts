import { describe, expect, it } from "vitest";

import { parseCheckoutRequest } from "@/domain/checkout";

const productA = "550e8400-e29b-41d4-a716-446655440000";
const productB = "6ba7b810-9dad-41d1-80b4-00c04fd430c8";
const promotionA = "123e4567-e89b-42d3-a456-426614174000";

function validRequest() {
  return {
    items: [{ productId: productA, quantity: 2 }],
    destination: {
      recipientName: "Dr. Ada Lovelace",
      line1: "1 Research Way",
      line2: null as string | null,
      city: "Boston",
      stateCode: "MA",
      postalCode: "02108",
      countryCode: "US",
    },
    promotionIds: [] as string[],
  };
}

describe("parseCheckoutRequest", () => {
  it("canonicalizes, orders, and deeply freezes the exact browser payload", () => {
    const request = validRequest();
    request.items = [
      { productId: productB.toUpperCase(), quantity: 1 },
      { productId: productA.toUpperCase(), quantity: 2 },
    ];
    request.destination = {
      recipientName: "  Dr.  Ada   Lovelace  ",
      line1: "  1   Research Way ",
      line2: "  Suite   2  ",
      city: "  São   José  ",
      stateCode: " ca ",
      postalCode: " 95113-1234 ",
      countryCode: "US",
    };
    request.promotionIds = [promotionA.toUpperCase()];

    const result = parseCheckoutRequest(request);

    expect(result).toEqual({
      ok: true,
      value: {
        items: [
          { productId: productA, quantity: 2 },
          { productId: productB, quantity: 1 },
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
        promotionIds: [promotionA],
      },
    });
    if (!result.ok) return;
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.value)).toBe(true);
    expect(Object.isFrozen(result.value.items)).toBe(true);
    expect(Object.isFrozen(result.value.items[0])).toBe(true);
    expect(Object.isFrozen(result.value.destination)).toBe(true);
    expect(Object.isFrozen(result.value.promotionIds)).toBe(true);
  });

  it.each([null, [], "request", 17])("rejects malformed root value %j", (input) => {
    expect(parseCheckoutRequest(input)).toEqual({
      ok: false,
      error: { code: "invalid_request", field: "request" },
    });
  });

  it("rejects unexpected own and inherited fields at every object boundary", () => {
    expect(parseCheckoutRequest({ ...validRequest(), totalMinor: 1 })).toEqual({
      ok: false,
      error: { code: "unexpected_field", field: "request.totalMinor" },
    });
    expect(
      parseCheckoutRequest({
        ...validRequest(),
        items: [{ productId: productA, quantity: 1, amountMinor: 1 }],
      }),
    ).toEqual({
      ok: false,
      error: { code: "unexpected_field", field: "items[0].amountMinor" },
    });
    expect(
      parseCheckoutRequest({
        ...validRequest(),
        destination: {
          ...validRequest().destination,
          email: "private@test.invalid",
        },
      }),
    ).toEqual({
      ok: false,
      error: { code: "unexpected_field", field: "destination.email" },
    });
    const inherited = Object.assign(
      Object.create({ amountMinor: 1 }) as Record<string, unknown>,
      validRequest(),
    );
    expect(parseCheckoutRequest(inherited)).toEqual({
      ok: false,
      error: { code: "unexpected_field", field: "request.amountMinor" },
    });
    const nonEnumerablePrototype = {};
    Object.defineProperty(nonEnumerablePrototype, "amountMinor", {
      value: 1,
      enumerable: false,
    });
    const hiddenInherited = Object.assign(
      Object.create(nonEnumerablePrototype) as Record<string, unknown>,
      validRequest(),
    );
    expect(parseCheckoutRequest(hiddenInherited)).toEqual({
      ok: false,
      error: { code: "unexpected_field", field: "request.amountMinor" },
    });
    const symbolKey = Symbol("private");
    expect(
      parseCheckoutRequest({ ...validRequest(), [symbolKey]: "hidden" }),
    ).toEqual({
      ok: false,
      error: { code: "unexpected_field", field: "request" },
    });
  });

  it("requires exact own keys instead of accepting inherited required values", () => {
    const item = Object.assign(Object.create({ productId: productA }), {
      quantity: 1,
    });
    expect(parseCheckoutRequest({ ...validRequest(), items: [item] })).toEqual({
      ok: false,
      error: { code: "invalid_product_id", field: "items[0].productId" },
    });
  });

  it("enforces dense item collections and the 1-50 line boundary", () => {
    expect(parseCheckoutRequest({ ...validRequest(), items: [] })).toEqual({
      ok: false,
      error: { code: "invalid_items", field: "items" },
    });
    const sparse = [{ productId: productA, quantity: 1 }];
    sparse.length = 2;
    expect(parseCheckoutRequest({ ...validRequest(), items: sparse })).toEqual({
      ok: false,
      error: { code: "invalid_items", field: "items" },
    });
    expect(
      parseCheckoutRequest({
        ...validRequest(),
        items: Array.from({ length: 51 }, (_, index) => ({
          productId:
            index === 0
              ? productA
              : `550e8400-e29b-41d4-a716-${index.toString().padStart(12, "0")}`,
          quantity: 1,
        })),
      }),
    ).toEqual({
      ok: false,
      error: { code: "invalid_items", field: "items" },
    });
  });

  it.each([
    "not-a-uuid",
    "550e8400-e29b-61d4-a716-446655440000",
    "550e8400-e29b-41d4-7716-446655440000",
  ])("rejects malformed or unsupported UUID %s", (productId) => {
    expect(
      parseCheckoutRequest({
        ...validRequest(),
        items: [{ productId, quantity: 1 }],
      }),
    ).toEqual({
      ok: false,
      error: { code: "invalid_product_id", field: "items[0].productId" },
    });
  });

  it.each([0, -1, 1.5, 26, Number.MAX_SAFE_INTEGER + 1])(
    "rejects invalid quantity %s",
    (quantity) => {
      expect(
        parseCheckoutRequest({
          ...validRequest(),
          items: [{ productId: productA, quantity }],
        }),
      ).toEqual({
        ok: false,
        error: { code: "invalid_quantity", field: "items[0].quantity" },
      });
    },
  );

  it("rejects duplicate products after UUID normalization", () => {
    expect(
      parseCheckoutRequest({
        ...validRequest(),
        items: [
          { productId: productA, quantity: 1 },
          { productId: productA.toUpperCase(), quantity: 2 },
        ],
      }),
    ).toEqual({
      ok: false,
      error: { code: "duplicate_product", field: "items[1].productId" },
    });
  });

  it.each([
    ["recipientName", "", "destination.recipientName"],
    ["recipientName", "x".repeat(121), "destination.recipientName"],
    ["line1", "\u0000hidden", "destination.line1"],
    ["line1", "x".repeat(121), "destination.line1"],
    ["line2", "", "destination.line2"],
    ["line2", "x".repeat(121), "destination.line2"],
    ["city", "x".repeat(101), "destination.city"],
    ["stateCode", "PR", "destination.stateCode"],
    ["postalCode", "1234", "destination.postalCode"],
    ["postalCode", "12345 6789", "destination.postalCode"],
    ["countryCode", "us", "destination.countryCode"],
  ] as const)("rejects invalid destination %s", (property, value, field) => {
    expect(
      parseCheckoutRequest({
        ...validRequest(),
        destination: { ...validRequest().destination, [property]: value },
      }),
    ).toEqual({
      ok: false,
      error: { code: "invalid_destination", field },
    });
  });

  it("accepts all approved state boundaries including DC", () => {
    expect(
      parseCheckoutRequest({
        ...validRequest(),
        destination: { ...validRequest().destination, stateCode: "dc" },
      }),
    ).toMatchObject({
      ok: true,
      value: { destination: { stateCode: "DC" } },
    });
  });

  it("rejects malformed, sparse, duplicate, or multiple promotions", () => {
    expect(parseCheckoutRequest({ ...validRequest(), promotionIds: ["bad"] })).toEqual({
      ok: false,
      error: { code: "invalid_promotion_id", field: "promotionIds[0]" },
    });
    const sparse = [promotionA];
    sparse.length = 2;
    expect(parseCheckoutRequest({ ...validRequest(), promotionIds: sparse })).toEqual({
      ok: false,
      error: { code: "invalid_promotion_id", field: "promotionIds" },
    });
    expect(
      parseCheckoutRequest({
        ...validRequest(),
        promotionIds: [promotionA, promotionA.toUpperCase()],
      }),
    ).toEqual({
      ok: false,
      error: { code: "duplicate_promotion", field: "promotionIds[1]" },
    });
    expect(
      parseCheckoutRequest({
        ...validRequest(),
        promotionIds: [promotionA, productB],
      }),
    ).toEqual({
      ok: false,
      error: { code: "invalid_promotion_id", field: "promotionIds" },
    });
  });

  it("returns frozen structured errors for malformed nested input", () => {
    const result = parseCheckoutRequest({ ...validRequest(), destination: null });
    expect(result).toEqual({
      ok: false,
      error: { code: "invalid_destination", field: "destination" },
    });
    expect(Object.isFrozen(result)).toBe(true);
    expect(!result.ok && Object.isFrozen(result.error)).toBe(true);
  });
});
