import "server-only";

import { isCanonicalUuid } from "@/commerce/checkout-identity";
import type {
  DownstreamEffectDeliveryV1,
  DownstreamEffectRepository,
} from "@/db/repositories/downstream-effect-repository";

export type AllowlistedDownstreamEffectV1 =
  | Readonly<{
      effectType: "wake_provider_dependencies";
      payload: Readonly<{
        schemaVersion: 1;
        verifiedPaymentEventId: string;
      }>;
      idempotencyKey: string;
    }>
  | Readonly<{
      effectType: "payment_verified";
      payload: Readonly<{
        schemaVersion: 1;
        orderId: string;
        verifiedPaymentEventId: string;
        reason: "payment_verified";
      }>;
      idempotencyKey: string;
    }>
  | Readonly<{
      effectType: "refund_verified" | "dispute_recorded" | "dispute_resolved";
      payload: Readonly<{
        schemaVersion: 1;
        orderId: string;
        paymentEventId: string;
        reason: "refund_verified" | "dispute_recorded" | "dispute_resolved";
      }>;
      idempotencyKey: string;
    }>
  | Readonly<{
      effectType: "fulfillment_handed_off";
      payload: Readonly<{
        schemaVersion: 1;
        orderId: string;
        shipmentId: string;
        fulfillmentReleaseId: string;
      }>;
      idempotencyKey: string;
    }>
  | Readonly<{
      effectType: "stripe_tax_transaction";
      payload: Readonly<{
        schemaVersion: 1;
        orderId: string;
        verifiedPaymentEventId: string;
        /** Stripe tax calculation id; never a monetary amount. */
        calculationReference: string;
      }>;
      idempotencyKey: string;
    }>;

export type DownstreamEffectSinkV1 = (
  delivery: Exclude<
    AllowlistedDownstreamEffectV1,
    Readonly<{ effectType: "wake_provider_dependencies" }>
  >,
) => Promise<void>;

const externalTypes = new Set([
  "payment_verified",
  "refund_verified",
  "dispute_recorded",
  "dispute_resolved",
  "fulfillment_handed_off",
  "stripe_tax_transaction",
] as const);
const BOUNDED_KEY = /^[\x20-\x7e]{1,255}$/u;
const LEASE_MILLISECONDS = 60_000;

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const expected = new Set(keys);
  const ownKeys = Reflect.ownKeys(value);
  if (
    ownKeys.length !== keys.length ||
    ownKeys.some((key) => typeof key !== "string" || !expected.has(key))
  ) {
    return false;
  }
  let prototype = Object.getPrototypeOf(value) as object | null;
  while (prototype !== null && prototype !== Object.prototype) {
    if (Reflect.ownKeys(prototype).length > 0) return false;
    prototype = Object.getPrototypeOf(prototype) as object | null;
  }
  for (const key in value) {
    if (!Object.hasOwn(value, key)) return false;
  }
  return true;
}

export function parseAllowlistedDownstreamEffectV1(
  delivery: DownstreamEffectDeliveryV1,
): AllowlistedDownstreamEffectV1 | null {
  if (!BOUNDED_KEY.test(delivery.idempotencyKey)) return null;
  const payload = record(delivery.payload);
  if (payload === null || payload.schemaVersion !== 1) return null;
  if (delivery.effectType === "wake_provider_dependencies") {
    if (
      !exactKeys(payload, ["schemaVersion", "verifiedPaymentEventId"]) ||
      !isCanonicalUuid(payload.verifiedPaymentEventId)
    ) return null;
    return Object.freeze({
      effectType: "wake_provider_dependencies",
      payload: Object.freeze({
        schemaVersion: 1,
        verifiedPaymentEventId: payload.verifiedPaymentEventId,
      }),
      idempotencyKey: delivery.idempotencyKey,
    });
  }
  if (delivery.effectType === "payment_verified") {
    if (
      !exactKeys(payload, [
        "schemaVersion",
        "orderId",
        "verifiedPaymentEventId",
        "reason",
      ]) ||
      !isCanonicalUuid(payload.orderId) ||
      !isCanonicalUuid(payload.verifiedPaymentEventId) ||
      payload.reason !== "payment_verified"
    ) return null;
    return Object.freeze({
      effectType: "payment_verified",
      payload: Object.freeze({
        schemaVersion: 1,
        orderId: payload.orderId,
        verifiedPaymentEventId: payload.verifiedPaymentEventId,
        reason: "payment_verified",
      }),
      idempotencyKey: delivery.idempotencyKey,
    });
  }
  if (delivery.effectType === "fulfillment_handed_off") {
    if (
      !exactKeys(payload, [
        "schemaVersion",
        "orderId",
        "shipmentId",
        "fulfillmentReleaseId",
      ]) ||
      !isCanonicalUuid(payload.orderId) ||
      !isCanonicalUuid(payload.shipmentId) ||
      !isCanonicalUuid(payload.fulfillmentReleaseId) ||
      delivery.idempotencyKey !==
        `fulfillment_release:${payload.fulfillmentReleaseId}:handoff`
    ) return null;
    return Object.freeze({
      effectType: "fulfillment_handed_off",
      payload: Object.freeze({
        schemaVersion: 1,
        orderId: payload.orderId,
        shipmentId: payload.shipmentId,
        fulfillmentReleaseId: payload.fulfillmentReleaseId,
      }),
      idempotencyKey: delivery.idempotencyKey,
    });
  }
  if (delivery.effectType === "stripe_tax_transaction") {
    if (
      !exactKeys(payload, [
        "schemaVersion",
        "orderId",
        "verifiedPaymentEventId",
        "calculationReference",
      ]) ||
      !isCanonicalUuid(payload.orderId) ||
      !isCanonicalUuid(payload.verifiedPaymentEventId) ||
      typeof payload.calculationReference !== "string" ||
      payload.calculationReference.trim() !== payload.calculationReference ||
      payload.calculationReference.length === 0 ||
      payload.calculationReference.length > 200 ||
      delivery.idempotencyKey !==
        `payment_event:${payload.verifiedPaymentEventId}:stripe_tax_transaction`
    ) return null;
    return Object.freeze({
      effectType: "stripe_tax_transaction",
      payload: Object.freeze({
        schemaVersion: 1,
        orderId: payload.orderId,
        verifiedPaymentEventId: payload.verifiedPaymentEventId,
        calculationReference: payload.calculationReference,
      }),
      idempotencyKey: delivery.idempotencyKey,
    });
  }
  if (!externalTypes.has(
    delivery.effectType as "refund_verified" | "dispute_recorded" | "dispute_resolved",
  ) || delivery.effectType === "payment_verified") {
    return null;
  }
  if (
    !exactKeys(payload, ["schemaVersion", "orderId", "paymentEventId", "reason"]) ||
    !isCanonicalUuid(payload.orderId) ||
    !isCanonicalUuid(payload.paymentEventId) ||
    payload.reason !== delivery.effectType
  ) return null;
  return Object.freeze({
    effectType: delivery.effectType as
      | "refund_verified"
      | "dispute_recorded"
      | "dispute_resolved",
    payload: Object.freeze({
      schemaVersion: 1,
      orderId: payload.orderId,
      paymentEventId: payload.paymentEventId,
      reason: payload.reason as
        | "refund_verified"
        | "dispute_recorded"
        | "dispute_resolved",
    }),
    idempotencyKey: delivery.idempotencyKey,
  });
}

export function createDownstreamEffectWorkerV1(dependencies: Readonly<{
  repository: DownstreamEffectRepository;
  sink: DownstreamEffectSinkV1 | null;
  wakeDependencies: (verifiedPaymentEventId: string) => Promise<unknown>;
  clock: () => Date;
  leaseToken: () => string;
}>): Readonly<{
  runEffect: (effectId: string) => Promise<Readonly<{
    status:
      | "processed"
      | "failed"
      | "disabled"
      | "busy"
      | "missing"
      | "lease_lost";
  }>>;
}> {
  return Object.freeze({
    async runEffect(effectId) {
      const descriptor = await dependencies.repository.describeEffect(effectId);
      if (descriptor === null) return Object.freeze({ status: "missing" });
      if (descriptor.status === "processed") {
        return Object.freeze({ status: "processed" });
      }
      if (
        descriptor.effectType !== "wake_provider_dependencies" &&
        dependencies.sink === null
      ) {
        return Object.freeze({ status: "disabled" });
      }
      const now = dependencies.clock();
      if (!Number.isFinite(now.getTime())) {
        throw new Error("Downstream effect worker clock returned an invalid instant");
      }
      const claimed = await dependencies.repository.claimEffect({
        effectId,
        now,
        leaseToken: dependencies.leaseToken(),
        leaseExpiresAt: new Date(now.getTime() + LEASE_MILLISECONDS),
      });
      if (claimed.status !== "claimed") {
        return Object.freeze({
          status: claimed.status === "processed"
            ? "processed"
            : claimed.status,
        });
      }
      const delivery = parseAllowlistedDownstreamEffectV1(claimed.delivery);
      if (
        delivery === null ||
        delivery.effectType !== descriptor.effectType
      ) {
        await dependencies.repository.failClaim(claimed.claim, {
          now,
          reason: "invalid_effect_payload",
        });
        return Object.freeze({ status: "failed" });
      }
      try {
        if (delivery.effectType === "wake_provider_dependencies") {
          await dependencies.wakeDependencies(
            delivery.payload.verifiedPaymentEventId,
          );
        } else {
          await dependencies.sink!(delivery);
        }
        const completed = await dependencies.repository.completeClaim(
          claimed.claim,
          { now },
        );
        return Object.freeze({
          status: completed.status === "applied" ? "processed" : "lease_lost",
        });
      } catch {
        await dependencies.repository.failClaim(claimed.claim, {
          now,
          reason: "effect_delivery_failed",
        });
        return Object.freeze({ status: "failed" });
      }
    },
  });
}
