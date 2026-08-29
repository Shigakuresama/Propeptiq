import { render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const actions = vi.hoisted(() => ({
  activateProductAction: vi.fn(),
  activatePromotionAction: vi.fn(),
  adjustRewardBalanceAction: vi.fn(),
  changeBuyerStatusAction: vi.fn(),
  changeStaffCapabilityAction: vi.fn(),
  clearFulfillmentHoldAction: vi.fn(),
  createAffiliatePayoutBatchAdminAction: vi.fn(),
  decideReviewAction: vi.fn(),
  deactivateSharedSetAction: vi.fn(),
  decideAffiliateApplicationAction: vi.fn(),
  handoffFulfillmentAction: vi.fn(),
  markShipmentDeliveredAction: vi.fn(),
  recordShipmentExceptionAction: vi.fn(),
  recordAffiliatePayoutPaidAdminAction: vi.fn(),
  publishAttestationAction: vi.fn(),
  publishCoaAction: vi.fn(),
  requestRefundAction: vi.fn(),
  revokeReferralCodeAction: vi.fn(),
  retireProductAction: vi.fn(),
  retirePromotionAction: vi.fn(),
  saveAnalyticalClaimDraftAction: vi.fn(),
  saveCoaDraftAction: vi.fn(),
  saveLotDraftAction: vi.fn(),
  savePolicyGroupAction: vi.fn(),
  saveProductDraftAction: vi.fn(),
  savePromotionDraftAction: vi.fn(),
  saveShipmentAction: vi.fn(),
  setAnalyticalClaimLifecycleAction: vi.fn(),
  setCoaLifecycleAction: vi.fn(),
  setLotLifecycleAction: vi.fn(),
  setPolicyGroupLifecycleAction: vi.fn(),
  submitOrRecoverRefundAction: vi.fn(),
  supersedeDestinationAction: vi.fn(),
  supersedeProductPriceAction: vi.fn(),
  suspendAffiliateApplicationAction: vi.fn(),
}));

vi.mock("@/admin/actions", () => actions);

import { resourceBySlug } from "@/admin/access";
import type { AdminReadSnapshot } from "@/admin/admin-read";
import { AdminResourceRecords } from "./admin-resource-records";
import { ResourceCommandPanel } from "./resource-command-panel";

const orderId = "68000000-0000-4000-8000-000000000001";
const refundId = "68000000-0000-4000-8000-000000000002";

function resource(slug: "orders" | "prices" | "refunds" | "shipments") {
  const selected = resourceBySlug(slug);
  if (!selected) throw new Error(`missing resource ${slug}`);
  return selected;
}

function snapshot<Resource extends "orders" | "prices" | "refunds" | "shipments">(
  value: object,
): Extract<AdminReadSnapshot, { resource: Resource }> {
  return value as Extract<AdminReadSnapshot, { resource: Resource }>;
}

function assertOnlyMutationField(formName: string, expectedName: string, expectedValue: string) {
  const form = screen.getByRole("form", { name: formName });
  const named = [...form.querySelectorAll("input[name], select[name], textarea[name]")];
  expect(named.map((element) => element.getAttribute("name"))).toEqual([expectedName]);
  expect((named[0] as HTMLInputElement).value).toBe(expectedValue);
}

describe("Slice 6G staff commerce commands", () => {
  it("describes truncation and signed payment authority without internal task labels", () => {
    const value = snapshot<"orders">({
      resource: "orders", limit: 100, truncated: true,
      items: [{
        id: orderId, buyerUserId: "redacted-owner", buyerStatusSnapshot: "active",
        attestationAcceptanceId: "redacted-attestation", attestationVersion: 1,
        destinationStateCode: "CA", currency: "USD", subtotalMinor: 2400,
        discountMinor: 0, taxMinor: 0, shippingMinor: 0, totalMinor: 2400,
        state: "paid_pending_fulfillment", itemCount: 1, verifiedPaymentEventCount: 1,
        paymentState: "paid", refundState: "none", holdState: "none",
        currentReleaseState: null, releaseVersion: null, shipmentState: null,
        providerExecutionBoundary: "task6_managed",
        createdAt: "2026-08-26T12:00:00.000Z", updatedAt: "2026-08-26T12:00:00.000Z",
      }],
    });
    const { container } = render(<AdminResourceRecords snapshot={value} />);

    expect(screen.getByText(
      "Matching verified signed provider evidence changes payment state. Staff commands cannot mark an order paid.",
    )).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Showing the first 100 records. Narrower filters are unavailable for the current view.",
    );
    expect(container).not.toHaveTextContent(/Task (?:5|6)|slice/iu);
  });

  it("states the stable USD supersession rule without an internal task label", () => {
    const value = snapshot<"prices">({
      resource: "prices", limit: 100, truncated: false,
      items: [{
        id: "68000000-0000-4000-8000-000000000005",
        productId: "68000000-0000-4000-8000-000000000006",
        productName: "Synthetic staff price",
        version: 1,
        amountMinor: 2400,
        currency: "USD",
        effectiveAt: "2026-08-26T12:00:00.000Z",
        supersededAt: null,
        createdAt: "2026-08-26T12:00:00.000Z",
      }],
    });
    const { container } = render(
      <ResourceCommandPanel resource={resource("prices")} snapshot={value} />,
    );

    expect(screen.getByText(
      "Only USD is accepted. Prior prices remain immutable and are atomically superseded.",
    )).toBeVisible();
    expect(container).not.toHaveTextContent(/Task (?:5|6)|slice/iu);
  });

  it("shows redacted order lifecycle state and clear-hold as its own UUID-only command", () => {
    const value = snapshot<"orders">({
      resource: "orders", limit: 100, truncated: false,
      items: [{
        id: orderId, buyerUserId: "redacted-owner", buyerStatusSnapshot: "active",
        attestationAcceptanceId: "redacted-attestation", attestationVersion: 1,
        destinationStateCode: "CA", currency: "USD", subtotalMinor: 2400,
        discountMinor: 0, taxMinor: 0, shippingMinor: 0, totalMinor: 2400,
        state: "paid_on_hold", itemCount: 1, verifiedPaymentEventCount: 1,
        paymentState: "paid", refundState: "none", holdState: "active",
        currentReleaseState: null, releaseVersion: null, shipmentState: "pending",
        providerExecutionBoundary: "task6_managed",
        createdAt: "2026-08-26T12:00:00.000Z", updatedAt: "2026-08-26T12:00:00.000Z",
      }],
    });
    render(<><AdminResourceRecords snapshot={value} /><ResourceCommandPanel resource={resource("orders")} snapshot={value} /></>);

    expect(screen.getByText("Payment", { selector: "dt" })).toBeVisible();
    expect(screen.getByText("Current hold", { selector: "dt" })).toBeVisible();
    expect(screen.getByText("Refund", { selector: "dt" })).toBeVisible();
    expect(screen.getByText("Shipment", { selector: "dt" })).toBeVisible();
    assertOnlyMutationField(`Clear fulfillment hold · ${orderId}`, "orderId", orderId);
  });

  it("keeps refund intent separate and exposes UUID-only submission or recovery", () => {
    const value = snapshot<"refunds">({
      resource: "refunds", limit: 100, truncated: false,
      items: [{
        id: refundId, orderId, requestedByUserId: null,
        verifiedPaymentEventId: "redacted-payment-event", provider: "local_test",
        requestedAmountMinor: 500, confirmedAmountMinor: null, currency: "USD",
        status: "submitted", reasonRedacted: null,
        requestedAt: "2026-08-26T12:00:00.000Z", confirmedAt: null,
        providerRefundRecorded: true, providerExecutionBoundary: "task6_managed",
      }],
    });
    render(<ResourceCommandPanel resource={resource("refunds")} snapshot={value} />);

    expect(screen.getByRole("form", { name: "Record a requested refund intent" })).toBeVisible();
    assertOnlyMutationField(`Submit or recover refund · ${refundId}`, "refundId", refundId);
    expect(screen.getByText(/awaiting a signed provider event/i)).toBeVisible();
  });

  it("keeps preparation separate from UUID-only handoff, delivery, and exception commands", () => {
    const pending = snapshot<"shipments">({
      resource: "shipments", limit: 100, truncated: false,
      items: [{
        id: "68000000-0000-4000-8000-000000000003", orderId,
        fulfillmentReleaseId: null, releaseState: null, releaseVersion: null,
        releaseExpiresAt: null, carrier: "Staff-only synthetic carrier",
        trackingReference: "STAFF-ONLY-SYNTHETIC-TRACKING",
        state: "pending", handedOffAt: null, deliveredAt: null,
        createdAt: "2026-08-26T12:00:00.000Z", updatedAt: "2026-08-26T12:00:00.000Z",
        handoffConfirmationBoundary: "task6_managed",
      }],
    });
    const { rerender } = render(<>
      <AdminResourceRecords snapshot={pending} />
      <ResourceCommandPanel resource={resource("shipments")} snapshot={pending} />
    </>);
    expect(screen.getByText("Staff-only synthetic carrier")).toBeVisible();
    expect(screen.getByText("STAFF-ONLY-SYNTHETIC-TRACKING")).toBeVisible();
    expect(screen.getAllByText("Preparation does not authorize handoff.").length).toBeGreaterThan(0);
    assertOnlyMutationField(`Handoff shipment · ${orderId}`, "orderId", orderId);

    const handedOff = snapshot<"shipments">({
      ...pending,
      items: [{ ...pending.items[0], state: "handed_off", handedOffAt: "2026-08-26T12:01:00.000Z" }],
    });
    rerender(<>
      <AdminResourceRecords snapshot={handedOff} />
      <ResourceCommandPanel resource={resource("shipments")} snapshot={handedOff} />
    </>);
    assertOnlyMutationField(`Mark shipment delivered · ${orderId}`, "orderId", orderId);
    assertOnlyMutationField(`Record shipment exception · ${orderId}`, "orderId", orderId);
    expect(within(screen.getByRole("form", { name: `Mark shipment delivered · ${orderId}` })).queryByRole("textbox")).toBeNull();
  });

  it("places an allowlisted no-op result adjacent to the matching authoritative form", () => {
    const value = snapshot<"orders">({
      resource: "orders", limit: 100, truncated: false,
      items: [{
        id: orderId, buyerUserId: "redacted-owner", buyerStatusSnapshot: "active",
        attestationAcceptanceId: "redacted-attestation", attestationVersion: 1,
        destinationStateCode: "CA", currency: "USD", subtotalMinor: 2400,
        discountMinor: 0, taxMinor: 0, shippingMinor: 0, totalMinor: 2400,
        state: "paid_on_hold", itemCount: 1, verifiedPaymentEventCount: 1,
        paymentState: "paid", refundState: "none", holdState: "active",
        currentReleaseState: null, releaseVersion: null, shipmentState: "pending",
        providerExecutionBoundary: "task6_managed",
        createdAt: "2026-08-26T12:00:00.000Z", updatedAt: "2026-08-26T12:00:00.000Z",
      }],
    });
    render(<ResourceCommandPanel
      resource={resource("orders")}
      snapshot={value}
      outcome={{ command: "clear-hold", target: orderId, result: "already_clear" }}
    />);
    const form = screen.getByRole("form", { name: `Clear fulfillment hold · ${orderId}` });
    const region = screen.getByRole("status");
    expect(within(region).getByText("Authoritative command read-back")).toBeVisible();
    expect(region).toHaveTextContent(/already clear/i);
    expect(form.parentElement).toContainElement(region);
  });

  it("keeps a completed command result visible after read-back removes the now-ineligible form", () => {
    const handedOff = snapshot<"shipments">({
      resource: "shipments", limit: 100, truncated: false,
      items: [{
        id: "68000000-0000-4000-8000-000000000003", orderId,
        fulfillmentReleaseId: "68000000-0000-4000-8000-000000000004",
        releaseState: "consumed", releaseVersion: 1,
        releaseExpiresAt: "2026-08-27T12:00:00.000Z", carrier: "REDACTED",
        trackingReference: "REDACTED", state: "handed_off",
        handedOffAt: "2026-08-26T12:01:00.000Z", deliveredAt: null,
        createdAt: "2026-08-26T12:00:00.000Z", updatedAt: "2026-08-26T12:01:00.000Z",
        handoffConfirmationBoundary: "task6_managed",
      }],
    });
    render(<ResourceCommandPanel
      resource={resource("shipments")}
      snapshot={handedOff}
      outcome={{ command: "handoff", target: orderId, result: "handed_off" }}
    />);

    expect(screen.queryByRole("form", { name: `Handoff shipment · ${orderId}` })).toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent(/handed off once/i);
  });

  it("uses failure-specific copy and focuses a redirected command failure", async () => {
    const value = snapshot<"orders">({
      resource: "orders", limit: 100, truncated: false,
      items: [{
        id: orderId, buyerUserId: "redacted-owner", buyerStatusSnapshot: "active",
        attestationAcceptanceId: "redacted-attestation", attestationVersion: 1,
        destinationStateCode: "CA", currency: "USD", subtotalMinor: 2400,
        discountMinor: 0, taxMinor: 0, shippingMinor: 0, totalMinor: 2400,
        state: "paid_on_hold", itemCount: 1, verifiedPaymentEventCount: 1,
        paymentState: "paid", refundState: "none", holdState: "active",
        currentReleaseState: null, releaseVersion: null, shipmentState: "pending",
        providerExecutionBoundary: "task6_managed",
        createdAt: "2026-08-26T12:00:00.000Z", updatedAt: "2026-08-26T12:00:00.000Z",
      }],
    });
    render(<ResourceCommandPanel
      resource={resource("orders")}
      snapshot={value}
      outcome={{ command: "clear-hold", target: orderId, result: "ineligible" }}
    />);

    const alert = screen.getByRole("alert");
    expect(within(alert).getByText("Command not completed")).toBeVisible();
    expect(alert).not.toHaveTextContent("Completed command read-back");
    await waitFor(() => expect(alert).toHaveFocus());
  });
});

describe("Task 8A growth resource shell", () => {
  it("shows the exact closed action boundary without exposing mutation forms", () => {
    const selected = resourceBySlug("loyalty-policies");
    expect(selected).not.toBeNull();
    if (!selected) return;

    render(<ResourceCommandPanel resource={selected} snapshot={null} />);

    expect(screen.getByRole("heading", { name: "Growth administration boundary" })).toBeVisible();
    expect(screen.getByText("Create draft · Activate · Retire")).toBeVisible();
    expect(screen.getByText(/database-backed records and commands are not available/i)).toBeVisible();
    expect(screen.queryByRole("form")).not.toBeInTheDocument();
  });
});
