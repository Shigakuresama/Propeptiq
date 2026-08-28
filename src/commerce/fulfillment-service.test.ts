import { describe, expect, it, vi } from "vitest";

import { parseServerEnv } from "@/config/env-schema";
import { createFulfillmentExecutionContextV1 } from "@/commerce/fulfillment-context";

import {
  clearFulfillmentHold,
  handoffFulfillment,
  markShipmentDelivered,
  recordShipmentException,
  type FulfillmentCommandRepository,
} from "./fulfillment-service";

const actorUserId = "79000000-0000-4000-8000-000000000001";
const orderId = "79000000-0000-4000-8000-000000000002";
const now = new Date("2026-08-26T12:00:00.000Z");
const secret = "task6f-fulfillment-secret-at-least-32-characters";

function repository(): FulfillmentCommandRepository & {
  clearHold: ReturnType<typeof vi.fn>;
  handoff: ReturnType<typeof vi.fn>;
  transitionShipment: ReturnType<typeof vi.fn>;
} {
  return {
    clearHold: vi.fn(async () => ({ status: "cleared" as const })),
    handoff: vi.fn(async () => ({ status: "handed_off" as const })),
    transitionShipment: vi.fn(async (input) => ({
      status: input.action === "deliver"
        ? "delivered" as const
        : "exception" as const,
    })),
  };
}

function authority(enabled: boolean) {
  return createFulfillmentExecutionContextV1(
    parseServerEnv(
      enabled
        ? {
            APP_ENV: "local",
            LOCAL_TEST_DRIVER: "enabled",
            LOCAL_TEST_SECRET: secret,
            RATE_LIMIT_SECRET: secret,
            FULFILLMENT_MODE: "test",
          }
        : {},
    ),
  );
}

function authorize(actor = actorUserId) {
  return vi.fn(async () => ({
    actorUserId: actor,
    actorClerkUserId: "clerk_staff_6f",
  }));
}

const common = () => ({
  actorUserId,
  orderId,
  now,
  correlationId: "fulfillment-command-6f",
});

describe("fulfillment command orchestration", () => {
  it("rejects disabled/forged authority before authorization or repository mutation", async () => {
    for (const executionContext of [authority(false), { enabled: true }]) {
      const repo = repository();
      const authorization = authorize();
      await expect(
        handoffFulfillment({
          ...common(),
          executionContext,
          repository: repo,
          authorize: authorization,
        }),
      ).resolves.toEqual({ status: "unavailable" });
      expect(authorization).not.toHaveBeenCalled();
      expect(repo.handoff).not.toHaveBeenCalled();
    }
  });

  it("binds the authorized actor/clerk and exact captured command facts", async () => {
    const repo = repository();
    await expect(
      handoffFulfillment({
        ...common(),
        executionContext: authority(true),
        repository: repo,
        authorize: authorize(),
      }),
    ).resolves.toEqual({ status: "handed_off" });
    expect(repo.handoff).toHaveBeenCalledWith({
      actorUserId,
      actorClerkUserId: "clerk_staff_6f",
      orderId,
      now,
      correlationId: "fulfillment-command-6f",
    });
  });

  it("rejects authorization identity drift without a mutating repository call", async () => {
    const repo = repository();
    await expect(
      clearFulfillmentHold({
        ...common(),
        executionContext: authority(true),
        repository: repo,
        authorize: authorize("79000000-0000-4000-8000-000000000099"),
      }),
    ).resolves.toEqual({ status: "unavailable" });
    expect(repo.clearHold).not.toHaveBeenCalled();
  });

  it("routes clear, delivery, and exception through their exact closed commands", async () => {
    const repo = repository();
    const base = {
      ...common(),
      executionContext: authority(true),
      repository: repo,
      authorize: authorize(),
      rewardsLifecycle: {
        reconcileDeliveredOrder: vi.fn(async () => ({ status: "idempotent" as const })),
      },
    };
    await expect(clearFulfillmentHold(base)).resolves.toEqual({ status: "cleared" });
    await expect(markShipmentDelivered(base)).resolves.toEqual({ status: "delivered" });
    await expect(recordShipmentException(base)).resolves.toEqual({ status: "exception" });
    expect(repo.clearHold).toHaveBeenCalledTimes(1);
    expect(repo.transitionShipment).toHaveBeenNthCalledWith(1, {
      actorUserId,
      actorClerkUserId: "clerk_staff_6f",
      orderId,
      action: "deliver",
      now,
      correlationId: "fulfillment-command-6f",
    });
    expect(repo.transitionShipment).toHaveBeenNthCalledWith(2, {
      actorUserId,
      actorClerkUserId: "clerk_staff_6f",
      orderId,
      action: "record_exception",
      now,
      correlationId: "fulfillment-command-6f",
    });
  });

  it.each(["delivered", "already_delivered"] as const)(
    "reconciles pending rewards after a %s repository result",
    async (status) => {
      const repo = repository();
      repo.transitionShipment.mockResolvedValueOnce({ status });
      const reconcile = vi.fn(async () => ({ status: "applied" as const }));
      await expect(markShipmentDelivered({
        ...common(),
        executionContext: authority(true),
        repository: repo,
        authorize: authorize(),
        rewardsLifecycle: { reconcileDeliveredOrder: reconcile },
      })).resolves.toEqual({ status });
      expect(reconcile).toHaveBeenCalledWith({ orderId, now });
    },
  );

  it("does not report delivery success when reward reconciliation is omitted", async () => {
    const repo = repository();
    await expect(markShipmentDelivered({
      ...common(),
      executionContext: authority(true),
      repository: repo,
      authorize: authorize(),
    })).resolves.toEqual({ status: "conflict" });
    expect(repo.transitionShipment).toHaveBeenCalledTimes(1);
  });
});
