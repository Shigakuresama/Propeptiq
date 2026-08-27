import { describe, expect, it, vi } from "vitest";

import type { AdminRepository } from "@/admin/admin-service";
import type { VerifiedIdentity } from "@/auth/identity";
import type { PaymentProvider } from "@/commerce/payment-provider";
import type { RefundCommandRepository } from "@/commerce/refund-service";
import type { FulfillmentCommandRepository } from "@/commerce/fulfillment-service";
import { parseServerEnv } from "@/config/env-schema";
import type { Principal } from "@/domain/authorization";

import { createStaffCommerceCommandRuntimeV1 } from "./staff-commerce-command-runtime";

const ids = {
  actor: "7c000000-0000-4000-8000-000000000001",
  order: "7c000000-0000-4000-8000-000000000002",
  refund: "7c000000-0000-4000-8000-000000000003",
} as const;
const now = new Date("2026-08-26T12:00:00.000Z");
const identity: VerifiedIdentity = Object.freeze({
  clerkUserId: "clerk_staff_runtime_6f",
  primaryEmail: "staff-runtime@example.test",
  emailVerifiedAt: "2026-08-26T11:00:00.000Z",
  mfaConfigured: true,
  secondFactorCompleted: true,
});
const principal: Principal = Object.freeze({
  actorId: ids.actor,
  clerkUserId: identity.clerkUserId,
  buyerStatus: null,
  capabilities: Object.freeze([
    "refund:request",
    "fulfillment:release:consume",
  ] as const),
  mfaSatisfied: true,
});

function adminRepository(rateIncrement: ReturnType<typeof vi.fn>): AdminRepository {
  return {
    rateLimitStore: { increment: rateIncrement },
    transaction: vi.fn(async () => {
      throw new Error("runtime authorization must not open an admin transaction");
    }),
    retrySerializableTransaction: vi.fn(async () => {
      throw new Error("runtime authorization must not open an admin transaction");
    }),
  } as unknown as AdminRepository;
}

function provider(): PaymentProvider {
  return Object.freeze({
    context: Object.freeze({
      provider: "local_test" as const,
      livemode: false,
      scope: "local_test:synthetic-propeptiq-v1",
    }),
    createCheckoutSession: vi.fn(async () => {
      throw new Error("checkout is outside Slice 6F runtime assembly");
    }),
    retrieveCheckoutSession: vi.fn(async () => {
      throw new Error("checkout is outside Slice 6F runtime assembly");
    }),
    createRefund: vi.fn(async () => {
      throw new Error("terminal replay must not call the provider");
    }),
    retrieveRefund: vi.fn(async () => {
      throw new Error("terminal replay must not call the provider");
    }),
  });
}

describe("server-only staff commerce command runtime", () => {
  it("keeps fulfillment assembly and execution independent of provider identity resolution", async () => {
    const rateIncrement = vi.fn(async () => 1);
    const resolveDatabaseUsersByClerkId = vi.fn(async () => {
      throw new Error("synthetic provider identity resolver outage");
    });
    const refundRepository = {
      claim: vi.fn(),
      applyResult: vi.fn(),
    } as unknown as RefundCommandRepository;
    const fulfillmentRepository = {
      clearHold: vi.fn(async () => ({ status: "cleared" as const })),
      handoff: vi.fn(async () => ({ status: "handed_off" as const })),
      transitionShipment: vi.fn(async (command) => ({
        status: command.action === "deliver"
          ? "delivered" as const
          : "exception" as const,
      })),
    } satisfies FulfillmentCommandRepository;

    const runtime = await createStaffCommerceCommandRuntimeV1({
      environment: parseServerEnv({
        APP_ENV: "local",
        LOCAL_TEST_DRIVER: "enabled",
        LOCAL_TEST_SECRET: "task6f-local-secret-at-least-32-characters",
        RATE_LIMIT_SECRET: "task6f-rate-secret-at-least-32-characters",
        FULFILLMENT_MODE: "test",
      }),
      identity,
      principal,
      now,
      correlationId: "runtime-provider-independent-6f",
      adminRepository: adminRepository(rateIncrement),
      refundRepository,
      fulfillmentRepository,
      resolveDatabaseUsersByClerkId,
      adapters: { stripe: null, localTest: provider() },
    });

    await expect(runtime.clearFulfillmentHold(ids.order)).resolves.toEqual({ status: "cleared" });
    await expect(runtime.handoffFulfillment(ids.order)).resolves.toEqual({ status: "handed_off" });
    await expect(runtime.markShipmentDelivered(ids.order)).resolves.toEqual({ status: "delivered" });
    await expect(runtime.recordShipmentException(ids.order)).resolves.toEqual({ status: "exception" });

    expect(resolveDatabaseUsersByClerkId).not.toHaveBeenCalled();
    expect(refundRepository.claim).not.toHaveBeenCalled();
    expect(refundRepository.applyResult).not.toHaveBeenCalled();
  });

  it("returns disabled before rate limiting, repository mutation, or provider calls", async () => {
    const rateIncrement = vi.fn(async () => 1);
    const refundRepository = {
      claim: vi.fn(),
      applyResult: vi.fn(),
    } as unknown as RefundCommandRepository;
    const fulfillmentRepository = {
      clearHold: vi.fn(),
      handoff: vi.fn(),
      transitionShipment: vi.fn(),
    } as unknown as FulfillmentCommandRepository;
    const adapter = provider();
    const runtime = await createStaffCommerceCommandRuntimeV1({
      environment: parseServerEnv({ APP_ENV: "local" }),
      identity,
      principal,
      now,
      correlationId: "runtime-disabled-6f",
      adminRepository: adminRepository(rateIncrement),
      refundRepository,
      fulfillmentRepository,
      resolveDatabaseUsersByClerkId: vi.fn(async () => [ids.actor]),
      adapters: { stripe: null, localTest: adapter },
    });

    await expect(runtime.submitOrRecoverRefund(ids.refund)).resolves.toEqual({ status: "unavailable" });
    await expect(runtime.clearFulfillmentHold(ids.order)).resolves.toEqual({ status: "unavailable" });
    await expect(runtime.handoffFulfillment(ids.order)).resolves.toEqual({ status: "unavailable" });
    await expect(runtime.markShipmentDelivered(ids.order)).resolves.toEqual({ status: "unavailable" });
    await expect(runtime.recordShipmentException(ids.order)).resolves.toEqual({ status: "unavailable" });

    expect(rateIncrement).not.toHaveBeenCalled();
    expect(refundRepository.claim).not.toHaveBeenCalled();
    expect(refundRepository.applyResult).not.toHaveBeenCalled();
    expect(fulfillmentRepository.clearHold).not.toHaveBeenCalled();
    expect(fulfillmentRepository.handoff).not.toHaveBeenCalled();
    expect(fulfillmentRepository.transitionShipment).not.toHaveBeenCalled();
    expect(adapter.createRefund).not.toHaveBeenCalled();
    expect(adapter.retrieveRefund).not.toHaveBeenCalled();
  });

  it("reuses exact staff authorization and dispatches all five closed commands", async () => {
    const rateIncrement = vi.fn(async () => 1);
    const refundRepository = {
      claim: vi.fn(async () => ({
        status: "terminal" as const,
        refundStatus: "succeeded" as const,
      })),
      applyResult: vi.fn(),
    } as unknown as RefundCommandRepository;
    const fulfillmentRepository = {
      clearHold: vi.fn(async () => ({ status: "cleared" as const })),
      handoff: vi.fn(async () => ({ status: "handed_off" as const })),
      transitionShipment: vi.fn(async (command) => ({
        status: command.action === "deliver"
          ? "delivered" as const
          : "exception" as const,
      })),
    } satisfies FulfillmentCommandRepository;
    const adapter = provider();
    const runtime = await createStaffCommerceCommandRuntimeV1({
      environment: parseServerEnv({
        APP_ENV: "local",
        LOCAL_TEST_DRIVER: "enabled",
        LOCAL_TEST_SECRET: "task6f-local-secret-at-least-32-characters",
        RATE_LIMIT_SECRET: "task6f-rate-secret-at-least-32-characters",
        FULFILLMENT_MODE: "test",
      }),
      identity,
      principal,
      now,
      correlationId: "runtime-enabled-6f",
      adminRepository: adminRepository(rateIncrement),
      refundRepository,
      fulfillmentRepository,
      resolveDatabaseUsersByClerkId: vi.fn(async () => [ids.actor]),
      adapters: { stripe: null, localTest: adapter },
    });

    await expect(runtime.submitOrRecoverRefund(ids.refund)).resolves.toEqual({
      status: "terminal",
      refundStatus: "succeeded",
    });
    await expect(runtime.clearFulfillmentHold(ids.order)).resolves.toEqual({ status: "cleared" });
    await expect(runtime.handoffFulfillment(ids.order)).resolves.toEqual({ status: "handed_off" });
    await expect(runtime.markShipmentDelivered(ids.order)).resolves.toEqual({ status: "delivered" });
    await expect(runtime.recordShipmentException(ids.order)).resolves.toEqual({ status: "exception" });

    expect(rateIncrement).toHaveBeenCalledTimes(5);
    expect(refundRepository.claim).toHaveBeenCalledWith(expect.objectContaining({
      refundId: ids.refund,
      actorUserId: ids.actor,
      actorClerkUserId: identity.clerkUserId,
    }));
    expect(fulfillmentRepository.clearHold).toHaveBeenCalledWith(expect.objectContaining({
      orderId: ids.order,
      actorUserId: ids.actor,
      actorClerkUserId: identity.clerkUserId,
      now,
      correlationId: "runtime-enabled-6f",
    }));
    expect(fulfillmentRepository.transitionShipment).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ action: "deliver" }),
    );
    expect(fulfillmentRepository.transitionShipment).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ action: "record_exception" }),
    );
    expect(adapter.createRefund).not.toHaveBeenCalled();
    expect(adapter.retrieveRefund).not.toHaveBeenCalled();
  });
});
