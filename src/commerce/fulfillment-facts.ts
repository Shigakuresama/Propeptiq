import { hasExactProviderEventEnvelopeIdentity } from "@/commerce/payment-authority";
import type { ProviderKind } from "@/commerce/provider-contracts";
import {
  parseNormalizedProviderEventV1,
  type DisputeProviderEventV1,
} from "@/commerce/provider-events";

export type ProviderRestrictionEventRowV1 = Readonly<{
  provider: string;
  providerEventId: string;
  eventType: string;
  status: string;
  livemode: boolean;
  normalizedPayload: unknown;
}>;

export type ProviderRestrictionsV1 = Readonly<{
  refundPending: boolean;
  paymentDisputed: boolean;
  conflict: boolean;
}>;

const unsettledStatuses = new Set([
  "pending",
  "processing",
  "deferred",
  "failed",
  "conflict",
]);
const disputeEventTypes = new Set([
  "charge.dispute.created",
  "charge.dispute.updated",
  "charge.dispute.closed",
]);
const refundEventTypes = new Set([
  "refund.created",
  "refund.updated",
  "refund.failed",
  "charge.refunded",
]);
const restrictiveDisputeStatuses = new Set<DisputeProviderEventV1["status"]>([
  "lost",
  "needs_response",
  "under_review",
  "warning_needs_response",
  "warning_under_review",
  "unknown_restrictive",
]);

function exactFinancialShape(
  event: Readonly<{
    currency: string;
    amountMinor: number;
  }>,
  currency: string,
  paidAmountMinor: number,
): boolean {
  return (
    event.currency === currency.toLowerCase() &&
    Number.isSafeInteger(event.amountMinor) &&
    event.amountMinor > 0 &&
    event.amountMinor <= paidAmountMinor
  );
}

export function deriveProviderRestrictionsV1(input: Readonly<{
  provider: ProviderKind;
  livemode: boolean;
  paymentIntentId: string;
  currency: string;
  paidAmountMinor: number;
  events: readonly ProviderRestrictionEventRowV1[];
}>): ProviderRestrictionsV1 {
  let refundPending = false;
  let paymentDisputed = false;
  let conflict = false;
  const disputeGroups = new Map<string, DisputeProviderEventV1[]>();

  for (const row of input.events) {
    if (row.provider !== input.provider || row.livemode !== input.livemode) {
      continue;
    }
    const knownDispute = disputeEventTypes.has(row.eventType);
    const knownRefund = refundEventTypes.has(row.eventType);
    if (!knownDispute && !knownRefund) continue;
    const event = parseNormalizedProviderEventV1(row.normalizedPayload);
    if (
      event === null ||
      event.eventType !== row.eventType ||
      event.livemode !== row.livemode ||
      !hasExactProviderEventEnvelopeIdentity(row.providerEventId, event)
    ) {
      conflict = true;
      if (knownDispute) paymentDisputed = true;
      if (knownRefund) refundPending = true;
      continue;
    }
    if (event.kind === "dispute") {
      if (event.paymentIntentId !== input.paymentIntentId) continue;
      if (!exactFinancialShape(event, input.currency, input.paidAmountMinor)) {
        conflict = true;
        paymentDisputed = true;
        continue;
      }
      if (unsettledStatuses.has(row.status)) {
        paymentDisputed = true;
        continue;
      }
      if (row.status !== "processed") {
        conflict = true;
        paymentDisputed = true;
        continue;
      }
      const group = disputeGroups.get(event.disputeId) ?? [];
      group.push(event);
      disputeGroups.set(event.disputeId, group);
      continue;
    }
    if (event.kind === "refund") {
      if (event.paymentIntentId !== input.paymentIntentId) continue;
      if (!exactFinancialShape(event, input.currency, input.paidAmountMinor)) {
        conflict = true;
        refundPending = true;
        continue;
      }
      if (unsettledStatuses.has(row.status)) refundPending = true;
      continue;
    }
    if (event.kind === "refund_reconciliation") {
      if (event.paymentIntentId !== input.paymentIntentId) continue;
      const shape = {
        currency: event.currency,
        amountMinor: event.amountRefundedMinor,
      };
      if (!exactFinancialShape(shape, input.currency, input.paidAmountMinor)) {
        conflict = true;
        refundPending = true;
        continue;
      }
      if (unsettledStatuses.has(row.status)) refundPending = true;
    }
  }

  for (const events of disputeGroups.values()) {
    let latest = Number.NEGATIVE_INFINITY;
    for (const event of events) {
      latest = Math.max(latest, new Date(event.providerCreatedAt).getTime());
    }
    const latestEvents = events.filter(
      (event) => new Date(event.providerCreatedAt).getTime() === latest,
    );
    if (
      latestEvents.some((event) =>
        restrictiveDisputeStatuses.has(event.status),
      )
    ) {
      paymentDisputed = true;
    }
  }

  return Object.freeze({ refundPending, paymentDisputed, conflict });
}
