import "server-only";

import { LOCAL_PAYMENT_PROVIDER_SCOPE } from "@/commerce/checkout-ports";
import type {
  ProviderRefundRequestV1,
  StripeCheckoutRequestV1,
} from "@/commerce/provider-contracts";
import type {
  CheckoutProviderResult,
  NormalizedCheckoutSessionV1,
  NormalizedProviderRefundV1,
  PaymentProvider,
  RefundProviderResult,
} from "@/commerce/payment-provider";

export const LOCAL_PAYMENT_PROVIDER_SENTINEL =
  "LOCAL_PAYMENT_PROVIDER_TEST_ONLY_PROPEPTIQ_6D_C8A13F" as const;

export type SyntheticCheckoutOutcome =
  | "open"
  | "persist_then_connection_loss"
  | "definite_4xx"
  | "idempotency_conflict"
  | "conflict_409"
  | "server_5xx"
  | "timeout"
  | "malformed";

export type SyntheticRefundOutcome = SyntheticCheckoutOutcome;

type CheckoutState = "open" | "complete" | "expired" | "future_status";
type RefundState =
  | "pending"
  | "requires_action"
  | "succeeded"
  | "failed"
  | "canceled"
  | "future_status";

type CheckoutRecord = {
  requestJson: string;
  request: StripeCheckoutRequestV1;
  sessionId: string;
  state: CheckoutState;
};

type RefundRecord = {
  requestJson: string;
  request: ProviderRefundRequestV1;
  refundId: string;
  state: RefundState;
};

function checkoutUnknown(
  knownProviderSessionId: string | null,
  evidenceCode: "provider_transport_unknown" | "provider_sdk_unknown" | "provider_context_mismatch" =
    "provider_sdk_unknown",
): CheckoutProviderResult {
  return Object.freeze({
    status: "provider_unknown" as const,
    knownProviderSessionId,
    evidenceCode,
  });
}

function refundUnknown(
  knownProviderRefundId: string | null,
  evidenceCode: "provider_transport_unknown" | "provider_sdk_unknown" | "provider_context_mismatch" =
    "provider_sdk_unknown",
): RefundProviderResult {
  return Object.freeze({
    status: "provider_unknown" as const,
    knownProviderRefundId,
    evidenceCode,
  });
}

function deterministicSuffix(value: string): string {
  return value.replaceAll("-", "").toLowerCase();
}

function sameContext(
  value: Readonly<{ provider: string; livemode: boolean; scope: string }>,
): boolean {
  return (
    value.provider === "local_test" &&
    value.livemode === false &&
    value.scope === LOCAL_PAYMENT_PROVIDER_SCOPE
  );
}

function normalizedCheckout(record: CheckoutRecord): CheckoutProviderResult {
  if (record.state === "future_status") {
    return checkoutUnknown(record.sessionId);
  }
  const request = record.request;
  const trustedOrigin = new URL(request.success_url).origin;
  const session = Object.freeze({
    provider: "local_test" as const,
    providerSessionId: record.sessionId,
    hostedUrl:
      record.state === "open"
        ? `${trustedOrigin}/__synthetic_local_checkout/${record.sessionId}`
        : null,
    clientReferenceId: request.client_reference_id,
    metadata: Object.freeze({ ...request.metadata }),
    paymentIntentId:
      record.state === "complete"
        ? `pi_local_synthetic_${deterministicSuffix(request.metadata.attemptId)}`
        : null,
    amountTotal: request.line_items.reduce(
      (total, line) => total + line.price_data.unit_amount,
      0,
    ),
    currency: "usd" as const,
    mode: "payment" as const,
    uiMode: "hosted_page" as const,
    status: record.state,
    paymentStatus: record.state === "complete" ? ("paid" as const) : ("unpaid" as const),
    livemode: false,
    customerEmail: request.customer_email,
    expiresAt: request.expires_at,
  }) satisfies NormalizedCheckoutSessionV1;
  if (record.state === "open") {
    return Object.freeze({ status: "open" as const, session });
  }
  if (record.state === "expired") {
    return Object.freeze({ status: "verified_expired" as const, session });
  }
  return Object.freeze({ status: "provider_pending" as const, session });
}

function normalizedRefund(record: RefundRecord): RefundProviderResult {
  if (record.state === "future_status") return refundUnknown(record.refundId);
  const request = record.request;
  const refund = Object.freeze({
    provider: "local_test" as const,
    providerRefundId: record.refundId,
    paymentIntentId: request.paymentIntentId,
    chargeId: request.chargeId,
    amount: request.amountMinor,
    currency: "usd" as const,
    status: record.state,
    livemode: false,
  }) satisfies NormalizedProviderRefundV1;
  return Object.freeze({ status: "normalized" as const, refund });
}

function scriptedCheckoutFailure(
  outcome: SyntheticCheckoutOutcome,
): CheckoutProviderResult | null {
  if (outcome === "open" || outcome === "persist_then_connection_loss") return null;
  if (outcome === "definite_4xx") {
    return Object.freeze({
      status: "definite_rejection" as const,
      evidenceCode: "create_rejected_4xx" as const,
      providerRequestId: "req_local_synthetic_definite_4xx",
    });
  }
  return checkoutUnknown(
    null,
    outcome === "timeout" ? "provider_transport_unknown" : "provider_sdk_unknown",
  );
}

function scriptedRefundFailure(
  outcome: SyntheticRefundOutcome,
): RefundProviderResult | null {
  if (outcome === "open" || outcome === "persist_then_connection_loss") return null;
  if (outcome === "definite_4xx") {
    return Object.freeze({
      status: "definite_rejection" as const,
      evidenceCode: "create_rejected_4xx" as const,
      providerRequestId: "req_local_synthetic_refund_4xx",
    });
  }
  return refundUnknown(
    null,
    outcome === "timeout" ? "provider_transport_unknown" : "provider_sdk_unknown",
  );
}

export function createSyntheticLocalPaymentProvider(): Readonly<{
  provider: PaymentProvider;
  control: Readonly<{
    reset: () => void;
    nextCheckoutOutcome: (outcome: SyntheticCheckoutOutcome) => void;
    nextRefundOutcome: (outcome: SyntheticRefundOutcome) => void;
    checkoutState: (providerSessionId: string) => Readonly<{
      state: CheckoutState;
      expiresAt: string;
    }> | null;
    setCheckoutState: (providerSessionId: string, state: CheckoutState) => void;
    setRefundState: (providerRefundId: string, state: RefundState) => void;
  }>;
}> {
  const checkoutByKey = new Map<string, CheckoutRecord>();
  const checkoutById = new Map<string, CheckoutRecord>();
  const refundByKey = new Map<string, RefundRecord>();
  const refundById = new Map<string, RefundRecord>();
  let checkoutOutcome: SyntheticCheckoutOutcome = "open";
  let refundOutcome: SyntheticRefundOutcome = "open";
  const context = Object.freeze({
    provider: "local_test" as const,
    livemode: false,
    scope: LOCAL_PAYMENT_PROVIDER_SCOPE,
  });

  const provider: PaymentProvider = Object.freeze({
    context,
    async createCheckoutSession(request, key) {
      if (key !== `checkout_attempt:${request.metadata.attemptId}`) {
        return checkoutUnknown(null, "provider_context_mismatch");
      }
      const requestJson = JSON.stringify(request);
      const existing = checkoutByKey.get(key);
      if (existing !== undefined) {
        return existing.requestJson === requestJson
          ? normalizedCheckout(existing)
          : checkoutUnknown(null);
      }
      const selected = checkoutOutcome;
      checkoutOutcome = "open";
      const failure = scriptedCheckoutFailure(selected);
      if (failure !== null) return failure;
      const sessionId = `cs_local_synthetic_${deterministicSuffix(request.metadata.attemptId)}`;
      const record: CheckoutRecord = {
        requestJson,
        request,
        sessionId,
        state: "open",
      };
      checkoutByKey.set(key, record);
      checkoutById.set(sessionId, record);
      return selected === "persist_then_connection_loss"
        ? checkoutUnknown(null, "provider_transport_unknown")
        : normalizedCheckout(record);
    },
    async retrieveCheckoutSession(input) {
      if (!sameContext(input.expectedProviderContext)) {
        return checkoutUnknown(input.knownProviderSessionId, "provider_context_mismatch");
      }
      const record = checkoutById.get(input.knownProviderSessionId);
      if (
        record === undefined ||
        record.requestJson !== JSON.stringify(input.expectedRequest)
      ) {
        return checkoutUnknown(input.knownProviderSessionId);
      }
      return normalizedCheckout(record);
    },
    async createRefund(request, key) {
      if (
        request.provider !== "local_test" ||
        key !== request.providerIdempotencyKey
      ) {
        return refundUnknown(null, "provider_context_mismatch");
      }
      const requestJson = JSON.stringify(request);
      const existing = refundByKey.get(key);
      if (existing !== undefined) {
        return existing.requestJson === requestJson
          ? normalizedRefund(existing)
          : refundUnknown(null);
      }
      const selected = refundOutcome;
      refundOutcome = "open";
      const failure = scriptedRefundFailure(selected);
      if (failure !== null) return failure;
      const refundId = `re_local_synthetic_${deterministicSuffix(request.refundId)}`;
      const record: RefundRecord = {
        requestJson,
        request,
        refundId,
        state: "pending",
      };
      refundByKey.set(key, record);
      refundById.set(refundId, record);
      return selected === "persist_then_connection_loss"
        ? refundUnknown(null, "provider_transport_unknown")
        : normalizedRefund(record);
    },
    async retrieveRefund(input) {
      if (!sameContext(input.expectedProviderContext)) {
        return refundUnknown(input.knownProviderRefundId, "provider_context_mismatch");
      }
      const record = refundById.get(input.knownProviderRefundId);
      if (
        record === undefined ||
        record.requestJson !== JSON.stringify(input.expectedRequest)
      ) {
        return refundUnknown(input.knownProviderRefundId);
      }
      return normalizedRefund(record);
    },
  });

  return Object.freeze({
    provider,
    control: Object.freeze({
      reset() {
        checkoutByKey.clear();
        checkoutById.clear();
        refundByKey.clear();
        refundById.clear();
        checkoutOutcome = "open";
        refundOutcome = "open";
      },
      nextCheckoutOutcome(outcome: SyntheticCheckoutOutcome) {
        checkoutOutcome = outcome;
      },
      nextRefundOutcome(outcome: SyntheticRefundOutcome) {
        refundOutcome = outcome;
      },
      checkoutState(providerSessionId: string) {
        const record = checkoutById.get(providerSessionId);
        return record === undefined
          ? null
          : Object.freeze({
              state: record.state,
              expiresAt: new Date(record.request.expires_at * 1_000).toISOString(),
            });
      },
      setCheckoutState(providerSessionId: string, state: CheckoutState) {
        const record = checkoutById.get(providerSessionId);
        if (record === undefined) throw new Error("Unknown synthetic checkout session");
        record.state = state;
      },
      setRefundState(providerRefundId: string, state: RefundState) {
        const record = refundById.get(providerRefundId);
        if (record === undefined) throw new Error("Unknown synthetic refund");
        record.state = state;
      },
    }),
  });
}
