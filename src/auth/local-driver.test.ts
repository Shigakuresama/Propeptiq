import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { getLocalTestDriver } from "./local-driver";
import {
  activateGrowthPolicy,
  adjustRewardBalance,
  createGrowthPolicyDraft,
} from "@/admin/admin-service";

const invalidId = "arbitrary-browser-supplied-id";

describe("local deterministic repository boundary", () => {
  it("returns deterministic growth fixtures only through the explicit local driver", () => {
    const driver = getLocalTestDriver();
    driver.growth.reset("active");

    expect(driver.readAdminSnapshot("loyalty-policies").items).toEqual([
      expect.objectContaining({
        id: "6c000000-0000-4000-8000-000000000001",
        status: "active",
        pointsPerDollar: 2,
        minimumRedemptionPoints: 500,
      }),
    ]);
    expect(driver.readAdminSnapshot("affiliate-applications").items).toEqual([
      expect.objectContaining({
        affiliateProfileId: "6c000000-0000-4000-8000-000000000008",
        status: "pending",
      }),
    ]);
    expect(driver.growth.ownerSnapshot("50000000-0000-4000-8000-000000000007").rewards?.ledger.items)
      .toEqual([
        expect.objectContaining({ kind: "admin_adjustment", availablePointsBalanceAfter: 2600 }),
        expect.objectContaining({ kind: "refund_reversal", availablePointsBalanceAfter: 2500 }),
      ]);
  });

  it("runs the real growth draft and activation services against the local transaction port", async () => {
    const driver = getLocalTestDriver();
    driver.growth.reset("active");
    const secret = "task10-local-actor-secret-at-least-32-characters";
    const signedActor = driver.signActor("admin", secret)!;
    const identity = driver.resolveIdentity(signedActor, secret)!;
    const principal = driver.loadPrincipal(identity.clerkUserId)!;
    const context = {
      principal,
      identity,
      now: new Date("2026-08-29T20:00:00.000Z"),
      correlationId: "local-growth-policy-test",
      rateLimitSecret: "task10-local-rate-limit-secret-at-least-32-characters",
    } as const;
    const policyId = "6c000000-0000-4000-8000-000000000020";

    await expect(createGrowthPolicyDraft(driver.adminRepository, context, {
      kind: "loyalty",
      policyId,
      effectiveAt: "2026-08-29T20:00:00.000Z",
      values: {
        pointsPerDollar: 2,
        redemptionMinorPerPoint: 1,
        minimumRedemptionPoints: 500,
        maximumRedemptionBasisPoints: 2_500,
        expiresAfterDays: null,
      },
    })).resolves.toEqual({ id: policyId, kind: "loyalty", version: 2, status: "draft" });

    await expect(activateGrowthPolicy(driver.adminRepository, context, {
      kind: "loyalty",
      policyId,
      expectedVersion: 2,
    })).resolves.toEqual({ id: policyId, kind: "loyalty", version: 2, status: "active" });
    expect(driver.readAdminSnapshot("loyalty-policies").items).toEqual([
      expect.objectContaining({ status: "retired", version: 1 }),
      expect.objectContaining({ id: policyId, status: "active", version: 2 }),
    ]);
  });

  it("keeps a repeated local reward adjustment idempotent", async () => {
    const driver = getLocalTestDriver();
    driver.growth.reset("active");
    const secret = "task10-local-actor-secret-at-least-32-characters";
    const signedActor = driver.signActor("admin", secret)!;
    const identity = driver.resolveIdentity(signedActor, secret)!;
    const principal = driver.loadPrincipal(identity.clerkUserId)!;
    const context = {
      principal,
      identity,
      now: new Date("2026-08-29T20:00:00.000Z"),
      correlationId: "local-growth-adjustment-test",
      rateLimitSecret: "task10-local-rate-limit-secret-at-least-32-characters",
    } as const;
    const command = {
      entryId: "6c000000-0000-4000-8000-000000000021",
      rewardAccountId: "6c000000-0000-4000-8000-000000000006",
      delta: 100,
      reason: "account_correction",
      internalAuditReason: "Synthetic local replay check.",
      idempotencyKey: "reward-adjustment:6c000000-0000-4000-8000-000000000021",
    } as const;

    await expect(adjustRewardBalance(driver.adminRepository, context, command))
      .resolves.toMatchObject({ status: "applied", availablePointsBalanceAfter: 2_600 });
    await expect(adjustRewardBalance(driver.adminRepository, context, command))
      .resolves.toMatchObject({ status: "idempotent", availablePointsBalanceAfter: 2_600 });
    expect(driver.growth.ownerSnapshot("50000000-0000-4000-8000-000000000007").rewards)
      .toMatchObject({ availablePoints: 2_600 });
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
