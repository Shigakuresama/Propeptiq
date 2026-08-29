import { render, screen } from "@testing-library/react";
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
import { ResourceCommandPanel } from "./resource-command-panel";

const ids = {
  active: "8b400000-0000-4000-8000-000000000001",
  draft: "8b400000-0000-4000-8000-000000000002",
  retired: "8b400000-0000-4000-8000-000000000003",
} as const;

const cases = [
  {
    resource: "loyalty-policies",
    title: "loyalty",
    economics: {
      pointsPerDollar: 2,
      redemptionMinorPerPoint: 1,
      minimumRedemptionPoints: 500,
      maximumRedemptionBasisPoints: 2_500,
      expiresAfterDays: null,
    },
    fieldNames: [
      "effectiveAt", "pointsPerDollar", "redemptionMinorPerPoint",
      "minimumRedemptionPoints", "maximumRedemptionBasisPoints",
    ],
  },
  {
    resource: "referral-policies",
    title: "referral",
    economics: {
      attributionDays: 30,
      referredDiscountBasisPoints: 1_000,
      referredDiscountCapMinor: 2_500,
      referrerPointsPerDollar: 5,
      referrerRewardCapPoints: 2_500,
    },
    fieldNames: [
      "effectiveAt", "attributionDays", "referredDiscountBasisPoints",
      "referredDiscountCapMinor", "referrerPointsPerDollar", "referrerRewardCapPoints",
    ],
  },
  {
    resource: "affiliate-policies",
    title: "affiliate",
    economics: {
      attributionDays: 30,
      firstOrderCommissionBasisPoints: 1_000,
      reorderCommissionBasisPoints: 500,
      reorderWindowDays: 180,
      approvalDelayDays: 30,
      payoutThresholdMinor: 5_000,
      currency: "USD",
    },
    fieldNames: [
      "effectiveAt", "attributionDays", "firstOrderCommissionBasisPoints",
      "reorderCommissionBasisPoints", "reorderWindowDays", "approvalDelayDays",
      "payoutThresholdMinor", "currency",
    ],
  },
] as const;

function resource(slug: (typeof cases)[number]["resource"]) {
  const selected = resourceBySlug(slug);
  if (!selected) throw new Error(`Missing resource ${slug}`);
  return selected;
}

function snapshot(entry: (typeof cases)[number], items = [
  { id: ids.draft, version: 3, status: "draft", effectiveAt: "2026-08-29T20:00:00.000Z", retiredAt: null, ...entry.economics },
  { id: ids.active, version: 2, status: "active", effectiveAt: "2026-08-28T20:00:00.000Z", retiredAt: null, ...entry.economics },
  { id: ids.retired, version: 1, status: "retired", effectiveAt: "2026-08-27T20:00:00.000Z", retiredAt: "2026-08-28T20:00:00.000Z", ...entry.economics },
]) {
  return {
    resource: entry.resource,
    limit: 100,
    truncated: false,
    items,
  } as unknown as AdminReadSnapshot;
}

function namedControls(form: HTMLElement): string[] {
  return [...form.querySelectorAll("input[name], select[name], textarea[name]")]
    .map((control) => control.getAttribute("name")!);
}

describe("Task 8B4 growth policy resource panel", () => {
  it.each(cases)("renders bounded database-backed $title policy forms without hidden authority", (entry) => {
    render(<ResourceCommandPanel resource={resource(entry.resource)} snapshot={snapshot(entry)} />);

    expect(screen.getByText("Active", { selector: "strong" })).toBeVisible();
    expect(screen.getByText("Draft", { selector: "strong" })).toBeVisible();
    expect(screen.getByText("Retired", { selector: "strong" })).toBeVisible();

    const create = screen.getByRole("form", { name: `Create ${entry.title} policy draft` });
    expect(namedControls(create)).toEqual(entry.fieldNames);
    for (const [name, value] of Object.entries(entry.economics)) {
      if (name === "expiresAfterDays") {
        expect(create.querySelector('[name="expiresAfterDays"]')).toBeNull();
        continue;
      }
      const control = create.querySelector(`[name="${name}"]`) as HTMLInputElement;
      expect(control).not.toBeNull();
      expect(control.closest("label")).not.toBeNull();
      expect(control.value).toBe(value === null ? "" : String(value));
    }

    const activate = screen.getByRole("form", { name: `Activate ${entry.title} policy draft` });
    expect(namedControls(activate)).toEqual(["policyId", "expectedVersion"]);
    expect((activate.querySelector('[name="policyId"]') as HTMLInputElement).value).toBe(ids.draft);
    expect((activate.querySelector('[name="expectedVersion"]') as HTMLInputElement).value).toBe("3");

    const forbidden = ["kind", "status", "actorUserId", "capability", "auditId", "correlationId"];
    expect(forbidden.flatMap((name) => [...document.querySelectorAll(`[name="${name}"]`)])).toEqual([]);
    expect(screen.queryByText(/Synthetic local test only/i)).not.toBeInTheDocument();
  });

  it.each(cases)("shows an inactive $title state without fixture economics", (entry) => {
    render(<ResourceCommandPanel resource={resource(entry.resource)} snapshot={snapshot(entry, [])} />);
    expect(screen.getByText("Inactive — no database policy records exist.")).toBeVisible();
    const create = screen.getByRole("form", { name: `Create ${entry.title} policy draft` });
    for (const name of entry.fieldNames) {
      expect((create.querySelector(`[name="${name}"]`) as HTMLInputElement).value).toBe("");
    }
    expect(screen.queryByRole("form", { name: `Activate ${entry.title} policy draft` })).toBeNull();
  });
});
