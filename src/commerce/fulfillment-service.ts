import "server-only";

import { isCanonicalUuid } from "@/commerce/checkout-identity";
import { projectFulfillmentExecutionContextV1 } from "@/commerce/fulfillment-context";

export type FulfillmentCommandResultV1 = Readonly<{
  status:
    | "unavailable"
    | "ineligible"
    | "conflict"
    | "held"
    | "denied"
    | "cleared"
    | "already_clear"
    | "handed_off"
    | "already_handed_off"
    | "delivered"
    | "already_delivered"
    | "exception"
    | "already_exception";
  reasons?: readonly string[];
}>;

export type FulfillmentCommandActorV1 = Readonly<{
  actorUserId: string;
  actorClerkUserId: string;
}>;

type FulfillmentRepositoryInputV1 = FulfillmentCommandActorV1 &
  Readonly<{
    orderId: string;
    now: Date;
    correlationId: string;
  }>;

export type FulfillmentCommandRepository = Readonly<{
  clearHold: (
    input: FulfillmentRepositoryInputV1,
  ) => Promise<FulfillmentCommandResultV1>;
  handoff: (
    input: FulfillmentRepositoryInputV1,
  ) => Promise<FulfillmentCommandResultV1>;
  transitionShipment: (
    input: FulfillmentRepositoryInputV1 &
      Readonly<{ action: "deliver" | "record_exception" }>,
  ) => Promise<FulfillmentCommandResultV1>;
}>;

export type FulfillmentRewardsLifecycleV1 = Readonly<{
  reconcileDeliveredOrder: (input: Readonly<{
    orderId: string;
    now: Date;
  }>) => Promise<Readonly<{ status: "applied" | "idempotent" }>>;
}>;

type CommandInput = Readonly<{
  executionContext: unknown;
  repository: FulfillmentCommandRepository;
  actorUserId: string | null;
  orderId: string;
  now: Date;
  correlationId: string;
  authorize: () => Promise<FulfillmentCommandActorV1>;
  rewardsLifecycle?: FulfillmentRewardsLifecycleV1;
}>;

function boundedText(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length >= 1 &&
    value.length <= 200 &&
    value.trim() === value &&
    !/[\u0000-\u001f\u007f]/u.test(value)
  );
}

async function execute(
  input: CommandInput,
  action: "clear" | "handoff" | "deliver" | "record_exception",
): Promise<FulfillmentCommandResultV1> {
  const authority = projectFulfillmentExecutionContextV1(
    input.executionContext,
  );
  if (
    authority?.enabled !== true ||
    !isCanonicalUuid(input.actorUserId) ||
    !isCanonicalUuid(input.orderId) ||
    !Number.isFinite(input.now.getTime()) ||
    !boundedText(input.correlationId)
  ) {
    return Object.freeze({ status: "unavailable" as const });
  }
  const authorized = await input.authorize();
  if (
    authorized.actorUserId !== input.actorUserId ||
    !boundedText(authorized.actorClerkUserId)
  ) {
    return Object.freeze({ status: "unavailable" as const });
  }
  const common = Object.freeze({
    actorUserId: authorized.actorUserId,
    actorClerkUserId: authorized.actorClerkUserId,
    orderId: input.orderId,
    now: input.now,
    correlationId: input.correlationId,
  });
  if (action === "clear") return input.repository.clearHold(common);
  if (action === "handoff") return input.repository.handoff(common);
  const result = await input.repository.transitionShipment({
    ...common,
    action,
  });
  if (
    action === "deliver" &&
    (result.status === "delivered" || result.status === "already_delivered")
  ) {
    if (input.rewardsLifecycle === undefined) {
      return Object.freeze({ status: "conflict" as const });
    }
    try {
      await input.rewardsLifecycle.reconcileDeliveredOrder({
        orderId: input.orderId,
        now: input.now,
      });
    } catch {
      return Object.freeze({ status: "conflict" as const });
    }
  }
  return result;
}

export function clearFulfillmentHold(
  input: CommandInput,
): Promise<FulfillmentCommandResultV1> {
  return execute(input, "clear");
}

export function handoffFulfillment(
  input: CommandInput,
): Promise<FulfillmentCommandResultV1> {
  return execute(input, "handoff");
}

export function markShipmentDelivered(
  input: CommandInput,
): Promise<FulfillmentCommandResultV1> {
  return execute(input, "deliver");
}

export function recordShipmentException(
  input: CommandInput,
): Promise<FulfillmentCommandResultV1> {
  return execute(input, "record_exception");
}
