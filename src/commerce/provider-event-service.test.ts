import Stripe from "stripe";
import { describe, expect, it, vi } from "vitest";

import {
  createProviderEventIngressV1,
  createProviderEventServiceV1,
} from "@/commerce/provider-event-service";
import {
  createProviderEventAuthorityV1,
} from "@/commerce/stripe-webhook-verifier";
import { parseServerEnv } from "@/config/env-schema";

const secret = "whsec_synthetic_6e_service_offline";
const now = new Date("2026-08-25T12:00:00.000Z");

function authority() {
  const value = createProviderEventAuthorityV1(parseServerEnv({
    APP_ENV: "local",
    PAYMENTS_MODE: "test",
    STRIPE_ACCOUNT_ID: "acct_synthetic123",
    STRIPE_SECRET_KEY: "sk_test_synthetic_6e_service",
    STRIPE_WEBHOOK_SECRET: secret,
  }));
  if (value === null) throw new Error("missing synthetic event authority");
  return value;
}

function delivery() {
  const text = JSON.stringify({
    id: "evt_synthetic_6e_service",
    type: "customer.created",
    created: Math.floor(now.getTime() / 1_000),
    livemode: false,
    data: { object: { email: "discard@example.test" } },
  });
  return {
    exactPayload: Uint8Array.from(new TextEncoder().encode(text)),
    signature: Stripe.webhooks.generateTestHeaderString({
      payload: text,
      secret,
      timestamp: Math.floor(now.getTime() / 1_000),
    }),
  };
}

function rewardBearingDelivery() {
  const text = JSON.stringify({
    id: "evt_synthetic_6e_reward_bearing",
    type: "checkout.session.completed",
    created: Math.floor(now.getTime() / 1_000),
    livemode: false,
    data: {
      object: {
        id: "cs_synthetic_6e_reward_bearing",
        client_reference_id: "78000000-0000-4000-8000-000000000041",
        metadata: {
          orderId: "78000000-0000-4000-8000-000000000041",
          attemptId: "78000000-0000-4000-8000-000000000042",
        },
        payment_intent: "pi_synthetic_6e_reward_bearing",
        amount_total: 5_000,
        currency: "usd",
        payment_status: "paid",
        status: "complete",
        livemode: false,
      },
    },
  });
  return {
    exactPayload: Uint8Array.from(new TextEncoder().encode(text)),
    signature: Stripe.webhooks.generateTestHeaderString({
      payload: text,
      secret,
      timestamp: Math.floor(now.getTime() / 1_000),
    }),
  };
}

describe("provider event ingress service", () => {
  it("verifies and normalizes before hashing exact bytes and calling Transaction A", async () => {
    const registration = vi.fn(async (repositoryInput: unknown) => {
      void repositoryInput;
      return { status: "processed" as const };
    });
    const byteHasher = vi.fn(async (exactPayload: Uint8Array) => {
      void exactPayload;
      return "a".repeat(64);
    });
    const uuid = vi
      .fn()
      .mockReturnValueOnce("78000000-0000-4000-8000-000000000001")
      .mockReturnValueOnce("78000000-0000-4000-8000-000000000002");
    const input = delivery();
    const service = createProviderEventIngressV1({
      authority: authority(),
      repository: { registerAndClaim: registration },
      sha256Bytes: byteHasher,
      clock: () => now,
      uuid,
      leaseToken: () => "lease_synthetic_6e_service",
    });

    await expect(service.verifyAndRegister(input)).resolves.toEqual({
      status: "processed",
    });
    expect(byteHasher).toHaveBeenCalledTimes(1);
    expect(byteHasher.mock.calls[0]?.[0]).toBe(input.exactPayload);
    expect(registration).toHaveBeenCalledWith(expect.objectContaining({
      databaseEventId: "78000000-0000-4000-8000-000000000001",
      conflictAuditId: "78000000-0000-4000-8000-000000000002",
      payloadHash: "a".repeat(64),
      normalization: expect.objectContaining({
        status: "normalized",
        event: expect.objectContaining({
          kind: "ignored",
          providerEventId: "evt_synthetic_6e_service",
        }),
      }),
      receivedAt: now,
      claimAt: now,
      leaseToken: "lease_synthetic_6e_service",
      leaseExpiresAt: new Date("2026-08-25T12:01:00.000Z"),
    }));
    expect(JSON.stringify(registration.mock.calls[0]?.[0])).not.toMatch(
      /email|discard|signature|whsec/i,
    );
  });

  it("makes invalid signature and invalid common identity indistinguishable with zero repository calls", async () => {
    const registration = vi.fn();
    const byteHasher = vi.fn(async () => "a".repeat(64));
    const service = createProviderEventIngressV1({
      authority: authority(),
      repository: { registerAndClaim: registration },
      sha256Bytes: byteHasher,
      clock: () => now,
      uuid: () => "78000000-0000-4000-8000-000000000001",
      leaseToken: () => "lease_synthetic_6e_service",
    });

    const valid = delivery();
    await expect(service.verifyAndRegister({
      ...valid,
      signature: "invalid_synthetic_signature",
    })).resolves.toEqual({ status: "invalid_delivery" });

    const invalidCommonText = JSON.stringify({
      id: " ",
      type: "customer.created",
      created: Math.floor(now.getTime() / 1_000),
      livemode: false,
      data: { object: {} },
    });
    await expect(service.verifyAndRegister({
      exactPayload: Uint8Array.from(new TextEncoder().encode(invalidCommonText)),
      signature: Stripe.webhooks.generateTestHeaderString({
        payload: invalidCommonText,
        secret,
        timestamp: Math.floor(now.getTime() / 1_000),
      }),
    })).resolves.toEqual({ status: "invalid_delivery" });

    expect(registration).not.toHaveBeenCalled();
    expect(byteHasher).not.toHaveBeenCalled();
  });

  it("is unavailable without an event authority and performs no work", async () => {
    const registration = vi.fn();
    const byteHasher = vi.fn();
    const service = createProviderEventIngressV1({
      authority: null,
      repository: { registerAndClaim: registration },
      sha256Bytes: byteHasher,
      clock: () => now,
      uuid: () => "78000000-0000-4000-8000-000000000001",
      leaseToken: () => "lease_synthetic_6e_service",
    });
    await expect(service.verifyAndRegister(delivery())).resolves.toEqual({
      status: "unavailable",
    });
    expect(registration).not.toHaveBeenCalled();
    expect(byteHasher).not.toHaveBeenCalled();
  });

  it("processes an opaque claim only after Transaction A commits", async () => {
    const calls: string[] = [];
    const claim = Object.freeze({ toJSON: () => { throw new Error("synthetic"); } }) as never;
    const repository = {
      registerAndClaim: vi.fn(async () => {
        calls.push("register");
        return { status: "claimed" as const, claim };
      }),
      processClaim: vi.fn(async () => {
        calls.push("process");
        return { status: "processed" as const };
      }),
      markClaimFailed: vi.fn(),
    };
    const service = createProviderEventServiceV1({
      authority: authority(),
      repository,
      sha256Bytes: async () => "a".repeat(64),
      clock: () => now,
      uuid: vi
        .fn()
        .mockReturnValueOnce("78000000-0000-4000-8000-000000000011")
        .mockReturnValueOnce("78000000-0000-4000-8000-000000000012"),
      leaseToken: () => "lease_synthetic_6e_full_service",
      rewardsLifecycle: {
        reconcileProcessedProviderEvent: vi.fn(async (input) => {
          calls.push(`rewards:${input.providerEventId}`);
          return { status: "applied" as const };
        }),
      },
    });
    await expect(service.handleDelivery(delivery())).resolves.toEqual({
      status: "processed",
    });
    expect(calls).toEqual([
      "register",
      "process",
      "rewards:evt_synthetic_6e_service",
    ]);
    expect(repository.processClaim).toHaveBeenCalledWith({
      claim,
      authority: expect.any(Object),
      now,
    });
    expect(repository.markClaimFailed).not.toHaveBeenCalled();
  });

  it("reconciles rewards on an already-processed verified replay without reprocessing the provider journal", async () => {
    const rewards = vi.fn(async () => ({ status: "idempotent" as const }));
    const repository = {
      registerAndClaim: vi.fn(async () => ({ status: "processed" as const })),
      processClaim: vi.fn(),
      markClaimFailed: vi.fn(),
    };
    const service = createProviderEventServiceV1({
      authority: authority(),
      repository,
      sha256Bytes: async () => "a".repeat(64),
      clock: () => now,
      uuid: vi
        .fn()
        .mockReturnValueOnce("78000000-0000-4000-8000-000000000031")
        .mockReturnValueOnce("78000000-0000-4000-8000-000000000032"),
      leaseToken: () => "lease_synthetic_6e_full_service_replay",
      rewardsLifecycle: { reconcileProcessedProviderEvent: rewards },
    });

    await expect(service.handleDelivery(delivery())).resolves.toEqual({
      status: "processed",
    });
    expect(repository.processClaim).not.toHaveBeenCalled();
    expect(rewards).toHaveBeenCalledTimes(1);
    expect(rewards).toHaveBeenCalledWith({
      provider: "stripe",
      providerEventId: "evt_synthetic_6e_service",
      now,
    });
  });

  it("does not report a processed reward-bearing payment when lifecycle reconciliation is omitted", async () => {
    const repository = {
      registerAndClaim: vi.fn(async () => ({ status: "processed" as const })),
      processClaim: vi.fn(),
      markClaimFailed: vi.fn(),
    };
    const service = createProviderEventServiceV1({
      authority: authority(),
      repository,
      sha256Bytes: async () => "a".repeat(64),
      clock: () => now,
      uuid: vi
        .fn()
        .mockReturnValueOnce("78000000-0000-4000-8000-000000000043")
        .mockReturnValueOnce("78000000-0000-4000-8000-000000000044"),
      leaseToken: () => "lease_synthetic_6e_missing_rewards",
    } as unknown as Parameters<typeof createProviderEventServiceV1>[0]);

    await expect(service.handleDelivery(rewardBearingDelivery())).resolves.toEqual({
      status: "retryable_failure",
    });
    expect(repository.processClaim).not.toHaveBeenCalled();
  });

  it("marks a still-owned lease failed in a separate call after Transaction B throws", async () => {
    const calls: string[] = [];
    const claim = Object.freeze({}) as never;
    const repository = {
      registerAndClaim: vi.fn(async () => ({ status: "claimed" as const, claim })),
      processClaim: vi.fn(async () => {
        calls.push("process_rolled_back");
        throw Object.assign(new Error("synthetic transaction crash"), { code: "synthetic" });
      }),
      markClaimFailed: vi.fn(async () => {
        calls.push("mark_failed");
        return { status: "applied" as const };
      }),
    };
    const service = createProviderEventServiceV1({
      authority: authority(),
      repository,
      sha256Bytes: async () => "a".repeat(64),
      clock: () => now,
      uuid: vi
        .fn()
        .mockReturnValueOnce("78000000-0000-4000-8000-000000000021")
        .mockReturnValueOnce("78000000-0000-4000-8000-000000000022"),
      leaseToken: () => "lease_synthetic_6e_full_service_failure",
      rewardsLifecycle: {
        reconcileProcessedProviderEvent: vi.fn(async () => ({ status: "idempotent" as const })),
      },
    });
    await expect(service.handleDelivery(delivery())).resolves.toEqual({
      status: "retryable_failure",
    });
    expect(calls).toEqual(["process_rolled_back", "mark_failed"]);
    expect(repository.markClaimFailed).toHaveBeenCalledWith(claim, {
      now,
      reason: "provider_event_processing_failed",
    });
  });
});
