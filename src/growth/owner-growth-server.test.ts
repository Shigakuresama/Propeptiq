import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Principal } from "@/domain/authorization";
import type { OwnerGrowthSnapshot } from "@/growth/read-model";

const ownerId = "74000000-0000-4000-8000-000000000001";
const identity = Object.freeze({
  clerkUserId: "clerk_owner_dashboard",
  primaryEmail: "owner@example.test",
  emailVerifiedAt: "2026-08-28T16:00:00.000Z",
  mfaConfigured: false,
  secondFactorCompleted: false,
});

function principal(buyerStatus: Principal["buyerStatus"] = "active"): Principal {
  return Object.freeze({
    actorId: ownerId,
    clerkUserId: identity.clerkUserId,
    buyerStatus,
    capabilities: Object.freeze([]),
    mfaSatisfied: false,
  });
}

const emptySnapshot = Object.freeze({
  rewards: null,
  referrals: Object.freeze({
    code: null,
    status: null,
    counts: Object.freeze({ attributed: 0, pending: 0, qualified: 0, reversed: 0 }),
    rewardPointsTotal: 0,
    conversions: Object.freeze({
      items: Object.freeze([]),
      totalCount: 0,
      page: Object.freeze({ limit: 50, offset: 0, hasMore: false }),
    }),
  }),
  sharedSets: Object.freeze({
    items: Object.freeze([]),
    totalCount: 0,
    page: Object.freeze({ limit: 50, offset: 0, hasMore: false }),
  }),
  affiliate: null,
}) satisfies OwnerGrowthSnapshot;

const historicalSnapshotWithPolicy = Object.freeze({
  ...emptySnapshot,
  rewards: Object.freeze({
    pendingPoints: 25,
    availablePoints: -10,
    usdEquivalentMinor: -10,
    minimumRedemptionProgress: Object.freeze({ currentPoints: 0, requiredPoints: 500 }),
    ledger: Object.freeze({
      items: Object.freeze([
        Object.freeze({
          occurredAt: "2026-08-28T15:00:00.000Z",
          kind: "refund_reversal",
          reference: "ref:1111111111",
          pendingPointsDelta: 0,
          availablePointsDelta: -10,
          pendingPointsBalanceAfter: 25,
          availablePointsBalanceAfter: -10,
        }),
      ]),
      totalCount: 1,
      page: Object.freeze({ limit: 50, offset: 0, hasMore: false }),
    }),
  }),
}) satisfies OwnerGrowthSnapshot;

const historicalSnapshotWithoutPolicy = Object.freeze({
  ...historicalSnapshotWithPolicy,
  rewards: Object.freeze({
    ...historicalSnapshotWithPolicy.rewards,
    usdEquivalentMinor: null,
    minimumRedemptionProgress: null,
  }),
}) satisfies OwnerGrowthSnapshot;

const sharedSetOnlySnapshot = Object.freeze({
  ...emptySnapshot,
  sharedSets: Object.freeze({
    items: Object.freeze([
      Object.freeze({
        code: "set_ABCDEFGHIJKLMNOP",
        label: "Archived owner research set",
        active: false,
        itemCount: 2,
        updatedAt: "2026-08-27T15:00:00.000Z",
      }),
    ]),
    totalCount: 1,
    page: Object.freeze({ limit: 50, offset: 0, hasMore: false }),
  }),
}) satisfies OwnerGrowthSnapshot;

describe("owner growth server read adapter", () => {
  const loadProjection = vi.fn();
  const loadSnapshot = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    loadProjection.mockResolvedValue({
      status: "active",
      projection: Object.freeze({
        loyalty: Object.freeze({
          id: "loyalty-policy",
          version: 1,
          status: "active",
          pointsPerDollar: 2,
          redemptionMinorPerPoint: 1,
          minimumRedemptionPoints: 500,
          maximumRedemptionBasisPoints: 2_500,
          expiresAfterDays: null,
          effectiveAt: "2026-08-27T00:00:00.000Z",
          supersededAt: null,
        }),
        referral: Object.freeze({ status: "active" }),
        affiliate: Object.freeze({ status: "active" }),
        terms: Object.freeze({
          rewards: Object.freeze({ id: "terms-rewards", version: 3, contentHash: "a".repeat(64) }),
          partner: Object.freeze({ id: "terms-partner", version: 4, contentHash: "b".repeat(64) }),
        }),
      }),
    });
    loadSnapshot.mockResolvedValue(emptySnapshot);
  });

  it("distinguishes denied, inactive, empty, blocked-readable data, and safe read errors", async () => {
    const { createOwnerGrowthReader } = await import("./owner-growth-server");
    const reader = createOwnerGrowthReader({ loadProjection, loadSnapshot });

    await expect(reader({ identity: null, principal: null }, ownerId)).resolves.toEqual({
      status: "denied",
    });

    loadProjection.mockResolvedValueOnce({ status: "inactive" });
    await expect(reader({ identity, principal: principal() }, ownerId)).resolves.toEqual({
      status: "inactive",
      access: "owner",
      verifiedEmail: identity.primaryEmail,
    });

    await expect(reader({ identity, principal: principal() }, ownerId)).resolves.toMatchObject({
      status: "empty",
      access: "owner",
      snapshot: emptySnapshot,
    });

    loadSnapshot.mockResolvedValueOnce(Object.freeze({
      ...emptySnapshot,
      rewards: Object.freeze({
        pendingPoints: 5,
        availablePoints: -10,
        usdEquivalentMinor: null,
        minimumRedemptionProgress: null,
        ledger: Object.freeze({
          items: Object.freeze([]),
          totalCount: 1,
          page: Object.freeze({ limit: 50, offset: 0, hasMore: true }),
        }),
      }),
    }));
    await expect(reader({ identity, principal: principal("blocked") }, ownerId)).resolves.toMatchObject({
      status: "data",
      access: "blocked_read_capable",
      snapshot: {
        rewards: {
          usdEquivalentMinor: -10,
          minimumRedemptionProgress: { currentPoints: 0, requiredPoints: 500 },
        },
      },
    });

    loadProjection.mockRejectedValueOnce(new Error("private database detail"));
    await expect(reader({ identity, principal: principal() }, ownerId)).resolves.toEqual({
      status: "read_error",
    });
  });

  it("denies cross-owner requests before any database read", async () => {
    const { createOwnerGrowthReader } = await import("./owner-growth-server");
    const reader = createOwnerGrowthReader({ loadProjection, loadSnapshot });

    await expect(reader(
      { identity, principal: principal() },
      "74000000-0000-4000-8000-000000000099",
    )).resolves.toEqual({ status: "denied" });
    expect(loadProjection).not.toHaveBeenCalled();
    expect(loadSnapshot).not.toHaveBeenCalled();
  });

  it("keeps blocked-owner history readable when the current growth projection is inactive", async () => {
    const { createOwnerGrowthReader } = await import("./owner-growth-server");
    const reader = createOwnerGrowthReader({ loadProjection, loadSnapshot });
    loadProjection.mockResolvedValueOnce({ status: "inactive" });
    loadSnapshot.mockResolvedValueOnce(historicalSnapshotWithPolicy);

    await expect(reader({ identity, principal: principal("blocked") }, ownerId)).resolves.toEqual({
      status: "data",
      access: "blocked_read_capable",
      verifiedEmail: identity.primaryEmail,
      snapshot: historicalSnapshotWithoutPolicy,
      projection: {
        loyalty: null,
        referral: null,
        affiliate: null,
        terms: { rewards: null, partner: null },
      },
    });
    expect(loadSnapshot).toHaveBeenCalledWith(ownerId);
  });

  it("keeps blocked-owner history readable when current policy reads fail", async () => {
    const { createOwnerGrowthReader } = await import("./owner-growth-server");
    const reader = createOwnerGrowthReader({ loadProjection, loadSnapshot });
    loadProjection.mockResolvedValueOnce({ status: "read_error" });
    loadSnapshot.mockResolvedValueOnce(historicalSnapshotWithPolicy);

    await expect(reader({ identity, principal: principal("blocked") }, ownerId)).resolves.toEqual({
      status: "data",
      access: "blocked_read_capable",
      verifiedEmail: identity.primaryEmail,
      snapshot: historicalSnapshotWithoutPolicy,
      projection: {
        loyalty: null,
        referral: null,
        affiliate: null,
        terms: { rewards: null, partner: null },
      },
    });
    expect(loadSnapshot).toHaveBeenCalledWith(ownerId);
  });

  it("keeps blocked-owner shared-set-only history readable when growth is inactive", async () => {
    const { createOwnerGrowthReader } = await import("./owner-growth-server");
    const reader = createOwnerGrowthReader({ loadProjection, loadSnapshot });
    loadProjection.mockResolvedValueOnce({ status: "inactive" });
    loadSnapshot.mockResolvedValueOnce(sharedSetOnlySnapshot);

    await expect(reader({ identity, principal: principal("blocked") }, ownerId)).resolves.toEqual({
      status: "data",
      access: "blocked_read_capable",
      verifiedEmail: identity.primaryEmail,
      snapshot: sharedSetOnlySnapshot,
      projection: {
        loyalty: null,
        referral: null,
        affiliate: null,
        terms: { rewards: null, partner: null },
      },
    });
  });

  it("keeps review-owner shared-set-only history readable when policy reads fail", async () => {
    const { createOwnerGrowthReader } = await import("./owner-growth-server");
    const reader = createOwnerGrowthReader({ loadProjection, loadSnapshot });
    loadProjection.mockResolvedValueOnce({ status: "read_error" });
    loadSnapshot.mockResolvedValueOnce(sharedSetOnlySnapshot);

    await expect(reader({ identity, principal: principal("review") }, ownerId)).resolves.toEqual({
      status: "data",
      access: "read_only_owner",
      verifiedEmail: identity.primaryEmail,
      snapshot: sharedSetOnlySnapshot,
      projection: {
        loyalty: null,
        referral: null,
        affiliate: null,
        terms: { rewards: null, partner: null },
      },
    });
  });
});
