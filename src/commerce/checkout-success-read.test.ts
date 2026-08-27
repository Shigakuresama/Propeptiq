import { describe, expect, it, vi } from "vitest";

import {
  loadCheckoutSuccess,
  type CheckoutSuccessQueryPort,
} from "@/commerce/checkout-success-read";

const ownerId = "6a000000-0000-4000-8000-000000000001";
const orderId = "61000000-0000-4000-8000-000000000003";

describe("checkout success read model", () => {
  it("is canonical-owner scoped, SELECT-only, and redacts provider/address facts", async () => {
    const queries: string[] = [];
    const query = vi.fn(async (sql: string, params: readonly unknown[] = []) => {
      queries.push(sql);
      expect(params).toEqual([orderId, ownerId]);
      if (queries.length === 1) {
        return { rows: [{
          orderId,
          state: "checkout_pending",
          currency: "USD",
          subtotalMinor: "4800",
          discountMinor: "480",
          shippingMinor: "500",
          taxMinor: "321",
          totalMinor: "5141",
          verifiedPaymentCount: "0",
          failedPaymentCount: "0",
          refundCount: "0",
          confirmedRefundMinor: "0",
          pendingRefundCount: "0",
          releaseCount: "0",
          releaseState: null,
          shipmentCount: "0",
          shipmentState: null,
          createdAt: "2026-08-26T12:00:00.000Z",
          updatedAt: "2026-08-26T12:00:00.000Z",
        }] };
      }
      return { rows: [{
        id: "61000000-0000-4000-8000-000000000004",
        productName: "Synthetic Alpha Reference",
        packageForm: "Synthetic sealed vial",
        quantity: 2,
        unitAmountMinor: "2400",
        subtotalMinor: "4800",
        discountMinor: "480",
        totalMinor: "4320",
      }] };
    });
    const result = await loadCheckoutSuccess(
      { query: query as CheckoutSuccessQueryPort["query"] },
      ownerId,
      orderId,
    );
    expect(result).toMatchObject({
      orderId,
      paymentState: "pending_verification",
      refundState: "none",
      holdState: "none",
      releaseState: "none",
      shipmentState: "none",
      totalMinor: 5_141,
    });
    expect(result).not.toHaveProperty("destination");
    expect(result).not.toHaveProperty("email");
    expect(result).not.toHaveProperty("providerSessionId");
    expect(queries).toHaveLength(2);
    for (const sql of queries) {
      expect(sql.trim().toUpperCase()).toMatch(/^SELECT/u);
      expect(sql).not.toMatch(/\b(?:INSERT|UPDATE|DELETE|MERGE)\b/iu);
    }
  });

  it("returns null without a query for malformed or non-canonical IDs", async () => {
    const query = vi.fn();
    const port = { query: query as CheckoutSuccessQueryPort["query"] };
    await expect(loadCheckoutSuccess(port, ownerId.toUpperCase(), orderId)).resolves.toBeNull();
    await expect(loadCheckoutSuccess(port, ownerId, "not-an-order")).resolves.toBeNull();
    expect(query).not.toHaveBeenCalled();
  });

  it("fails closed on impossible multiplicity", async () => {
    const query = vi.fn(async () => ({ rows: [{ orderId }, { orderId }] }));
    await expect(loadCheckoutSuccess(
      { query: query as CheckoutSuccessQueryPort["query"] },
      ownerId,
      orderId,
    )).rejects.toThrow(/coherent/iu);
  });

  it("accepts a coherent versioned release history and projects only the latest state", async () => {
    const query = vi.fn(async () => query.mock.calls.length === 1 ? ({ rows: [{
      orderId, state: "fulfillment_in_progress", currency: "USD",
      subtotalMinor: 2400, discountMinor: 0, shippingMinor: 0, taxMinor: 0, totalMinor: 2400,
      verifiedPaymentCount: 1, failedPaymentCount: 0,
      refundCount: 0, confirmedRefundMinor: 0, pendingRefundCount: 0, failedRefundCount: 0,
      releaseCount: 2, releaseVersion: 2, releaseState: "consumed",
      shipmentCount: 1, shipmentState: "handed_off",
      createdAt: "2026-08-26T12:00:00.000Z", updatedAt: "2026-08-26T12:01:00.000Z",
    }] }) : ({ rows: [{
      id: "61000000-0000-4000-8000-000000000004",
      productName: "Synthetic Alpha Reference", packageForm: "Synthetic sealed vial",
      quantity: 1, unitAmountMinor: 2400, subtotalMinor: 2400, discountMinor: 0, totalMinor: 2400,
    }] }));

    await expect(loadCheckoutSuccess(
      { query: query as CheckoutSuccessQueryPort["query"] }, ownerId, orderId,
    )).resolves.toMatchObject({ releaseState: "consumed", shipmentState: "handed_off" });
  });
});
