import { describe, expect, it, vi } from "vitest";

const rewardsTerms = Object.freeze({
  id: "76000000-0000-4000-8000-000000000001",
  contentHash: "a".repeat(64),
});
const partnerTerms = Object.freeze({
  id: "76000000-0000-4000-8000-000000000002",
  contentHash: "b".repeat(64),
});

describe("owner growth browser form adapters", () => {
  it("adds the authoritative referral terms hash only after the browser boundary", async () => {
    const { createOwnerReferralActivationAction } = await import("./owner-action-forms");
    const runAuthoritativeAction = vi.fn().mockResolvedValue({
      state: "success",
      code: "idempotent",
      referralCode: "ref_StableOwnerCode1234",
    });
    const action = createOwnerReferralActivationAction({
      loadCurrentTerms: vi.fn().mockResolvedValue(rewardsTerms),
      runAuthoritativeAction,
    });
    const browserForm = new FormData();
    browserForm.set("acceptCurrentTerms", "yes");
    browserForm.set("termsVersionId", rewardsTerms.id);

    await expect(action(browserForm)).resolves.toMatchObject({ state: "success" });

    expect([...browserForm.keys()]).toEqual(["acceptCurrentTerms", "termsVersionId"]);
    const trustedForm = runAuthoritativeAction.mock.calls[0]![0] as FormData;
    expect(Object.fromEntries(trustedForm)).toEqual({
      acceptCurrentTerms: "yes",
      termsVersionId: rewardsTerms.id,
      termsContentHash: rewardsTerms.contentHash,
    });
  });

  it("adds authoritative affiliate terms without accepting browser money, role, or hash fields", async () => {
    const { createOwnerAffiliateApplicationAction } = await import("./owner-action-forms");
    const runAuthoritativeAction = vi.fn().mockResolvedValue({
      state: "success",
      code: "submitted",
      application: Object.freeze({ status: "pending" }),
    });
    const action = createOwnerAffiliateApplicationAction({
      loadCurrentTerms: vi.fn().mockResolvedValue(partnerTerms),
      runAuthoritativeAction,
    });
    const browserForm = new FormData();
    browserForm.set("publicChannel", "https://example.test/research-records");
    browserForm.set("promotionMethod", "website");
    browserForm.set("acceptCurrentTerms", "yes");
    browserForm.set("termsVersionId", partnerTerms.id);

    await expect(action(browserForm)).resolves.toMatchObject({ state: "success" });

    const trustedForm = runAuthoritativeAction.mock.calls[0]![0] as FormData;
    expect(Object.fromEntries(trustedForm)).toEqual({
      publicChannel: "https://example.test/research-records",
      promotionMethod: "website",
      acceptCurrentTerms: "yes",
      termsVersionId: partnerTerms.id,
      termsContentHash: partnerTerms.contentHash,
    });
    expect([...browserForm.keys()]).not.toContain("termsContentHash");
  });

  it("rejects stale terms identifiers before invoking an authoritative mutation", async () => {
    const { createOwnerReferralActivationAction } = await import("./owner-action-forms");
    const runAuthoritativeAction = vi.fn();
    const action = createOwnerReferralActivationAction({
      loadCurrentTerms: vi.fn().mockResolvedValue(rewardsTerms),
      runAuthoritativeAction,
    });
    const browserForm = new FormData();
    browserForm.set("acceptCurrentTerms", "yes");
    browserForm.set("termsVersionId", "76000000-0000-4000-8000-000000000099");

    await expect(action(browserForm)).resolves.toEqual({
      state: "error",
      code: "invalid",
      referralCode: null,
    });
    expect(runAuthoritativeAction).not.toHaveBeenCalled();
  });
});
