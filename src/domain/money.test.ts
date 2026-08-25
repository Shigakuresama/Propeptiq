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
        taxMinor: 100,
        shippingMinor: 250,
        totalMinor: 2_850,
        lines: [
          {
            productId: "synthetic-product-1",
            priceBookId: "synthetic-price-1",
            priceVersion: "test-v1",
            unitAmountMinor: 1_250,
            currency: "USD",
            quantity: 2,
            lineTotalMinor: 2_500,
          },
        ],
      },
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
      error: { code: "arithmetic_overflow", field: "lines[0].lineTotalMinor" },
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
      maximumOrderAmountMinor: 2_849,
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
      "a missing tax component",
      { lines: validInput.lines, shipping: validInput.shipping },
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
