import "server-only";

import { isCanonicalUuid, isSha256 } from "@/commerce/checkout-identity";
import type { ExpectedProviderContextV1 } from "@/commerce/payment-provider";
import {
  buildProviderRefundRequestV1,
  type ProviderRefundRequestV1,
} from "@/commerce/provider-contracts";
import { projectProviderExecutionContextV1 } from "@/commerce/provider-context";

export type RefundClaimDescriptorV1 = Readonly<{
  operation: "create" | "retrieve";
  knownProviderRefundId?: string;
  actorUserId: string;
  actorClerkUserId: string;
  refundId: string;
  orderId: string;
  verifiedPaymentEventId: string;
  request: ProviderRefundRequestV1;
  requestHash: string;
  expectedAttempt: number;
  expectedProviderContext: ExpectedProviderContextV1;
}>;

export type StrictRefundProviderResultV1 =
  | Readonly<{
      kind: "normalized";
      providerRefundId: string;
      status: "pending" | "requires_action" | "succeeded" | "failed" | "canceled";
    }>
  | Readonly<{
      kind: "provider_unknown";
      providerRefundId: string | null;
    }>
  | Readonly<{ kind: "definite_rejection" }>;

export type RefundCommandResultV1 =
  | Readonly<{ status: "unavailable" | "ineligible" | "conflict" }>
  | Readonly<{
      status: "terminal";
      refundStatus: "succeeded" | "failed" | "cancelled";
    }>
  | Readonly<{
      status:
        | "submitted"
        | "awaiting_signed_event"
        | "failed"
        | "cancelled"
        | "stale"
        | "provider_refund_result_invalid";
    }>;

export type RefundCommandRepository = Readonly<{
  claim: (input: Readonly<{
    refundId: string;
    actorUserId: string;
    actorClerkUserId: string;
    expectedProviderContext: ExpectedProviderContextV1;
    now: Date;
  }>) => Promise<
    | Readonly<{ status: "call_required"; descriptor: RefundClaimDescriptorV1 }>
    | Readonly<{ status: "unavailable" | "ineligible" | "conflict" }>
    | Readonly<{
        status: "terminal";
        refundStatus: "succeeded" | "failed" | "cancelled";
      }>
  >;
  applyResult: (input: Readonly<{
    descriptor: RefundClaimDescriptorV1;
    result: StrictRefundProviderResultV1;
    now: Date;
  }>) => Promise<RefundCommandResultV1>;
}>;

const providerUnknownEvidence = new Set([
  "provider_context_mismatch",
  "provider_response_mismatch",
  "provider_transport_unknown",
  "provider_sdk_unknown",
  "create_requires_retrieve",
] as const);
const normalizedStatuses = new Set([
  "pending",
  "requires_action",
  "succeeded",
  "failed",
  "canceled",
] as const);

function exactOwnRecord(
  value: unknown,
  expectedKeys: readonly string[],
): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  const keys = Reflect.ownKeys(value);
  if (
    keys.length !== expectedKeys.length ||
    keys.some((key) => typeof key !== "string" || !expectedKeys.includes(key))
  ) {
    return false;
  }
  return expectedKeys.every((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return (
      descriptor !== undefined &&
      "value" in descriptor &&
      descriptor.enumerable === true
    );
  });
}

function boundedProviderReference(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length >= 3 &&
    value.length <= 200 &&
    value.trim() === value &&
    /^[\x20-\x7e]+$/u.test(value)
  );
}

function descriptorIsCoherent(value: RefundClaimDescriptorV1): boolean {
  const expected = value.expectedProviderContext;
  const request = value.request;
  const knownId = value.knownProviderRefundId;
  if (
    !exactOwnRecord(request, [
      "schemaVersion",
      "provider",
      "refundId",
      "orderId",
      "amountMinor",
      "currency",
      "paymentIntentId",
      "chargeId",
      "metadata",
      "providerIdempotencyKey",
    ]) ||
    !exactOwnRecord(request.metadata, ["orderId", "refundId"])
  ) {
    return false;
  }
  const rebuilt = buildProviderRefundRequestV1({
    schemaVersion: request.schemaVersion,
    provider: request.provider,
    refundId: request.refundId,
    orderId: request.orderId,
    requestedAmountMinor: request.amountMinor,
    currency: request.currency === "usd" ? "USD" : null,
    paymentIntentId: request.paymentIntentId,
    chargeId: request.chargeId,
    providerIdempotencyKey: request.providerIdempotencyKey,
  });
  return (
    rebuilt.ok &&
    JSON.stringify(rebuilt.value) === JSON.stringify(request) &&
    (value.operation === "create" || value.operation === "retrieve") &&
    isCanonicalUuid(value.actorUserId) &&
    boundedProviderReference(value.actorClerkUserId) &&
    isCanonicalUuid(value.refundId) &&
    isCanonicalUuid(value.orderId) &&
    isCanonicalUuid(value.verifiedPaymentEventId) &&
    isSha256(value.requestHash) &&
    Number.isSafeInteger(value.expectedAttempt) &&
    value.expectedAttempt > 0 &&
    (expected.provider === "stripe" || expected.provider === "local_test") &&
    typeof expected.livemode === "boolean" &&
    boundedProviderReference(expected.scope) &&
    request.schemaVersion === 1 &&
    request.provider === expected.provider &&
    request.refundId === value.refundId &&
    request.orderId === value.orderId &&
    request.paymentIntentId !== null &&
    request.chargeId === null &&
    request.providerIdempotencyKey === `refund_request:${value.refundId}` &&
    (value.operation === "create"
      ? knownId === undefined
      : boundedProviderReference(knownId))
  );
}

export function projectRefundProviderResultV1(
  value: unknown,
  descriptor: RefundClaimDescriptorV1,
): StrictRefundProviderResultV1 | null {
  try {
    if (!descriptorIsCoherent(descriptor)) return null;
    if (exactOwnRecord(value, ["status", "refund"]) && value.status === "normalized") {
      const refund = value.refund;
      if (
        !exactOwnRecord(refund, [
          "provider",
          "providerRefundId",
          "paymentIntentId",
          "chargeId",
          "amount",
          "currency",
          "status",
          "livemode",
        ]) ||
        refund.provider !== descriptor.expectedProviderContext.provider ||
        !boundedProviderReference(refund.providerRefundId) ||
        refund.paymentIntentId !== descriptor.request.paymentIntentId ||
        !(
          refund.chargeId === null ||
          boundedProviderReference(refund.chargeId)
        ) ||
        refund.amount !== descriptor.request.amountMinor ||
        refund.currency !== descriptor.request.currency ||
        !normalizedStatuses.has(refund.status as never) ||
        !(
          refund.livemode === null ||
          refund.livemode === descriptor.expectedProviderContext.livemode
        ) ||
        (descriptor.operation === "retrieve" &&
          refund.providerRefundId !== descriptor.knownProviderRefundId)
      ) {
        return null;
      }
      return Object.freeze({
        kind: "normalized" as const,
        providerRefundId: refund.providerRefundId,
        status: refund.status as
          | "pending"
          | "requires_action"
          | "succeeded"
          | "failed"
          | "canceled",
      });
    }
    if (
      exactOwnRecord(value, [
        "status",
        "knownProviderRefundId",
        "evidenceCode",
      ]) &&
      value.status === "provider_unknown"
    ) {
      const providerRefundId = value.knownProviderRefundId;
      if (
        !(
          providerRefundId === null ||
          boundedProviderReference(providerRefundId)
        ) ||
        !providerUnknownEvidence.has(value.evidenceCode as never) ||
        (descriptor.operation === "retrieve" &&
          providerRefundId !== descriptor.knownProviderRefundId)
      ) {
        return null;
      }
      return Object.freeze({
        kind: "provider_unknown" as const,
        providerRefundId,
      });
    }
    if (
      exactOwnRecord(value, ["status", "evidenceCode", "providerRequestId"]) &&
      value.status === "definite_rejection" &&
      value.evidenceCode === "create_rejected_4xx" &&
      descriptor.operation === "create" &&
      (value.providerRequestId === null ||
        boundedProviderReference(value.providerRequestId))
    ) {
      return Object.freeze({ kind: "definite_rejection" as const });
    }
    return null;
  } catch {
    return null;
  }
}

export async function submitOrRecoverRefund(input: Readonly<{
  repository: RefundCommandRepository;
  providerContext: unknown;
  actorUserId: string | null;
  refundId: string;
  now: Date;
  authorize: () => Promise<Readonly<{
    actorUserId: string;
    actorClerkUserId: string;
  }>>;
}>): Promise<RefundCommandResultV1> {
  const context = projectProviderExecutionContextV1(input.providerContext);
  if (
    context === null ||
    input.actorUserId === null ||
    !isCanonicalUuid(input.actorUserId) ||
    !isCanonicalUuid(input.refundId) ||
    !Number.isFinite(input.now.getTime()) ||
    context.buyerUserId !== input.actorUserId ||
    context.refundProviderAvailable !== true ||
    context.adapter === null ||
    context.provider === null ||
    context.expectedLivemode === null ||
    context.providerScope === null ||
    context.adapter.context.provider !== context.provider ||
    context.adapter.context.livemode !== context.expectedLivemode ||
    context.adapter.context.scope !== context.providerScope
  ) {
    return Object.freeze({ status: "unavailable" as const });
  }
  const authorized = await input.authorize();
  if (
    authorized.actorUserId !== input.actorUserId ||
    !boundedProviderReference(authorized.actorClerkUserId)
  ) {
    return Object.freeze({ status: "unavailable" as const });
  }
  const expectedProviderContext = Object.freeze({
    provider: context.provider,
    livemode: context.expectedLivemode,
    scope: context.providerScope,
  });
  const claim = await input.repository.claim({
    refundId: input.refundId,
    actorUserId: authorized.actorUserId,
    actorClerkUserId: authorized.actorClerkUserId,
    expectedProviderContext,
    now: input.now,
  });
  if (claim.status !== "call_required") return claim;
  const descriptor = claim.descriptor;
  if (
    !descriptorIsCoherent(descriptor) ||
    descriptor.actorUserId !== authorized.actorUserId ||
    descriptor.actorClerkUserId !== authorized.actorClerkUserId ||
    descriptor.refundId !== input.refundId ||
    descriptor.expectedProviderContext.provider !== context.provider ||
    descriptor.expectedProviderContext.livemode !== context.expectedLivemode ||
    descriptor.expectedProviderContext.scope !== context.providerScope
  ) {
    return Object.freeze({ status: "conflict" as const });
  }
  let providerResult: unknown;
  try {
    providerResult = descriptor.operation === "create"
      ? await context.adapter.createRefund(
          descriptor.request,
          descriptor.request.providerIdempotencyKey,
        )
      : await context.adapter.retrieveRefund({
          knownProviderRefundId: descriptor.knownProviderRefundId!,
          expectedRequest: descriptor.request,
          expectedProviderContext: descriptor.expectedProviderContext,
        });
  } catch {
    return Object.freeze({ status: "provider_refund_result_invalid" as const });
  }
  const projected = projectRefundProviderResultV1(providerResult, descriptor);
  if (projected === null) {
    return Object.freeze({ status: "provider_refund_result_invalid" as const });
  }
  return input.repository.applyResult({
    descriptor,
    result: projected,
    now: input.now,
  });
}
