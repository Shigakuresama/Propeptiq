import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { getLocalTestDriver } from "./local-driver";

const invalidId = "arbitrary-browser-supplied-id";

describe("local deterministic repository boundary", () => {
  it.each([
    "loyalty-policies",
    "referral-policies",
    "affiliate-policies",
    "reward-adjustments",
    "referral-codes",
    "shared-sets",
    "affiliate-applications",
  ] as const)("returns an empty frozen %s read snapshot without fixture economics", (resource) => {
    const snapshot = getLocalTestDriver().readAdminSnapshot(resource);

    expect(snapshot).toEqual({
      resource,
      limit: 100,
      truncated: false,
      items: [],
    });
    expect(Object.isFrozen(snapshot.items)).toBe(true);
  });

  it("rejects non-fixed identifiers across reads and lifecycle writes", async () => {
    const repository = getLocalTestDriver().adminRepository;
    await repository.transaction(async (transaction) => {
      await expect(transaction.getProductPublicationFacts(invalidId)).resolves.toBeNull();
      await expect(transaction.getPromotion(invalidId)).resolves.toBeNull();
      await expect(transaction.getCoaDocument(invalidId)).resolves.toBeNull();
      await expect(transaction.getRefundEligibility(invalidId, "fixed-key")).resolves.toBeNull();
      await expect(transaction.getShipmentEligibility(invalidId)).resolves.toBeNull();
      await expect(
        transaction.saveProductDraft({
          productId: invalidId,
          slug: "invalid-browser-record",
          name: "Invalid browser record",
          packageForm: "Sealed unit",
          materialIdentity: "Invalid browser identity",
          policyGroupId: invalidId,
          expectedUpdatedAt: "2026-08-25T12:00:00.000Z",
          now: new Date("2026-08-25T12:00:01.000Z"),
        }),
      ).rejects.toThrow(/fixed/i);
    });
  });
});
