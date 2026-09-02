import "server-only";

import Stripe from "stripe";

import type {
  ProviderRefundRequestV1,
  StripeProviderBindingSnapshotV2,
  StripeCheckoutRequest,
} from "@/commerce/provider-contracts";
import { createStripeProviderBindingSnapshotV2 } from "@/commerce/provider-contracts";
import type {
  CheckoutProviderResult,
  ExpectedProviderContextV1,
  NormalizedCheckoutSessionV1,
  NormalizedProviderRefundV1,
  PaymentProvider,
  ProviderEvidenceCode,
  RefundProviderResult,
} from "@/commerce/payment-provider";

export const STRIPE_API_VERSION = "2026-07-29.dahlia" as const;

type StripeRequestOptions = Readonly<{
  idempotencyKey?: string;
  maxNetworkRetries: 0;
}>;

export type StripeSdkClient = Readonly<{
  checkout: Readonly<{
    sessions: Readonly<{
      create: (
        params: Stripe.Checkout.SessionCreateParams,
        options: StripeRequestOptions,
      ) => Promise<unknown>;
      retrieve: (
        id: string,
        params: Stripe.Checkout.SessionRetrieveParams | undefined,
        options: StripeRequestOptions,
      ) => Promise<unknown>;
    }>;
  }>;
  refunds: Readonly<{
    create: (
      params: Stripe.RefundCreateParams,
      options: StripeRequestOptions,
    ) => Promise<unknown>;
    retrieve: (
      id: string,
      params: Stripe.RefundRetrieveParams | undefined,
      options: StripeRequestOptions,
    ) => Promise<unknown>;
  }>;
}>;

export type StripeBindingVerifierSdkClient = Readonly<{
  accounts: Readonly<{
    retrieveCurrent: () => Promise<unknown>;
  }>;
  prices: Readonly<{
    retrieve: (
      id: string,
      params: Readonly<{ expand: readonly ["product"] }>,
    ) => Promise<unknown>;
  }>;
}>;

export type StripeBindingVerifier = Readonly<{
  verifyBindings: (
    snapshot: StripeProviderBindingSnapshotV2,
  ) => Promise<Readonly<{ status: "verified" | "unavailable" }>>;
}>;

export type StripeConstructorLike = new (
  secret: string,
  options: Readonly<{
    apiVersion: typeof STRIPE_API_VERSION;
    maxNetworkRetries: 0;
  }>,
) => StripeSdkClient;

type StripeOperation =
  | "create_checkout"
  | "retrieve_checkout"
  | "create_refund"
  | "retrieve_refund";

export type StripeErrorClassification =
  | Readonly<{
      status: "provider_unknown";
      evidenceCode: "provider_transport_unknown" | "provider_sdk_unknown";
      providerRequestId: string | null;
    }>
  | Readonly<{
      status: "definite_rejection";
      evidenceCode: "create_rejected_4xx";
      providerRequestId: string | null;
    }>;

const checkoutStatuses = new Set(["open", "complete", "expired"] as const);
const paymentStatuses = new Set(["unpaid", "paid", "no_payment_required"] as const);
const refundStatuses = new Set([
  "pending",
  "requires_action",
  "succeeded",
  "failed",
  "canceled",
] as const);

function objectRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function safeReference(value: unknown, prefix?: string): value is string {
  return (
    typeof value === "string" &&
    value.length >= 3 &&
    value.length <= 200 &&
    value.trim() === value &&
    !/[\u0000-\u001f\u007f]/u.test(value) &&
    (prefix === undefined || value.startsWith(prefix))
  );
}

function expandableId(
  value: unknown,
): Readonly<{ ok: true; value: string | null }> | Readonly<{ ok: false }> {
  if (value === null) return { ok: true, value: null };
  if (safeReference(value)) return { ok: true, value };
  const record = objectRecord(value);
  if (record && safeReference(record.id)) {
    return { ok: true, value: record.id };
  }
  return { ok: false };
}

function exactMetadata(
  value: unknown,
  expected: Readonly<{ orderId: string; attemptId?: string; refundId?: string }>,
): boolean {
  const record = objectRecord(value);
  if (!record || Object.getPrototypeOf(record) !== Object.prototype) return false;
  const expectedKeys = expected.attemptId === undefined
    ? ["orderId", "refundId"]
    : ["attemptId", "orderId"];
  const actualKeys = Reflect.ownKeys(record);
  if (
    actualKeys.some((key) => typeof key !== "string") ||
    actualKeys.length !== expectedKeys.length ||
    !(actualKeys as string[]).toSorted().every((key, index) => key === expectedKeys[index])
  ) {
    return false;
  }
  return (
    record.orderId === expected.orderId &&
    (expected.attemptId === undefined
      ? record.refundId === expected.refundId
      : record.attemptId === expected.attemptId)
  );
}

function trustedHostedUrl(value: unknown): value is string {
  if (typeof value !== "string" || !URL.canParse(value)) return false;
  const url = new URL(value);
  return (
    url.protocol === "https:" &&
    url.hostname === "checkout.stripe.com" &&
    url.port === "" &&
    url.username === "" &&
    url.password === ""
  );
}

function sameProviderContext(
  left: ExpectedProviderContextV1,
  right: ExpectedProviderContextV1,
): boolean {
  return (
    left.provider === right.provider &&
    left.livemode === right.livemode &&
    left.scope === right.scope
  );
}

function knownSessionId(raw: unknown): string | null {
  const record = objectRecord(raw);
  return record && safeReference(record.id, "cs_") ? record.id : null;
}

function knownRefundId(raw: unknown): string | null {
  const record = objectRecord(raw);
  return record && safeReference(record.id, "re_") ? record.id : null;
}

function unknownCheckout(
  knownProviderSessionId: string | null,
  evidenceCode: ProviderEvidenceCode = "provider_response_mismatch",
): CheckoutProviderResult {
  return Object.freeze({
    status: "provider_unknown" as const,
    knownProviderSessionId,
    evidenceCode,
  });
}

function unknownRefund(
  knownProviderRefundId: string | null,
  evidenceCode: ProviderEvidenceCode = "provider_response_mismatch",
): RefundProviderResult {
  return Object.freeze({
    status: "provider_unknown" as const,
    knownProviderRefundId,
    evidenceCode,
  });
}

function normalizedSession(
  raw: unknown,
  expected: StripeCheckoutRequest,
  context: ExpectedProviderContextV1,
  knownId: string | null,
): NormalizedCheckoutSessionV1 | null {
  const record = objectRecord(raw);
  if (!record) return null;
  const id = knownSessionId(record);
  const paymentIntent = expandableId(record.payment_intent);
  const status = record.status;
  const paymentStatus = record.payment_status;
  if (
    id === null ||
    (knownId !== null && id !== knownId) ||
    !paymentIntent.ok ||
    !checkoutStatuses.has(status as never) ||
    !paymentStatuses.has(paymentStatus as never) ||
    record.client_reference_id !== expected.client_reference_id ||
    !exactMetadata(record.metadata, expected.metadata) ||
    record.amount_total !== expected.line_items.reduce(
      (total, item) => total + item.price_data.unit_amount,
      0,
    ) ||
    record.currency !== "usd" ||
    record.mode !== expected.mode ||
    record.ui_mode !== expected.ui_mode ||
    record.livemode !== context.livemode ||
    record.customer_email !== expected.customer_email ||
    record.expires_at !== expected.expires_at
  ) {
    return null;
  }
  const hostedUrl =
    status === "open" && paymentStatus === "unpaid" && trustedHostedUrl(record.url)
      ? record.url
      : null;
  return Object.freeze({
    provider: "stripe" as const,
    providerSessionId: id,
    hostedUrl,
    clientReferenceId: expected.client_reference_id,
    metadata: Object.freeze({ ...expected.metadata }),
    paymentIntentId: paymentIntent.value,
    amountTotal: record.amount_total as number,
    currency: "usd" as const,
    mode: "payment" as const,
    uiMode: "hosted_page" as const,
    status: status as NormalizedCheckoutSessionV1["status"],
    paymentStatus: paymentStatus as NormalizedCheckoutSessionV1["paymentStatus"],
    livemode: context.livemode,
    customerEmail: expected.customer_email,
    expiresAt: expected.expires_at,
  });
}

function adaptSession(
  raw: unknown,
  expected: StripeCheckoutRequest,
  context: ExpectedProviderContextV1,
  operation: "create" | "retrieve",
  knownId: string | null,
): CheckoutProviderResult {
  const learnedId = knownSessionId(raw);
  const session = normalizedSession(raw, expected, context, knownId);
  if (session === null) return unknownCheckout(learnedId);
  if (session.status === "open") {
    return session.paymentStatus === "unpaid" && session.hostedUrl !== null
      ? Object.freeze({ status: "open" as const, session })
      : unknownCheckout(session.providerSessionId);
  }
  if (session.status === "expired") {
    if (session.paymentStatus !== "unpaid") {
      return unknownCheckout(session.providerSessionId);
    }
    return operation === "retrieve"
      ? Object.freeze({ status: "verified_expired" as const, session })
      : unknownCheckout(session.providerSessionId, "create_requires_retrieve");
  }
  return Object.freeze({ status: "provider_pending" as const, session });
}

function normalizedRefund(
  raw: unknown,
  expected: ProviderRefundRequestV1,
  context: ExpectedProviderContextV1,
  knownId: string | null,
): NormalizedProviderRefundV1 | null {
  const record = objectRecord(raw);
  if (!record) return null;
  const id = knownRefundId(record);
  const paymentIntent = expandableId(record.payment_intent);
  const charge = expandableId(record.charge);
  const status = record.status;
  const rawLivemode = record.livemode;
  if (
    id === null ||
    (knownId !== null && id !== knownId) ||
    !paymentIntent.ok ||
    !charge.ok ||
    !refundStatuses.has(status as never) ||
    record.amount !== expected.amountMinor ||
    record.currency !== expected.currency ||
    !exactMetadata(record.metadata, expected.metadata) ||
    (expected.paymentIntentId !== null && paymentIntent.value !== expected.paymentIntentId) ||
    (expected.chargeId !== null && charge.value !== expected.chargeId) ||
    (rawLivemode !== undefined && rawLivemode !== null && rawLivemode !== context.livemode)
  ) {
    return null;
  }
  return Object.freeze({
    provider: "stripe" as const,
    providerRefundId: id,
    paymentIntentId: paymentIntent.value,
    chargeId: charge.value,
    amount: expected.amountMinor,
    currency: "usd" as const,
    status: status as NormalizedProviderRefundV1["status"],
    livemode: typeof rawLivemode === "boolean" ? rawLivemode : null,
  });
}

function directField(record: Record<string, unknown> | null, key: string): unknown {
  return record === null ? undefined : record[key];
}

const bindingUnavailable = Object.freeze({ status: "unavailable" as const });
const bindingVerified = Object.freeze({ status: "verified" as const });

function exactCurrentAccount(raw: unknown, expectedAccountId: string): boolean {
  const account = objectRecord(raw);
  return (
    account !== null &&
    account.object === "account" &&
    account.id === expectedAccountId
  );
}

function exactExpandedProduct(
  raw: unknown,
  expectedProductId: string,
  expectedLivemode: boolean,
): boolean {
  const product = objectRecord(raw);
  return (
    product !== null &&
    product.object === "product" &&
    product.id === expectedProductId &&
    product.active === true &&
    product.deleted !== true &&
    product.livemode === expectedLivemode
  );
}

const stripeDecimalPrototype = Object.getPrototypeOf(Stripe.Decimal.zero);

function exactWholeMinorDecimal(raw: unknown, expectedMinor: number): boolean {
  if (raw === null || raw === undefined) return true;
  if (
    typeof raw !== "object" ||
    Object.getPrototypeOf(raw) !== stripeDecimalPrototype
  ) {
    return false;
  }
  try {
    const serialized = (raw as Stripe.Decimal).toString();
    return /^(?:0|[1-9]\d*)$/u.test(serialized) &&
      BigInt(serialized) === BigInt(expectedMinor);
  } catch {
    return false;
  }
}

function exactConfiguredPrice(
  raw: unknown,
  expected: StripeProviderBindingSnapshotV2["lines"][number],
  expectedLivemode: boolean,
): boolean {
  const price = objectRecord(raw);
  return (
    price !== null &&
    price.object === "price" &&
    price.id === expected.stripePriceId &&
    price.active === true &&
    price.type === "one_time" &&
    price.recurring === null &&
    price.billing_scheme === "per_unit" &&
    price.custom_unit_amount === null &&
    price.tiers_mode === null &&
    (price.transform_quantity === null || price.transform_quantity === undefined) &&
    Number.isSafeInteger(price.unit_amount) &&
    (price.unit_amount as number) > 0 &&
    price.unit_amount === expected.baseUnitMinor &&
    exactWholeMinorDecimal(price.unit_amount_decimal, expected.baseUnitMinor) &&
    price.currency === expected.currency.toLowerCase() &&
    price.livemode === expectedLivemode &&
    exactExpandedProduct(
      price.product,
      expected.stripeProductId,
      expectedLivemode,
    )
  );
}

export function createStripeBindingVerifier(input: Readonly<{
  sdk: StripeBindingVerifierSdkClient;
  context: ExpectedProviderContextV1;
}>): StripeBindingVerifier {
  if (
    input.context.provider !== "stripe" ||
    !/^stripe:acct_[A-Za-z0-9]{8,64}$/u.test(input.context.scope)
  ) {
    throw new Error("Stripe binding verifier context is invalid");
  }
  const expectedAccountId = input.context.scope.slice("stripe:".length);
  const expectedLivemode = input.context.livemode;
  return Object.freeze({
    async verifyBindings(snapshot) {
      if (snapshot.schemaVersion !== 2) return bindingUnavailable;
      const canonical = createStripeProviderBindingSnapshotV2(snapshot.lines);
      if (!canonical.ok || JSON.stringify(canonical.value) !== JSON.stringify(snapshot)) {
        return bindingUnavailable;
      }
      try {
        const account = await input.sdk.accounts.retrieveCurrent();
        if (!exactCurrentAccount(account, expectedAccountId)) return bindingUnavailable;
        for (const line of canonical.value.lines) {
          const price = await input.sdk.prices.retrieve(line.stripePriceId, {
            expand: ["product"],
          });
          if (!exactConfiguredPrice(price, line, expectedLivemode)) {
            return bindingUnavailable;
          }
        }
        return bindingVerified;
      } catch {
        return bindingUnavailable;
      }
    },
  });
}

export function classifyStripeProviderError(
  error: unknown,
  operation: StripeOperation,
): StripeErrorClassification {
  const record = objectRecord(error);
  const type = directField(record, "type");
  const name = directField(record, "name");
  const code = directField(record, "code");
  const statusCode = directField(record, "statusCode");
  const requestId = directField(record, "requestId");
  const providerRequestId = safeReference(requestId, "req_") ? requestId : null;
  const idempotencyError =
    type === "StripeIdempotencyError" || name === "StripeIdempotencyError";
  const transportError =
    type === "StripeConnectionError" ||
    name === "StripeConnectionError" ||
    code === "ETIMEDOUT" ||
    code === "ECONNRESET" ||
    code === "ECONNABORTED" ||
    code === "EPIPE";
  const createOperation =
    operation === "create_checkout" || operation === "create_refund";
  const definiteErrorType = new Set([
    "StripeInvalidRequestError",
    "StripeCardError",
    "StripeAuthenticationError",
    "StripePermissionError",
  ]).has(typeof type === "string" ? type : typeof name === "string" ? name : "");
  if (
    createOperation &&
    definiteErrorType &&
    typeof statusCode === "number" &&
    Number.isInteger(statusCode) &&
    statusCode >= 400 &&
    statusCode <= 499 &&
    statusCode !== 409 &&
    !idempotencyError &&
    !transportError
  ) {
    return Object.freeze({
      status: "definite_rejection" as const,
      evidenceCode: "create_rejected_4xx" as const,
      providerRequestId,
    });
  }
  return Object.freeze({
    status: "provider_unknown" as const,
    evidenceCode: transportError
      ? ("provider_transport_unknown" as const)
      : ("provider_sdk_unknown" as const),
    providerRequestId,
  });
}

function checkoutParams(request: StripeCheckoutRequest): Stripe.Checkout.SessionCreateParams {
  return {
    ui_mode: request.ui_mode,
    mode: request.mode,
    payment_method_types: [...request.payment_method_types],
    success_url: request.success_url,
    cancel_url: request.cancel_url,
    client_reference_id: request.client_reference_id,
    customer_email: request.customer_email,
    expires_at: request.expires_at,
    metadata: { ...request.metadata },
    payment_intent_data: {
      metadata: { ...request.payment_intent_data.metadata },
      shipping: {
        name: request.payment_intent_data.shipping.name,
        address: { ...request.payment_intent_data.shipping.address },
      },
    },
    ...("allow_promotion_codes" in request
      ? { allow_promotion_codes: false }
      : {}),
    line_items: request.line_items.map((item) => ({
      quantity: 1,
      price_data: "product" in item.price_data
        ? {
            currency: "usd" as const,
            unit_amount: item.price_data.unit_amount,
            product: item.price_data.product,
          }
        : {
            currency: "usd" as const,
            unit_amount: item.price_data.unit_amount,
            product_data: { name: item.price_data.product_data.name },
          },
    })),
  };
}

function refundParams(request: ProviderRefundRequestV1): Stripe.RefundCreateParams {
  return {
    amount: request.amountMinor,
    currency: request.currency,
    ...(request.paymentIntentId === null
      ? { charge: request.chargeId! }
      : { payment_intent: request.paymentIntentId }),
    metadata: { ...request.metadata },
  };
}

export function createStripePaymentProvider(input: Readonly<{
  sdk: StripeSdkClient;
  context: ExpectedProviderContextV1;
}>): PaymentProvider {
  if (
    input.context.provider !== "stripe" ||
    !/^stripe:acct_[A-Za-z0-9]{8,64}$/u.test(input.context.scope)
  ) {
    throw new Error("Stripe provider context is invalid");
  }
  const context = Object.freeze({ ...input.context });
  return Object.freeze({
    context,
    async createCheckoutSession(request, providerIdempotencyKey) {
      if (providerIdempotencyKey !== `checkout_attempt:${request.metadata.attemptId}`) {
        return unknownCheckout(null, "provider_context_mismatch");
      }
      try {
        const raw = await input.sdk.checkout.sessions.create(
          checkoutParams(request),
          { idempotencyKey: providerIdempotencyKey, maxNetworkRetries: 0 },
        );
        return adaptSession(raw, request, context, "create", null);
      } catch (error) {
        const classified = classifyStripeProviderError(error, "create_checkout");
        return classified.status === "definite_rejection"
          ? classified
          : unknownCheckout(null, classified.evidenceCode);
      }
    },
    async retrieveCheckoutSession(request) {
      if (!sameProviderContext(context, request.expectedProviderContext)) {
        return unknownCheckout(
          request.knownProviderSessionId,
          "provider_context_mismatch",
        );
      }
      try {
        const raw = await input.sdk.checkout.sessions.retrieve(
          request.knownProviderSessionId,
          undefined,
          { maxNetworkRetries: 0 },
        );
        return adaptSession(
          raw,
          request.expectedRequest,
          context,
          "retrieve",
          request.knownProviderSessionId,
        );
      } catch (error) {
        const classified = classifyStripeProviderError(error, "retrieve_checkout");
        return unknownCheckout(
          request.knownProviderSessionId,
          classified.evidenceCode,
        );
      }
    },
    async createRefund(request, providerIdempotencyKey) {
      if (
        request.provider !== "stripe" ||
        providerIdempotencyKey !== request.providerIdempotencyKey
      ) {
        return unknownRefund(null, "provider_context_mismatch");
      }
      try {
        const raw = await input.sdk.refunds.create(refundParams(request), {
          idempotencyKey: providerIdempotencyKey,
          maxNetworkRetries: 0,
        });
        const refund = normalizedRefund(raw, request, context, null);
        return refund === null
          ? unknownRefund(knownRefundId(raw))
          : Object.freeze({ status: "normalized" as const, refund });
      } catch (error) {
        const classified = classifyStripeProviderError(error, "create_refund");
        return classified.status === "definite_rejection"
          ? classified
          : unknownRefund(null, classified.evidenceCode);
      }
    },
    async retrieveRefund(request) {
      if (!sameProviderContext(context, request.expectedProviderContext)) {
        return unknownRefund(
          request.knownProviderRefundId,
          "provider_context_mismatch",
        );
      }
      try {
        const raw = await input.sdk.refunds.retrieve(
          request.knownProviderRefundId,
          undefined,
          { maxNetworkRetries: 0 },
        );
        const refund = normalizedRefund(
          raw,
          request.expectedRequest,
          context,
          request.knownProviderRefundId,
        );
        return refund === null
          ? unknownRefund(request.knownProviderRefundId)
          : Object.freeze({ status: "normalized" as const, refund });
      } catch (error) {
        const classified = classifyStripeProviderError(error, "retrieve_refund");
        return unknownRefund(
          request.knownProviderRefundId,
          classified.evidenceCode,
        );
      }
    },
  });
}

export function createRuntimeStripePaymentProvider(input: Readonly<{
  secretKey: string;
  accountId: string;
  livemode: boolean;
  StripeConstructor?: StripeConstructorLike;
}>): PaymentProvider {
  if (
    !/^acct_[A-Za-z0-9]{8,64}$/u.test(input.accountId) ||
    (input.livemode
      ? !input.secretKey.startsWith("sk_live_")
      : !input.secretKey.startsWith("sk_test_"))
  ) {
    throw new Error("Stripe runtime configuration is incoherent");
  }
  const Constructor =
    input.StripeConstructor ?? (Stripe as unknown as StripeConstructorLike);
  const sdk = new Constructor(input.secretKey, {
    apiVersion: STRIPE_API_VERSION,
    maxNetworkRetries: 0,
  });
  return createStripePaymentProvider({
    sdk,
    context: Object.freeze({
      provider: "stripe" as const,
      livemode: input.livemode,
      scope: `stripe:${input.accountId}`,
    }),
  });
}
