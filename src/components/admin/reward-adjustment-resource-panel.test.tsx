import { render, screen, within } from "@testing-library/react";
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
  decideReviewAction: vi.fn(),
  deactivateSharedSetAction: vi.fn(),
  decideAffiliateApplicationAction: vi.fn(),
  handoffFulfillmentAction: vi.fn(),
  markShipmentDeliveredAction: vi.fn(),
  publishAttestationAction: vi.fn(),
  publishCoaAction: vi.fn(),
  recordShipmentExceptionAction: vi.fn(),
  recordAffiliatePayoutPaidAdminAction: vi.fn(),
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

const rewardAccountId = "8c1a3000-0000-4000-8000-000000000002";
const adjustmentId = "8c1a3000-0000-4000-8000-000000000003";

function resource() {
  const selected = resourceBySlug("reward-adjustments");
  if (!selected) throw new Error("Missing reward-adjustments resource");
  return selected;
}

function snapshot(items: Extract<AdminReadSnapshot, { resource: "reward-adjustments" }>["items"] = []) {
  return {
    resource: "reward-adjustments",
    limit: 100,
    truncated: false,
    items,
  } as Extract<AdminReadSnapshot, { resource: "reward-adjustments" }>;
}

describe("Task 8C1A3 reward adjustment resource UI", () => {
  it("shows a helpful database-empty state without a form or synthetic balances", () => {
    const value = snapshot();
    render(<>
      <ResourceCommandPanel resource={resource()} snapshot={value} />
      <AdminResourceRecords snapshot={value} />
    </>);

    expect(screen.getByText(/no reward accounts are available/i)).toBeVisible();
    expect(screen.queryByRole("form")).toBeNull();
    expect(screen.queryByText(/synthetic local test only/i)).toBeNull();
    expect(screen.queryByText(/available points.*\d/iu)).toBeNull();
  });

  it("binds the guarded action to a stable command token and four bounded operator fields", () => {
    const value = snapshot([{
      rewardAccountId,
      pendingPoints: 7,
      availablePoints: 1_250,
      recentAdjustments: [],
    }]);
    render(<ResourceCommandPanel resource={resource()} snapshot={value} />);

    const form = screen.getByRole("form", { name: /adjust reward balance/i });
    const named = [...form.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
      "input[name], select[name], textarea[name]",
    )];
    expect(named.map((field) => field.name)).toEqual([
      "commandToken",
      "rewardAccountId",
      "delta",
      "reason",
      "internalAuditReason",
    ]);
    const commandToken = form.querySelector<HTMLInputElement>('[name="commandToken"]');
    expect(commandToken).toHaveAttribute("type", "hidden");
    expect(commandToken?.value).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u,
    );

    const account = within(form).getByRole("combobox", { name: /reward account/i });
    expect(account).toHaveValue(rewardAccountId);
    expect(within(account).getAllByRole("option")).toHaveLength(1);

    const delta = within(form).getByRole("spinbutton", { name: /points adjustment/i });
    expect(delta).toHaveAttribute("min", "-10000");
    expect(delta).toHaveAttribute("max", "10000");
    expect(delta).toHaveAttribute("step", "1");
    expect(screen.getByText(/nonzero integer from -10,000 to \+10,000/i)).toBeVisible();

    const reason = within(form).getByRole("combobox", { name: /adjustment reason/i });
    expect(reason).toHaveValue("account_correction");
    expect(within(reason).getAllByRole("option")).toHaveLength(1);

    const internalReason = within(form).getByRole("textbox", { name: /private internal reason/i });
    expect(internalReason).toBeRequired();
    expect(internalReason).toHaveAttribute("minlength", "1");
    expect(internalReason).toHaveAttribute("maxlength", "240");
    expect(form.querySelector("[name='actorId'], [name='idempotencyKey'], [name='correlationId'], [name='userId']")).toBeNull();
    expect(named.filter((field) => field.type !== "hidden")
      .every((field) => field.classList.contains("form-input"))).toBe(true);
  });

  it("renders safe balances and bounded immutable adjustment history only", () => {
    const value = snapshot([{
      rewardAccountId,
      pendingPoints: 7,
      availablePoints: 1_250,
      recentAdjustments: [{
        adjustmentId,
        delta: -250,
        occurredAt: "2026-08-29T18:00:00.000Z",
      }],
      buyerEmail: "private@example.test",
      clerkId: "clerk-private",
      internalAuditReason: "private reason",
      idempotencyKey: "private-key",
      sourceFingerprint: "private-fingerprint",
    } as never]);
    render(<>
      <ResourceCommandPanel resource={resource()} snapshot={value} />
      <AdminResourceRecords snapshot={value} />
    </>);

    expect(screen.getAllByText(rewardAccountId).length).toBeGreaterThan(0);
    expect(screen.getAllByText("1,250").length).toBeGreaterThan(0);
    expect(screen.getAllByText("7").length).toBeGreaterThan(0);
    const adjustment = screen.getByText(adjustmentId);
    expect(adjustment).toBeVisible();
    expect(adjustment.parentElement).toHaveTextContent("-250 points");
    expect(document.body).not.toHaveTextContent(/private@example|clerk-private|private reason|private-key|private-fingerprint/iu);
  });
});
