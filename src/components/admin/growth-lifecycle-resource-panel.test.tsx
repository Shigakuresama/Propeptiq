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
}));

vi.mock("@/admin/actions", () => actions);

import { resourceBySlug } from "@/admin/access";
import type { AdminReadSnapshot } from "@/admin/admin-read";
import { AdminResourceRecords } from "./admin-resource-records";
import { ResourceCommandPanel } from "./resource-command-panel";

const referralActiveId = "8c1a8000-0000-4000-8000-000000000001";
const referralRevokedId = "8c1a8000-0000-4000-8000-000000000002";
const sharedActiveId = "8c1a8000-0000-4000-8000-000000000003";
const sharedInactiveId = "8c1a8000-0000-4000-8000-000000000004";
const createdAt = "2026-08-28T20:00:00.000Z";
const updatedAt = "2026-08-28T21:00:00.000Z";
const terminalAt = "2026-08-29T21:00:00.000Z";

const cases = [
  {
    resource: "referral-codes",
    formName: "Revoke referral code · ref_ABCDEFGHIJKLMNOP",
    action: actions.revokeReferralCodeAction,
    fields: ["referralCodeId", "expectedCreatedAt"],
    values: [referralActiveId, createdAt],
    activeText: "ref_ABCDEFGHIJKLMNOP",
    terminalText: "ref_QRSTUVWXYZabcdef",
    items: [
      { referralCodeId: referralActiveId, code: "ref_ABCDEFGHIJKLMNOP", status: "active", createdAt, revokedAt: null },
      { referralCodeId: referralRevokedId, code: "ref_QRSTUVWXYZabcdef", status: "revoked", createdAt, revokedAt: terminalAt },
    ],
    terminalItems: [
      { referralCodeId: referralRevokedId, code: "ref_QRSTUVWXYZabcdef", status: "revoked", createdAt, revokedAt: terminalAt },
    ],
    emptyCopy: /no referral code records are available/i,
    terminalCopy: /no active referral codes are available/i,
  },
  {
    resource: "shared-sets",
    formName: "Deactivate shared set · Research set · set_ABCDEFGHIJKLMNOP",
    action: actions.deactivateSharedSetAction,
    fields: ["sharedSetId", "expectedUpdatedAt"],
    values: [sharedActiveId, updatedAt],
    activeText: "Research set",
    terminalText: "Archived set",
    items: [
      { sharedSetId: sharedActiveId, publicCode: "set_ABCDEFGHIJKLMNOP", label: "Research set", active: true, itemCount: 2, createdAt, updatedAt, deactivatedAt: null },
      { sharedSetId: sharedInactiveId, publicCode: "set_QRSTUVWXYZabcdef", label: "Archived set", active: false, itemCount: 3, createdAt, updatedAt: terminalAt, deactivatedAt: terminalAt },
    ],
    terminalItems: [
      { sharedSetId: sharedInactiveId, publicCode: "set_QRSTUVWXYZabcdef", label: "Archived set", active: false, itemCount: 3, createdAt, updatedAt: terminalAt, deactivatedAt: terminalAt },
    ],
    emptyCopy: /no shared set records are available/i,
    terminalCopy: /no active shared sets are available/i,
  },
] as const;

function selectedResource(slug: (typeof cases)[number]["resource"]) {
  const selected = resourceBySlug(slug);
  if (!selected) throw new Error(`Missing ${slug} resource`);
  return selected;
}

function snapshot(entry: (typeof cases)[number], items: readonly object[] = entry.items) {
  return {
    resource: entry.resource,
    limit: 100,
    truncated: false,
    items,
  } as unknown as AdminReadSnapshot;
}

function namedFields(form: HTMLElement) {
  return [...form.querySelectorAll<HTMLInputElement>("input[name]")];
}

describe("Task 8 growth lifecycle resource presentation", () => {
  it.each(cases)("renders one guarded active $resource command and no terminal command", async (entry) => {
    const value = snapshot(entry, entry.items.map((item) => ({
      ...item,
      ownerUserId: "private-owner",
      buyerEmail: "private@example.test",
      clerkId: "clerk-private",
      auditId: "private-audit",
      idempotencyKey: "private-key",
    })));
    render(<>
      <ResourceCommandPanel resource={selectedResource(entry.resource)} snapshot={value} />
      <AdminResourceRecords snapshot={value} />
    </>);

    const form = screen.getByRole("form", { name: entry.formName });
    expect(screen.getByRole("heading", { name: entry.formName })).toHaveClass("break-words");
    const fields = namedFields(form);
    expect(fields.map((field) => field.name)).toEqual(entry.fields);
    expect(fields.map((field) => field.value)).toEqual(entry.values);
    expect(screen.getAllByRole("form")).toHaveLength(1);
    expect(within(form).getByRole("button", { name: /submit guarded command/i })).toHaveClass("action-primary");
    expect(within(form).getByText(entry.activeText, { exact: false })).toBeVisible();
    expect(screen.getAllByText(entry.terminalText, { exact: false }).length).toBeGreaterThan(0);
    expect(form.querySelector("[name='actorId'], [name='capability'], [name='correlationId'], [name='idempotencyKey'], [name='ownerUserId']")).toBeNull();
    expect(document.body).not.toHaveTextContent(/private-owner|private@example|clerk-private|private-audit|private-key/iu);

    fireEvent.submit(form);
    await waitFor(() => expect(entry.action).toHaveBeenCalledTimes(1));
    const submitted = entry.action.mock.calls[0]?.[0] as FormData;
    expect([...submitted.keys()]).toEqual(entry.fields);
  });

  it.each(cases)("shows truthful empty and terminal-only $resource states without forms", (entry) => {
    const { rerender } = render(
      <ResourceCommandPanel resource={selectedResource(entry.resource)} snapshot={snapshot(entry, [])} />,
    );
    expect(screen.getByText(entry.emptyCopy)).toBeVisible();
    expect(screen.queryByRole("form")).toBeNull();

    rerender(
      <ResourceCommandPanel
        resource={selectedResource(entry.resource)}
        snapshot={snapshot(entry, entry.terminalItems)}
      />,
    );
    expect(screen.getByText(entry.terminalCopy)).toBeVisible();
    expect(screen.queryByRole("form")).toBeNull();
  });
});
