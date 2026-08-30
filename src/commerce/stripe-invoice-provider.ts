import "server-only";

/**
 * Stripe Invoicing adapter for institutional buyers on net terms.
 *
 * This is a parallel flow to hosted Checkout, not a variation of it. The server
 * stays the authority on money: line amounts are computed upstream and this
 * adapter only transports them, then re-validates that the finalized invoice
 * still says what the server said.
 *
 * `auto_advance` is deliberately false and `collection_method` is
 * `send_invoice`: net-terms buyers pay from the hosted invoice page, and
 * nothing here may auto-charge a stored payment method.
 *
 * Line descriptions are customer-facing surface and must pass the content
 * policy scanner before reaching this adapter.
 */
export type StripeInvoiceRequestV1 = Readonly<{
  orderId: string;
  customerId: string;
  daysUntilDue: number;
  currency: "USD";
  lines: readonly Readonly<{
    productId: string;
    description: string;
    amountMinor: number;
  }>[];
  metadata: Readonly<{ orderId: string } & Record<string, string>>;
}>;

export type NormalizedInvoiceV1 = Readonly<{
  provider: "stripe";
  providerInvoiceId: string;
  orderId: string;
  hostedInvoiceUrl: string;
  amountDueMinor: number;
  currency: "USD";
  collectionMethod: "send_invoice";
  livemode: boolean;
}>;

export type InvoiceProviderResultV1 =
  | Readonly<{ status: "open"; invoice: NormalizedInvoiceV1 }>
  | Readonly<{
      status: "provider_unknown";
      evidenceCode:
        | "provider_response_mismatch"
        | "provider_transport_unknown"
        | "provider_sdk_unknown";
      knownProviderInvoiceId: string | null;
    }>
  | Readonly<{
      status: "definite_rejection";
      evidenceCode: "create_rejected_4xx";
      providerRequestId: string | null;
    }>;

export type StripeInvoiceSdkClient = Readonly<{
  invoiceItems: Readonly<{
    create: (params: unknown, options: unknown) => Promise<unknown>;
  }>;
  invoices: Readonly<{
    create: (params: unknown, options: unknown) => Promise<unknown>;
    finalizeInvoice: (
      id: string,
      params: unknown,
      options: unknown,
    ) => Promise<unknown>;
  }>;
}>;

function objectRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function invoiceId(value: unknown): string | null {
  return typeof value === "string" &&
    value.startsWith("in_") &&
    value.length <= 200 &&
    value.trim() === value
    ? value
    : null;
}

/** Exact-host match. A suffixed lookalike domain must never be trusted. */
function trustedInvoiceUrl(value: unknown): value is string {
  if (typeof value !== "string" || !URL.canParse(value)) return false;
  const url = new URL(value);
  return (
    url.protocol === "https:" &&
    url.hostname === "invoice.stripe.com" &&
    url.port === "" &&
    url.username === "" &&
    url.password === ""
  );
}

function unknownInvoice(
  knownProviderInvoiceId: string | null,
  evidenceCode: Extract<
    InvoiceProviderResultV1,
    { status: "provider_unknown" }
  >["evidenceCode"] = "provider_response_mismatch",
): InvoiceProviderResultV1 {
  return Object.freeze({
    status: "provider_unknown" as const,
    evidenceCode,
    knownProviderInvoiceId,
  });
}

export function classifyStripeInvoiceError(
  error: unknown,
): InvoiceProviderResultV1 {
  const record = objectRecord(error);
  const type = typeof record?.type === "string" ? record.type : record?.name;
  const statusCode = record?.statusCode;
  const requestId = record?.requestId;
  const providerRequestId =
    typeof requestId === "string" && requestId.startsWith("req_")
      ? requestId
      : null;

  const transport =
    type === "StripeConnectionError" ||
    record?.code === "ETIMEDOUT" ||
    record?.code === "ECONNRESET";
  const idempotencyConflict = type === "StripeIdempotencyError";
  const definite = new Set([
    "StripeInvalidRequestError",
    "StripeCardError",
    "StripeAuthenticationError",
    "StripePermissionError",
  ]).has(typeof type === "string" ? type : "");

  if (
    definite &&
    !transport &&
    !idempotencyConflict &&
    typeof statusCode === "number" &&
    Number.isInteger(statusCode) &&
    statusCode >= 400 &&
    statusCode <= 499 &&
    statusCode !== 409
  ) {
    return Object.freeze({
      status: "definite_rejection" as const,
      evidenceCode: "create_rejected_4xx" as const,
      providerRequestId,
    });
  }
  return unknownInvoice(
    null,
    transport ? "provider_transport_unknown" : "provider_sdk_unknown",
  );
}

function normalizedInvoice(
  raw: unknown,
  request: StripeInvoiceRequestV1,
  livemode: boolean,
  expectedTotalMinor: number,
): NormalizedInvoiceV1 | null {
  const record = objectRecord(raw);
  if (record === null) return null;
  const id = invoiceId(record.id);
  const metadata = objectRecord(record.metadata);
  if (
    id === null ||
    record.status !== "open" ||
    record.currency !== "usd" ||
    record.collection_method !== "send_invoice" ||
    record.livemode !== livemode ||
    record.amount_due !== expectedTotalMinor ||
    metadata === null ||
    metadata.orderId !== request.orderId ||
    !trustedInvoiceUrl(record.hosted_invoice_url)
  ) {
    return null;
  }
  return Object.freeze({
    provider: "stripe" as const,
    providerInvoiceId: id,
    orderId: request.orderId,
    hostedInvoiceUrl: record.hosted_invoice_url,
    amountDueMinor: expectedTotalMinor,
    currency: "USD" as const,
    collectionMethod: "send_invoice" as const,
    livemode,
  });
}

export function createStripeInvoiceProvider(input: Readonly<{
  sdk: StripeInvoiceSdkClient;
  livemode: boolean;
}>): Readonly<{
  createInvoice: (
    request: StripeInvoiceRequestV1,
  ) => Promise<InvoiceProviderResultV1>;
}> {
  const { sdk, livemode } = input;

  return Object.freeze({
    async createInvoice(request) {
      const expectedTotalMinor = request.lines.reduce(
        (total, line) => total + line.amountMinor,
        0,
      );
      if (
        request.lines.length < 1 ||
        !Number.isSafeInteger(expectedTotalMinor) ||
        expectedTotalMinor < 1
      ) {
        return unknownInvoice(null, "provider_response_mismatch");
      }

      try {
        for (const line of request.lines) {
          await sdk.invoiceItems.create(
            {
              customer: request.customerId,
              amount: line.amountMinor,
              currency: "usd",
              description: line.description,
              metadata: { orderId: request.orderId, productId: line.productId },
            },
            {
              idempotencyKey: `invoice_item:${request.orderId}:${line.productId}`,
              maxNetworkRetries: 0,
            },
          );
        }
      } catch (error) {
        return classifyStripeInvoiceError(error);
      }

      let draftId: string | null = null;
      try {
        const draft = await sdk.invoices.create(
          {
            customer: request.customerId,
            collection_method: "send_invoice",
            days_until_due: request.daysUntilDue,
            // Never auto-charge: net-terms buyers pay from the hosted page.
            auto_advance: false,
            pending_invoice_items_behavior: "include",
            currency: "usd",
            metadata: { ...request.metadata },
          },
          {
            idempotencyKey: `invoice:${request.orderId}`,
            maxNetworkRetries: 0,
          },
        );
        draftId = invoiceId(objectRecord(draft)?.id);
      } catch (error) {
        return classifyStripeInvoiceError(error);
      }
      if (draftId === null) return unknownInvoice(null);

      try {
        const finalized = await sdk.invoices.finalizeInvoice(
          draftId,
          {},
          {
            idempotencyKey: `invoice_finalize:${request.orderId}`,
            maxNetworkRetries: 0,
          },
        );
        const invoice = normalizedInvoice(
          finalized,
          request,
          livemode,
          expectedTotalMinor,
        );
        return invoice === null
          ? unknownInvoice(invoiceId(objectRecord(finalized)?.id) ?? draftId)
          : Object.freeze({ status: "open" as const, invoice });
      } catch (error) {
        const classified = classifyStripeInvoiceError(error);
        // The draft exists, so surface its id even on an ambiguous finalize.
        return classified.status === "provider_unknown"
          ? unknownInvoice(draftId, classified.evidenceCode)
          : classified;
      }
    },
  });
}
