import { describe, expect, it } from "vitest";

import { transitionShipment, type ShipmentSnapshot } from "./shipments";

const base: ShipmentSnapshot = Object.freeze({
  shipmentId: "78000000-0000-4000-8000-000000000001",
  orderId: "78000000-0000-4000-8000-000000000002",
  fulfillmentReleaseId: "78000000-0000-4000-8000-000000000003",
  state: "handed_off",
  handedOffAt: "2026-08-26T12:00:00.000Z",
  deliveredAt: null,
});

describe("shipment delivery and exception state table", () => {
  it("delivers from handed-off or exception and replays delivered", () => {
    for (const state of ["handed_off", "exception"] as const) {
      const delivered = transitionShipment({ ...base, state }, {
        type: "deliver",
        now: "2026-08-26T12:05:00.000Z",
      });
      expect(delivered).toMatchObject({
        ok: true,
        changed: true,
        snapshot: {
          state: "delivered",
          deliveredAt: "2026-08-26T12:05:00.000Z",
        },
      });
      if (!delivered.ok) continue;
      expect(
        transitionShipment(delivered.snapshot, {
          type: "deliver",
          now: "2026-08-26T12:06:00.000Z",
        }),
      ).toMatchObject({ ok: true, changed: false });
    }
  });

  it("records exception only from handed-off and replays the same exception", () => {
    const exception = transitionShipment(base, {
      type: "record_exception",
      now: "2026-08-26T12:05:00.000Z",
    });
    expect(exception).toMatchObject({
      ok: true,
      changed: true,
      snapshot: { state: "exception", deliveredAt: null },
    });
    if (!exception.ok) return;
    expect(
      transitionShipment(exception.snapshot, {
        type: "record_exception",
        now: "2026-08-26T12:06:00.000Z",
      }),
    ).toMatchObject({ ok: true, changed: false });
  });

  it("never regresses delivered and rejects malformed snapshots or instants", () => {
    const delivered: ShipmentSnapshot = Object.freeze({
      ...base,
      state: "delivered",
      deliveredAt: "2026-08-26T12:05:00.000Z",
    });
    expect(
      transitionShipment(delivered, {
        type: "record_exception",
        now: "2026-08-26T12:06:00.000Z",
      }),
    ).toEqual({ ok: false, code: "delivered_terminal" });
    expect(
      transitionShipment({ ...base, fulfillmentReleaseId: null } as never, {
        type: "deliver",
        now: "2026-08-26T12:05:00.000Z",
      }),
    ).toEqual({ ok: false, code: "invalid_snapshot" });
    expect(
      transitionShipment(base, {
        type: "deliver",
        now: "browser-time",
      }),
    ).toEqual({ ok: false, code: "invalid_event" });
  });

  it("rejects a delivery timestamp captured before the immutable handoff", () => {
    expect(
      transitionShipment(base, {
        type: "deliver",
        now: "2026-08-26T11:59:59.999Z",
      }),
    ).toEqual({ ok: false, code: "invalid_transition" });
  });
});
