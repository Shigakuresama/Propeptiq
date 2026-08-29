import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const actions = vi.hoisted(() => ({
  activateAffiliatePolicyAction: vi.fn(),
  activateLoyaltyPolicyAction: vi.fn(),
  activateProductAction: vi.fn(),
  activatePromotionAction: vi.fn(),
  activateReferralPolicyAction: vi.fn(),
  adjustRewardBalanceAction: vi.fn(),
  changeBuyerStatusAction: vi.fn(),
  changeStaffCapabilityAction: vi.fn(),
  clearFulfillmentHoldAction: vi.fn(),
  createAffiliatePayoutBatchAdminAction: vi.fn(),
  createAffiliatePolicyDraftAction: vi.fn(),
  createLoyaltyPolicyDraftAction: vi.fn(),
  createReferralPolicyDraftAction: vi.fn(),
  deactivateSharedSetAction: vi.fn(),
  decideAffiliateApplicationAction: vi.fn(),
  decideReviewAction: vi.fn(),
  handoffFulfillmentAction: vi.fn(),
  markShipmentDeliveredAction: vi.fn(),
  publishAttestationAction: vi.fn(),
  publishCoaAction: vi.fn(),
  recordAffiliatePayoutPaidAdminAction: vi.fn(),
  recordShipmentExceptionAction: vi.fn(),
  requestRefundAction: vi.fn(),
  retireProductAction: vi.fn(),
  retirePromotionAction: vi.fn(),
  revokeReferralCodeAction: vi.fn(),
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
import type { AdminReadSnapshot, AdminReadResource } from "@/admin/admin-read";
import { AdminResourceRecords } from "./admin-resource-records";
import { ResourceCommandPanel } from "./resource-command-panel";

const profileId = "8f500000-0000-4000-8000-000000000001";
const pendingPayoutId = "8f500000-0000-4000-8000-000000000002";
const paidPayoutId = "8f500000-0000-4000-8000-000000000003";
const conversionId = "8f500000-0000-4000-8000-000000000004";
const commissionId = "8f500000-0000-4000-8000-000000000005";

function resource(slug: AdminReadResource) {
  const selected = resourceBySlug(slug);
  if (!selected) throw new Error(`Missing ${slug} resource`);
  return selected;
}

function snapshot<Resource extends AdminReadResource>(
  resourceName: Resource,
  items: readonly object[],
): Extract<AdminReadSnapshot, { resource: Resource }> {
  return {
    resource: resourceName,
    limit: 100,
    truncated: false,
    items,
  } as Extract<AdminReadSnapshot, { resource: Resource }>;
}

describe("Task 8 growth settlement administration presentation", () => {
  it.each([
    {
      slug: "referral-conversions" as const,
      item: {
        conversionId,
        referralPolicyVersion: 2,
        referredDiscountMinor: 500,
        referrerRewardPoints: 25,
        status: "qualified",
        createdAt: "2026-08-30T18:00:00.000Z",
        qualifiedAt: "2026-08-30T19:00:00.000Z",
        reversedAt: null,
      },
      visible: ["Referral conversion", "Qualified", "25", "$5.00"],
    },
    {
      slug: "commissions" as const,
      item: {
        commissionId,
        affiliateProfileId: profileId,
        affiliatePolicyVersion: 3,
        grossCommissionMinor: 6_000,
        reversedCommissionMinor: 1_000,
        netCommissionMinor: 5_000,
        status: "approved",
        approvalEligibleAt: "2026-08-30T19:00:00.000Z",
        payoutId: null,
        createdAt: "2026-08-29T18:00:00.000Z",
        updatedAt: "2026-08-30T19:00:00.000Z",
      },
      visible: ["Affiliate commission", "Approved", "$50.00", profileId],
    },
  ])("renders $slug as a redacted read-only lifecycle", ({ slug, item, visible }) => {
    const value = snapshot(slug, [{
      ...item,
      buyerEmail: "private@example.test",
      clerkUserId: "clerk-private",
      orderId: "private-order",
      idempotencyKey: "private-idempotency",
      providerReference: "private-provider-reference",
    }]);
    render(<>
      <ResourceCommandPanel resource={resource(slug)} snapshot={value} />
      <AdminResourceRecords snapshot={value} />
    </>);

    expect(screen.getByRole("heading", { name: /read-only lifecycle boundary/i })).toBeVisible();
    expect(screen.queryByRole("form")).toBeNull();
    for (const text of visible) expect(screen.getAllByText(text, { exact: false }).length).toBeGreaterThan(0);
    expect(document.body).not.toHaveTextContent(
      /private@example|clerk-private|private-order|private-idempotency|private-provider-reference/iu,
    );
  });

  it("creates server-selected payout batches and records external evidence without a send-money control", async () => {
    const value = snapshot("payouts", [
      {
        payoutId: pendingPayoutId,
        affiliateProfileId: profileId,
        affiliatePolicyVersion: 3,
        amountMinor: 5_000,
        currency: "USD",
        state: "pending",
        version: 1,
        commissionCount: 2,
        externalEvidenceRecorded: false,
        createdAt: "2026-08-30T18:00:00.000Z",
        paidAt: null,
      },
      {
        payoutId: paidPayoutId,
        affiliateProfileId: profileId,
        affiliatePolicyVersion: 3,
        amountMinor: 7_500,
        currency: "USD",
        state: "paid",
        version: 2,
        commissionCount: 3,
        externalEvidenceRecorded: true,
        createdAt: "2026-08-29T18:00:00.000Z",
        paidAt: "2026-08-30T20:00:00.000Z",
      },
    ]);
    render(<>
      <ResourceCommandPanel resource={resource("payouts")} snapshot={value} />
      <AdminResourceRecords snapshot={value} />
    </>);

    const create = screen.getByRole("form", { name: "Create affiliate payout batch" });
    const paid = screen.getByRole("form", { name: `Record payout paid · ${pendingPayoutId}` });
    expect([...create.querySelectorAll<HTMLInputElement>("input[name]")].map(({ name }) => name))
      .toEqual(["profileId"]);
    expect([...paid.querySelectorAll<HTMLInputElement>("input[name]")].map(({ name }) => name))
      .toEqual(["payoutId", "expectedVersion", "providerName", "externalReference"]);
    expect(within(create).getByLabelText(/affiliate profile id/i)).toHaveAttribute(
      "list",
      "known-affiliate-payout-profiles",
    );
    expect(screen.getAllByRole("form")).toHaveLength(2);
    expect(screen.queryByRole("form", { name: new RegExp(paidPayoutId, "u") })).toBeNull();
    expect(screen.getByText(/does not transmit funds/i)).toBeVisible();
    expect(document.body).not.toHaveTextContent(/send payout|send money|bank account|routing number/iu);
    for (const form of [create, paid]) {
      expect(form.querySelector(
        "[name='actorUserId'], [name='capability'], [name='correlationId'], [name='idempotencyKey'], [name='amountMinor'], [name='commissionId']",
      )).toBeNull();
    }

    fireEvent.change(within(create).getByLabelText(/affiliate profile id/i), {
      target: { value: profileId },
    });
    fireEvent.change(within(paid).getByLabelText(/provider name/i), {
      target: { value: "Offline ACH operator" },
    });
    fireEvent.change(within(paid).getByLabelText(/external reference/i), {
      target: { value: "ach-confirmation-0001" },
    });
    fireEvent.submit(create);
    fireEvent.submit(paid);
    await waitFor(() => {
      expect(actions.createAffiliatePayoutBatchAdminAction).toHaveBeenCalledTimes(1);
      expect(actions.recordAffiliatePayoutPaidAdminAction).toHaveBeenCalledTimes(1);
    });
  });

  it("keeps payout batching available with an explicit profile field when no prior payouts exist", () => {
    render(
      <ResourceCommandPanel
        resource={resource("payouts")}
        snapshot={snapshot("payouts", [])}
      />,
    );
    expect(screen.getByRole("form", { name: "Create affiliate payout batch" })).toBeVisible();
    expect(screen.getByText(/active affiliate profile id from the applications view/i)).toBeVisible();
  });
});
