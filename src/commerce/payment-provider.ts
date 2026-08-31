import type {
  ProviderKind,
  ProviderRefundRequestV1,
  StripeCheckoutRequest,
} from "@/commerce/provider-contracts";

export type ExpectedProviderContextV1 = Readonly<{
  provider: ProviderKind;
  livemode: boolean;
  scope: string;
}>;

export type NormalizedCheckoutSessionV1 = Readonly<{
  provider: ProviderKind;
  providerSessionId: string;
  hostedUrl: string | null;
  clientReferenceId: string;
  metadata: Readonly<{ orderId: string; attemptId: string }>;
  paymentIntentId: string | null;
  amountTotal: number;
  currency: "usd";
  mode: "payment";
  uiMode: "hosted_page";
  status: "open" | "complete" | "expired";
  paymentStatus: "unpaid" | "paid" | "no_payment_required";
  livemode: boolean;
  customerEmail: string;
  expiresAt: number;
}>;

export type NormalizedProviderRefundV1 = Readonly<{
  provider: ProviderKind;
  providerRefundId: string;
  paymentIntentId: string | null;
  chargeId: string | null;
  amount: number;
  currency: "usd";
  status: "pending" | "requires_action" | "succeeded" | "failed" | "canceled";
  livemode: boolean | null;
}>;

export type ProviderEvidenceCode =
  | "provider_context_mismatch"
  | "provider_response_mismatch"
  | "provider_transport_unknown"
  | "provider_sdk_unknown"
  | "create_requires_retrieve"
  | "create_rejected_4xx";

export type CheckoutProviderResult =
  | Readonly<{ status: "open"; session: NormalizedCheckoutSessionV1 }>
  | Readonly<{ status: "provider_pending"; session: NormalizedCheckoutSessionV1 }>
  | Readonly<{ status: "verified_expired"; session: NormalizedCheckoutSessionV1 }>
  | Readonly<{
      status: "provider_unknown";
      knownProviderSessionId: string | null;
      evidenceCode: ProviderEvidenceCode;
    }>
  | Readonly<{
      status: "definite_rejection";
      evidenceCode: "create_rejected_4xx";
      providerRequestId: string | null;
    }>;

export type RefundProviderResult =
  | Readonly<{ status: "normalized"; refund: NormalizedProviderRefundV1 }>
  | Readonly<{
      status: "provider_unknown";
      knownProviderRefundId: string | null;
      evidenceCode: ProviderEvidenceCode;
    }>
  | Readonly<{
      status: "definite_rejection";
      evidenceCode: "create_rejected_4xx";
      providerRequestId: string | null;
    }>;

export type PaymentProvider = Readonly<{
  context: ExpectedProviderContextV1;
  createCheckoutSession: (
    exactRequest: StripeCheckoutRequest,
    providerIdempotencyKey: string,
  ) => Promise<CheckoutProviderResult>;
  retrieveCheckoutSession: (input: Readonly<{
    knownProviderSessionId: string;
    expectedRequest: StripeCheckoutRequest;
    expectedProviderContext: ExpectedProviderContextV1;
  }>) => Promise<CheckoutProviderResult>;
  createRefund: (
    exactRequest: ProviderRefundRequestV1,
    providerIdempotencyKey: string,
  ) => Promise<RefundProviderResult>;
  retrieveRefund: (input: Readonly<{
    knownProviderRefundId: string;
    expectedRequest: ProviderRefundRequestV1;
    expectedProviderContext: ExpectedProviderContextV1;
  }>) => Promise<RefundProviderResult>;
}>;
