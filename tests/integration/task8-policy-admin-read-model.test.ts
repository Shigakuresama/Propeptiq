import type { PGlite } from "@electric-sql/pglite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { AdminReadResource } from "@/admin/admin-read";
import type { VerifiedIdentity } from "@/auth/identity";
import {
  createPostgresAdminReadRepository,
  type AdminReadSqlClient,
} from "@/db/repositories/admin-read-repository";

import { createMigratedPglite } from "./helpers/pglite";

const adminId = "8b410000-0000-4000-8000-000000000001";
const ids = {
  loyalty: "8b410000-0000-4000-8000-000000000002",
  referral: "8b410000-0000-4000-8000-000000000003",
  affiliate: "8b410000-0000-4000-8000-000000000004",
} as const;
const now = new Date("2026-08-28T20:00:00.000Z");
const identity: VerifiedIdentity = {
  clerkUserId: "clerk-policy-reader",
  primaryEmail: "admin@example.test",
  emailVerifiedAt: "2026-08-28T00:00:00.000Z",
  mfaConfigured: true,
  secondFactorCompleted: true,
};

const cases = [
  {
    resource: "loyalty-policies",
    id: ids.loyalty,
    economics: {
      pointsPerDollar: 2,
      redemptionMinorPerPoint: 1,
      minimumRedemptionPoints: 500,
      maximumRedemptionBasisPoints: 2_500,
      expiresAfterDays: null,
    },
  },
  {
    resource: "referral-policies",
    id: ids.referral,
    economics: {
      attributionDays: 30,
      referredDiscountBasisPoints: 1_000,
      referredDiscountCapMinor: 2_500,
      referrerPointsPerDollar: 5,
      referrerRewardCapPoints: 2_500,
    },
  },
  {
    resource: "affiliate-policies",
    id: ids.affiliate,
    economics: {
      attributionDays: 30,
      firstOrderCommissionBasisPoints: 1_000,
      reorderCommissionBasisPoints: 500,
      reorderWindowDays: 180,
      approvalDelayDays: 30,
      payoutThresholdMinor: 5_000,
      currency: "USD",
    },
  },
] as const;

describe("Task 8B4 policy admin read projection", () => {
  let database: PGlite;

  beforeEach(async () => {
    database = await createMigratedPglite();
    await database.exec(`
      INSERT INTO users (id, clerk_id, email_verified_at)
      VALUES ('${adminId}', 'clerk-policy-reader', '2026-08-28T00:00:00.000Z');
      INSERT INTO staff_roles
        (user_id, capability, granted_by_user_id, grant_correlation_id)
      VALUES ('${adminId}', 'growth:manage', '${adminId}', 'task-8b4-read');

      INSERT INTO loyalty_policies
        (id, version, status, points_per_dollar, redemption_minor_per_point,
         minimum_redemption_points, maximum_redemption_basis_points,
         expires_after_days, effective_at)
      VALUES ('${ids.loyalty}', 1, 'draft', 2, 1, 500, 2500, null,
              '2026-08-29T20:00:00.000Z');
      INSERT INTO referral_policies
        (id, version, status, attribution_days, referred_discount_basis_points,
         referred_discount_cap_minor, referrer_points_per_dollar,
         referrer_reward_cap_points, effective_at)
      VALUES ('${ids.referral}', 1, 'draft', 30, 1000, 2500, 5, 2500,
              '2026-08-29T20:00:00.000Z');
      INSERT INTO affiliate_policies
        (id, version, status, attribution_days, first_order_commission_basis_points,
         reorder_commission_basis_points, reorder_window_days, approval_delay_days,
         payout_threshold_minor, currency, effective_at)
      VALUES ('${ids.affiliate}', 1, 'draft', 30, 1000, 500, 180, 30, 5000,
              'USD', '2026-08-29T20:00:00.000Z');
    `);
  });

  afterEach(async () => database.close());

  function repository() {
    return createPostgresAdminReadRepository((work, options) => {
      expect(options).toEqual({ isolationLevel: "serializable", readOnly: true });
      return database.transaction((transaction) => work({
        query: async <Row extends object>(sql: string, params: readonly unknown[] = []) => {
          const result = await transaction.query<Row>(sql, [...params]);
          return { rows: result.rows };
        },
      } satisfies AdminReadSqlClient));
    });
  }

  it.each(cases)("returns bounded redacted database facts for $resource", async (entry) => {
    const result = await repository().readSnapshot({
      userId: adminId,
      identity,
      now,
      resource: entry.resource as AdminReadResource,
    });

    expect(result).toEqual({
      resource: entry.resource,
      limit: 100,
      truncated: false,
      items: [{
        id: entry.id,
        version: 1,
        status: "draft",
        effectiveAt: "2026-08-29T20:00:00.000Z",
        retiredAt: null,
        ...entry.economics,
      }],
    });
    expect(JSON.stringify(result)).not.toMatch(/actor|audit|clerk|email|metadata|secret|capability/iu);
  });

  it("fails closed without persisted growth read authority", async () => {
    await database.query(`UPDATE staff_roles
      SET revoked_by_user_id = $1, revoke_correlation_id = 'task-8b4-revoke', revoked_at = $2
      WHERE user_id = $1`, [
      adminId,
      now.toISOString(),
    ]);
    await expect(repository().readSnapshot({
      userId: adminId,
      identity,
      now,
      resource: "loyalty-policies" as AdminReadResource,
    })).rejects.toThrow(/growth:manage/i);
  });
});
