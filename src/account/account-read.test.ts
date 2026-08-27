import { describe, expect, it, vi } from "vitest";

import { listOwnOrders, loadOwnOrder, type AccountReadQueryPort } from "./account-read";

const ownerId = "10000000-0000-4000-8000-000000000001";
const orderId = "10000000-0000-4000-8000-000000000002";

describe("owner-scoped order reads", () => {
  it("rejects malformed owner or order identifiers before SQL casting", async () => {
    const query = vi.fn();
    await expect(
      loadOwnOrder(
        { query },
        ownerId,
        "not-a-uuid",
      ),
    ).resolves.toBeNull();
    expect(query).not.toHaveBeenCalled();
  });

  it("projects bounded payment, refund, hold, release, and shipment state for the owner", async () => {
    let selectedSql = "";
    const query = vi.fn(async (sql: string) => {
      selectedSql = sql;
      return { rows: [{
      id: orderId,
      state: "paid_on_hold",
      currency: "USD",
      totalMinor: "5141",
      verifiedPaymentCount: "1",
      failedPaymentCount: "0",
      refundCount: "1",
      confirmedRefundMinor: "0",
      pendingRefundCount: "1",
      failedRefundCount: "0",
      releaseCount: "0",
      releaseState: null,
      shipmentCount: "1",
      shipmentState: "pending",
      carrier: "STAFF-ONLY-CARRIER-SENTINEL",
      trackingReference: "STAFF-ONLY-TRACKING-SENTINEL",
      createdAt: "2026-08-26T12:00:00.000Z",
      }] };
    });
    const orders = await listOwnOrders(
      { query: query as AccountReadQueryPort["query"] },
      ownerId,
    );
    expect(orders).toEqual([expect.objectContaining({
      id: orderId,
      paymentState: "paid",
      refundState: "pending",
      holdState: "active",
      releaseState: "none",
      shipmentState: "pending",
    })]);
    expect(orders[0]).not.toHaveProperty("carrier");
    expect(orders[0]).not.toHaveProperty("trackingReference");
    expect(selectedSql).toMatch(/buyer_user_id = \$1::uuid/iu);
    expect(selectedSql).not.toMatch(/shipping_address|email|provider_session|provider_refund_id|carrier|tracking/iu);
  });

  it("fails closed instead of choosing among incoherent payment, release, or shipment rows", async () => {
    const query = vi.fn(async () => ({ rows: [{
      id: orderId,
      state: "paid_pending_fulfillment",
      currency: "USD",
      totalMinor: "5141",
      verifiedPaymentCount: "2",
      failedPaymentCount: "0",
      refundCount: "0",
      confirmedRefundMinor: "0",
      pendingRefundCount: "0",
      failedRefundCount: "0",
      releaseCount: "0",
      releaseState: null,
      shipmentCount: "0",
      shipmentState: null,
      createdAt: "2026-08-26T12:00:00.000Z",
    }] }));
    await expect(listOwnOrders(
      { query: query as AccountReadQueryPort["query"] },
      ownerId,
    )).rejects.toThrow(/coherent/iu);
  });
});
