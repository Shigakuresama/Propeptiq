import type { Result } from "@/domain/result";

export type MoneyPolicy = Readonly<{
  allowedCurrencies: readonly string[];
  maximumQuantityPerLine: number;
  maximumLineCount: number;
  maximumOrderAmountMinor: number;
}>;

export type BrowserCartLineInput = Readonly<{
  productId: string;
  quantity: number;
}>;

export type PriceLineInput = Readonly<{
  authority: "server_resolved_price";
  productId: string;
  priceBookId: string;
  priceVersion: string;
  unitAmountMinor: number;
  currency: string;
  quantity: number;
}>;

type MoneyComponent = Readonly<{
  amountMinor: number;
  currency: string;
}>;

export type TaxComponent = Readonly<
  MoneyComponent & { authority: "server_calculated_tax" }
>;

export type ShippingComponent = Readonly<
  MoneyComponent & { authority: "server_resolved_shipping" }
>;

export type PriceSnapshot = Readonly<
  Omit<PriceLineInput, "authority"> & { lineTotalMinor: number }
>;

export type OrderTotals = Readonly<{
  currency: string;
  subtotalMinor: number;
  taxMinor: number;
  shippingMinor: number;
  totalMinor: number;
  lines: readonly PriceSnapshot[];
}>;

export type MoneyError = Readonly<{
  code:
    | "invalid_policy"
    | "untrusted_input"
    | "invalid_line_count"
    | "invalid_identifier"
    | "invalid_currency"
    | "currency_mismatch"
    | "invalid_amount"
    | "invalid_quantity"
    | "arithmetic_overflow"
    | "order_limit_exceeded";
  field: string;
}>;

export type OrderTotalsInput = Readonly<{
  lines: readonly PriceLineInput[];
  tax: TaxComponent;
  shipping: ShippingComponent;
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isDenseArray(value: readonly unknown[]): boolean {
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.hasOwn(value, index)) return false;
  }
  return true;
}

export function calculateOrderTotals(
  input: OrderTotalsInput,
  policy: MoneyPolicy,
): Result<OrderTotals, MoneyError> {
  const fail = (code: MoneyError["code"], field: string) =>
    Object.freeze({
      ok: false as const,
      error: Object.freeze({ code, field }),
    });

  const limits = isRecord(policy)
    ? [
        policy.maximumQuantityPerLine,
        policy.maximumLineCount,
        policy.maximumOrderAmountMinor,
      ]
    : [];
  const validPolicy =
    isRecord(policy) &&
    Array.isArray(policy.allowedCurrencies) &&
    isDenseArray(policy.allowedCurrencies) &&
    policy.allowedCurrencies.length > 0 &&
    policy.allowedCurrencies.every(
      (currency) =>
        typeof currency === "string" && /^[A-Z]{3}$/.test(currency),
    ) &&
    new Set(policy.allowedCurrencies).size === policy.allowedCurrencies.length &&
    limits.every((limit) => Number.isSafeInteger(limit) && limit > 0);
  if (!validPolicy) {
    return fail("invalid_policy", "policy");
  }

  if (
    !isRecord(input) ||
    !Array.isArray(input.lines) ||
    input.lines.length === 0 ||
    input.lines.length > policy.maximumLineCount
  ) {
    return fail("invalid_line_count", "lines");
  }

  const isAllowedCurrency = (currency: unknown): currency is string =>
    typeof currency === "string" &&
    /^[A-Z]{3}$/.test(currency) &&
    policy.allowedCurrencies.includes(currency);

  for (const [index, line] of input.lines.entries()) {
    if (!isRecord(line)) {
      return fail("invalid_identifier", `lines[${index}]`);
    }
    if (line.authority !== "server_resolved_price") {
      return fail("untrusted_input", `lines[${index}].authority`);
    }
    for (const field of [
      "productId",
      "priceBookId",
      "priceVersion",
    ] as const) {
      if (typeof line[field] !== "string" || line[field].trim().length === 0) {
        return fail("invalid_identifier", `lines[${index}].${field}`);
      }
    }
    if (!isAllowedCurrency(line.currency)) {
      return fail("invalid_currency", `lines[${index}].currency`);
    }
  }


  if (!isRecord(input.tax)) {
    return fail("invalid_amount", "tax");
  }
  if (!isRecord(input.shipping)) {
    return fail("invalid_amount", "shipping");
  }
  if (input.tax.authority !== "server_calculated_tax") {
    return fail("untrusted_input", "tax.authority");
  }
  if (input.shipping.authority !== "server_resolved_shipping") {
    return fail("untrusted_input", "shipping.authority");
  }

  if (!isAllowedCurrency(input.tax.currency)) {
    return fail("invalid_currency", "tax.currency");
  }
  if (!isAllowedCurrency(input.shipping.currency)) {
    return fail("invalid_currency", "shipping.currency");
  }

  const currency = input.lines[0]!.currency;
  for (const [index, line] of input.lines.entries()) {
    if (line.currency !== currency) {
      return fail("currency_mismatch", `lines[${index}].currency`);
    }
  }
  if (input.tax.currency !== currency) {
    return fail("currency_mismatch", "tax.currency");
  }
  if (input.shipping.currency !== currency) {
    return fail("currency_mismatch", "shipping.currency");
  }

  const lines: PriceSnapshot[] = [];
  let subtotalMinor = 0;
  for (const [index, line] of input.lines.entries()) {
    if (
      !Number.isSafeInteger(line.unitAmountMinor) ||
      line.unitAmountMinor < 0
    ) {
      return fail("invalid_amount", `lines[${index}].unitAmountMinor`);
    }
    if (
      !Number.isSafeInteger(line.quantity) ||
      line.quantity <= 0 ||
      line.quantity > policy.maximumQuantityPerLine
    ) {
      return fail("invalid_quantity", `lines[${index}].quantity`);
    }

    const lineTotalMinor = line.unitAmountMinor * line.quantity;
    if (!Number.isSafeInteger(lineTotalMinor)) {
      return fail("arithmetic_overflow", `lines[${index}].lineTotalMinor`);
    }
    const nextSubtotal = subtotalMinor + lineTotalMinor;
    if (!Number.isSafeInteger(nextSubtotal)) {
      return fail("arithmetic_overflow", "subtotalMinor");
    }

    lines.push(
      Object.freeze({
        productId: line.productId,
        priceBookId: line.priceBookId,
        priceVersion: line.priceVersion,
        unitAmountMinor: line.unitAmountMinor,
        currency: line.currency,
        quantity: line.quantity,
        lineTotalMinor,
      }),
    );
    subtotalMinor = nextSubtotal;
  }

  for (const [component, value] of [
    ["tax", input.tax.amountMinor],
    ["shipping", input.shipping.amountMinor],
  ] as const) {
    if (!Number.isSafeInteger(value) || value < 0) {
      return fail("invalid_amount", `${component}.amountMinor`);
    }
  }

  const subtotalWithTax = subtotalMinor + input.tax.amountMinor;
  const totalMinor = subtotalWithTax + input.shipping.amountMinor;
  if (
    !Number.isSafeInteger(subtotalWithTax) ||
    !Number.isSafeInteger(totalMinor)
  ) {
    return fail("arithmetic_overflow", "totalMinor");
  }
  if (totalMinor > policy.maximumOrderAmountMinor) {
    return fail("order_limit_exceeded", "totalMinor");
  }

  return Object.freeze({
    ok: true,
    value: Object.freeze({
      currency,
      subtotalMinor,
      taxMinor: input.tax.amountMinor,
      shippingMinor: input.shipping.amountMinor,
      totalMinor,
      lines: Object.freeze(lines),
    }),
  });
}
