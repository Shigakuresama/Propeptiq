import { describe, expect, it } from "vitest";

import { evaluateCheckout } from "@/domain/eligibility";
import {
  evaluateFulfillment,
  type FulfillmentInput,
} from "@/domain/fulfillment";
import {
  transitionOrder,
  transitionPayment,
  transitionFulfillmentRelease,
  type FulfillmentReleaseSnapshot,
  type OrderEvent,
  type OrderSnapshot,
  type PaymentEvent,
  type PaymentSnapshot,
} from "@/domain/orders";

const allowedCheckoutDecision = evaluateCheckout({
  authenticated: true,
  buyerStatus: "active",
  acceptedAttestationVersion: "attestation-v1",
  currentAttestationVersion: "attestation-v1",
  items: [
    {
      productId: "synthetic-product-1",
      active: true,
      catalogComplete: true,
      destination: {
        status: "allowed",
        normalizedStateCode: "CA",
        ruleId: "synthetic-rule-1",
        ruleVersion: "policy-v1",
        scope: "product",
      },
      inventoryAvailable: true,
    },
  ],
  paymentProviderAvailable: true,
  reviewSnapshotHash: null,
  reviewDecision: null,
});
describe("Task 6A lean order and fulfillment-release contracts", () => {
  const now = "2026-08-24T12:00:00.000Z";
  const expiresAt = "2026-08-24T13:00:00.000Z";
  const orderId = "synthetic-order-1";
  const otherOrderId = "synthetic-order-2";
  const paymentEvidenceId = "synthetic-payment-event-1";

  const leanDraft = {
    orderId,
    state: "draft",
    paymentEvidenceId: null,
    reviewRequestId: null,
    fulfillmentReleaseVersion: null,
    lastFulfillmentReleaseVersion: 0,
    carrierHandoffAt: null,
  } as unknown as OrderSnapshot;

  const fulfillmentInput = (
    overrides: Partial<FulfillmentInput> = {},
  ): FulfillmentInput => ({
    orderId,
    verifiedPaymentEventId: paymentEvidenceId,
    refundPending: false,
    confirmedRefundAmountMinor: 0,
    paymentDisputed: false,
    orderHoldActive: false,
    buyerStatus: "active",
    buyerReviewCovered: false,
    productsActive: true,
    destinationStatus: "allowed",
    destinationReviewCovered: false,
    inventoryReservationsComplete: true,
    reservedLotsAvailable: true,
    shipmentMetadataPresent: true,
    fulfillmentCapabilityEnabled: true,
    reviewRequestId: null,
    ...overrides,
  });

  const permittedFulfillment = (overrides: Partial<FulfillmentInput> = {}) =>
    evaluateFulfillment(fulfillmentInput(overrides));
  const deniedFulfillment = (overrides: Partial<FulfillmentInput>) =>
    evaluateFulfillment(fulfillmentInput(overrides));

  function expectOrderSuccess(
    snapshot: OrderSnapshot,
    event: unknown,
  ): OrderSnapshot {
    const result = transitionOrder(snapshot, event as OrderEvent);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(`synthetic transition failed: ${result.error.code}`);
    const value = result.value as unknown as {
      snapshot: OrderSnapshot;
      requiredIncidents: readonly string[];
    };
    expect(value.requiredIncidents).toEqual([]);
    return value.snapshot;
  }

  function checkoutPending(): OrderSnapshot {
    const eligibility = expectOrderSuccess(leanDraft, { type: "start_eligibility" });
    const ready = expectOrderSuccess(eligibility, {
      type: "eligibility_passed",
      decision: allowedCheckoutDecision,
    });
    return expectOrderSuccess(ready, { type: "begin_checkout" });
  }

  function paidPending(): OrderSnapshot {
    return expectOrderSuccess(checkoutPending(), {
      type: "payment_verified",
      source: "verified_provider_event",
      paymentEvidenceId,
      reservationDisposition: "active",
    });
  }

  const absentRelease = (): FulfillmentReleaseSnapshot =>
    ({
      orderId,
      state: "absent",
      version: null,
      lastVersion: 0,
      paymentEvidenceId: null,
      reviewRequestId: null,
      expiresAt: null,
    }) as unknown as FulfillmentReleaseSnapshot;

  it("binds every fulfillment decision and release to exactly one order", () => {
    const crossOrderPermitted = permittedFulfillment({ orderId: otherOrderId });
    const crossOrderDenied = deniedFulfillment({
      orderId: otherOrderId,
      refundPending: true,
    });
    const held = {
      ...leanDraft,
      state: "paid_on_hold",
      paymentEvidenceId,
    } as OrderSnapshot;
    const ready = {
      ...leanDraft,
      state: "ready_for_fulfillment",
      paymentEvidenceId,
      fulfillmentReleaseVersion: 1,
      lastFulfillmentReleaseVersion: 1,
    } as OrderSnapshot;
    const inProgress = {
      ...ready,
      state: "fulfillment_in_progress",
    } as OrderSnapshot;
    const sameOrderIssued = {
      orderId,
      state: "issued",
      version: 1,
      lastVersion: 1,
      paymentEvidenceId,
      reviewRequestId: null,
      expiresAt,
    } as FulfillmentReleaseSnapshot;
    const crossOrderIssued = {
      ...sameOrderIssued,
      orderId: otherOrderId,
    } as FulfillmentReleaseSnapshot;

    expect(
      transitionOrder(paidPending(), {
        type: "post_payment_hold",
        decision: crossOrderDenied,
      }),
    ).toMatchObject({
      ok: false,
      error: { code: "invalid_fulfillment_decision" },
    });
    expect(
      transitionOrder(held, {
        type: "clear_fulfillment_hold",
        decision: crossOrderPermitted,
      }),
    ).toMatchObject({
      ok: false,
      error: { code: "invalid_fulfillment_decision" },
    });
    expect(
      transitionOrder(paidPending(), {
        type: "release_for_fulfillment",
        decision: crossOrderPermitted,
        paymentEvidenceId,
        fulfillmentReleaseVersion: 1,
      }),
    ).toMatchObject({
      ok: false,
      error: { code: "invalid_fulfillment_decision" },
    });
    expect(
      transitionOrder(ready, {
        type: "begin_fulfillment",
        now,
        decision: crossOrderPermitted,
        release: sameOrderIssued,
      }),
    ).toMatchObject({
      ok: false,
      error: { code: "invalid_fulfillment_decision" },
    });
    expect(
      transitionFulfillmentRelease(absentRelease(), {
        type: "issue",
        now,
        decision: crossOrderPermitted,
        version: 1,
        paymentEvidenceId,
        expiresAt,
      }),
    ).toMatchObject({
      ok: false,
      error: { code: "invalid_fulfillment_decision" },
    });
    expect(
      transitionFulfillmentRelease(sameOrderIssued, {
        type: "consume",
        now,
        decision: crossOrderPermitted,
      }),
    ).toMatchObject({
      ok: false,
      error: { code: "invalid_fulfillment_decision" },
    });
    expect(
      transitionOrder(ready, {
        type: "begin_fulfillment",
        now,
        decision: permittedFulfillment(),
        release: crossOrderIssued,
      }),
    ).toMatchObject({ ok: false, error: { code: "invalid_release" } });
    expect(
      transitionOrder(inProgress, {
        type: "carrier_handoff",
        carrierHandoffAt: "2026-08-24T12:10:00.000Z",
        recordedAt: "2026-08-24T12:11:00.000Z",
        consumedRelease: {
          ...crossOrderIssued,
          state: "consumed",
        },
      }),
    ).toMatchObject({
      ok: false,
      error: { code: "invalid_carrier_handoff" },
    });
  });

  it("returns a deeply frozen snapshot-plus-incident result for ordinary transitions", () => {
    const result = transitionOrder(leanDraft, { type: "start_eligibility" });
    expect(result).toEqual({
      ok: true,
      value: {
        snapshot: { ...leanDraft, state: "eligibility_review" },
        requiredIncidents: [],
      },
    });
    if (!result.ok) return;
    const value = result.value as unknown as {
      snapshot: OrderSnapshot;
      requiredIncidents: readonly string[];
    };
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(value)).toBe(true);
    expect(Object.isFrozen(value.snapshot)).toBe(true);
    expect(Object.isFrozen(value.requiredIncidents)).toBe(true);
  });

  it("moves an actively reserved verified payment to paid-pending-fulfillment", () => {
    const result = transitionOrder(checkoutPending(), {
      type: "payment_verified",
      source: "verified_provider_event",
      paymentEvidenceId,
      reservationDisposition: "active",
    } as never);
    expect(result).toMatchObject({
      ok: true,
      value: {
        snapshot: {
          state: "paid_pending_fulfillment",
          paymentEvidenceId,
        },
        requiredIncidents: [],
      },
    });
  });

  it.each(["checkout_pending", "payment_failed"] as const)(
    "routes a late paid %s order to hold with exactly one inventory incident",
    (state) => {
      const snapshot = {
        ...leanDraft,
        state,
      } as OrderSnapshot;
      const result = transitionOrder(snapshot, {
        type: "payment_verified",
        source: "verified_provider_event",
        paymentEvidenceId,
        reservationDisposition: "authoritatively_released",
      } as never);
      expect(result).toEqual({
        ok: true,
        value: {
          snapshot: {
            ...leanDraft,
            state: "paid_on_hold",
            paymentEvidenceId,
          },
          requiredIncidents: ["inventory_conflict"],
        },
      });
    },
  );

  it("accepts cancelled late payment only after authoritative release", () => {
    const failed = expectOrderSuccess(checkoutPending(), {
      type: "checkout_closed",
      source: "verified_provider_event",
      reason: "checkout_expired",
      providerEvidenceId: "synthetic-session-expired-1",
    });
    const cancelled = expectOrderSuccess(failed, { type: "cancel" });
    const latePaid = transitionOrder(cancelled, {
      type: "payment_verified",
      source: "verified_provider_event",
      paymentEvidenceId,
      reservationDisposition: "authoritatively_released",
    } as never);
    expect(latePaid).toMatchObject({
      ok: true,
      value: {
        snapshot: { state: "paid_on_hold", paymentEvidenceId },
        requiredIncidents: ["inventory_conflict"],
      },
    });
    expect(
      transitionOrder(cancelled, {
        type: "payment_verified",
        source: "verified_provider_event",
        paymentEvidenceId,
        reservationDisposition: "active",
      } as never),
    ).toMatchObject({ ok: false, error: { code: "invalid_transition" } });
  });

  it("places any paid pre-handoff state on a restrictive denied-decision hold", () => {
    const denied = deniedFulfillment({ refundPending: true });
    const held = expectOrderSuccess(paidPending(), {
      type: "post_payment_hold",
      decision: denied,
    });
    expect(held).toMatchObject({
      state: "paid_on_hold",
      fulfillmentReleaseVersion: null,
      reviewRequestId: null,
    });
    const repeated = expectOrderSuccess(held, {
      type: "post_payment_hold",
      decision: denied,
    });
    expect(repeated).toEqual(held);
    expect(
      transitionOrder(paidPending(), {
        type: "post_payment_hold",
        decision: { ...denied },
      } as never),
    ).toMatchObject({
      ok: false,
      error: { code: "invalid_fulfillment_decision" },
    });
  });

  it("clears a hold only with a matching permitted decision and creates no release", () => {
    const held = {
      ...leanDraft,
      state: "paid_on_hold",
      paymentEvidenceId,
    } as OrderSnapshot;
    const result = transitionOrder(held, {
      type: "clear_fulfillment_hold",
      decision: permittedFulfillment(),
    } as never);
    expect(result).toEqual({
      ok: true,
      value: {
        snapshot: {
          ...leanDraft,
          state: "paid_pending_fulfillment",
          paymentEvidenceId,
        },
        requiredIncidents: [],
      },
    });
    expect(
      transitionOrder(held, {
        type: "clear_fulfillment_hold",
        decision: permittedFulfillment({
          verifiedPaymentEventId: "synthetic-other-payment",
        }),
      } as never),
    ).toMatchObject({ ok: false, error: { code: "payment_mismatch" } });
  });

  it("releases only a matching permitted decision at a newer monotonic version", () => {
    const released = transitionOrder(paidPending(), {
      type: "release_for_fulfillment",
      decision: permittedFulfillment(),
      paymentEvidenceId,
      fulfillmentReleaseVersion: 1,
    } as never);
    expect(released).toMatchObject({
      ok: true,
      value: {
        snapshot: {
          state: "ready_for_fulfillment",
          paymentEvidenceId,
          reviewRequestId: null,
          fulfillmentReleaseVersion: 1,
          lastFulfillmentReleaseVersion: 1,
        },
      },
    });
    expect(
      transitionOrder(
        {
          ...leanDraft,
          state: "paid_pending_fulfillment",
          paymentEvidenceId,
          lastFulfillmentReleaseVersion: 1,
        } as OrderSnapshot,
        {
          type: "release_for_fulfillment",
          decision: permittedFulfillment(),
          paymentEvidenceId,
          fulfillmentReleaseVersion: 1,
        } as never,
      ),
    ).toMatchObject({ ok: false, error: { code: "invalid_release" } });
  });

  it("issues a release from the decision and never accepts a caller-substituted review", () => {
    const reviewed = permittedFulfillment({
      buyerStatus: "review",
      buyerReviewCovered: true,
      reviewRequestId: "synthetic-review-1",
    });
    const result = transitionFulfillmentRelease(absentRelease(), {
      type: "issue",
      now,
      decision: reviewed,
      version: 1,
      paymentEvidenceId,
      expiresAt,
    } as never);
    expect(result).toEqual({
      ok: true,
      value: {
        orderId,
        state: "issued",
        version: 1,
        lastVersion: 1,
        paymentEvidenceId,
        reviewRequestId: "synthetic-review-1",
        expiresAt,
      },
    });
    if (!result.ok) return;
    expect(Object.isFrozen(result.value)).toBe(true);
    expect(
      transitionFulfillmentRelease(absentRelease(), {
        type: "issue",
        now,
        decision: { ...reviewed, reviewRequestId: "synthetic-other-review" },
        version: 1,
        paymentEvidenceId,
        expiresAt,
      } as never),
    ).toMatchObject({
      ok: false,
      error: { code: "invalid_fulfillment_decision" },
    });
  });

  it("revokes, expires, and consumes only current releases", () => {
    const issued = transitionFulfillmentRelease(absentRelease(), {
      type: "issue",
      now,
      decision: permittedFulfillment(),
      version: 1,
      paymentEvidenceId,
      expiresAt,
    } as never);
    expect(issued.ok).toBe(true);
    if (!issued.ok) return;
    const revoked = transitionFulfillmentRelease(issued.value, {
      type: "revoke",
      reasonCode: "facts_changed",
    });
    expect(revoked).toMatchObject({
      ok: true,
      value: {
        orderId,
        state: "revoked",
        version: null,
        lastVersion: 1,
        paymentEvidenceId: null,
        reviewRequestId: null,
        expiresAt: null,
      },
    });
    const consumed = transitionFulfillmentRelease(issued.value, {
      type: "consume",
      now,
      decision: permittedFulfillment(),
    } as never);
    expect(consumed).toMatchObject({
      ok: true,
      value: { orderId, state: "consumed" },
    });
    if (!consumed.ok) return;
    expect(
      transitionFulfillmentRelease(consumed.value, {
        type: "consume",
        now,
        decision: permittedFulfillment(),
      } as never),
    ).toMatchObject({
      ok: false,
      error: { code: "release_already_consumed" },
    });
    expect(
      transitionFulfillmentRelease(issued.value, {
        type: "expire",
        now: expiresAt,
      }),
    ).toMatchObject({
      ok: true,
      value: { orderId, state: "expired", lastVersion: 1 },
    });
  });

  it("rejects expired, payment-mismatched, and review-mismatched release consumption", () => {
    const reviewed = permittedFulfillment({
      destinationStatus: "review",
      destinationReviewCovered: true,
      reviewRequestId: "synthetic-review-1",
    });
    const release = {
      orderId,
      state: "issued",
      version: 2,
      lastVersion: 2,
      paymentEvidenceId,
      reviewRequestId: "synthetic-review-1",
      expiresAt,
    } as unknown as FulfillmentReleaseSnapshot;
    expect(
      transitionFulfillmentRelease(release, {
        type: "consume",
        now: expiresAt,
        decision: reviewed,
      } as never),
    ).toMatchObject({ ok: false, error: { code: "release_not_current" } });
    expect(
      transitionFulfillmentRelease(release, {
        type: "consume",
        now,
        decision: permittedFulfillment({
          verifiedPaymentEventId: "synthetic-other-payment",
        }),
      } as never),
    ).toMatchObject({ ok: false, error: { code: "payment_mismatch" } });
    expect(
      transitionFulfillmentRelease(release, {
        type: "consume",
        now,
        decision: permittedFulfillment(),
      } as never),
    ).toMatchObject({ ok: false, error: { code: "invalid_release" } });
  });

  it("begins fulfillment and records handoff only with matching release facts", () => {
    const decision = permittedFulfillment();
    const issued = transitionFulfillmentRelease(absentRelease(), {
      type: "issue",
      now,
      decision,
      version: 1,
      paymentEvidenceId,
      expiresAt,
    } as never);
    expect(issued.ok).toBe(true);
    if (!issued.ok) return;
    const ready = {
      ...leanDraft,
      state: "ready_for_fulfillment",
      paymentEvidenceId,
      fulfillmentReleaseVersion: 1,
      lastFulfillmentReleaseVersion: 1,
    } as OrderSnapshot;
    const started = transitionOrder(ready, {
      type: "begin_fulfillment",
      now,
      decision,
      release: issued.value,
    } as never);
    expect(started).toMatchObject({
      ok: true,
      value: { snapshot: { state: "fulfillment_in_progress" } },
    });
    if (!started.ok) return;
    const consumed = transitionFulfillmentRelease(issued.value, {
      type: "consume",
      now,
      decision,
    } as never);
    expect(consumed.ok).toBe(true);
    if (!consumed.ok) return;
    const startedSnapshot = (started.value as unknown as { snapshot: OrderSnapshot }).snapshot;
    expect(
      transitionOrder(startedSnapshot, {
        type: "carrier_handoff",
        carrierHandoffAt: "2026-08-24T12:10:00.000Z",
        recordedAt: "2026-08-24T12:11:00.000Z",
        consumedRelease: consumed.value,
      } as never),
    ).toMatchObject({
      ok: true,
      value: {
        snapshot: {
          state: "fulfilled",
          carrierHandoffAt: "2026-08-24T12:10:00.000Z",
        },
      },
    });
  });

  it("fails malformed snapshots, events, and fulfillment decisions closed", () => {
    expect(transitionOrder(null as never, { type: "start_eligibility" })).toMatchObject({
      ok: false,
      error: { code: "invalid_snapshot" },
    });
    expect(transitionOrder(leanDraft, null as never)).toMatchObject({
      ok: false,
      error: { code: "invalid_transition" },
    });
    expect(
      transitionFulfillmentRelease(null as never, {
        type: "consume",
        now,
        decision: permittedFulfillment(),
      } as never),
    ).toMatchObject({ ok: false, error: { code: "invalid_snapshot" } });
    expect(
      transitionFulfillmentRelease(absentRelease(), {
        type: "issue",
        now,
        decision: { ...permittedFulfillment() },
        version: 1,
        paymentEvidenceId,
        expiresAt,
      } as never),
    ).toMatchObject({
      ok: false,
      error: { code: "invalid_fulfillment_decision" },
    });
  });

  it.each([undefined, "", "   "])(
    "rejects the nonblank order binding %j on both snapshot types",
    (invalidOrderId) => {
      expect(
        transitionOrder(
          { ...leanDraft, orderId: invalidOrderId } as unknown as OrderSnapshot,
          { type: "start_eligibility" },
        ),
      ).toMatchObject({ ok: false, error: { code: "invalid_snapshot" } });
      expect(
        transitionFulfillmentRelease(
          {
            ...absentRelease(),
            orderId: invalidOrderId,
          } as unknown as FulfillmentReleaseSnapshot,
          {
            type: "issue",
            now,
            decision: permittedFulfillment(),
            version: 1,
            paymentEvidenceId,
            expiresAt,
          },
        ),
      ).toMatchObject({ ok: false, error: { code: "invalid_snapshot" } });
    },
  );

  it("accepts an active reservation after provider failure but rejects invalid payment authority", () => {
    const failed = {
      ...leanDraft,
      state: "payment_failed",
    } as OrderSnapshot;
    expect(
      transitionOrder(failed, {
        type: "payment_verified",
        source: "verified_provider_event",
        paymentEvidenceId,
        reservationDisposition: "active",
      } as never),
    ).toMatchObject({
      ok: true,
      value: { snapshot: { state: "paid_pending_fulfillment" } },
    });
    expect(
      transitionOrder(failed, {
        type: "payment_verified",
        source: "success_page",
        paymentEvidenceId,
        reservationDisposition: "active",
      } as never),
    ).toMatchObject({
      ok: false,
      error: { code: "missing_payment_evidence" },
    });
    expect(
      transitionOrder(failed, {
        type: "payment_verified",
        source: "verified_provider_event",
        paymentEvidenceId,
        reservationDisposition: "unknown",
      } as never),
    ).toMatchObject({ ok: false, error: { code: "invalid_transition" } });
  });

  it("rejects nonfuture release expiry, payment mismatch, and nonmonotonic issue", () => {
    expect(
      transitionFulfillmentRelease(absentRelease(), {
        type: "issue",
        now,
        decision: permittedFulfillment(),
        version: 1,
        paymentEvidenceId,
        expiresAt: now,
      } as never),
    ).toMatchObject({ ok: false, error: { code: "invalid_release" } });
    expect(
      transitionFulfillmentRelease(absentRelease(), {
        type: "issue",
        now,
        decision: permittedFulfillment(),
        version: 1,
        paymentEvidenceId: "synthetic-other-payment",
        expiresAt,
      } as never),
    ).toMatchObject({ ok: false, error: { code: "payment_mismatch" } });
    expect(
      transitionFulfillmentRelease(
        {
          ...absentRelease(),
          state: "revoked",
          lastVersion: 2,
        } as FulfillmentReleaseSnapshot,
        {
          type: "issue",
          now,
          decision: permittedFulfillment(),
          version: 2,
          paymentEvidenceId,
          expiresAt,
        } as never,
      ),
    ).toMatchObject({ ok: false, error: { code: "invalid_release" } });
  });

  it("rejects mismatched begin facts and malformed or repeated carrier handoff", () => {
    const decision = permittedFulfillment();
    const ready = {
      ...leanDraft,
      state: "ready_for_fulfillment",
      paymentEvidenceId,
      fulfillmentReleaseVersion: 1,
      lastFulfillmentReleaseVersion: 1,
    } as OrderSnapshot;
    const wrongRelease = {
      orderId,
      state: "issued",
      version: 2,
      lastVersion: 2,
      paymentEvidenceId,
      reviewRequestId: null,
      expiresAt,
    } as FulfillmentReleaseSnapshot;
    expect(
      transitionOrder(ready, {
        type: "begin_fulfillment",
        now,
        decision,
        release: wrongRelease,
      } as never),
    ).toMatchObject({ ok: false, error: { code: "invalid_release" } });

    const inProgress = {
      ...ready,
      state: "fulfillment_in_progress",
    } as OrderSnapshot;
    const consumed = {
      ...wrongRelease,
      version: 1,
      lastVersion: 1,
      state: "consumed",
    } as FulfillmentReleaseSnapshot;
    expect(
      transitionOrder(inProgress, {
        type: "carrier_handoff",
        carrierHandoffAt: "2026-08-24T12:12:00.000Z",
        recordedAt: "2026-08-24T12:11:00.000Z",
        consumedRelease: consumed,
      }),
    ).toMatchObject({
      ok: false,
      error: { code: "invalid_carrier_handoff" },
    });
    expect(
      transitionOrder(
        {
          ...inProgress,
          state: "fulfilled",
          carrierHandoffAt: "2026-08-24T12:10:00.000Z",
        } as OrderSnapshot,
        {
          type: "carrier_handoff",
          carrierHandoffAt: "2026-08-24T12:10:00.000Z",
          recordedAt: "2026-08-24T12:11:00.000Z",
          consumedRelease: consumed,
        },
      ),
    ).toMatchObject({ ok: false, error: { code: "invalid_transition" } });
  });

  it("contains no clearance evidence in order or release snapshots", () => {
    const paid = paidPending();
    expect(paid).not.toHaveProperty("clearanceEvidenceId");
    const issued = transitionFulfillmentRelease(absentRelease(), {
      type: "issue",
      now,
      decision: permittedFulfillment(),
      version: 1,
      paymentEvidenceId,
      expiresAt,
    } as never);
    expect(issued.ok).toBe(true);
    if (!issued.ok) return;
    expect(issued.value).not.toHaveProperty("clearanceEvidenceId");
    expect(issued.value).not.toHaveProperty("clearanceEvidenceHistory");
  });

  it.each([
    ["draft", { type: "begin_checkout" }],
    ["checkout_pending", { type: "cancel" }],
    ["paid_pending_fulfillment", { type: "begin_checkout" }],
    ["paid_on_hold", { type: "begin_fulfillment" }],
    ["fulfilled", { type: "cancel" }],
  ] as const)("rejects %s outside the lean transition matrix", (state, event) => {
    const snapshot =
      state === "draft" || state === "checkout_pending"
        ? ({ ...leanDraft, state } as OrderSnapshot)
        : state === "fulfilled"
          ? ({
              ...leanDraft,
              state,
              paymentEvidenceId,
              fulfillmentReleaseVersion: 1,
              lastFulfillmentReleaseVersion: 1,
              carrierHandoffAt: "2026-08-24T12:10:00.000Z",
            } as OrderSnapshot)
          : ({ ...leanDraft, state, paymentEvidenceId } as OrderSnapshot);
    expect(transitionOrder(snapshot, event as never)).toMatchObject({
      ok: false,
      error: { code: "invalid_transition" },
    });
  });

  it("places verified disputes on hold and keeps repeated disputes restrictive", () => {
    const held = expectOrderSuccess(paidPending(), {
      type: "payment_disputed",
      source: "verified_provider_event",
      providerEvidenceId: "synthetic-dispute-1",
    });
    expect(held.state).toBe("paid_on_hold");
    expect(
      expectOrderSuccess(held, {
        type: "payment_disputed",
        source: "verified_provider_event",
        providerEvidenceId: "synthetic-dispute-1",
      }),
    ).toEqual(held);
  });
});

describe("transitionPayment", () => {
  it("records paid only from matching verified provider evidence", () => {
    const unpaid: PaymentSnapshot = {
      state: "unpaid",
      currency: "USD",
      orderAmountMinor: 2_850,
      paidAmountMinor: 0,
      refundedAmountMinor: 0,
      pendingRefundAmountMinor: 0,
    };

    const result = transitionPayment(unpaid, {
      type: "verified_payment",
      source: "verified_provider_event",
      amountMinor: 2_850,
      currency: "USD",
      providerEvidenceId: "synthetic-provider-event-1",
    });

    expect(result).toEqual({
      ok: true,
      value: { ...unpaid, state: "paid", paidAmountMinor: 2_850 },
    });
    expect(unpaid.state).toBe("unpaid");
  });

  it.each([
    {
      name: "browser redirect source",
      event: {
        type: "verified_payment",
        source: "success_page",
        amountMinor: 2_850,
        currency: "USD",
        providerEvidenceId: "synthetic-provider-event-1",
      },
      code: "missing_payment_evidence",
    },
    {
      name: "blank provider evidence",
      event: {
        type: "verified_payment",
        source: "verified_provider_event",
        amountMinor: 2_850,
        currency: "USD",
        providerEvidenceId: "   ",
      },
      code: "missing_payment_evidence",
    },
    {
      name: "amount mismatch",
      event: {
        type: "verified_payment",
        source: "verified_provider_event",
        amountMinor: 2_849,
        currency: "USD",
        providerEvidenceId: "synthetic-provider-event-1",
      },
      code: "payment_mismatch",
    },
    {
      name: "currency mismatch",
      event: {
        type: "verified_payment",
        source: "verified_provider_event",
        amountMinor: 2_850,
        currency: "EUR",
        providerEvidenceId: "synthetic-provider-event-1",
      },
      code: "payment_mismatch",
    },
    {
      name: "invalid amount",
      event: {
        type: "verified_payment",
        source: "verified_provider_event",
        amountMinor: -1,
        currency: "USD",
        providerEvidenceId: "synthetic-provider-event-1",
      },
      code: "invalid_amount",
    },
  ] as const)("rejects verified payment with $name", ({ event, code }) => {
    const unpaid: PaymentSnapshot = {
      state: "unpaid",
      currency: "USD",
      orderAmountMinor: 2_850,
      paidAmountMinor: 0,
      refundedAmountMinor: 0,
      pendingRefundAmountMinor: 0,
    };

    const result = transitionPayment(unpaid, event as never);

    expect(result).toEqual({
      ok: false,
      error: { code, state: "unpaid", event: "verified_payment" },
    });
  });

  it("derives partial and full refund states from verified cumulative amounts", () => {
    const paid: PaymentSnapshot = {
      state: "paid",
      currency: "USD",
      orderAmountMinor: 2_850,
      paidAmountMinor: 2_850,
      refundedAmountMinor: 0,
      pendingRefundAmountMinor: 0,
    };

    const partialRequest = transitionPayment(paid, {
      type: "refund_requested",
      amountMinor: 850,
      currency: "USD",
      requestId: "synthetic-refund-request-1",
    });
    expect(partialRequest).toMatchObject({
      ok: true,
      value: { state: "refund_pending", pendingRefundAmountMinor: 850 },
    });
    if (!partialRequest.ok) return;

    const partial = transitionPayment(partialRequest.value, {
      type: "verified_refund",
      source: "verified_provider_event",
      cumulativeRefundedAmountMinor: 850,
      currency: "USD",
      providerEvidenceId: "synthetic-refund-event-1",
    });
    expect(partial).toMatchObject({
      ok: true,
      value: {
        state: "partially_refunded",
        refundedAmountMinor: 850,
        pendingRefundAmountMinor: 0,
      },
    });
    if (!partial.ok) return;

    const finalRequest = transitionPayment(partial.value, {
      type: "refund_requested",
      amountMinor: 2_000,
      currency: "USD",
      requestId: "synthetic-refund-request-2",
    });
    if (!finalRequest.ok) throw new Error("synthetic test setup failed");
    const refunded = transitionPayment(finalRequest.value, {
      type: "verified_refund",
      source: "verified_provider_event",
      cumulativeRefundedAmountMinor: 2_850,
      currency: "USD",
      providerEvidenceId: "synthetic-refund-event-2",
    });

    expect(refunded).toMatchObject({
      ok: true,
      value: {
        state: "refunded",
        refundedAmountMinor: 2_850,
        pendingRefundAmountMinor: 0,
      },
    });
  });

  it.each(["paid", "partially_refunded"] as const)(
    "records a verified provider dispute from %s as terminal",
    (state) => {
      const snapshot: PaymentSnapshot = {
        state,
        currency: "USD",
        orderAmountMinor: 2_850,
        paidAmountMinor: 2_850,
        refundedAmountMinor: state === "partially_refunded" ? 850 : 0,
        pendingRefundAmountMinor: 0,
      };

      const disputed = transitionPayment(snapshot, {
        type: "dispute_recorded",
        source: "verified_provider_event",
        providerEvidenceId: "synthetic-dispute-event-1",
      });
      expect(disputed).toMatchObject({
        ok: true,
        value: { state: "disputed" },
      });
      if (!disputed.ok) return;

      expect(
        transitionPayment(disputed.value, {
          type: "refund_requested",
          amountMinor: 100,
          currency: "USD",
          requestId: "synthetic-refund-request-after-dispute",
        }),
      ).toMatchObject({
        ok: false,
        error: { code: "invalid_transition" },
      });
    },
  );

  it.each([
    ["blank request evidence", 100, "USD", "   ", "missing_refund_evidence"],
    ["zero amount", 0, "USD", "synthetic-refund-request", "invalid_amount"],
    ["unsafe amount", Number.MAX_SAFE_INTEGER + 1, "USD", "synthetic-refund-request", "invalid_amount"],
    ["currency mismatch", 100, "EUR", "synthetic-refund-request", "payment_mismatch"],
    ["over-refund", 2_851, "USD", "synthetic-refund-request", "refund_exceeds_balance"],
  ] as const)(
    "rejects refund requests with %s",
    (_name, amountMinor, currency, requestId, code) => {
      const paid: PaymentSnapshot = {
        state: "paid",
        currency: "USD",
        orderAmountMinor: 2_850,
        paidAmountMinor: 2_850,
        refundedAmountMinor: 0,
        pendingRefundAmountMinor: 0,
      };

      expect(
        transitionPayment(paid, {
          type: "refund_requested",
          amountMinor,
          currency,
          requestId,
        }),
      ).toMatchObject({ ok: false, error: { code } });
    },
  );

  it("fails closed for malformed payment snapshots", () => {
    const malformed = {
      state: "paid",
      currency: "usd",
      orderAmountMinor: 2_850,
      paidAmountMinor: 2_850,
      refundedAmountMinor: 3_000,
      pendingRefundAmountMinor: 0,
    } as PaymentSnapshot;

    expect(
      transitionPayment(malformed, {
        type: "refund_requested",
        amountMinor: 100,
        currency: "usd",
        requestId: "synthetic-refund-request",
      }),
    ).toMatchObject({ ok: false, error: { code: "invalid_snapshot" } });
  });

  it("returns structured denials for null and scalar payment transition inputs", () => {
    const unpaid: PaymentSnapshot = {
      state: "unpaid",
      currency: "USD",
      orderAmountMinor: 2_850,
      paidAmountMinor: 0,
      refundedAmountMinor: 0,
      pendingRefundAmountMinor: 0,
    };

    expect(transitionPayment(null as never, { type: "dispute_recorded", source: "verified_provider_event", providerEvidenceId: "synthetic-dispute-event-1" })).toEqual({
      ok: false,
      error: { code: "invalid_snapshot", state: "unknown", event: "dispute_recorded" },
    });
    expect(transitionPayment(unpaid, null as never)).toEqual({
      ok: false,
      error: { code: "invalid_transition", state: "unpaid", event: "unknown" },
    });
    expect(
      transitionPayment("malformed-snapshot" as never, {
        type: "dispute_recorded",
        source: "verified_provider_event",
        providerEvidenceId: "synthetic-dispute-event-1",
      }),
    ).toEqual({
      ok: false,
      error: {
        code: "invalid_snapshot",
        state: "unknown",
        event: "dispute_recorded",
      },
    });
    expect(transitionPayment(unpaid, 17 as never)).toEqual({
      ok: false,
      error: { code: "invalid_transition", state: "unpaid", event: "unknown" },
    });
  });

  it.each([
    ["browser refund evidence", "browser_redirect", "synthetic-refund-event", 850, "missing_refund_evidence"],
    ["blank refund evidence", "verified_provider_event", "   ", 850, "missing_refund_evidence"],
    ["unchanged cumulative amount", "verified_provider_event", "synthetic-refund-event", 0, "invalid_amount"],
    ["wrong cumulative amount", "verified_provider_event", "synthetic-refund-event", 800, "payment_mismatch"],
  ] as const)(
    "rejects a verified refund with %s",
    (_name, source, providerEvidenceId, cumulativeRefundedAmountMinor, code) => {
      const pending: PaymentSnapshot = {
        state: "refund_pending",
        currency: "USD",
        orderAmountMinor: 2_850,
        paidAmountMinor: 2_850,
        refundedAmountMinor: 0,
        pendingRefundAmountMinor: 850,
      };

      expect(
        transitionPayment(pending, {
          type: "verified_refund",
          source,
          cumulativeRefundedAmountMinor,
          currency: "USD",
          providerEvidenceId,
        } as never),
      ).toMatchObject({ ok: false, error: { code } });
    },
  );

  it.each([
    ["browser evidence", "browser_redirect", "synthetic-dispute-event"],
    ["blank evidence", "verified_provider_event", "   "],
  ] as const)("rejects disputes with %s", (_name, source, providerEvidenceId) => {
    const paid: PaymentSnapshot = {
      state: "paid",
      currency: "USD",
      orderAmountMinor: 2_850,
      paidAmountMinor: 2_850,
      refundedAmountMinor: 0,
      pendingRefundAmountMinor: 0,
    };

    expect(
      transitionPayment(paid, {
        type: "dispute_recorded",
        source,
        providerEvidenceId,
      } as never),
    ).toMatchObject({
      ok: false,
      error: { code: "missing_payment_evidence" },
    });
  });

  it("keeps disputed and fully refunded payment states terminal", () => {
    const events: readonly PaymentEvent[] = [
      {
        type: "verified_payment",
        source: "verified_provider_event",
        amountMinor: 2_850,
        currency: "USD",
        providerEvidenceId: "synthetic-provider-event",
      },
      {
        type: "refund_requested",
        amountMinor: 100,
        currency: "USD",
        requestId: "synthetic-refund-request",
      },
      {
        type: "verified_refund",
        source: "verified_provider_event",
        cumulativeRefundedAmountMinor: 2_850,
        currency: "USD",
        providerEvidenceId: "synthetic-refund-event",
      },
      {
        type: "dispute_recorded",
        source: "verified_provider_event",
        providerEvidenceId: "synthetic-dispute-event",
      },
    ];
    const terminalSnapshots: readonly PaymentSnapshot[] = [
      {
        state: "refunded",
        currency: "USD",
        orderAmountMinor: 2_850,
        paidAmountMinor: 2_850,
        refundedAmountMinor: 2_850,
        pendingRefundAmountMinor: 0,
      },
      {
        state: "disputed",
        currency: "USD",
        orderAmountMinor: 2_850,
        paidAmountMinor: 2_850,
        refundedAmountMinor: 0,
        pendingRefundAmountMinor: 0,
      },
    ];

    for (const snapshot of terminalSnapshots) {
      for (const event of events) {
        expect(transitionPayment(snapshot, event)).toMatchObject({
          ok: false,
          error: { code: "invalid_transition" },
        });
      }
    }
  });
});
