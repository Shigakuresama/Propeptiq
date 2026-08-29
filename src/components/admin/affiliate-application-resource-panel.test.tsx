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
import type { AdminReadSnapshot } from "@/admin/admin-read";
import { AdminResourceRecords } from "./admin-resource-records";
import { ResourceCommandPanel } from "./resource-command-panel";

const pendingId = "8e100000-0000-4000-8000-000000000001";
const activeId = "8e100000-0000-4000-8000-000000000002";
const rejectedId = "8e100000-0000-4000-8000-000000000003";
const suspendedId = "8e100000-0000-4000-8000-000000000004";

const applications = [
  {
    affiliateProfileId: pendingId,
    publicCode: "aff_PENDING0000001",
    status: "pending",
    version: 1,
    publicChannel: "Independent research newsletter",
    promotionMethod: "email",
    createdAt: "2026-08-29T18:00:00.000Z",
    updatedAt: "2026-08-29T18:00:00.000Z",
  },
  {
    affiliateProfileId: activeId,
    publicCode: "aff_ACTIVE00000002",
    status: "active",
    version: 4,
    publicChannel: "Laboratory methods website",
    promotionMethod: "website",
    createdAt: "2026-08-28T18:00:00.000Z",
    updatedAt: "2026-08-29T19:00:00.000Z",
  },
  {
    affiliateProfileId: rejectedId,
    publicCode: "aff_REJECTED000003",
    status: "rejected",
    version: 2,
    publicChannel: "Reference archive",
    promotionMethod: "other",
    createdAt: "2026-08-27T18:00:00.000Z",
    updatedAt: "2026-08-29T20:00:00.000Z",
  },
  {
    affiliateProfileId: suspendedId,
    publicCode: "aff_SUSPENDED00004",
    status: "suspended",
    version: 6,
    publicChannel: "Research social channel",
    promotionMethod: "social",
    createdAt: "2026-08-26T18:00:00.000Z",
    updatedAt: "2026-08-29T21:00:00.000Z",
  },
] as const;

function resource() {
  const selected = resourceBySlug("affiliate-applications");
  if (!selected) throw new Error("Missing affiliate-applications resource");
  return selected;
}

function snapshot(
  items: readonly object[] = applications,
): Extract<AdminReadSnapshot, { resource: "affiliate-applications" }> {
  return {
    resource: "affiliate-applications",
    limit: 100,
    truncated: false,
    items,
  } as Extract<AdminReadSnapshot, { resource: "affiliate-applications" }>;
}

function namedFields(form: HTMLElement) {
  return [...form.querySelectorAll<HTMLInputElement | HTMLSelectElement>(
    "input[name], select[name]",
  )];
}

describe("Task 8 affiliate application resource presentation", () => {
  it("renders exact pending decisions, active suspension, and no terminal controls", async () => {
    const value = snapshot(applications.map((application) => ({
      ...application,
      userId: "private-user",
      clerkUserId: "clerk-private",
      primaryEmail: "private@example.test",
      termsAcceptedAt: "private-terms",
      idempotencyKey: "private-key",
    })));
    render(<>
      <ResourceCommandPanel resource={resource()} snapshot={value} />
      <AdminResourceRecords snapshot={value} />
    </>);

    const approve = screen.getByRole("form", {
      name: "Approve affiliate application · aff_PENDING0000001",
    });
    const reject = screen.getByRole("form", {
      name: "Reject affiliate application · aff_PENDING0000001",
    });
    const suspend = screen.getByRole("form", {
      name: "Suspend affiliate · aff_ACTIVE00000002",
    });

    expect(namedFields(approve).map((field) => [field.name, field.value])).toEqual([
      ["profileId", pendingId],
      ["expectedVersion", "1"],
      ["decision", "active"],
    ]);
    expect(namedFields(reject).map((field) => [field.name, field.value])).toEqual([
      ["profileId", pendingId],
      ["expectedVersion", "1"],
      ["decision", "rejected"],
    ]);
    expect(namedFields(suspend).map((field) => [field.name, field.value])).toEqual([
      ["profileId", activeId],
      ["expectedVersion", "4"],
    ]);
    expect(screen.getAllByRole("form")).toHaveLength(3);
    expect(screen.queryByRole("form", { name: /rejected000003|suspended00004/i })).toBeNull();

    expect(screen.getAllByText("Independent research newsletter").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Laboratory methods website").length).toBeGreaterThan(0);
    expect(screen.getByText("Reference archive")).toBeVisible();
    expect(screen.getByText("Research social channel")).toBeVisible();
    expect(document.body).not.toHaveTextContent(
      /private-user|clerk-private|private@example|private-terms|private-key/iu,
    );
    for (const form of [approve, reject, suspend]) {
      expect(form.querySelector(
        "[name='actorUserId'], [name='capability'], [name='correlationId'], [name='idempotencyKey']",
      )).toBeNull();
      expect(within(form).getByRole("button", { name: /submit guarded command/i })).toHaveClass(
        "action-primary",
      );
    }

    fireEvent.submit(approve);
    fireEvent.submit(reject);
    fireEvent.submit(suspend);
    await waitFor(() => {
      expect(actions.decideAffiliateApplicationAction).toHaveBeenCalledTimes(2);
      expect(actions.suspendAffiliateApplicationAction).toHaveBeenCalledTimes(1);
    });
    expect([...((actions.decideAffiliateApplicationAction.mock.calls[0]?.[0]) as FormData).keys()])
      .toEqual(["profileId", "expectedVersion", "decision"]);
    expect([...((actions.suspendAffiliateApplicationAction.mock.calls[0]?.[0]) as FormData).keys()])
      .toEqual(["profileId", "expectedVersion"]);
  });

  it("renders truthful empty and terminal-only states without controls", () => {
    const { rerender } = render(
      <ResourceCommandPanel resource={resource()} snapshot={snapshot([])} />,
    );
    expect(screen.getByText(/no affiliate application records are available/i)).toBeVisible();
    expect(screen.queryByRole("form")).toBeNull();

    rerender(
      <ResourceCommandPanel resource={resource()} snapshot={snapshot(applications.slice(2))} />,
    );
    expect(screen.getByText(/no pending or active affiliate applications are available/i)).toBeVisible();
    expect(screen.queryByRole("form")).toBeNull();
  });
});
