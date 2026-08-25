import { describe, expect, it } from "vitest";

import {
  evaluateFulfillment,
  FULFILLMENT_DENIAL_CODES,
  isAuthoritativeFulfillmentDecision,
  type FulfillmentInput,
} from "@/domain/fulfillment";

function validInput(overrides: Partial<FulfillmentInput> = {}): FulfillmentInput {
  return {
    orderId: "synthetic-order-1",
    verifiedPaymentEventId: "synthetic-payment-event-1",
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
  };
}

describe("evaluateFulfillment", () => {
  it("exports the exact stable denial-code order", () => {
    expect(FULFILLMENT_DENIAL_CODES).toEqual([
      "fulfillment_input_invalid",
      "payment_unverified",
      "refund_pending",
      "payment_refunded",
      "payment_disputed",
      "order_hold_active",
      "buyer_blocked",
      "buyer_review_not_covered",
      "product_inactive",
      "destination_not_allowed",
      "destination_review_not_covered",
      "inventory_reservation_missing",
      "reserved_lot_unavailable",
      "shipment_metadata_missing",
      "fulfillment_unavailable",
    ]);
    expect(Object.isFrozen(FULFILLMENT_DENIAL_CODES)).toBe(true);
  });

  it("permits only complete current facts with verified payment", () => {
    const decision = evaluateFulfillment(validInput());
    expect(decision).toEqual({
      permitted: true,
      reasons: [],
      orderId: "synthetic-order-1",
      verifiedPaymentEventId: "synthetic-payment-event-1",
      reviewRequestId: null,
    });
    expect(isAuthoritativeFulfillmentDecision(decision)).toBe(true);
  });

  it.each([
    ["payment_unverified", { verifiedPaymentEventId: null }],
    ["refund_pending", { refundPending: true }],
    ["payment_refunded", { confirmedRefundAmountMinor: 1 }],
    ["payment_disputed", { paymentDisputed: true }],
    ["order_hold_active", { orderHoldActive: true }],
    ["buyer_blocked", { buyerStatus: "blocked" }],
    ["buyer_review_not_covered", { buyerStatus: "review" }],
    ["product_inactive", { productsActive: false }],
    ["destination_not_allowed", { destinationStatus: "blocked" }],
    ["destination_not_allowed", { destinationStatus: "unavailable" }],
    ["destination_review_not_covered", { destinationStatus: "review" }],
    ["inventory_reservation_missing", { inventoryReservationsComplete: false }],
    ["reserved_lot_unavailable", { reservedLotsAvailable: false }],
    ["shipment_metadata_missing", { shipmentMetadataPresent: false }],
    ["fulfillment_unavailable", { fulfillmentCapabilityEnabled: false }],
  ] as const)(
    "returns %s for its exact current-fact failure",
    (reason, overrides) => {
      expect(
        evaluateFulfillment(validInput(overrides as Partial<FulfillmentInput>)),
      ).toMatchObject({ permitted: false, reasons: [reason] });
    },
  );

  it("orders and deduplicates simultaneous reasons", () => {
    expect(
      evaluateFulfillment(
        validInput({
          verifiedPaymentEventId: null,
          refundPending: true,
          confirmedRefundAmountMinor: 5,
          paymentDisputed: true,
          orderHoldActive: true,
          buyerStatus: "blocked",
          productsActive: false,
          destinationStatus: "blocked",
          inventoryReservationsComplete: false,
          reservedLotsAvailable: false,
          shipmentMetadataPresent: false,
          fulfillmentCapabilityEnabled: false,
        }),
      ).reasons,
    ).toEqual([
      "payment_unverified",
      "refund_pending",
      "payment_refunded",
      "payment_disputed",
      "order_hold_active",
      "buyer_blocked",
      "product_inactive",
      "destination_not_allowed",
      "inventory_reservation_missing",
      "reserved_lot_unavailable",
      "shipment_metadata_missing",
      "fulfillment_unavailable",
    ]);
  });

  it("binds one exact review request for covered buyer and destination review", () => {
    expect(
      evaluateFulfillment(
        validInput({
          buyerStatus: "review",
          buyerReviewCovered: true,
          destinationStatus: "review",
          destinationReviewCovered: true,
          reviewRequestId: "synthetic-review-1",
        }),
      ),
    ).toMatchObject({
      permitted: true,
      reasons: [],
      reviewRequestId: "synthetic-review-1",
    });
  });

  it.each([
    { buyerStatus: "review", buyerReviewCovered: true, reviewRequestId: null },
    {
      destinationStatus: "review",
      destinationReviewCovered: true,
      reviewRequestId: " ",
    },
    { reviewRequestId: "synthetic-unrelated-review" },
    { buyerStatus: "blocked", buyerReviewCovered: true },
    { destinationStatus: "blocked", destinationReviewCovered: true },
  ] as const)("fails malformed review binding closed", (overrides) => {
    expect(
      evaluateFulfillment(validInput(overrides as Partial<FulfillmentInput>)),
    ).toMatchObject({
      permitted: false,
      reasons: ["fulfillment_input_invalid"],
      verifiedPaymentEventId: null,
      reviewRequestId: null,
    });
  });

  it.each([
    null,
    [],
    { ...validInput(), orderId: " " },
    { ...validInput(), verifiedPaymentEventId: " " },
    { ...validInput(), refundPending: "false" },
    { ...validInput(), confirmedRefundAmountMinor: -1 },
    { ...validInput(), confirmedRefundAmountMinor: 1.5 },
    { ...validInput(), buyerStatus: "pending" },
    { ...validInput(), destinationStatus: "unknown" },
  ])("returns one authoritative malformed-input denial for %j", (input) => {
    const decision = evaluateFulfillment(input as never);
    expect(decision.reasons).toEqual(["fulfillment_input_invalid"]);
    expect(decision.permitted).toBe(false);
    expect(isAuthoritativeFulfillmentDecision(decision)).toBe(true);
  });

  it("cannot be forged or copied and returns deeply immutable decisions", () => {
    const decision = evaluateFulfillment(validInput());
    expect(isAuthoritativeFulfillmentDecision({ ...decision })).toBe(false);
    expect(
      isAuthoritativeFulfillmentDecision(Object.freeze({ ...decision })),
    ).toBe(false);
    expect(Object.isFrozen(decision)).toBe(true);
    expect(Object.isFrozen(decision.reasons)).toBe(true);
  });

  it("does not require checkout-only gates", () => {
    const decision = evaluateFulfillment(validInput());
    expect(decision).not.toHaveProperty("authenticated");
    expect(decision).not.toHaveProperty("attestation");
    expect(decision).not.toHaveProperty("price");
    expect(decision).not.toHaveProperty("tax");
    expect(decision).not.toHaveProperty("paymentProviderAvailable");
    expect(decision.permitted).toBe(true);
  });
});
