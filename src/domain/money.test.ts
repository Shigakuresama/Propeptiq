import { describe, expect, it } from "vitest";

import {
  calculateOrderTotals,
  type BrowserCartLineInput,
  type MoneyPolicy,
  type OrderTotalsInput,
} from "@/domain/money";

const syntheticPolicy: MoneyPolicy = {
  allowedCurrencies: ["USD"],
  maximumQuantityPerLine: 10,
  maximumLineCount: 5,
  maximumOrderAmountMinor: 100_000,
};

const validInput = {
  lines: [
    {
      productId: "synthetic-product-1",
      authority: "server_resolved_price",
      priceBookId: "synthetic-price-1",
      priceVersion: "test-v1",
      unitAmountMinor: 1_250,
      currency: "USD",
      quantity: 2,
    },
  ],
  discount: {
    authority: "server_calculated_discount",
    amountMinor: 250,
    currency: "USD",
    allocations: [
      {
        productId: "synthetic-product-1",
        discountMinor: 250,
      },
    ],
  },
  tax: {
    authority: "server_calculated_tax",
    amountMinor: 100,
    currency: "USD",
  },
  shipping: {
    authority: "server_resolved_shipping",
    amountMinor: 250,
    currency: "USD",
  },
} as const;

describe("calculateOrderTotals", () => {
  it("calculates integer-minor-unit totals from server price inputs", () => {
    const result = calculateOrderTotals(
      validInput,
      syntheticPolicy,
    );

    expect(result).toEqual({
      ok: true,
      value: {
        currency: "USD",
        subtotalMinor: 2_500,
        discountMinor: 250,
        taxMinor: 100,
        shippingMinor: 250,
        totalMinor: 2_600,
        lines: [
          {
            productId: "synthetic-product-1",
            priceBookId: "synthetic-price-1",
            priceVersion: "test-v1",
            unitAmountMinor: 1_250,
            currency: "USD",
            quantity: 2,
            subtotalMinor: 2_500,
            discountMinor: 250,
            totalMinor: 2_250,
          },
        ],
      },
    });
  });

  it("requires exact dense discount coverage and derives net line totals", () => {
    const secondLine = {
      ...validInput.lines[0],
      productId: "synthetic-product-2",
      priceBookId: "synthetic-price-2",
      unitAmountMinor: 500,
      quantity: 1,
    } as const;
    const result = calculateOrderTotals(
      {
        ...validInput,
        lines: [secondLine, validInput.lines[0]],
        discount: {
          ...validInput.discount,
          amountMinor: 300,
          allocations: [
            { productId: "synthetic-product-1", discountMinor: 250 },
            { productId: "synthetic-product-2", discountMinor: 50 },
          ],
        },
      },
      syntheticPolicy,
    );

    expect(result).toMatchObject({
      ok: true,
      value: {
        subtotalMinor: 3_000,
        discountMinor: 300,
        totalMinor: 3_050,
        lines: [
          {
            productId: "synthetic-product-2",
            subtotalMinor: 500,
            discountMinor: 50,
            totalMinor: 450,
          },
          {
            productId: "synthetic-product-1",
            subtotalMinor: 2_500,
            discountMinor: 250,
            totalMinor: 2_250,
          },
        ],
      },
    });
  });

  it.each([
    [
      "missing allocation",
      [{ productId: "synthetic-product-2", discountMinor: 250 }],
      "discount.allocations",
    ],
    [
      "duplicate allocation",
      [
        { productId: "synthetic-product-1", discountMinor: 125 },
        { productId: "synthetic-product-1", discountMinor: 125 },
      ],
      "discount.allocations[1].productId",
    ],
    [
      "negative allocation",
      [{ productId: "synthetic-product-1", discountMinor: -1 }],
      "discount.allocations[0].discountMinor",
    ],
    [
      "allocation above subtotal",
      [{ productId: "synthetic-product-1", discountMinor: 2_501 }],
      "discount.allocations[0].discountMinor",
    ],
  ] as const)("rejects %s", (_name, allocations, field) => {
    expect(
      calculateOrderTotals(
        {
          ...validInput,
          discount: { ...validInput.discount, allocations },
        } as OrderTotalsInput,
        syntheticPolicy,
      ),
    ).toEqual({
      ok: false,
      error: { code: "invalid_amount", field },
    });
  });

  it("rejects sparse allocations and a declared discount that does not equal them", () => {
    const sparse = [
      { productId: "synthetic-product-1", discountMinor: 250 },
    ];
    sparse.length = 2;
    expect(
      calculateOrderTotals(
        {
          ...validInput,
          discount: { ...validInput.discount, allocations: sparse },
        },
        syntheticPolicy,
      ),
    ).toEqual({
      ok: false,
      error: { code: "invalid_amount", field: "discount.allocations" },
    });

    expect(
      calculateOrderTotals(
        {
          ...validInput,
          discount: { ...validInput.discount, amountMinor: 251 },
        },
        syntheticPolicy,
      ),
    ).toEqual({
      ok: false,
      error: { code: "invalid_amount", field: "discount.amountMinor" },
    });
  });

  it("rejects zero final totals but permits fully discounted merchandise with positive shipping", () => {
    const fullyDiscounted = {
      ...validInput,
      lines: [{ ...validInput.lines[0], unitAmountMinor: 100, quantity: 1 }],
      discount: {
        ...validInput.discount,
        amountMinor: 100,
        allocations: [
          { productId: "synthetic-product-1", discountMinor: 100 },
        ],
      },
      tax: { ...validInput.tax, amountMinor: 0 },
      shipping: { ...validInput.shipping, amountMinor: 0 },
    };
    expect(calculateOrderTotals(fullyDiscounted, syntheticPolicy)).toEqual({
      ok: false,
      error: { code: "zero_total_not_supported", field: "totalMinor" },
    });
    expect(
      calculateOrderTotals(
        {
          ...fullyDiscounted,
          shipping: { ...fullyDiscounted.shipping, amountMinor: 1 },
        },
        syntheticPolicy,
      ),
    ).toMatchObject({
      ok: true,
      value: { subtotalMinor: 100, discountMinor: 100, totalMinor: 1 },
    });
  });

  it("rejects duplicate price-line product IDs and sparse price lines", () => {
    expect(
      calculateOrderTotals(
        { ...validInput, lines: [validInput.lines[0], validInput.lines[0]] },
        syntheticPolicy,
      ),
    ).toEqual({
      ok: false,
      error: { code: "invalid_identifier", field: "lines[1].productId" },
    });
    const sparse = [validInput.lines[0]];
    sparse.length = 2;
    expect(
      calculateOrderTotals({ ...validInput, lines: sparse }, syntheticPolicy),
    ).toEqual({
      ok: false,
      error: { code: "invalid_line_count", field: "lines" },
    });
  });

  it.each([
    ["an empty currency allowlist", { allowedCurrencies: [] }],
    ["a malformed currency", { allowedCurrencies: ["usd"] }],
    ["a zero quantity limit", { maximumQuantityPerLine: 0 }],
    ["a fractional line limit", { maximumLineCount: 1.5 }],
    ["a negative order limit", { maximumOrderAmountMinor: -1 }],
    [
      "an unsafe order limit",
      { maximumOrderAmountMinor: Number.MAX_SAFE_INTEGER + 1 },
    ],
  ] as const)("rejects policy with %s", (_name, override) => {
    const result = calculateOrderTotals(validInput, {
      ...syntheticPolicy,
      ...override,
    });

    expect(result).toEqual({
      ok: false,
      error: { code: "invalid_policy", field: "policy" },
    });
  });

  it("rejects a sparse currency allowlist", () => {
    const allowedCurrencies = ["USD"];
    allowedCurrencies.length = 2;

    expect(
      calculateOrderTotals(validInput, {
        ...syntheticPolicy,
        allowedCurrencies,
      }),
    ).toEqual({
      ok: false,
      error: { code: "invalid_policy", field: "policy" },
    });
  });

  it.each([
    ["no lines", [], "invalid_line_count", "lines"],
    [
      "too many lines",
      Array.from({ length: 6 }, (_, index) => ({
        ...validInput.lines[0],
        productId: `synthetic-product-${index}`,
      })),
      "invalid_line_count",
      "lines",
    ],
  ] as const)("rejects %s", (_name, lines, code, field) => {
    const result = calculateOrderTotals({ ...validInput, lines }, syntheticPolicy);

    expect(result).toEqual({ ok: false, error: { code, field } });
  });

  it.each([
    ["productId", "productId"],
    ["priceBookId", "priceBookId"],
    ["priceVersion", "priceVersion"],
  ] as const)("rejects a blank %s", (property, fieldName) => {
    const result = calculateOrderTotals(
      {
        ...validInput,
        lines: [{ ...validInput.lines[0], [property]: "   " }],
      },
      syntheticPolicy,
    );

    expect(result).toEqual({
      ok: false,
      error: {
        code: "invalid_identifier",
        field: `lines[0].${fieldName}`,
      },
    });
  });

  it.each(["usd", "US", "USDX", "EUR"])(
    "rejects unapproved or malformed currency %s",
    (currency) => {
      const result = calculateOrderTotals(
        {
          ...validInput,
          lines: [{ ...validInput.lines[0], currency }],
        },
        syntheticPolicy,
      );

      expect(result).toEqual({
        ok: false,
        error: { code: "invalid_currency", field: "lines[0].currency" },
      });
    },
  );

  it("rejects currency inconsistency across lines, tax, and shipping", () => {
    const result = calculateOrderTotals(
      {
        ...validInput,
        tax: { ...validInput.tax, amountMinor: 100, currency: "EUR" },
      },
      { ...syntheticPolicy, allowedCurrencies: ["USD", "EUR"] },
    );

    expect(result).toEqual({
      ok: false,
      error: { code: "currency_mismatch", field: "tax.currency" },
    });
  });

  it.each([
    ["negative unit amount", "unitAmountMinor", -1],
    ["fractional unit amount", "unitAmountMinor", 1.5],
    ["unsafe unit amount", "unitAmountMinor", Number.MAX_SAFE_INTEGER + 1],
  ] as const)("rejects a %s", (_name, property, value) => {
    const result = calculateOrderTotals(
      {
        ...validInput,
        lines: [{ ...validInput.lines[0], [property]: value }],
      },
      syntheticPolicy,
    );

    expect(result).toEqual({
      ok: false,
      error: { code: "invalid_amount", field: "lines[0].unitAmountMinor" },
    });
  });

  it.each([
    ["zero quantity", 0],
    ["negative quantity", -1],
    ["fractional quantity", 1.5],
    ["quantity above policy", 11],
    ["unsafe quantity", Number.MAX_SAFE_INTEGER + 1],
  ] as const)("rejects %s", (_name, quantity) => {
    const result = calculateOrderTotals(
      {
        ...validInput,
        lines: [{ ...validInput.lines[0], quantity }],
      },
      syntheticPolicy,
    );

    expect(result).toEqual({
      ok: false,
      error: { code: "invalid_quantity", field: "lines[0].quantity" },
    });
  });

  it.each([
    ["tax", -1],
    ["shipping", 1.5],
  ] as const)("rejects an invalid %s amount", (component, amountMinor) => {
    const result = calculateOrderTotals(
      {
        ...validInput,
        [component]: { ...validInput[component], amountMinor },
      },
      syntheticPolicy,
    );

    expect(result).toEqual({
      ok: false,
      error: { code: "invalid_amount", field: `${component}.amountMinor` },
    });
  });

  it("rejects unsafe multiplication or addition before JavaScript loses precision", () => {
    const multiplication = calculateOrderTotals(
      {
        ...validInput,
        lines: [
          {
            ...validInput.lines[0],
            unitAmountMinor: Number.MAX_SAFE_INTEGER,
            quantity: 2,
          },
        ],
        tax: { ...validInput.tax, amountMinor: 0, currency: "USD" },
        shipping: { ...validInput.shipping, amountMinor: 0, currency: "USD" },
      },
      {
        ...syntheticPolicy,
        maximumOrderAmountMinor: Number.MAX_SAFE_INTEGER,
      },
    );
    expect(multiplication).toEqual({
      ok: false,
      error: { code: "arithmetic_overflow", field: "lines[0].subtotalMinor" },
    });

    const addition = calculateOrderTotals(
      {
        ...validInput,
        lines: [
          {
            ...validInput.lines[0],
            unitAmountMinor: Number.MAX_SAFE_INTEGER - 100,
            quantity: 1,
          },
        ],
        tax: { ...validInput.tax, amountMinor: 100, currency: "USD" },
        shipping: { ...validInput.shipping, amountMinor: 100, currency: "USD" },
        discount: {
          ...validInput.discount,
          amountMinor: 0,
          allocations: [
            { productId: "synthetic-product-1", discountMinor: 0 },
          ],
        },
      },
      {
        ...syntheticPolicy,
        maximumOrderAmountMinor: Number.MAX_SAFE_INTEGER,
      },
    );
    expect(addition).toEqual({
      ok: false,
      error: { code: "arithmetic_overflow", field: "totalMinor" },
    });
  });

  it("rejects a valid total above the approved order limit", () => {
    const result = calculateOrderTotals(validInput, {
      ...syntheticPolicy,
      maximumOrderAmountMinor: 2_599,
    });

    expect(result).toEqual({
      ok: false,
      error: { code: "order_limit_exceeded", field: "totalMinor" },
    });
  });

  it.each([
    [
      "a null identifier",
      {
        ...validInput,
        lines: [{ ...validInput.lines[0], productId: null }],
      },
      "invalid_identifier",
      "lines[0].productId",
    ],
    [
      "a null line",
      { ...validInput, lines: [null] },
      "invalid_identifier",
      "lines[0]",
    ],
    [
      "a missing discount component",
      {
        lines: validInput.lines,
        tax: validInput.tax,
        shipping: validInput.shipping,
      },
      "invalid_amount",
      "discount",
    ],
    [
      "a missing tax component",
      {
        lines: validInput.lines,
        discount: validInput.discount,
        shipping: validInput.shipping,
      },
      "invalid_amount",
      "tax",
    ],
    [
      "a null shipping component",
      { ...validInput, shipping: null },
      "invalid_amount",
      "shipping",
    ],
  ] as const)(
    "returns a typed denial for %s instead of throwing",
    (_name, malformedInput, code, field) => {
      expect(() =>
        calculateOrderTotals(
          malformedInput as unknown as OrderTotalsInput,
          syntheticPolicy,
        ),
      ).not.toThrow();
      expect(
        calculateOrderTotals(
          malformedInput as unknown as OrderTotalsInput,
          syntheticPolicy,
        ),
      ).toEqual({ ok: false, error: { code, field } });
    },
  );

  it("returns invalid_policy for a malformed runtime policy", () => {
    expect(() =>
      calculateOrderTotals(validInput, null as unknown as MoneyPolicy),
    ).not.toThrow();
    expect(
      calculateOrderTotals(validInput, null as unknown as MoneyPolicy),
    ).toEqual({
      ok: false,
      error: { code: "invalid_policy", field: "policy" },
    });
  });

  it("keeps browser cart requests structurally separate from authoritative pricing", () => {
    const browserLine = {
      productId: "synthetic-product-1",
      quantity: 2,
    } satisfies BrowserCartLineInput;

    expect(
      calculateOrderTotals(
        {
          lines: [browserLine],
          tax: validInput.tax,
          shipping: validInput.shipping,
        } as unknown as OrderTotalsInput,
        syntheticPolicy,
      ),
    ).toMatchObject({
      ok: false,
      error: { code: "untrusted_input", field: "lines[0].authority" },
    });
  });

  it.each([
    [
      "a missing server price authority marker",
      {
        ...validInput,
        lines: [
          {
            productId: "synthetic-product-1",
            priceBookId: "synthetic-price-1",
            priceVersion: "test-v1",
            unitAmountMinor: 1_250,
            currency: "USD",
            quantity: 2,
          },
        ],
      },
      "lines[0].authority",
    ],
    [
      "a caller price marker",
      {
        ...validInput,
        lines: [{ ...validInput.lines[0], authority: "browser_claimed_price" }],
      },
      "lines[0].authority",
    ],
    [
      "a caller discount marker",
      {
        ...validInput,
        discount: {
          ...validInput.discount,
          authority: "browser_claimed_discount",
        },
      },
      "discount.authority",
    ],
    [
      "a caller tax marker",
      {
        ...validInput,
        tax: { ...validInput.tax, authority: "browser_claimed_tax" },
      },
      "tax.authority",
    ],
    [
      "a caller shipping marker",
      {
        ...validInput,
        shipping: {
          ...validInput.shipping,
          authority: "browser_claimed_shipping",
        },
      },
      "shipping.authority",
    ],
  ] as const)("rejects %s", (_name, input, field) => {
    expect(
      calculateOrderTotals(
        input as unknown as OrderTotalsInput,
        syntheticPolicy,
      ),
    ).toEqual({ ok: false, error: { code: "untrusted_input", field } });
  });

  it("projects only approved fields into deeply immutable snapshots", () => {
    const inputWithUnknownFields = {
      ...validInput,
      lines: [
        {
          ...validInput.lines[0],
          unapprovedMetadata: { mutable: true },
        },
      ],
    } as unknown as OrderTotalsInput;

    const result = calculateOrderTotals(inputWithUnknownFields, syntheticPolicy);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.lines[0]).not.toHaveProperty("unapprovedMetadata");
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.value)).toBe(true);
    expect(Object.isFrozen(result.value.lines)).toBe(true);
    expect(Object.isFrozen(result.value.lines[0])).toBe(true);

    const denied = calculateOrderTotals(validInput, {
      ...syntheticPolicy,
      allowedCurrencies: [],
    });
    expect(Object.isFrozen(denied)).toBe(true);
    expect(!denied.ok && Object.isFrozen(denied.error)).toBe(true);
  });
});
