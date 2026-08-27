import { isCanonicalUuid } from "@/commerce/checkout-identity";

export type ShipmentState =
  | "pending"
  | "handed_off"
  | "delivered"
  | "exception";

export type ShipmentSnapshot = Readonly<{
  shipmentId: string;
  orderId: string;
  fulfillmentReleaseId: string | null;
  state: ShipmentState;
  handedOffAt: string | null;
  deliveredAt: string | null;
}>;

export type ShipmentEvent =
  | Readonly<{ type: "deliver"; now: string }>
  | Readonly<{ type: "record_exception"; now: string }>;

export type ShipmentTransitionResult =
  | Readonly<{
      ok: true;
      changed: boolean;
      snapshot: ShipmentSnapshot;
    }>
  | Readonly<{
      ok: false;
      code:
        | "invalid_snapshot"
        | "invalid_event"
        | "invalid_transition"
        | "delivered_terminal";
    }>;

function canonicalInstant(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const instant = new Date(value);
  return Number.isFinite(instant.getTime()) && instant.toISOString() === value;
}

function exactRecord(value: unknown, keys: readonly string[]): boolean {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  const ownKeys = Reflect.ownKeys(value);
  return (
    ownKeys.length === keys.length &&
    ownKeys.every(
      (key) => typeof key === "string" && keys.includes(key),
    )
  );
}

function validSnapshot(value: ShipmentSnapshot): boolean {
  if (
    !exactRecord(value, [
      "shipmentId",
      "orderId",
      "fulfillmentReleaseId",
      "state",
      "handedOffAt",
      "deliveredAt",
    ]) ||
    !isCanonicalUuid(value.shipmentId) ||
    !isCanonicalUuid(value.orderId)
  ) {
    return false;
  }
  if (value.state === "pending") {
    return (
      value.fulfillmentReleaseId === null &&
      value.handedOffAt === null &&
      value.deliveredAt === null
    );
  }
  if (
    !isCanonicalUuid(value.fulfillmentReleaseId) ||
    !canonicalInstant(value.handedOffAt)
  ) {
    return false;
  }
  if (value.state === "handed_off" || value.state === "exception") {
    return value.deliveredAt === null;
  }
  return (
    value.state === "delivered" &&
    canonicalInstant(value.deliveredAt) &&
    new Date(value.deliveredAt).getTime() >=
      new Date(value.handedOffAt).getTime()
  );
}

export function transitionShipment(
  snapshot: ShipmentSnapshot,
  event: ShipmentEvent,
): ShipmentTransitionResult {
  if (!validSnapshot(snapshot)) {
    return Object.freeze({ ok: false as const, code: "invalid_snapshot" as const });
  }
  if (
    !exactRecord(event, ["type", "now"]) ||
    (event.type !== "deliver" && event.type !== "record_exception") ||
    !canonicalInstant(event.now)
  ) {
    return Object.freeze({ ok: false as const, code: "invalid_event" as const });
  }
  if (event.type === "deliver") {
    if (snapshot.state === "delivered") {
      return Object.freeze({ ok: true as const, changed: false, snapshot });
    }
    if (snapshot.state !== "handed_off" && snapshot.state !== "exception") {
      return Object.freeze({ ok: false as const, code: "invalid_transition" as const });
    }
    if (
      snapshot.handedOffAt === null ||
      new Date(event.now).getTime() <
      new Date(snapshot.handedOffAt).getTime()
    ) {
      return Object.freeze({ ok: false as const, code: "invalid_transition" as const });
    }
    return Object.freeze({
      ok: true as const,
      changed: true,
      snapshot: Object.freeze({
        ...snapshot,
        state: "delivered" as const,
        deliveredAt: event.now,
      }),
    });
  }
  if (snapshot.state === "delivered") {
    return Object.freeze({ ok: false as const, code: "delivered_terminal" as const });
  }
  if (snapshot.state === "exception") {
    return Object.freeze({ ok: true as const, changed: false, snapshot });
  }
  if (snapshot.state !== "handed_off") {
    return Object.freeze({ ok: false as const, code: "invalid_transition" as const });
  }
  return Object.freeze({
    ok: true as const,
    changed: true,
    snapshot: Object.freeze({
      ...snapshot,
      state: "exception" as const,
      deliveredAt: null,
    }),
  });
}
