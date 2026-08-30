export type ProviderEventCommonV1 = Readonly<{
  schemaVersion: 1;
  providerEventId: string;
  eventType: string;
  providerCreatedAt: string;
  livemode: boolean;
}>;

export type IgnoredProviderEventV1 = ProviderEventCommonV1 &
  Readonly<{ kind: "ignored" }>;

export type CheckoutSessionProviderEventV1 = ProviderEventCommonV1 &
  Readonly<{
    kind: "checkout_session";
    sessionId: string;
    orderId: string;
    attemptId: string;
    paymentIntentId: string | null;
    amountMinor: number;
    currency: string;
    paymentStatus: "paid" | "unpaid" | "no_payment_required" | "unknown_restrictive";
    sessionStatus: "open" | "complete" | "expired" | "unknown_restrictive" | null;
  }>;

export type RefundProviderEventV1 = ProviderEventCommonV1 &
  Readonly<{
    kind: "refund";
    providerRefundId: string;
    orderId: string | null;
    refundRequestId: string | null;
    paymentIntentId: string | null;
    chargeId: string | null;
    amountMinor: number;
    currency: string;
    status: "pending" | "requires_action" | "succeeded" | "failed" | "canceled";
  }>;

export type RefundReconciliationProviderEventV1 = ProviderEventCommonV1 &
  Readonly<{
    kind: "refund_reconciliation";
    chargeId: string;
    paymentIntentId: string | null;
    amountRefundedMinor: number;
    currency: string;
  }>;

export type DisputeProviderEventV1 = ProviderEventCommonV1 &
  Readonly<{
    kind: "dispute";
    disputeId: string;
    paymentIntentId: string | null;
    chargeId: string | null;
    amountMinor: number;
    currency: string;
    status:
      | "lost"
      | "needs_response"
      | "prevented"
      | "under_review"
      | "warning_closed"
      | "warning_needs_response"
      | "warning_under_review"
      | "won"
      | "unknown_restrictive";
  }>;

export type InvoiceProviderEventV1 = ProviderEventCommonV1 &
  Readonly<{
    kind: "invoice";
    invoiceId: string;
    orderId: string;
    amountDueMinor: number;
    amountPaidMinor: number;
    currency: string;
    status:
      | "draft"
      | "open"
      | "paid"
      | "uncollectible"
      | "void"
      | "unknown_restrictive";
    collectionMethod:
      | "send_invoice"
      | "charge_automatically"
      | "unknown_restrictive";
  }>;

export type CreditNoteProviderEventV1 = ProviderEventCommonV1 &
  Readonly<{
    kind: "credit_note";
    creditNoteId: string;
    /** Bound to an invoice, not an order: a credit note carries no metadata of ours. */
    invoiceId: string;
    amountMinor: number;
    currency: string;
    status: "issued" | "void" | "unknown_restrictive";
    creditType: "mixed" | "post_payment" | "pre_payment" | "unknown_restrictive";
  }>;

export type NormalizedProviderEventV1 =
  | IgnoredProviderEventV1
  | CheckoutSessionProviderEventV1
  | RefundProviderEventV1
  | RefundReconciliationProviderEventV1
  | DisputeProviderEventV1
  | InvoiceProviderEventV1
  | CreditNoteProviderEventV1;

export type ProviderEventNormalizationResultV1 =
  | Readonly<{ status: "normalized"; event: NormalizedProviderEventV1 }>
  | Readonly<{
      status: "conflict";
      reason: "malformed_known_event";
      event: IgnoredProviderEventV1;
    }>
  | Readonly<{ status: "invalid" }>;

const checkoutEventTypes = new Set([
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed",
  "checkout.session.expired",
] as const);
const refundEventTypes = new Set([
  "refund.created",
  "refund.updated",
  "refund.failed",
] as const);
const invoiceEventTypes = new Set([
  "invoice.finalized",
  "invoice.paid",
  "invoice.payment_failed",
] as const);
const creditNoteStatuses = new Set(["issued", "void"] as const);
const creditNoteTypes = new Set(["mixed", "post_payment", "pre_payment"] as const);
const invoiceStatuses = new Set([
  "draft",
  "open",
  "paid",
  "uncollectible",
  "void",
] as const);
const invoiceCollectionMethods = new Set([
  "send_invoice",
  "charge_automatically",
] as const);
const disputeEventTypes = new Set([
  "charge.dispute.created",
  "charge.dispute.updated",
  "charge.dispute.closed",
] as const);
const paymentStatuses = new Set(["paid", "unpaid", "no_payment_required"] as const);
const sessionStatuses = new Set(["open", "complete", "expired"] as const);
const refundStatuses = new Set([
  "pending",
  "requires_action",
  "succeeded",
  "failed",
  "canceled",
] as const);
const disputeStatuses = new Set([
  "lost",
  "needs_response",
  "prevented",
  "under_review",
  "warning_closed",
  "warning_needs_response",
  "warning_under_review",
  "won",
] as const);
const terminalDisputeStatuses = new Set([
  "lost",
  "prevented",
  "warning_closed",
  "won",
] as const);

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const PRINTABLE_PATTERN = /^[\x20-\x7e]+$/u;
const CURRENCY_PATTERN = /^[A-Za-z]{3}$/u;
const COMMON_KEYS = [
  "schemaVersion",
  "kind",
  "providerEventId",
  "eventType",
  "providerCreatedAt",
  "livemode",
] as const;

function isKnownProcessableEventType(eventType: string): boolean {
  return (
    checkoutEventTypes.has(eventType as never) ||
    refundEventTypes.has(eventType as never) ||
    eventType === "charge.refunded" ||
    disputeEventTypes.has(eventType as never) ||
    invoiceEventTypes.has(eventType as never) ||
    eventType === "credit_note.created"
  );
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function own(value: Record<string, unknown>, key: string): unknown {
  return Object.hasOwn(value, key) ? value[key] : undefined;
}

function boundedPrintable(value: unknown): string | null {
  return typeof value === "string" &&
    value.length >= 1 &&
    value.length <= 255 &&
    value === value.trim() &&
    PRINTABLE_PATTERN.test(value)
    ? value
    : null;
}

function canonicalUuid(value: unknown): string | null {
  return typeof value === "string" && UUID_PATTERN.test(value) ? value : null;
}

function currency(value: unknown): string | null {
  return typeof value === "string" && CURRENCY_PATTERN.test(value)
    ? value.toLowerCase()
    : null;
}

function safeMoney(value: unknown, positive: boolean): number | null {
  if (!Number.isSafeInteger(value) || typeof value !== "number") return null;
  if (positive ? value <= 0 : value < 0) return null;
  return value;
}

function expandableId(value: unknown): string | null | undefined {
  if (value === null) return null;
  const direct = boundedPrintable(value);
  if (direct !== null) return direct;
  const expanded = record(value);
  if (expanded === null || !Object.hasOwn(expanded, "id")) return undefined;
  return boundedPrintable(expanded.id) ?? undefined;
}

function exactOwnKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  const expectedKeys = new Set(expected);
  const ownKeys = Reflect.ownKeys(value);
  if (
    ownKeys.length !== expected.length ||
    ownKeys.some((key) => typeof key !== "string" || !expectedKeys.has(key))
  ) {
    return false;
  }

  let prototype = Object.getPrototypeOf(value) as object | null;
  while (prototype !== null && prototype !== Object.prototype) {
    if (Reflect.ownKeys(prototype).length > 0) return false;
    prototype = Object.getPrototypeOf(prototype) as object | null;
  }
  if (prototype === Object.prototype) {
    for (const key in value) {
      if (!Object.hasOwn(value, key)) return false;
    }
  }
  return true;
}

function deepFreeze<Value>(value: Value): Value {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const nested of Object.values(value as Record<string, unknown>)) {
      deepFreeze(nested);
    }
    Object.freeze(value);
  }
  return value;
}

function commonFromRaw(value: unknown): ProviderEventCommonV1 | null {
  const event = record(value);
  if (event === null) return null;
  const providerEventId = boundedPrintable(own(event, "id"));
  const eventType = boundedPrintable(own(event, "type"));
  const created = own(event, "created");
  const livemode = own(event, "livemode");
  if (
    providerEventId === null ||
    eventType === null ||
    typeof created !== "number" ||
    !Number.isSafeInteger(created) ||
    created < 0 ||
    typeof livemode !== "boolean"
  ) {
    return null;
  }
  const date = new Date(created * 1_000);
  if (!Number.isFinite(date.getTime())) return null;
  return {
    schemaVersion: 1,
    providerEventId,
    eventType,
    providerCreatedAt: date.toISOString(),
    livemode,
  };
}

function ignored(common: ProviderEventCommonV1): IgnoredProviderEventV1 {
  return deepFreeze({ ...common, kind: "ignored" });
}

function conflict(common: ProviderEventCommonV1): ProviderEventNormalizationResultV1 {
  return Object.freeze({
    status: "conflict",
    reason: "malformed_known_event",
    event: ignored(common),
  });
}

function rawObject(value: unknown): Record<string, unknown> | null {
  const event = record(value);
  const data = event === null ? null : record(own(event, "data"));
  return data === null ? null : record(own(data, "object"));
}

function normalizedCheckout(
  common: ProviderEventCommonV1,
  object: Record<string, unknown>,
): CheckoutSessionProviderEventV1 | null {
  const metadata = record(own(object, "metadata"));
  if (metadata === null || !exactOwnKeys(metadata, ["orderId", "attemptId"])) {
    return null;
  }
  const orderId = canonicalUuid(own(metadata, "orderId"));
  const attemptId = canonicalUuid(own(metadata, "attemptId"));
  const clientReferenceId = canonicalUuid(own(object, "client_reference_id"));
  const sessionId = boundedPrintable(own(object, "id"));
  const paymentIntentId = expandableId(own(object, "payment_intent"));
  const amountMinor = safeMoney(own(object, "amount_total"), false);
  const normalizedCurrency = currency(own(object, "currency"));
  const rawPaymentStatus = own(object, "payment_status");
  const rawSessionStatus = own(object, "status");
  if (
    orderId === null ||
    attemptId === null ||
    clientReferenceId !== orderId ||
    sessionId === null ||
    paymentIntentId === undefined ||
    amountMinor === null ||
    normalizedCurrency === null ||
    typeof rawPaymentStatus !== "string" ||
    rawPaymentStatus.trim().length === 0 ||
    (rawSessionStatus !== null &&
      (typeof rawSessionStatus !== "string" || rawSessionStatus.trim().length === 0)) ||
    own(object, "livemode") !== common.livemode
  ) {
    return null;
  }

  const paymentStatus = paymentStatuses.has(
    rawPaymentStatus as "paid" | "unpaid" | "no_payment_required",
  )
    ? (rawPaymentStatus as "paid" | "unpaid" | "no_payment_required")
    : "unknown_restrictive";
  const sessionStatus =
    rawSessionStatus === null
      ? null
      : sessionStatuses.has(rawSessionStatus as "open" | "complete" | "expired")
        ? (rawSessionStatus as "open" | "complete" | "expired")
        : "unknown_restrictive";
  return deepFreeze({
    ...common,
    kind: "checkout_session",
    sessionId,
    orderId,
    attemptId,
    paymentIntentId,
    amountMinor,
    currency: normalizedCurrency,
    paymentStatus,
    sessionStatus,
  });
}

function refundCorrelation(
  value: unknown,
): Readonly<{ orderId: string | null; refundRequestId: string | null }> | null {
  if (value === undefined || value === null) {
    return { orderId: null, refundRequestId: null };
  }
  const metadata = record(value);
  if (metadata === null) return null;
  const hasOrder = Object.hasOwn(metadata, "orderId");
  const hasRefund = Object.hasOwn(metadata, "refundId");
  if (!hasOrder && !hasRefund) return { orderId: null, refundRequestId: null };
  if (!hasOrder || !hasRefund || !exactOwnKeys(metadata, ["orderId", "refundId"])) {
    return null;
  }
  const orderId = canonicalUuid(metadata.orderId);
  const refundRequestId = canonicalUuid(metadata.refundId);
  return orderId === null || refundRequestId === null
    ? null
    : { orderId, refundRequestId };
}

function normalizedRefund(
  common: ProviderEventCommonV1,
  object: Record<string, unknown>,
): RefundProviderEventV1 | null {
  const providerRefundId = boundedPrintable(own(object, "id"));
  const correlation = refundCorrelation(own(object, "metadata"));
  const paymentIntentId = expandableId(own(object, "payment_intent"));
  const chargeId = expandableId(own(object, "charge"));
  const amountMinor = safeMoney(own(object, "amount"), true);
  const normalizedCurrency = currency(own(object, "currency"));
  const rawStatus = own(object, "status");
  if (
    providerRefundId === null ||
    correlation === null ||
    paymentIntentId === undefined ||
    chargeId === undefined ||
    amountMinor === null ||
    normalizedCurrency === null ||
    typeof rawStatus !== "string" ||
    !refundStatuses.has(rawStatus as RefundProviderEventV1["status"]) ||
    (common.eventType === "refund.failed" && rawStatus !== "failed")
  ) {
    return null;
  }
  return deepFreeze({
    ...common,
    kind: "refund",
    providerRefundId,
    ...correlation,
    paymentIntentId,
    chargeId,
    amountMinor,
    currency: normalizedCurrency,
    status: rawStatus as RefundProviderEventV1["status"],
  });
}

function normalizedRefundReconciliation(
  common: ProviderEventCommonV1,
  object: Record<string, unknown>,
): RefundReconciliationProviderEventV1 | null {
  const chargeId = boundedPrintable(own(object, "id"));
  const paymentIntentId = expandableId(own(object, "payment_intent"));
  const amountRefundedMinor = safeMoney(own(object, "amount_refunded"), true);
  const normalizedCurrency = currency(own(object, "currency"));
  if (
    chargeId === null ||
    paymentIntentId === undefined ||
    amountRefundedMinor === null ||
    normalizedCurrency === null ||
    own(object, "livemode") !== common.livemode
  ) {
    return null;
  }
  return deepFreeze({
    ...common,
    kind: "refund_reconciliation",
    chargeId,
    paymentIntentId,
    amountRefundedMinor,
    currency: normalizedCurrency,
  });
}

function normalizedDispute(
  common: ProviderEventCommonV1,
  object: Record<string, unknown>,
): DisputeProviderEventV1 | null {
  const disputeId = boundedPrintable(own(object, "id"));
  const paymentIntentId = expandableId(own(object, "payment_intent"));
  const chargeId = expandableId(own(object, "charge"));
  const amountMinor = safeMoney(own(object, "amount"), true);
  const normalizedCurrency = currency(own(object, "currency"));
  const rawStatus = own(object, "status");
  if (
    disputeId === null ||
    paymentIntentId === undefined ||
    chargeId === undefined ||
    amountMinor === null ||
    normalizedCurrency === null ||
    typeof rawStatus !== "string" ||
    rawStatus.trim().length === 0 ||
    own(object, "livemode") !== common.livemode
  ) {
    return null;
  }
  const status = disputeStatuses.has(
    rawStatus as Exclude<DisputeProviderEventV1["status"], "unknown_restrictive">,
  )
    ? (rawStatus as DisputeProviderEventV1["status"])
    : "unknown_restrictive";
  if (
    status !== "unknown_restrictive" &&
    (common.eventType === "charge.dispute.closed") !==
      terminalDisputeStatuses.has(
        status as "lost" | "prevented" | "warning_closed" | "won",
      )
  ) {
    return null;
  }
  return deepFreeze({
    ...common,
    kind: "dispute",
    disputeId,
    paymentIntentId,
    chargeId,
    amountMinor,
    currency: normalizedCurrency,
    status,
  });
}

function normalizedInvoice(
  common: ProviderEventCommonV1,
  object: Record<string, unknown>,
): InvoiceProviderEventV1 | null {
  const metadata = record(own(object, "metadata"));
  if (metadata === null) return null;
  const orderId = canonicalUuid(own(metadata, "orderId"));
  const invoiceId = boundedPrintable(own(object, "id"));
  const amountDueMinor = safeMoney(own(object, "amount_due"), false);
  const amountPaidMinor = safeMoney(own(object, "amount_paid"), false);
  const normalizedCurrency = currency(own(object, "currency"));
  const rawStatus = own(object, "status");
  const rawCollection = own(object, "collection_method");
  if (
    orderId === null ||
    invoiceId === null ||
    amountDueMinor === null ||
    amountPaidMinor === null ||
    normalizedCurrency === null ||
    typeof rawStatus !== "string" ||
    rawStatus.trim().length === 0 ||
    typeof rawCollection !== "string" ||
    rawCollection.trim().length === 0 ||
    own(object, "livemode") !== common.livemode
  ) {
    return null;
  }
  // An unrecognized status or collection method is restricted rather than
  // trusted. A later Stripe value must never be read as a payment outcome.
  const status = invoiceStatuses.has(
    rawStatus as Exclude<InvoiceProviderEventV1["status"], "unknown_restrictive">,
  )
    ? (rawStatus as InvoiceProviderEventV1["status"])
    : "unknown_restrictive";
  const collectionMethod = invoiceCollectionMethods.has(
    rawCollection as Exclude<
      InvoiceProviderEventV1["collectionMethod"],
      "unknown_restrictive"
    >,
  )
    ? (rawCollection as InvoiceProviderEventV1["collectionMethod"])
    : "unknown_restrictive";
  return deepFreeze({
    ...common,
    kind: "invoice",
    invoiceId,
    orderId,
    amountDueMinor,
    amountPaidMinor,
    currency: normalizedCurrency,
    status,
    collectionMethod,
  });
}

function normalizedCreditNote(
  common: ProviderEventCommonV1,
  object: Record<string, unknown>,
): CreditNoteProviderEventV1 | null {
  const creditNoteId = boundedPrintable(own(object, "id"));
  const invoiceId = expandableId(own(object, "invoice"));
  // `total` is the credited amount including tax; `amount` excludes it. The
  // ledger must reconcile against what the customer was actually credited.
  const amountMinor = safeMoney(own(object, "total"), false);
  const normalizedCurrency = currency(own(object, "currency"));
  const rawStatus = own(object, "status");
  const rawType = own(object, "type");
  if (
    creditNoteId === null ||
    invoiceId === undefined ||
    invoiceId === null ||
    amountMinor === null ||
    normalizedCurrency === null ||
    typeof rawStatus !== "string" ||
    rawStatus.trim().length === 0 ||
    typeof rawType !== "string" ||
    rawType.trim().length === 0 ||
    own(object, "livemode") !== common.livemode
  ) {
    return null;
  }
  const status = creditNoteStatuses.has(
    rawStatus as Exclude<CreditNoteProviderEventV1["status"], "unknown_restrictive">,
  )
    ? (rawStatus as CreditNoteProviderEventV1["status"])
    : "unknown_restrictive";
  const creditType = creditNoteTypes.has(
    rawType as Exclude<CreditNoteProviderEventV1["creditType"], "unknown_restrictive">,
  )
    ? (rawType as CreditNoteProviderEventV1["creditType"])
    : "unknown_restrictive";
  return deepFreeze({
    ...common,
    kind: "credit_note",
    creditNoteId,
    invoiceId,
    amountMinor,
    currency: normalizedCurrency,
    status,
    creditType,
  });
}

export function normalizeStripeProviderEventV1(
  value: unknown,
): ProviderEventNormalizationResultV1 {
  const common = commonFromRaw(value);
  if (common === null) return Object.freeze({ status: "invalid" });
  const object = rawObject(value);

  let normalized: NormalizedProviderEventV1 | null;
  if (checkoutEventTypes.has(common.eventType as never)) {
    normalized = object === null ? null : normalizedCheckout(common, object);
  } else if (refundEventTypes.has(common.eventType as never)) {
    normalized = object === null ? null : normalizedRefund(common, object);
  } else if (common.eventType === "charge.refunded") {
    normalized =
      object === null ? null : normalizedRefundReconciliation(common, object);
  } else if (disputeEventTypes.has(common.eventType as never)) {
    normalized = object === null ? null : normalizedDispute(common, object);
  } else if (invoiceEventTypes.has(common.eventType as never)) {
    normalized = object === null ? null : normalizedInvoice(common, object);
  } else if (common.eventType === "credit_note.created") {
    normalized = object === null ? null : normalizedCreditNote(common, object);
  } else {
    normalized = ignored(common);
  }

  return normalized === null
    ? conflict(common)
    : Object.freeze({ status: "normalized", event: normalized });
}

function exactEnvelope(value: unknown): NormalizedProviderEventV1 | null {
  const envelope = record(value);
  if (envelope === null) return null;
  const common = {
    schemaVersion: own(envelope, "schemaVersion"),
    providerEventId: boundedPrintable(own(envelope, "providerEventId")),
    eventType: boundedPrintable(own(envelope, "eventType")),
    providerCreatedAt: own(envelope, "providerCreatedAt"),
    livemode: own(envelope, "livemode"),
  };
  if (
    common.schemaVersion !== 1 ||
    common.providerEventId === null ||
    common.eventType === null ||
    typeof common.providerCreatedAt !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.000Z$/u.test(common.providerCreatedAt) ||
    !Number.isFinite(Date.parse(common.providerCreatedAt)) ||
    typeof common.livemode !== "boolean"
  ) {
    return null;
  }
  const kind = own(envelope, "kind");
  if (
    kind === "ignored" &&
    exactOwnKeys(envelope, COMMON_KEYS) &&
    !isKnownProcessableEventType(common.eventType)
  ) {
    return deepFreeze(value as IgnoredProviderEventV1);
  }

  let raw: unknown;
  if (kind === "checkout_session") {
    if (
      !exactOwnKeys(envelope, [
        ...COMMON_KEYS,
        "sessionId",
        "orderId",
        "attemptId",
        "paymentIntentId",
        "amountMinor",
        "currency",
        "paymentStatus",
        "sessionStatus",
      ])
    ) return null;
    raw = {
      id: common.providerEventId,
      type: common.eventType,
      created: Date.parse(common.providerCreatedAt) / 1_000,
      livemode: common.livemode,
      data: {
        object: {
          id: own(envelope, "sessionId"),
          client_reference_id: own(envelope, "orderId"),
          metadata: {
            orderId: own(envelope, "orderId"),
            attemptId: own(envelope, "attemptId"),
          },
          payment_intent: own(envelope, "paymentIntentId"),
          amount_total: own(envelope, "amountMinor"),
          currency: own(envelope, "currency"),
          payment_status: own(envelope, "paymentStatus"),
          status: own(envelope, "sessionStatus"),
          livemode: common.livemode,
        },
      },
    };
  } else if (kind === "refund") {
    if (
      !exactOwnKeys(envelope, [
        ...COMMON_KEYS,
        "providerRefundId",
        "orderId",
        "refundRequestId",
        "paymentIntentId",
        "chargeId",
        "amountMinor",
        "currency",
        "status",
      ])
    ) return null;
    const storedOrderId = own(envelope, "orderId");
    const storedRefundId = own(envelope, "refundRequestId");
    if ((storedOrderId === null) !== (storedRefundId === null)) return null;
    raw = {
      id: common.providerEventId,
      type: common.eventType,
      created: Date.parse(common.providerCreatedAt) / 1_000,
      livemode: common.livemode,
      data: {
        object: {
          id: own(envelope, "providerRefundId"),
          metadata:
            storedOrderId === null
              ? {}
              : { orderId: storedOrderId, refundId: storedRefundId },
          payment_intent: own(envelope, "paymentIntentId"),
          charge: own(envelope, "chargeId"),
          amount: own(envelope, "amountMinor"),
          currency: own(envelope, "currency"),
          status: own(envelope, "status"),
        },
      },
    };
  } else if (kind === "refund_reconciliation") {
    if (
      !exactOwnKeys(envelope, [
        ...COMMON_KEYS,
        "chargeId",
        "paymentIntentId",
        "amountRefundedMinor",
        "currency",
      ])
    ) return null;
    raw = {
      id: common.providerEventId,
      type: common.eventType,
      created: Date.parse(common.providerCreatedAt) / 1_000,
      livemode: common.livemode,
      data: {
        object: {
          id: own(envelope, "chargeId"),
          payment_intent: own(envelope, "paymentIntentId"),
          amount_refunded: own(envelope, "amountRefundedMinor"),
          currency: own(envelope, "currency"),
          livemode: common.livemode,
        },
      },
    };
  } else if (kind === "dispute") {
    if (
      !exactOwnKeys(envelope, [
        ...COMMON_KEYS,
        "disputeId",
        "paymentIntentId",
        "chargeId",
        "amountMinor",
        "currency",
        "status",
      ])
    ) return null;
    raw = {
      id: common.providerEventId,
      type: common.eventType,
      created: Date.parse(common.providerCreatedAt) / 1_000,
      livemode: common.livemode,
      data: {
        object: {
          id: own(envelope, "disputeId"),
          payment_intent: own(envelope, "paymentIntentId"),
          charge: own(envelope, "chargeId"),
          amount: own(envelope, "amountMinor"),
          currency: own(envelope, "currency"),
          status: own(envelope, "status"),
          livemode: common.livemode,
        },
      },
    };
  } else if (kind === "credit_note") {
    if (
      !exactOwnKeys(envelope, [
        ...COMMON_KEYS,
        "creditNoteId",
        "invoiceId",
        "amountMinor",
        "currency",
        "status",
        "creditType",
      ])
    ) return null;
    raw = {
      id: common.providerEventId,
      type: common.eventType,
      created: Date.parse(common.providerCreatedAt) / 1_000,
      livemode: common.livemode,
      data: {
        object: {
          id: own(envelope, "creditNoteId"),
          invoice: own(envelope, "invoiceId"),
          total: own(envelope, "amountMinor"),
          currency: own(envelope, "currency"),
          status: own(envelope, "status"),
          type: own(envelope, "creditType"),
          livemode: common.livemode,
        },
      },
    };
  } else if (kind === "invoice") {
    if (
      !exactOwnKeys(envelope, [
        ...COMMON_KEYS,
        "invoiceId",
        "orderId",
        "amountDueMinor",
        "amountPaidMinor",
        "currency",
        "status",
        "collectionMethod",
      ])
    ) return null;
    raw = {
      id: common.providerEventId,
      type: common.eventType,
      created: Date.parse(common.providerCreatedAt) / 1_000,
      livemode: common.livemode,
      data: {
        object: {
          id: own(envelope, "invoiceId"),
          metadata: { orderId: own(envelope, "orderId") },
          amount_due: own(envelope, "amountDueMinor"),
          amount_paid: own(envelope, "amountPaidMinor"),
          currency: own(envelope, "currency"),
          status: own(envelope, "status"),
          collection_method: own(envelope, "collectionMethod"),
          livemode: common.livemode,
        },
      },
    };
  } else {
    return null;
  }

  const reparsed = normalizeStripeProviderEventV1(raw);
  if (
    reparsed.status !== "normalized" ||
    Reflect.ownKeys(reparsed.event).some(
      (key) =>
        typeof key !== "string" ||
        !Object.hasOwn(envelope, key) ||
        reparsed.event[key as keyof NormalizedProviderEventV1] !== envelope[key],
    )
  ) {
    return null;
  }
  return deepFreeze(value as NormalizedProviderEventV1);
}

export function parseNormalizedProviderEventV1(
  value: unknown,
): NormalizedProviderEventV1 | null {
  return exactEnvelope(value);
}

export function parseKnownProviderEventConflictV1(
  value: unknown,
): IgnoredProviderEventV1 | null {
  const envelope = record(value);
  if (
    envelope === null ||
    own(envelope, "schemaVersion") !== 1 ||
    own(envelope, "kind") !== "ignored" ||
    !exactOwnKeys(envelope, COMMON_KEYS)
  ) {
    return null;
  }
  const providerEventId = boundedPrintable(own(envelope, "providerEventId"));
  const eventType = boundedPrintable(own(envelope, "eventType"));
  const providerCreatedAt = own(envelope, "providerCreatedAt");
  const livemode = own(envelope, "livemode");
  if (
    providerEventId === null ||
    eventType === null ||
    !isKnownProcessableEventType(eventType) ||
    typeof providerCreatedAt !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.000Z$/u.test(providerCreatedAt) ||
    !Number.isFinite(Date.parse(providerCreatedAt)) ||
    typeof livemode !== "boolean"
  ) {
    return null;
  }
  return deepFreeze(value as IgnoredProviderEventV1);
}
