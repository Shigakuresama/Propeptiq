import { describe, expect, it, vi } from "vitest";

import { parseServerEnv } from "@/config/env-schema";
import type { PaymentProvider, RefundProviderResult } from "@/commerce/payment-provider";
import { createProviderExecutionContextV1 } from "@/commerce/provider-context";
import type { ProviderRefundRequestV1 } from "@/commerce/provider-contracts";

import {
  projectRefundProviderResultV1,
  submitOrRecoverRefund,
  type RefundClaimDescriptorV1,
  type RefundCommandRepository,
  type RefundCommandResultV1,
} from "./refund-service";

const ids = {
  actor: "76000000-0000-4000-8000-000000000001",
  otherActor: "76000000-0000-4000-8000-000000000002",
  order: "76000000-0000-4000-8000-000000000003",
  refund: "76000000-0000-4000-8000-000000000004",
  payment: "76000000-0000-4000-8000-000000000005",
} as const;
const now = new Date("2026-08-26T12:00:00.000Z");

const request: ProviderRefundRequestV1 = Object.freeze({
  schemaVersion: 1,
  provider: "local_test",
  refundId: ids.refund,
  orderId: ids.order,
  amountMinor: 1200,
  currency: "usd",
  paymentIntentId: "pi_synthetic_refund_target",
  chargeId: null,
  metadata: Object.freeze({ orderId: ids.order, refundId: ids.refund }),
  providerIdempotencyKey: `refund_request:${ids.refund}`,
});

function descriptor(
  overrides: Partial<RefundClaimDescriptorV1> = {},
): RefundClaimDescriptorV1 {
  return Object.freeze({
    operation: "create" as const,
    actorUserId: ids.actor,
    actorClerkUserId: "clerk_staff_6f",
    refundId: ids.refund,
    orderId: ids.order,
    verifiedPaymentEventId: ids.payment,
    request,
    requestHash: "a".repeat(64),
    expectedAttempt: 1,
    expectedProviderContext: Object.freeze({
      provider: "local_test" as const,
      livemode: false,
      scope: "local_test:synthetic-propeptiq-v1",
    }),
    ...overrides,
  });
}

function fakeProvider(result: unknown): PaymentProvider {
  return Object.freeze({
    context: Object.freeze({
      provider: "local_test" as const,
      livemode: false,
      scope: "local_test:synthetic-propeptiq-v1",
    }),
    createCheckoutSession: vi.fn(async () => {
      throw new Error("checkout is outside this test");
    }),
    retrieveCheckoutSession: vi.fn(async () => {
      throw new Error("checkout is outside this test");
    }),
    createRefund: vi.fn(async () => result as RefundProviderResult),
    retrieveRefund: vi.fn(async () => result as RefundProviderResult),
  });
}

async function providerContext(adapter: PaymentProvider, actor: string = ids.actor) {
  const result = await createProviderExecutionContextV1({
    environment: parseServerEnv({
      APP_ENV: "local",
      LOCAL_TEST_DRIVER: "enabled",
      LOCAL_TEST_SECRET: "task6f-local-secret-at-least-32-characters",
      RATE_LIMIT_SECRET: "task6f-rate-limit-at-least-32-characters",
    }),
    identity: {
      clerkUserId: "clerk_staff_6f",
      primaryEmail: "staff@example.test",
      emailVerifiedAt: "2026-08-26T11:00:00.000Z",
      mfaConfigured: true,
      secondFactorCompleted: true,
    },
    now,
    resolveDatabaseUsersByClerkId: vi.fn(async () => [actor]),
    adapters: { stripe: null, localTest: adapter },
  });
  if (!result.ok) throw new Error("test provider context was not minted");
  return result.context;
}

function repository(
  claimResult: Awaited<ReturnType<RefundCommandRepository["claim"]>> = {
    status: "call_required",
    descriptor: descriptor(),
  },
) {
  return {
    claim: vi.fn(async () => claimResult),
    applyResult: vi.fn(
      async (): Promise<RefundCommandResultV1> => ({ status: "submitted" }),
    ),
  } satisfies RefundCommandRepository;
}

function authorization() {
  return vi.fn(async () => ({
    actorUserId: ids.actor,
    actorClerkUserId: "clerk_staff_6f",
  }));
}

describe("refund submission and recovery", () => {
  it("rejects a disabled or actor-mismatched provider context before authorization or repository mutation", async () => {
    const adapter = fakeProvider({
      status: "provider_unknown",
      knownProviderRefundId: null,
      evidenceCode: "provider_sdk_unknown",
    });
    for (const context of [
      Object.freeze({}),
      await providerContext(adapter, ids.otherActor),
    ]) {
      const repo = repository();
      const authorize = authorization();
      await expect(
        submitOrRecoverRefund({
          repository: repo,
          providerContext: context,
          actorUserId: ids.actor,
          refundId: ids.refund,
          now,
          authorize,
        }),
      ).resolves.toEqual({ status: "unavailable" });
      expect(authorize).not.toHaveBeenCalled();
      expect(repo.claim).not.toHaveBeenCalled();
      expect(adapter.createRefund).not.toHaveBeenCalled();
    }
  });

  it("awaits the Transaction A runner promise before making exactly one provider call", async () => {
    const adapter = fakeProvider({
      status: "provider_unknown",
      knownProviderRefundId: null,
      evidenceCode: "provider_sdk_unknown",
    });
    const context = await providerContext(adapter);
    let releaseClaim!: (value: Awaited<ReturnType<RefundCommandRepository["claim"]>>) => void;
    const claim = vi.fn(
      () => new Promise<Awaited<ReturnType<RefundCommandRepository["claim"]>>>((resolve) => {
        releaseClaim = resolve;
      }),
    );
    const repo = {
      claim,
      applyResult: vi.fn(async () => ({ status: "submitted" as const })),
    } satisfies RefundCommandRepository;
    const pending = submitOrRecoverRefund({
      repository: repo,
      providerContext: context,
      actorUserId: ids.actor,
      refundId: ids.refund,
      now,
      authorize: authorization(),
    });
    await vi.waitFor(() => expect(claim).toHaveBeenCalledTimes(1));
    expect(adapter.createRefund).not.toHaveBeenCalled();
    releaseClaim({ status: "call_required", descriptor: descriptor() });
    await expect(pending).resolves.toEqual({ status: "submitted" });
    expect(adapter.createRefund).toHaveBeenCalledTimes(1);
    expect(repo.applyResult).toHaveBeenCalledTimes(1);
  });

  it("makes no provider call when Transaction A rejects or returns a terminal replay", async () => {
    const adapter = fakeProvider({
      status: "provider_unknown",
      knownProviderRefundId: null,
      evidenceCode: "provider_sdk_unknown",
    });
    const context = await providerContext(adapter);
    const rollbackRepo = repository();
    rollbackRepo.claim.mockRejectedValueOnce(
      Object.assign(new Error("ambiguous commit"), { code: "08006" }),
    );
    await expect(
      submitOrRecoverRefund({
        repository: rollbackRepo,
        providerContext: context,
        actorUserId: ids.actor,
        refundId: ids.refund,
        now,
        authorize: authorization(),
      }),
    ).rejects.toThrow(/ambiguous commit/i);
    const terminalRepo = repository({
      status: "terminal",
      refundStatus: "succeeded",
    });
    await expect(
      submitOrRecoverRefund({
        repository: terminalRepo,
        providerContext: context,
        actorUserId: ids.actor,
        refundId: ids.refund,
        now,
        authorize: authorization(),
      }),
    ).resolves.toEqual({ status: "terminal", refundStatus: "succeeded" });
    expect(adapter.createRefund).not.toHaveBeenCalled();
    expect(adapter.retrieveRefund).not.toHaveBeenCalled();
  });

  it("uses exact create/retrieve authority and leaves reward reversal to the signed event", async () => {
    const normalized = {
      status: "normalized",
      refund: {
        provider: "local_test",
        providerRefundId: "re_synthetic_exact",
        paymentIntentId: request.paymentIntentId,
        chargeId: "ch_ancillary_synthetic",
        amount: request.amountMinor,
        currency: "usd",
        status: "succeeded",
        livemode: false,
      },
    } as const;
    const adapter = fakeProvider(normalized);
    const context = await providerContext(adapter);
    const createRepo = repository();
    createRepo.applyResult.mockResolvedValueOnce({ status: "awaiting_signed_event" });
    await expect(
      submitOrRecoverRefund({
        repository: createRepo,
        providerContext: context,
        actorUserId: ids.actor,
        refundId: ids.refund,
        now,
        authorize: authorization(),
      }),
    ).resolves.toEqual({ status: "awaiting_signed_event" });
    expect(adapter.createRefund).toHaveBeenCalledWith(
      request,
      `refund_request:${ids.refund}`,
    );
    expect(createRepo.applyResult).toHaveBeenCalledTimes(1);
    const appliedPayload = (
      createRepo.applyResult.mock.calls as unknown as readonly (readonly [unknown])[]
    )[0]?.[0];
    expect(JSON.stringify(appliedPayload)).not.toMatch(
      /reward|points|ledger/i,
    );

    const retrieveRepo = repository({
      status: "call_required",
      descriptor: descriptor({
        operation: "retrieve",
        knownProviderRefundId: "re_synthetic_exact",
        expectedAttempt: 2,
      }),
    });
    await submitOrRecoverRefund({
      repository: retrieveRepo,
      providerContext: context,
      actorUserId: ids.actor,
      refundId: ids.refund,
      now,
      authorize: authorization(),
    });
    expect(adapter.retrieveRefund).toHaveBeenCalledWith({
      knownProviderRefundId: "re_synthetic_exact",
      expectedRequest: request,
      expectedProviderContext: descriptor().expectedProviderContext,
    });
  });

  it("strictly projects only descriptor-coherent exact-own-key provider results", () => {
    const expected = descriptor();
    const valid = {
      status: "normalized",
      refund: {
        provider: "local_test",
        providerRefundId: "re_synthetic_exact",
        paymentIntentId: request.paymentIntentId,
        chargeId: null,
        amount: 1200,
        currency: "usd",
        status: "pending",
        livemode: false,
      },
    };
    expect(projectRefundProviderResultV1(valid, expected)).toEqual({
      kind: "normalized",
      providerRefundId: "re_synthetic_exact",
      status: "pending",
    });
    expect(
      projectRefundProviderResultV1(
        {
          status: "provider_unknown",
          knownProviderRefundId: "re_synthetic_exact",
          evidenceCode: "provider_transport_unknown",
        },
        expected,
      ),
    ).toEqual({ kind: "provider_unknown", providerRefundId: "re_synthetic_exact" });

    const inherited = Object.create({ raw: "private" }) as Record<string, unknown>;
    Object.assign(inherited, valid);
    const invalid = [
      { ...valid, raw: "private" },
      { ...valid, refund: { ...valid.refund, provider: "stripe" } },
      { ...valid, refund: { ...valid.refund, paymentIntentId: "pi_wrong" } },
      { ...valid, refund: { ...valid.refund, amount: 1199 } },
      { ...valid, refund: { ...valid.refund, currency: "eur" } },
      { ...valid, refund: { ...valid.refund, livemode: true } },
      { ...valid, refund: { ...valid.refund, status: "unknown" } },
      inherited,
      {
        status: "definite_rejection",
        evidenceCode: "create_rejected_4xx",
        providerRequestId: "req_synthetic",
        extra: true,
      },
    ];
    for (const value of invalid) {
      expect(projectRefundProviderResultV1(value, expected)).toBeNull();
    }
    expect(
      projectRefundProviderResultV1(
        {
          status: "definite_rejection",
          evidenceCode: "create_rejected_4xx",
          providerRequestId: null,
        },
        descriptor({
          operation: "retrieve",
          knownProviderRefundId: "re_synthetic_exact",
        }),
      ),
    ).toBeNull();

    const inheritedRefund = Object.create({ metadata: "private" }) as Record<
      string,
      unknown
    >;
    Object.assign(inheritedRefund, valid.refund);
    expect(
      projectRefundProviderResultV1(
        { status: "normalized", refund: inheritedRefund },
        expected,
      ),
    ).toBeNull();
    expect(
      projectRefundProviderResultV1(
        Object.assign(
          Object.create({ raw: "private" }) as Record<string, unknown>,
          {
            status: "provider_unknown",
            knownProviderRefundId: null,
            evidenceCode: "provider_transport_unknown",
          },
        ),
        expected,
      ),
    ).toBeNull();
    expect(
      projectRefundProviderResultV1(
        {
          status: "provider_unknown",
          knownProviderRefundId: "re_wrong_retrieve",
          evidenceCode: "provider_transport_unknown",
        },
        descriptor({
          operation: "retrieve",
          knownProviderRefundId: "re_synthetic_exact",
        }),
      ),
    ).toBeNull();
  });

  it("rejects a repository descriptor with a noncanonical refund request before the provider call", async () => {
    const adapter = fakeProvider({
      status: "provider_unknown",
      knownProviderRefundId: null,
      evidenceCode: "provider_sdk_unknown",
    });
    const malformedRequest = Object.freeze({
      ...request,
      amountMinor: 0,
      metadata: Object.freeze({
        orderId: ids.order,
        refundId: ids.otherActor,
      }),
    }) as ProviderRefundRequestV1;
    const repo = repository({
      status: "call_required",
      descriptor: descriptor({ request: malformedRequest }),
    });
    await expect(
      submitOrRecoverRefund({
        repository: repo,
        providerContext: await providerContext(adapter),
        actorUserId: ids.actor,
        refundId: ids.refund,
        now,
        authorize: authorization(),
      }),
    ).resolves.toEqual({ status: "conflict" });
    expect(adapter.createRefund).not.toHaveBeenCalled();
    expect(repo.applyResult).not.toHaveBeenCalled();
  });

  it("reduces thrown or cyclic provider values to one fixed non-leaking outcome", async () => {
    const sentinel = "SECRET_EMAIL_address_tracking_raw_metadata_sentinel";
    const cyclic = new Error(sentinel) as Error & { raw?: unknown; self?: unknown };
    cyclic.raw = { email: sentinel, address: sentinel, tracking: sentinel };
    cyclic.self = cyclic;
    const adapter = fakeProvider(null);
    vi.mocked(adapter.createRefund).mockRejectedValueOnce(cyclic);
    const repo = repository();
    const result = await submitOrRecoverRefund({
      repository: repo,
      providerContext: await providerContext(adapter),
      actorUserId: ids.actor,
      refundId: ids.refund,
      now,
      authorize: authorization(),
    });
    expect(result).toEqual({ status: "provider_refund_result_invalid" });
    expect(JSON.stringify(result)).not.toContain(sentinel);
    expect(repo.applyResult).not.toHaveBeenCalled();
  });

  it("reduces returned cyclic/enumerable provider data without logging or persisting sentinels", async () => {
    const sentinel = "SECRET_EMAIL_address_tracking_raw_metadata_returned";
    const returned: Record<string, unknown> = {
      status: "provider_unknown",
      knownProviderRefundId: null,
      evidenceCode: "provider_sdk_unknown",
      metadata: { email: sentinel, address: sentinel, tracking: sentinel },
    };
    returned.self = returned;
    const adapter = fakeProvider(returned);
    const repo = repository();
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const result = await submitOrRecoverRefund({
      repository: repo,
      providerContext: await providerContext(adapter),
      actorUserId: ids.actor,
      refundId: ids.refund,
      now,
      authorize: authorization(),
    });
    expect(result).toEqual({ status: "provider_refund_result_invalid" });
    expect(JSON.stringify(result)).not.toContain(sentinel);
    expect(repo.applyResult).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
    error.mockRestore();
    warn.mockRestore();
    log.mockRestore();
  });
});
