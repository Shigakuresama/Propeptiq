import { describe, expect, it, vi } from "vitest";

import {
  createDownstreamEffectWorkerV1,
  parseAllowlistedDownstreamEffectV1,
} from "@/commerce/downstream-effect-worker";
import type {
  DownstreamEffectClaimV1,
  DownstreamEffectRepository,
} from "@/db/repositories/downstream-effect-repository";

const effectId = "7b000000-0000-4000-8000-000000000001";
const orderId = "7b000000-0000-4000-8000-000000000002";
const paymentEventId = "7b000000-0000-4000-8000-000000000003";
const shipmentId = "7b000000-0000-4000-8000-000000000004";
const fulfillmentReleaseId = "7b000000-0000-4000-8000-000000000005";
const now = new Date("2026-08-25T12:00:00.000Z");

function fakeRepository(input: Readonly<{
  effectType: string;
  payload: unknown;
  idempotencyKey?: string;
  status?: "pending" | "failed" | "processing" | "processed";
}>) {
  const claim = Object.freeze({}) as DownstreamEffectClaimV1;
  const repository = {
    describeEffect: vi.fn(async () => ({
      effectId,
      effectType: input.effectType,
      status: input.status ?? "pending",
    })),
    claimEffect: vi.fn(async () => ({
      status: "claimed" as const,
      claim,
      delivery: {
        effectType: input.effectType,
        payload: input.payload,
        idempotencyKey: input.idempotencyKey ?? `effect:${effectId}:synthetic`,
      },
    })),
    completeClaim: vi.fn(async () => ({ status: "applied" as const })),
    failClaim: vi.fn(async () => ({ status: "applied" as const })),
  } as unknown as DownstreamEffectRepository;
  return { repository, claim };
}

describe("downstream effect worker", () => {
  it("allowlists only the exact privacy-safe fulfillment handoff delivery", () => {
    const exact = {
      effectType: "fulfillment_handed_off",
      payload: {
        schemaVersion: 1,
        orderId,
        shipmentId,
        fulfillmentReleaseId,
      },
      idempotencyKey: `fulfillment_release:${fulfillmentReleaseId}:handoff`,
    } as const;

    expect(parseAllowlistedDownstreamEffectV1(exact)).toEqual(exact);

    const invalid = [
      { ...exact, idempotencyKey: `fulfillment_release:${shipmentId}:handoff` },
      { ...exact, idempotencyKey: `fulfillment_release:${fulfillmentReleaseId}:delivered` },
      { ...exact, payload: { ...exact.payload, orderId: "not-a-uuid" } },
      { ...exact, payload: { ...exact.payload, shipmentId: "not-a-uuid" } },
      { ...exact, payload: { ...exact.payload, fulfillmentReleaseId: "not-a-uuid" } },
      { ...exact, payload: { ...exact.payload, reason: "handoff" } },
      { ...exact, payload: { ...exact.payload, trackingNumber: "forbidden" } },
      { ...exact, payload: { ...exact.payload, carrier: "forbidden" } },
      { ...exact, payload: { ...exact.payload, customerEmail: "forbidden@example.test" } },
    ];
    for (const delivery of invalid) {
      expect(parseAllowlistedDownstreamEffectV1(delivery)).toBeNull();
    }
  });

  it("leaves fulfillment handoff pending and unclaimed when the production sink is absent", async () => {
    const fixture = fakeRepository({
      effectType: "fulfillment_handed_off",
      payload: {
        schemaVersion: 1,
        orderId,
        shipmentId,
        fulfillmentReleaseId,
      },
      idempotencyKey: `fulfillment_release:${fulfillmentReleaseId}:handoff`,
    });
    const worker = createDownstreamEffectWorkerV1({
      repository: fixture.repository,
      sink: null,
      wakeDependencies: vi.fn(),
      clock: () => now,
      leaseToken: () => "effect_lease_synthetic_worker",
    });

    await expect(worker.runEffect(effectId)).resolves.toEqual({ status: "disabled" });
    expect(fixture.repository.claimEffect).not.toHaveBeenCalled();
  });

  it("leaves external effects pending and unclaimed when production sink is absent", async () => {
    const fixture = fakeRepository({
      effectType: "payment_verified",
      payload: {
        schemaVersion: 1,
        orderId,
        verifiedPaymentEventId: paymentEventId,
        reason: "payment_verified",
      },
    });
    const wake = vi.fn();
    const worker = createDownstreamEffectWorkerV1({
      repository: fixture.repository,
      sink: null,
      wakeDependencies: wake,
      clock: () => now,
      leaseToken: () => "effect_lease_synthetic_worker",
    });
    await expect(worker.runEffect(effectId)).resolves.toEqual({ status: "disabled" });
    expect(fixture.repository.claimEffect).not.toHaveBeenCalled();
    expect(wake).not.toHaveBeenCalled();
  });

  it("delivers an exact allowlisted external payload after claim and completes CAS", async () => {
    const payload = {
      schemaVersion: 1,
      orderId,
      paymentEventId,
      reason: "refund_verified",
    } as const;
    const fixture = fakeRepository({ effectType: "refund_verified", payload });
    const sink = vi.fn(async () => undefined);
    const worker = createDownstreamEffectWorkerV1({
      repository: fixture.repository,
      sink,
      wakeDependencies: vi.fn(),
      clock: () => now,
      leaseToken: () => "effect_lease_synthetic_worker",
    });
    await expect(worker.runEffect(effectId)).resolves.toEqual({ status: "processed" });
    expect(sink).toHaveBeenCalledWith({
      effectType: "refund_verified",
      payload,
      idempotencyKey: `effect:${effectId}:synthetic`,
    });
    expect(fixture.repository.completeClaim).toHaveBeenCalledWith(
      fixture.claim,
      { now },
    );
  });

  it("retries a successful delivery with the same key when completion loses its lease", async () => {
    const payload = {
      schemaVersion: 1,
      orderId,
      paymentEventId,
      reason: "refund_verified",
    } as const;
    const fixture = fakeRepository({ effectType: "refund_verified", payload });
    vi.mocked(fixture.repository.completeClaim).mockResolvedValue({
      status: "lease_lost",
    });
    const deliveredKeys: string[] = [];
    const worker = createDownstreamEffectWorkerV1({
      repository: fixture.repository,
      sink: async (delivery) => {
        deliveredKeys.push(delivery.idempotencyKey);
      },
      wakeDependencies: vi.fn(),
      clock: () => now,
      leaseToken: () => "effect_lease_synthetic_worker",
    });

    await expect(worker.runEffect(effectId)).resolves.toEqual({ status: "lease_lost" });
    await expect(worker.runEffect(effectId)).resolves.toEqual({ status: "lease_lost" });
    expect(deliveredKeys).toEqual([
      `effect:${effectId}:synthetic`,
      `effect:${effectId}:synthetic`,
    ]);
  });

  it("dispatches internal wake only to the internal handler and never to the sink", async () => {
    const fixture = fakeRepository({
      effectType: "wake_provider_dependencies",
      payload: { schemaVersion: 1, verifiedPaymentEventId: paymentEventId },
    });
    const sink = vi.fn();
    const wake = vi.fn(async () => undefined);
    const worker = createDownstreamEffectWorkerV1({
      repository: fixture.repository,
      sink,
      wakeDependencies: wake,
      clock: () => now,
      leaseToken: () => "effect_lease_synthetic_worker",
    });
    await expect(worker.runEffect(effectId)).resolves.toEqual({ status: "processed" });
    expect(wake).toHaveBeenCalledWith(paymentEventId);
    expect(sink).not.toHaveBeenCalled();
  });

  it("fails invalid payloads and sink errors with bounded redacted reasons", async () => {
    const invalid = fakeRepository({
      effectType: "refund_verified",
      payload: { schemaVersion: 1, orderId, rawProviderJson: { email: "forbidden" } },
    });
    const invalidWorker = createDownstreamEffectWorkerV1({
      repository: invalid.repository,
      sink: vi.fn(),
      wakeDependencies: vi.fn(),
      clock: () => now,
      leaseToken: () => "effect_lease_synthetic_worker",
    });
    await expect(invalidWorker.runEffect(effectId)).resolves.toEqual({ status: "failed" });
    expect(invalid.repository.failClaim).toHaveBeenCalledWith(invalid.claim, {
      now,
      reason: "invalid_effect_payload",
    });

    const crashing = fakeRepository({
      effectType: "refund_verified",
      payload: { schemaVersion: 1, orderId, paymentEventId, reason: "refund_verified" },
    });
    const deliveredKeys: string[] = [];
    const crashWorker = createDownstreamEffectWorkerV1({
      repository: crashing.repository,
      sink: async (delivery) => {
        deliveredKeys.push(delivery.idempotencyKey);
        throw new Error("synthetic post-delivery crash");
      },
      wakeDependencies: vi.fn(),
      clock: () => now,
      leaseToken: () => "effect_lease_synthetic_worker",
    });
    await expect(crashWorker.runEffect(effectId)).resolves.toEqual({ status: "failed" });
    await expect(crashWorker.runEffect(effectId)).resolves.toEqual({ status: "failed" });
    expect(deliveredKeys).toEqual([
      `effect:${effectId}:synthetic`,
      `effect:${effectId}:synthetic`,
    ]);
  });
});

describe("downstream effect worker tax recording", () => {
  const calculationReference = "taxcalc_synthetic6d";

  function exactTaxDelivery() {
    return {
      effectType: "stripe_tax_transaction",
      payload: {
        schemaVersion: 1,
        orderId,
        verifiedPaymentEventId: paymentEventId,
        calculationReference,
      },
      idempotencyKey: `payment_event:${paymentEventId}:stripe_tax_transaction`,
    } as const;
  }

  it("allowlists the exact tax recording delivery", () => {
    expect(parseAllowlistedDownstreamEffectV1(exactTaxDelivery())).toEqual(
      exactTaxDelivery(),
    );
  });

  it("rejects a tax delivery carrying a blank calculation reference", () => {
    expect(
      parseAllowlistedDownstreamEffectV1({
        ...exactTaxDelivery(),
        payload: { ...exactTaxDelivery().payload, calculationReference: "  " },
      }),
    ).toBeNull();
  });

  it("rejects a tax delivery carrying an unexpected extra field", () => {
    expect(
      parseAllowlistedDownstreamEffectV1({
        ...exactTaxDelivery(),
        payload: { ...exactTaxDelivery().payload, amountMinor: 321 },
      }),
    ).toBeNull();
  });

  it("delivers a claimed tax effect to the sink and completes it", async () => {
    const { repository, claim } = fakeRepository(exactTaxDelivery());
    const sink = vi.fn(async () => {});
    const worker = createDownstreamEffectWorkerV1({
      repository,
      sink,
      wakeDependencies: vi.fn(),
      clock: () => now,
      leaseToken: () => "lease_synthetic_tax",
    });

    await expect(worker.runEffect(effectId)).resolves.toEqual({
      status: "processed",
    });
    expect(sink).toHaveBeenCalledWith(exactTaxDelivery());
    expect(repository.completeClaim).toHaveBeenCalledWith(claim, { now });
    expect(repository.failClaim).not.toHaveBeenCalled();
  });
});

describe("downstream effect worker settlement and credit note", () => {
  it("allowlists the exact settlement window delivery", () => {
    const exact = {
      effectType: "settlement_window_elapsed",
      payload: {
        schemaVersion: 1,
        orderId,
        verifiedPaymentEventId: paymentEventId,
        closesAt: "2026-09-01T12:00:30.000Z",
      },
      idempotencyKey: `payment_event:${paymentEventId}:settlement_window_elapsed`,
    } as const;

    expect(parseAllowlistedDownstreamEffectV1(exact)).toEqual(exact);
  });

  it("allowlists the exact credit note delivery", () => {
    const exact = {
      effectType: "credit_note_recorded",
      payload: {
        schemaVersion: 1,
        orderId,
        creditNoteId: "cn_synthetic",
        invoiceId: "in_synthetic",
        amountMinor: 8_700,
      },
      idempotencyKey: "credit_note:cn_synthetic",
    } as const;

    expect(parseAllowlistedDownstreamEffectV1(exact)).toEqual(exact);
  });

  it("rejects a settlement delivery with a non-instant close time", () => {
    expect(
      parseAllowlistedDownstreamEffectV1({
        effectType: "settlement_window_elapsed",
        payload: {
          schemaVersion: 1,
          orderId,
          verifiedPaymentEventId: paymentEventId,
          closesAt: "soon",
        },
        idempotencyKey: `payment_event:${paymentEventId}:settlement_window_elapsed`,
      }),
    ).toBeNull();
  });

  it("rejects a credit note delivery carrying a negative amount", () => {
    expect(
      parseAllowlistedDownstreamEffectV1({
        effectType: "credit_note_recorded",
        payload: {
          schemaVersion: 1,
          orderId,
          creditNoteId: "cn_synthetic",
          invoiceId: "in_synthetic",
          amountMinor: -1,
        },
        idempotencyKey: "credit_note:cn_synthetic",
      }),
    ).toBeNull();
  });
});
