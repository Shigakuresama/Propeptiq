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

export type DiscountAllocation = Readonly<{
  productId: string;
  discountMinor: number;
}>;

export type DiscountComponent = Readonly<
  MoneyComponent & {
    authority: "server_calculated_discount";
    allocations: readonly DiscountAllocation[];
  }
>;

export type TaxComponent = Readonly<
  MoneyComponent & { authority: "server_calculated_tax" }
>;

export type ShippingComponent = Readonly<
  MoneyComponent & { authority: "server_resolved_shipping" }
>;

export type PriceSnapshot = Readonly<
  Omit<PriceLineInput, "authority"> & {
    subtotalMinor: number;
    discountMinor: number;
    totalMinor: number;
  }
>;

export type OrderTotals = Readonly<{
  currency: string;
  subtotalMinor: number;
  discountMinor: number;
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
    | "order_limit_exceeded"
    | "zero_total_not_supported";
  field: string;
}>;

export type OrderTotalsInput = Readonly<{
  lines: readonly PriceLineInput[];
  discount: DiscountComponent;
  tax: TaxComponent;
  shipping: ShippingComponent;
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isDenseArray(value: unknown): value is readonly unknown[] {
  if (!Array.isArray(value)) return false;
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
    isDenseArray(policy.allowedCurrencies) &&
    policy.allowedCurrencies.length > 0 &&
    policy.allowedCurrencies.every(
      (currency) =>
        typeof currency === "string" && /^[A-Z]{3}$/.test(currency),
    ) &&
    new Set(policy.allowedCurrencies).size === policy.allowedCurrencies.length &&
    limits.every((limit) => Number.isSafeInteger(limit) && limit > 0);
  if (!validPolicy) return fail("invalid_policy", "policy");

  if (
    !isRecord(input) ||
    !isDenseArray(input.lines) ||
    input.lines.length === 0 ||
    input.lines.length > policy.maximumLineCount
  ) {
    return fail("invalid_line_count", "lines");
  }

  const isAllowedCurrency = (currency: unknown): currency is string =>
    typeof currency === "string" &&
    /^[A-Z]{3}$/.test(currency) &&
    policy.allowedCurrencies.includes(currency);

  const productIds = new Set<string>();
  for (let index = 0; index < input.lines.length; index += 1) {
    const line = input.lines[index];
    if (!isRecord(line)) {
      return fail("invalid_identifier", `lines[${index}]`);
    }
    if (line.authority !== "server_resolved_price") {
      return fail("untrusted_input", `lines[${index}].authority`);
    }
    for (const field of ["productId", "priceBookId", "priceVersion"] as const) {
      if (typeof line[field] !== "string" || line[field].trim().length === 0) {
        return fail("invalid_identifier", `lines[${index}].${field}`);
      }
    }
    if (productIds.has(line.productId as string)) {
      return fail("invalid_identifier", `lines[${index}].productId`);
    }
    productIds.add(line.productId as string);
    if (!isAllowedCurrency(line.currency)) {
      return fail("invalid_currency", `lines[${index}].currency`);
    }
  }

  for (const component of ["discount", "tax", "shipping"] as const) {
    if (!isRecord(input[component])) {
      return fail("invalid_amount", component);
    }
  }
  if (input.discount.authority !== "server_calculated_discount") {
    return fail("untrusted_input", "discount.authority");
  }
  if (input.tax.authority !== "server_calculated_tax") {
    return fail("untrusted_input", "tax.authority");
  }
  if (input.shipping.authority !== "server_resolved_shipping") {
    return fail("untrusted_input", "shipping.authority");
  }
  for (const component of ["discount", "tax", "shipping"] as const) {
    if (!isAllowedCurrency(input[component].currency)) {
      return fail("invalid_currency", `${component}.currency`);
    }
  }

  const currency = input.lines[0]!.currency;
  for (let index = 0; index < input.lines.length; index += 1) {
    if (input.lines[index]!.currency !== currency) {
      return fail("currency_mismatch", `lines[${index}].currency`);
    }
  }
  for (const component of ["discount", "tax", "shipping"] as const) {
    if (input[component].currency !== currency) {
      return fail("currency_mismatch", `${component}.currency`);
    }
  }

  const lineSubtotals = new Map<string, number>();
  let subtotalMinor = 0;
  for (let index = 0; index < input.lines.length; index += 1) {
    const line = input.lines[index]!;
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
    const lineSubtotalMinor = line.unitAmountMinor * line.quantity;
    if (!Number.isSafeInteger(lineSubtotalMinor)) {
      return fail("arithmetic_overflow", `lines[${index}].subtotalMinor`);
    }
    const nextSubtotal = subtotalMinor + lineSubtotalMinor;
    if (!Number.isSafeInteger(nextSubtotal)) {
      return fail("arithmetic_overflow", "subtotalMinor");
    }
    lineSubtotals.set(line.productId, lineSubtotalMinor);
    subtotalMinor = nextSubtotal;
  }

  if (
    !Number.isSafeInteger(input.discount.amountMinor) ||
    input.discount.amountMinor < 0
  ) {
    return fail("invalid_amount", "discount.amountMinor");
  }
  if (
    !isDenseArray(input.discount.allocations)
  ) {
    return fail("invalid_amount", "discount.allocations");
  }

  const allocationByProductId = new Map<string, number>();
  let allocatedDiscountMinor = 0;
  for (
    let index = 0;
    index < input.discount.allocations.length;
    index += 1
  ) {
    const allocation = input.discount.allocations[index];
    if (!isRecord(allocation)) {
      return fail("invalid_amount", `discount.allocations[${index}]`);
    }
    if (
      typeof allocation.productId !== "string" ||
      !lineSubtotals.has(allocation.productId)
    ) {
      return fail("invalid_amount", "discount.allocations");
    }
    if (allocationByProductId.has(allocation.productId)) {
      return fail(
        "invalid_amount",
        `discount.allocations[${index}].productId`,
      );
    }
    if (
      !Number.isSafeInteger(allocation.discountMinor) ||
      (allocation.discountMinor as number) < 0 ||
      (allocation.discountMinor as number) >
        lineSubtotals.get(allocation.productId)!
    ) {
      return fail(
        "invalid_amount",
        `discount.allocations[${index}].discountMinor`,
      );
    }
    const nextAllocated =
      allocatedDiscountMinor + (allocation.discountMinor as number);
    if (!Number.isSafeInteger(nextAllocated)) {
      return fail("arithmetic_overflow", "discount.amountMinor");
    }
    allocationByProductId.set(
      allocation.productId,
      allocation.discountMinor as number,
    );
    allocatedDiscountMinor = nextAllocated;
  }
  if (
    input.discount.allocations.length !== input.lines.length ||
    allocationByProductId.size !== lineSubtotals.size ||
    allocatedDiscountMinor !== input.discount.amountMinor
  ) {
    return fail(
      "invalid_amount",
      input.discount.allocations.length !== input.lines.length ||
        allocationByProductId.size !== lineSubtotals.size
        ? "discount.allocations"
        : "discount.amountMinor",
    );
  }

  for (const component of ["tax", "shipping"] as const) {
    if (
      !Number.isSafeInteger(input[component].amountMinor) ||
      input[component].amountMinor < 0
    ) {
      return fail("invalid_amount", `${component}.amountMinor`);
    }
  }

  const merchandiseTotalMinor = subtotalMinor - input.discount.amountMinor;
  if (!Number.isSafeInteger(merchandiseTotalMinor) || merchandiseTotalMinor < 0) {
    return fail("invalid_amount", "discount.amountMinor");
  }
  const totalWithTax = merchandiseTotalMinor + input.tax.amountMinor;
  const totalMinor = totalWithTax + input.shipping.amountMinor;
  if (!Number.isSafeInteger(totalWithTax) || !Number.isSafeInteger(totalMinor)) {
    return fail("arithmetic_overflow", "totalMinor");
  }
  if (totalMinor === 0) {
    return fail("zero_total_not_supported", "totalMinor");
  }
  if (totalMinor > policy.maximumOrderAmountMinor) {
    return fail("order_limit_exceeded", "totalMinor");
  }

  const lines: PriceSnapshot[] = input.lines.map((line) => {
    const lineSubtotalMinor = lineSubtotals.get(line.productId)!;
    const lineDiscountMinor = allocationByProductId.get(line.productId)!;
    return Object.freeze({
      productId: line.productId,
      priceBookId: line.priceBookId,
      priceVersion: line.priceVersion,
      unitAmountMinor: line.unitAmountMinor,
      currency: line.currency,
      quantity: line.quantity,
      subtotalMinor: lineSubtotalMinor,
      discountMinor: lineDiscountMinor,
      totalMinor: lineSubtotalMinor - lineDiscountMinor,
    });
  });

  return Object.freeze({
    ok: true,
    value: Object.freeze({
      currency,
      subtotalMinor,
      discountMinor: input.discount.amountMinor,
      taxMinor: input.tax.amountMinor,
      shippingMinor: input.shipping.amountMinor,
      totalMinor,
      lines: Object.freeze(lines),
    }),
  });
}
