import { describe, expect, it } from "vitest";

import {
  canFulfill,
  transitionOrder,
  transitionPayment,
  transitionFulfillmentRelease,
  type FulfillmentReleaseSnapshot,
  type OrderEvent,
  type OrderSnapshot,
  type OrderState,
  type PaymentEvent,
  type PaymentSnapshot,
} from "@/domain/orders";

const draftOrder: OrderSnapshot = {
  state: "draft",
  paymentEvidenceId: null,
  clearanceEvidenceId: null,
  fulfillmentReleaseVersion: null,
  lastFulfillmentReleaseVersion: 0,
  carrierHandoffAt: null,
};

const issuedRelease: FulfillmentReleaseSnapshot = {
  state: "issued",
  version: 1,
  lastVersion: 1,
  paymentEvidenceId: "synthetic-payment-journal-1",
  clearanceEvidenceId: "synthetic-clearance-1",
  expiresAt: "2026-08-25T12:00:00.000Z",
};

const consumedRelease: FulfillmentReleaseSnapshot = {
  ...issuedRelease,
  state: "consumed",
};

function paidPendingOrder(): OrderSnapshot {
  const eligibility = transitionOrder(draftOrder, { type: "start_eligibility" });
  if (!eligibility.ok) throw new Error("synthetic test setup failed");
  const ready = transitionOrder(eligibility.value, {
    type: "eligibility_passed",
    decision: "pass",
  });
  if (!ready.ok) throw new Error("synthetic test setup failed");
  const checkout = transitionOrder(ready.value, { type: "begin_checkout" });
  if (!checkout.ok) throw new Error("synthetic test setup failed");
  const paid = transitionOrder(checkout.value, {
    type: "payment_verified",
    source: "verified_provider_event",
    paymentEvidenceId: "synthetic-payment-journal-1",
  });
  if (!paid.ok) throw new Error("synthetic test setup failed");
  return paid.value;
}

describe("transitionOrder", () => {
  it("starts eligibility review from a draft without mutating the input", () => {
    const before = structuredClone(draftOrder);

    const result = transitionOrder(draftOrder, { type: "start_eligibility" });

    expect(result).toEqual({
      ok: true,
      value: { ...draftOrder, state: "eligibility_review" },
    });
    expect(draftOrder).toEqual(before);
  });

  it("follows the verified-payment and released-fulfillment happy path", () => {
    const eligibility = transitionOrder(draftOrder, {
      type: "start_eligibility",
    });
    expect(eligibility.ok).toBe(true);
    if (!eligibility.ok) return;

    const ready = transitionOrder(eligibility.value, {
      type: "eligibility_passed",
      decision: "pass",
    });
    expect(ready.ok).toBe(true);
    if (!ready.ok) return;

    const checkout = transitionOrder(ready.value, { type: "begin_checkout" });
    expect(checkout.ok).toBe(true);
    if (!checkout.ok) return;

    const paid = transitionOrder(checkout.value, {
      type: "payment_verified",
      source: "verified_provider_event",
      paymentEvidenceId: "synthetic-payment-journal-1",
    });
    expect(paid.ok).toBe(true);
    if (!paid.ok) return;

    const released = transitionOrder(paid.value, {
      type: "release_for_fulfillment",
      decision: "pass",
      paymentEvidenceId: "synthetic-payment-journal-1",
      clearanceEvidenceId: "synthetic-clearance-1",
      fulfillmentReleaseVersion: 1,
    });
    expect(released).toMatchObject({
      ok: true,
      value: {
        state: "ready_for_fulfillment",
        paymentEvidenceId: "synthetic-payment-journal-1",
        clearanceEvidenceId: "synthetic-clearance-1",
        fulfillmentReleaseVersion: 1,
      },
    });
    if (!released.ok) return;

    const inProgress = transitionOrder(released.value, {
      type: "begin_fulfillment",
      now: "2026-08-24T12:00:00.000Z",
      paymentVerified: true,
      eligibilityDecision: "pass",
      release: issuedRelease,
    } as never);
    expect(inProgress.ok).toBe(true);
    if (!inProgress.ok) return;

    const fulfilled = transitionOrder(inProgress.value, {
      type: "carrier_handoff",
      carrierHandoffAt: "2026-08-24T12:00:00.000Z",
      recordedAt: "2026-08-24T12:00:00.000Z",
      consumedRelease,
    } as never);

    expect(fulfilled).toMatchObject({
      ok: true,
      value: {
        state: "fulfilled",
        carrierHandoffAt: "2026-08-24T12:00:00.000Z",
      },
    });
  });

  it("routes pre-payment review holds and authoritative Checkout expiration", () => {
    const eligibility = transitionOrder(draftOrder, {
      type: "start_eligibility",
    });
    expect(eligibility.ok).toBe(true);
    if (!eligibility.ok) return;

    const held = transitionOrder(eligibility.value, {
      type: "place_compliance_hold",
    });
    expect(held).toMatchObject({ ok: true, value: { state: "compliance_hold" } });
    if (!held.ok) return;

    const resumed = transitionOrder(held.value, { type: "resume_eligibility" });
    expect(resumed).toMatchObject({
      ok: true,
      value: { state: "eligibility_review" },
    });
    if (!resumed.ok) return;

    const ready = transitionOrder(resumed.value, {
      type: "eligibility_passed",
      decision: "pass",
    });
    if (!ready.ok) throw new Error("synthetic test setup failed");
    const checkout = transitionOrder(ready.value, { type: "begin_checkout" });
    if (!checkout.ok) throw new Error("synthetic test setup failed");

    const expired = transitionOrder(checkout.value, {
      type: "checkout_closed",
      source: "verified_provider_event",
      reason: "checkout_expired",
      providerEvidenceId: "synthetic-provider-event-1",
    } as never);
    expect(expired).toMatchObject({
      ok: true,
      value: { state: "payment_failed" },
    });
    if (!expired.ok) return;

    expect(transitionOrder(expired.value, { type: "cancel" })).toMatchObject({
      ok: true,
      value: { state: "cancelled" },
    });
  });

  it("recovers a paid hold only through fresh clearance and a new release", () => {
    const paid = paidPendingOrder();
    const held = transitionOrder(paid, {
      type: "post_payment_hold",
      decision: "unknown",
    });
    expect(held).toMatchObject({
      ok: true,
      value: { state: "paid_on_hold", paymentEvidenceId: "synthetic-payment-journal-1" },
    });
    if (!held.ok) return;

    const released = transitionOrder(held.value, {
      type: "release_for_fulfillment",
      decision: "pass",
      paymentEvidenceId: "synthetic-payment-journal-1",
      clearanceEvidenceId: "synthetic-clearance-2",
      fulfillmentReleaseVersion: 2,
    });
    if (!released.ok) throw new Error("synthetic test setup failed");

    const revoked = transitionOrder(released.value, {
      type: "clearance_revoked",
      beforeCarrierHandoff: true,
    });
    expect(revoked).toMatchObject({
      ok: true,
      value: {
        state: "paid_on_hold",
        clearanceEvidenceId: null,
        fulfillmentReleaseVersion: null,
      },
    });
    if (!revoked.ok) return;

    const reissued = transitionOrder(revoked.value, {
      type: "release_for_fulfillment",
      decision: "pass",
      paymentEvidenceId: "synthetic-payment-journal-1",
      clearanceEvidenceId: "synthetic-clearance-3",
      fulfillmentReleaseVersion: 3,
    });
    if (!reissued.ok) throw new Error("synthetic test setup failed");
    const inProgress = transitionOrder(reissued.value, {
      type: "begin_fulfillment",
      now: "2026-08-24T12:00:00.000Z",
      paymentVerified: true,
      eligibilityDecision: "pass",
      release: {
        ...issuedRelease,
        version: 3,
        lastVersion: 3,
        clearanceEvidenceId: "synthetic-clearance-3",
      },
    } as never);
    if (!inProgress.ok) throw new Error("synthetic test setup failed");

    expect(
      transitionOrder(inProgress.value, {
        type: "clearance_revoked",
        beforeCarrierHandoff: true,
      }),
    ).toMatchObject({ ok: true, value: { state: "paid_on_hold" } });
  });

  it.each([
    [
      "browser-reported Checkout closure",
      {
        type: "checkout_closed",
        source: "browser_redirect",
        reason: "checkout_expired",
        providerEvidenceId: "synthetic-provider-event-1",
      },
      "missing_payment_evidence",
    ],
    [
      "blank provider evidence",
      {
        type: "checkout_closed",
        source: "verified_provider_event",
        reason: "checkout_expired",
        providerEvidenceId: "   ",
      },
      "missing_payment_evidence",
    ],
    [
      "unknown closure reason",
      {
        type: "checkout_closed",
        source: "verified_provider_event",
        reason: "browser_cancelled",
        providerEvidenceId: "synthetic-provider-event-1",
      },
      "invalid_transition",
    ],
  ] as const)("rejects %s", (_name, event, code) => {
    const paid = paidPendingOrder();
    const checkout = {
      ...draftOrder,
      state: "checkout_pending" as const,
    };

    expect(transitionOrder(checkout, event as never)).toEqual({
      ok: false,
      error: { code, state: "checkout_pending", event: "checkout_closed" },
    });
    expect(paid.state).toBe("paid_pending_clearance");
  });

  it.each([
    ["wrong payment evidence", "other-payment", "synthetic-clearance-2", 2],
    ["blank payment evidence", "   ", "synthetic-clearance-2", 2],
    ["blank clearance evidence", "synthetic-payment-journal-1", "   ", 2],
    ["stale release version", "synthetic-payment-journal-1", "synthetic-clearance-2", 0],
  ] as const)(
    "rejects a fulfillment release with %s",
    (_name, paymentEvidenceId, clearanceEvidenceId, fulfillmentReleaseVersion) => {
      const result = transitionOrder(paidPendingOrder(), {
        type: "release_for_fulfillment",
        decision: "pass",
        paymentEvidenceId,
        clearanceEvidenceId,
        fulfillmentReleaseVersion,
      });

      expect(result.ok).toBe(false);
    },
  );

  it.each([
    ["paid_pending_clearance", null, null, 0],
    ["paid_on_hold", null, null, 1],
    ["ready_for_fulfillment", "synthetic-clearance-1", 1, 1],
    ["fulfillment_in_progress", "synthetic-clearance-1", 1, 1],
  ] as const)(
    "places %s on hold after a verified dispute",
    (state, clearanceEvidenceId, fulfillmentReleaseVersion, lastVersion) => {
      const snapshot: OrderSnapshot = {
        state,
        paymentEvidenceId: "synthetic-payment-journal-1",
        clearanceEvidenceId,
        fulfillmentReleaseVersion,
        lastFulfillmentReleaseVersion: lastVersion,
        carrierHandoffAt: null,
      };

      expect(
        transitionOrder(snapshot, {
          type: "payment_disputed",
          source: "verified_provider_event",
          providerEvidenceId: "synthetic-dispute-event-1",
        } as never),
      ).toMatchObject({
        ok: true,
        value: {
          state: "paid_on_hold",
          paymentEvidenceId: "synthetic-payment-journal-1",
          clearanceEvidenceId: null,
          fulfillmentReleaseVersion: null,
        },
      });
    },
  );

  it("does not place an order on dispute hold from browser evidence", () => {
    expect(
      transitionOrder(paidPendingOrder(), {
        type: "payment_disputed",
        source: "browser_redirect",
        providerEvidenceId: "synthetic-dispute-event-1",
      } as never),
    ).toMatchObject({
      ok: false,
      error: { code: "missing_payment_evidence" },
    });
  });

  it("keeps a repeated verified dispute on the same restrictive paid hold snapshot", () => {
    const paid = paidPendingOrder();
    const first = transitionOrder(paid, {
      type: "payment_disputed",
      source: "verified_provider_event",
      providerEvidenceId: "synthetic-dispute-event-1",
    } as never);
    expect(first).toMatchObject({
      ok: true,
      value: {
        state: "paid_on_hold",
        paymentEvidenceId: "synthetic-payment-journal-1",
        clearanceEvidenceId: null,
        fulfillmentReleaseVersion: null,
      },
    });
    if (!first.ok) return;

    const second = transitionOrder(first.value, {
      type: "payment_disputed",
      source: "verified_provider_event",
      providerEvidenceId: "synthetic-dispute-event-2",
    } as never);

    expect(second).toEqual(first);
  });

  it("requires the exact consumed release before carrier handoff", () => {
    const inProgress: OrderSnapshot = {
      state: "fulfillment_in_progress",
      paymentEvidenceId: "synthetic-payment-journal-1",
      clearanceEvidenceId: "synthetic-clearance-1",
      fulfillmentReleaseVersion: 1,
      lastFulfillmentReleaseVersion: 1,
      carrierHandoffAt: null,
    };

    for (const release of [
      issuedRelease,
      { ...consumedRelease, version: 2, lastVersion: 2 },
      { ...consumedRelease, paymentEvidenceId: "other-payment" },
      { ...consumedRelease, clearanceEvidenceId: "other-clearance" },
    ]) {
      expect(
        transitionOrder(inProgress, {
          type: "carrier_handoff",
          carrierHandoffAt: "2026-08-24T12:00:00.000Z",
          recordedAt: "2026-08-24T12:00:00.000Z",
          consumedRelease: release,
        } as never),
      ).toMatchObject({
        ok: false,
        error: { code: "invalid_carrier_handoff" },
      });
    }
  });

  it("rejects a future or malformed carrier handoff timestamp", () => {
    const inProgress: OrderSnapshot = {
      state: "fulfillment_in_progress",
      paymentEvidenceId: "synthetic-payment-journal-1",
      clearanceEvidenceId: "synthetic-clearance-1",
      fulfillmentReleaseVersion: 1,
      lastFulfillmentReleaseVersion: 1,
      carrierHandoffAt: null,
    };

    for (const carrierHandoffAt of [
      "not-a-date",
      "2026-08-24T12:01:00.000Z",
    ]) {
      expect(
        transitionOrder(inProgress, {
          type: "carrier_handoff",
          carrierHandoffAt,
          recordedAt: "2026-08-24T12:00:00.000Z",
          consumedRelease,
        } as never),
      ).toMatchObject({
        ok: false,
        error: { code: "invalid_carrier_handoff" },
      });
    }
  });

  it.each([
    [
      "an unverified payment",
      false,
      "pass",
      issuedRelease,
      "missing_payment_evidence",
    ],
    [
      "a non-pass recheck",
      true,
      "unknown",
      issuedRelease,
      "eligibility_not_passed",
    ],
    [
      "a revoked release",
      true,
      "pass",
      {
        state: "revoked",
        version: null,
        lastVersion: 1,
        paymentEvidenceId: null,
        clearanceEvidenceId: null,
        expiresAt: null,
      },
      "release_not_current",
    ],
    [
      "a release for another payment",
      true,
      "pass",
      { ...issuedRelease, paymentEvidenceId: "synthetic-other-payment" },
      "invalid_release",
    ],
    [
      "an expired release",
      true,
      "pass",
      issuedRelease,
      "release_not_current",
    ],
  ] as const)(
    "does not begin fulfillment with %s",
    (_name, paymentVerified, eligibilityDecision, release, code) => {
      const ready: OrderSnapshot = {
        state: "ready_for_fulfillment",
        paymentEvidenceId: "synthetic-payment-journal-1",
        clearanceEvidenceId: "synthetic-clearance-1",
        fulfillmentReleaseVersion: 1,
        lastFulfillmentReleaseVersion: 1,
        carrierHandoffAt: null,
      };

      expect(
        transitionOrder(ready, {
          type: "begin_fulfillment",
          now:
            _name === "an expired release"
              ? "2026-08-25T12:00:00.000Z"
              : "2026-08-24T12:00:00.000Z",
          paymentVerified,
          eligibilityDecision,
          release,
        } as never),
      ).toMatchObject({ ok: false, error: { code } });
    },
  );

  it("fails closed for a malformed order snapshot", () => {
    const malformed = {
      ...draftOrder,
      lastFulfillmentReleaseVersion: -1,
    };

    expect(
      transitionOrder(malformed, { type: "start_eligibility" }),
    ).toMatchObject({ ok: false, error: { code: "invalid_snapshot" } });
  });

  it("returns structured denials for null and scalar order transition inputs", () => {
    expect(transitionOrder(null as never, { type: "start_eligibility" })).toEqual({
      ok: false,
      error: {
        code: "invalid_snapshot",
        state: "unknown",
        event: "start_eligibility",
      },
    });
    expect(transitionOrder(draftOrder, null as never)).toEqual({
      ok: false,
      error: {
        code: "invalid_transition",
        state: "draft",
        event: "unknown",
      },
    });
    expect(
      transitionOrder("malformed-snapshot" as never, {
        type: "start_eligibility",
      }),
    ).toEqual({
      ok: false,
      error: {
        code: "invalid_snapshot",
        state: "unknown",
        event: "start_eligibility",
      },
    });
    expect(transitionOrder(draftOrder, 17 as never)).toEqual({
      ok: false,
      error: {
        code: "invalid_transition",
        state: "draft",
        event: "unknown",
      },
    });
  });

  it("returns an invalid-snapshot denial for an object order snapshot", () => {
    expect(transitionOrder({} as never, {} as never)).toEqual({
      ok: false,
      error: { code: "invalid_snapshot", state: "unknown", event: "unknown" },
    });
  });

  it("returns an invalid-snapshot denial for an array order snapshot", () => {
    expect(transitionOrder([] as never, [] as never)).toEqual({
      ok: false,
      error: { code: "invalid_snapshot", state: "unknown", event: "unknown" },
    });
  });

  it("returns a typed denial for a malformed nested fulfillment release", () => {
    const ready: OrderSnapshot = {
      state: "ready_for_fulfillment",
      paymentEvidenceId: "synthetic-payment-journal-1",
      clearanceEvidenceId: "synthetic-clearance-1",
      fulfillmentReleaseVersion: 1,
      lastFulfillmentReleaseVersion: 1,
      carrierHandoffAt: null,
    };
    expect(() =>
      transitionOrder(ready, {
        type: "begin_fulfillment",
        paymentVerified: true,
        eligibilityDecision: "pass",
        release: {},
        now: "2026-08-24T12:00:00.000Z",
      } as never),
    ).not.toThrow();
    expect(
      transitionOrder(ready, {
        type: "begin_fulfillment",
        paymentVerified: true,
        eligibilityDecision: "pass",
        release: {},
        now: "2026-08-24T12:00:00.000Z",
      } as never),
    ).toEqual({
      ok: false,
      error: {
        code: "invalid_snapshot",
        state: "ready_for_fulfillment",
        event: "begin_fulfillment",
      },
    });
  });

  it("rejects malformed post-payment decisions instead of treating them as holds", () => {
    expect(
      transitionOrder(paidPendingOrder(), {
        type: "post_payment_hold",
        decision: "not-a-gate-status",
      } as never),
    ).toEqual({
      ok: false,
      error: {
        code: "invalid_transition",
        state: "paid_pending_clearance",
        event: "post_payment_hold",
      },
    });
  });

  it("rejects malformed clearance-revocation booleans", () => {
    const ready: OrderSnapshot = {
      state: "ready_for_fulfillment",
      paymentEvidenceId: "synthetic-payment-journal-1",
      clearanceEvidenceId: "synthetic-clearance-1",
      fulfillmentReleaseVersion: 1,
      lastFulfillmentReleaseVersion: 1,
      carrierHandoffAt: null,
    };

    expect(
      transitionOrder(ready, {
        type: "clearance_revoked",
        beforeCarrierHandoff: "true",
      } as never),
    ).toEqual({
      ok: false,
      error: {
        code: "invalid_transition",
        state: "ready_for_fulfillment",
        event: "clearance_revoked",
      },
    });
  });

  it("returns frozen transition results and snapshots", () => {
    const result = transitionOrder(draftOrder, { type: "start_eligibility" });

    expect(Object.isFrozen(result)).toBe(true);
    expect(result.ok && Object.isFrozen(result.value)).toBe(true);
  });

  it("rejects every event outside the documented order transition matrix", () => {
    const states: readonly OrderState[] = [
      "draft",
      "eligibility_review",
      "compliance_hold",
      "ready_for_checkout",
      "checkout_pending",
      "payment_failed",
      "paid_pending_clearance",
      "paid_on_hold",
      "ready_for_fulfillment",
      "fulfillment_in_progress",
      "fulfilled",
      "cancelled",
    ];
    const snapshotFor = (state: OrderState): OrderSnapshot => {
      if (state === "paid_pending_clearance" || state === "paid_on_hold") {
        return {
          ...draftOrder,
          state,
          paymentEvidenceId: "synthetic-payment-journal-1",
          lastFulfillmentReleaseVersion:
            state === "paid_on_hold" ? 1 : 0,
        };
      }
      if (
        state === "ready_for_fulfillment" ||
        state === "fulfillment_in_progress" ||
        state === "fulfilled"
      ) {
        return {
          state,
          paymentEvidenceId: "synthetic-payment-journal-1",
          clearanceEvidenceId: "synthetic-clearance-1",
          fulfillmentReleaseVersion: 1,
          lastFulfillmentReleaseVersion: 1,
          carrierHandoffAt:
            state === "fulfilled" ? "2026-08-24T12:00:00.000Z" : null,
        };
      }
      return { ...draftOrder, state };
    };
    const events: readonly OrderEvent[] = [
      { type: "start_eligibility" },
      { type: "place_compliance_hold" },
      { type: "resume_eligibility" },
      { type: "eligibility_passed", decision: "pass" },
      { type: "begin_checkout" },
      {
        type: "checkout_closed",
        source: "verified_provider_event",
        reason: "checkout_expired",
        providerEvidenceId: "synthetic-provider-event-1",
      },
      {
        type: "payment_verified",
        source: "verified_provider_event",
        paymentEvidenceId: "synthetic-payment-journal-1",
      },
      {
        type: "payment_disputed",
        source: "verified_provider_event",
        providerEvidenceId: "synthetic-dispute-event-1",
      } as never,
      { type: "post_payment_hold", decision: "unknown" },
      {
        type: "release_for_fulfillment",
        decision: "pass",
        paymentEvidenceId: "synthetic-payment-journal-1",
        clearanceEvidenceId: "synthetic-clearance-2",
        fulfillmentReleaseVersion: 2,
      },
      {
        type: "begin_fulfillment",
        now: "2026-08-24T12:00:00.000Z",
        paymentVerified: true,
        eligibilityDecision: "pass",
        release: issuedRelease,
      } as never,
      { type: "clearance_revoked", beforeCarrierHandoff: true },
      {
        type: "carrier_handoff",
        carrierHandoffAt: "2026-08-24T12:00:00.000Z",
        recordedAt: "2026-08-24T12:00:00.000Z",
        consumedRelease,
      },
      { type: "cancel" },
    ];
    const allowedEvents: Readonly<Record<OrderState, readonly string[]>> = {
      draft: ["start_eligibility", "cancel"],
      eligibility_review: [
        "place_compliance_hold",
        "eligibility_passed",
        "cancel",
      ],
      compliance_hold: ["resume_eligibility", "cancel"],
      ready_for_checkout: ["begin_checkout"],
      checkout_pending: ["checkout_closed", "payment_verified"],
      payment_failed: ["cancel"],
      paid_pending_clearance: [
        "post_payment_hold",
        "release_for_fulfillment",
        "payment_disputed",
      ],
      paid_on_hold: ["release_for_fulfillment", "payment_disputed"],
      ready_for_fulfillment: [
        "begin_fulfillment",
        "clearance_revoked",
        "payment_disputed",
      ],
      fulfillment_in_progress: [
        "clearance_revoked",
        "carrier_handoff",
        "payment_disputed",
      ],
      fulfilled: [],
      cancelled: [],
    };

    for (const state of states) {
      for (const event of events) {
        if (allowedEvents[state].includes(event.type)) continue;

        expect(transitionOrder(snapshotFor(state), event)).toEqual({
          ok: false,
          error: { code: "invalid_transition", state, event: event.type },
        });
      }
    }
  });
});

describe("transitionFulfillmentRelease", () => {
  it("issues a release only with verified payment and all-pass clearance evidence", () => {
    const absent: FulfillmentReleaseSnapshot = {
      state: "absent",
      version: null,
      lastVersion: 0,
      paymentEvidenceId: null,
      clearanceEvidenceId: null,
      expiresAt: null,
    };

    const result = transitionFulfillmentRelease(absent, {
      type: "issue",
      now: "2026-08-24T12:00:00.000Z",
      paymentVerified: true,
      eligibilityDecision: "pass",
      version: 1,
      paymentEvidenceId: "synthetic-payment-journal-1",
      clearanceEvidenceId: "synthetic-clearance-1",
      expiresAt: "2026-08-25T12:00:00.000Z",
    });

    expect(result).toEqual({
      ok: true,
      value: {
        state: "issued",
        version: 1,
        lastVersion: 1,
        paymentEvidenceId: "synthetic-payment-journal-1",
        clearanceEvidenceId: "synthetic-clearance-1",
        expiresAt: "2026-08-25T12:00:00.000Z",
      },
    });
  });

  it("allows fulfillment only for verified payment, all-pass recheck, and a current issued release", () => {
    const release: FulfillmentReleaseSnapshot = {
      state: "issued",
      version: 1,
      lastVersion: 1,
      paymentEvidenceId: "synthetic-payment-journal-1",
      clearanceEvidenceId: "synthetic-clearance-1",
      expiresAt: "2026-08-25T12:00:00.000Z",
    };

    expect(
      canFulfill({
        paymentVerified: true,
        eligibilityDecision: "pass",
        release,
        now: "2026-08-24T12:00:00.000Z",
      }),
    ).toEqual({ ok: true, value: true });
  });

  it("revokes or expires a release and permits only a newer evidence-backed reissue", () => {
    const absent: FulfillmentReleaseSnapshot = {
      state: "absent",
      version: null,
      lastVersion: 0,
      paymentEvidenceId: null,
      clearanceEvidenceId: null,
      expiresAt: null,
    };
    const issue = (snapshot: FulfillmentReleaseSnapshot, version: number) =>
      transitionFulfillmentRelease(snapshot, {
        type: "issue",
        now: "2026-08-24T12:00:00.000Z",
        paymentVerified: true,
        eligibilityDecision: "pass",
        version,
        paymentEvidenceId: "synthetic-payment-journal-1",
        clearanceEvidenceId: `synthetic-clearance-${version}`,
        expiresAt: "2026-08-25T12:00:00.000Z",
      });

    const first = issue(absent, 1);
    if (!first.ok) throw new Error("synthetic test setup failed");
    const revoked = transitionFulfillmentRelease(first.value, {
      type: "revoke",
      reasonCode: "synthetic_policy_changed",
    });
    expect(revoked).toMatchObject({
      ok: true,
      value: { state: "revoked", version: null, lastVersion: 1 },
    });
    if (!revoked.ok) return;

    expect(issue(revoked.value, 1)).toMatchObject({
      ok: false,
      error: { code: "invalid_release" },
    });
    const second = issue(revoked.value, 2);
    expect(second).toMatchObject({
      ok: true,
      value: { state: "issued", version: 2, lastVersion: 2 },
    });
    if (!second.ok) return;

    const expired = transitionFulfillmentRelease(second.value, {
      type: "expire",
      now: "2026-08-25T12:00:00.000Z",
    });
    expect(expired).toMatchObject({
      ok: true,
      value: { state: "expired", version: null, lastVersion: 2 },
    });
    if (!expired.ok) return;

    const third = issue(expired.value, 3);
    if (!third.ok) throw new Error("synthetic test setup failed");
    const consumed = transitionFulfillmentRelease(third.value, {
      type: "consume",
      now: "2026-08-24T12:00:00.000Z",
      atomicEligibilityRecheck: "pass",
    });
    expect(consumed).toMatchObject({
      ok: true,
      value: { state: "consumed", version: 3, lastVersion: 3 },
    });
    if (!consumed.ok) return;

    expect(
      transitionFulfillmentRelease(consumed.value, {
        type: "consume",
        now: "2026-08-24T12:01:00.000Z",
        atomicEligibilityRecheck: "pass",
      }),
    ).toMatchObject({
      ok: false,
      error: { code: "release_already_consumed" },
    });
  });

  it.each([
    ["past", "2026-08-24T11:59:59.999Z"],
    ["equal to now", "2026-08-24T12:00:00.000Z"],
    ["malformed", "not-a-date"],
  ] as const)("rejects an expiration that is %s", (_name, expiresAt) => {
    const absent: FulfillmentReleaseSnapshot = {
      state: "absent",
      version: null,
      lastVersion: 0,
      paymentEvidenceId: null,
      clearanceEvidenceId: null,
      expiresAt: null,
    };

    expect(
      transitionFulfillmentRelease(absent, {
        type: "issue",
        now: "2026-08-24T12:00:00.000Z",
        paymentVerified: true,
        eligibilityDecision: "pass",
        version: 1,
        paymentEvidenceId: "synthetic-payment-journal-1",
        clearanceEvidenceId: "synthetic-clearance-1",
        expiresAt,
      } as never),
    ).toMatchObject({ ok: false, error: { code: "invalid_release" } });
  });

  it.each([
    [false, "pass", issuedRelease, "missing_payment_evidence"],
    [true, "unknown", issuedRelease, "eligibility_not_passed"],
    [
      true,
      "pass",
      {
        state: "revoked",
        version: null,
        lastVersion: 1,
        paymentEvidenceId: null,
        clearanceEvidenceId: null,
        expiresAt: null,
      },
      "release_not_current",
    ],
    [true, "pass", { ...issuedRelease, paymentEvidenceId: "   " }, "invalid_snapshot"],
  ] as const)(
    "denies fulfillment when payment=%s, eligibility=%s, or release is invalid",
    (paymentVerified, eligibilityDecision, release, code) => {
      expect(
        canFulfill({
          paymentVerified,
          eligibilityDecision,
          release: release as FulfillmentReleaseSnapshot,
          now: "2026-08-24T12:00:00.000Z",
        }),
      ).toMatchObject({ ok: false, error: { code } });
    },
  );

  it("returns structured denials for null and scalar release inputs", () => {
    const absent: FulfillmentReleaseSnapshot = {
      state: "absent",
      version: null,
      lastVersion: 0,
      paymentEvidenceId: null,
      clearanceEvidenceId: null,
      expiresAt: null,
    };

    expect(transitionFulfillmentRelease(null as never, { type: "consume", now: "2026-08-24T12:00:00.000Z", atomicEligibilityRecheck: "pass" })).toEqual({
      ok: false,
      error: { code: "invalid_snapshot", state: "unknown", event: "consume" },
    });
    expect(transitionFulfillmentRelease(absent, null as never)).toEqual({
      ok: false,
      error: { code: "invalid_transition", state: "absent", event: "unknown" },
    });
    expect(
      transitionFulfillmentRelease("malformed-snapshot" as never, {
        type: "consume",
        now: "2026-08-24T12:00:00.000Z",
        atomicEligibilityRecheck: "pass",
      }),
    ).toEqual({
      ok: false,
      error: { code: "invalid_snapshot", state: "unknown", event: "consume" },
    });
    expect(transitionFulfillmentRelease(absent, 17 as never)).toEqual({
      ok: false,
      error: { code: "invalid_transition", state: "absent", event: "unknown" },
    });
    expect(canFulfill(null as never)).toEqual({
      ok: false,
      error: { code: "invalid_snapshot", state: "unknown", event: "fulfill" },
    });
    expect(canFulfill("malformed-input" as never)).toEqual({
      ok: false,
      error: { code: "invalid_snapshot", state: "unknown", event: "fulfill" },
    });
    expect(canFulfill({ release: null } as never)).toEqual({
      ok: false,
      error: { code: "invalid_snapshot", state: "unknown", event: "fulfill" },
    });
  });

  it("does not treat truthy non-boolean payment markers as verified", () => {
    const absent: FulfillmentReleaseSnapshot = {
      state: "absent",
      version: null,
      lastVersion: 0,
      paymentEvidenceId: null,
      clearanceEvidenceId: null,
      expiresAt: null,
    };

    expect(
      transitionFulfillmentRelease(absent, {
        type: "issue",
        now: "2026-08-24T12:00:00.000Z",
        paymentVerified: "false",
        eligibilityDecision: "pass",
        version: 1,
        paymentEvidenceId: "synthetic-payment-journal-1",
        clearanceEvidenceId: "synthetic-clearance-1",
        expiresAt: "2026-08-25T12:00:00.000Z",
      } as never),
    ).toMatchObject({
      ok: false,
      error: { code: "missing_payment_evidence" },
    });

    expect(
      canFulfill({
        paymentVerified: "false",
        eligibilityDecision: "pass",
        release: issuedRelease,
        now: "2026-08-24T12:00:00.000Z",
      } as never),
    ).toMatchObject({
      ok: false,
      error: { code: "missing_payment_evidence" },
    });
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
