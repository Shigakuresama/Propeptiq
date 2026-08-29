import type { PGlite } from "@electric-sql/pglite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  activateGrowthPolicy,
  createGrowthPolicyDraft,
  type AdminCommandContext,
  type GrowthPolicyKind,
} from "@/admin/admin-service";
import {
  createPostgresAdminRepository,
  type AdminSqlClient,
} from "@/db/repositories/admin-repository";
import { createPostgresRateLimitStore } from "@/db/repositories/rate-limit-store";

import { createMigratedPglite } from "./helpers/pglite";

const now = new Date("2026-08-28T20:00:00.000Z");
const adminId = "89000000-0000-4000-8000-000000000001";
const activeIds = {
  loyalty: "89000000-0000-4000-8000-000000000002",
  referral: "89000000-0000-4000-8000-000000000003",
  affiliate: "89000000-0000-4000-8000-000000000004",
} as const;
const draftIds = {
  loyalty: "89000000-0000-4000-8000-000000000005",
  referral: "89000000-0000-4000-8000-000000000006",
  affiliate: "89000000-0000-4000-8000-000000000007",
} as const;

const policyCases = [
  {
    kind: "loyalty",
    table: "loyalty_policies",
    values: {
      pointsPerDollar: 2,
      redemptionMinorPerPoint: 1,
      minimumRedemptionPoints: 500,
      maximumRedemptionBasisPoints: 2_500,
      expiresAfterDays: null,
    },
  },
  {
    kind: "referral",
    table: "referral_policies",
    values: {
      attributionDays: 30,
      referredDiscountBasisPoints: 1_000,
      referredDiscountCapMinor: 2_500,
      referrerPointsPerDollar: 5,
      referrerRewardCapPoints: 2_500,
    },
  },
  {
    kind: "affiliate",
    table: "affiliate_policies",
    values: {
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

function context(correlationId: string): AdminCommandContext {
  return {
    principal: {
      actorId: adminId,
      clerkUserId: "clerk-growth-admin",
      buyerStatus: "active",
      capabilities: ["growth:manage"],
      mfaSatisfied: true,
    },
    identity: {
      clerkUserId: "clerk-growth-admin",
      primaryEmail: "admin@example.test",
      emailVerifiedAt: now.toISOString(),
      mfaConfigured: true,
      secondFactorCompleted: true,
    },
    now,
    correlationId,
    rateLimitSecret: "task-8b2-rate-limit-secret-at-least-32-characters",
  };
}

describe("Task 8B2 growth policy admin persistence", () => {
  let client: PGlite;

  beforeEach(async () => {
    client = await createMigratedPglite();
    await client.exec(`
      INSERT INTO users (id, clerk_id, email_verified_at)
      VALUES ('${adminId}', 'clerk-growth-admin', '${now.toISOString()}');
      INSERT INTO staff_roles
        (user_id, capability, granted_by_user_id, grant_correlation_id)
      VALUES ('${adminId}', 'growth:manage', '${adminId}', 'task-8b2-authority');
    `);
  });

  afterEach(async () => client.close());

  function repository(failAudit = false) {
    return createPostgresAdminRepository(
      (work, options) => {
        expect(options).toEqual({ isolationLevel: "serializable" });
        return client.transaction((transaction) => work({
          query: async <Row extends object>(sql: string, params: unknown[] = []) => {
            if (failAudit && /INSERT INTO admin_audit/iu.test(sql)) {
              throw new Error("synthetic forced audit insert failure");
            }
            const result = await transaction.query<Row>(sql, params);
            return { rows: result.rows };
          },
        } satisfies AdminSqlClient));
      },
      createPostgresRateLimitStore(client),
    );
  }

  async function seedActive(kind: GrowthPolicyKind): Promise<void> {
    const id = activeIds[kind];
    if (kind === "loyalty") {
      await client.query(`INSERT INTO loyalty_policies
        (id, version, status, points_per_dollar, redemption_minor_per_point,
         minimum_redemption_points, maximum_redemption_basis_points,
         expires_after_days, effective_at)
        VALUES ($1, 1, 'active', 2, 1, 500, 2500, null, '2026-08-27T20:00:00.000Z')`, [id]);
    } else if (kind === "referral") {
      await client.query(`INSERT INTO referral_policies
        (id, version, status, attribution_days, referred_discount_basis_points,
         referred_discount_cap_minor, referrer_points_per_dollar,
         referrer_reward_cap_points, effective_at)
        VALUES ($1, 1, 'active', 30, 1000, 2500, 5, 2500, '2026-08-27T20:00:00.000Z')`, [id]);
    } else {
      await client.query(`INSERT INTO affiliate_policies
        (id, version, status, attribution_days, first_order_commission_basis_points,
         reorder_commission_basis_points, reorder_window_days, approval_delay_days,
         payout_threshold_minor, currency, effective_at)
        VALUES ($1, 1, 'active', 30, 1000, 500, 180, 30, 5000, 'USD',
                '2026-08-27T20:00:00.000Z')`, [id]);
    }
  }

  it.each(policyCases)("creates one inactive $kind draft with immutable values", async ({ kind, table, values }) => {
    const result = await createGrowthPolicyDraft(repository(), context(`draft-${kind}`), {
      kind,
      policyId: draftIds[kind],
      effectiveAt: now.toISOString(),
      values,
    });

    expect(result).toEqual({ id: draftIds[kind], kind, version: 1, status: "draft" });
    const rows = await client.query<{ id: string; version: number; status: string; supersededAt: Date | null }>(
      `SELECT id::text, version, status, superseded_at AS "supersededAt" FROM ${table}`,
    );
    expect(rows.rows).toEqual([{ id: draftIds[kind], version: 1, status: "draft", supersededAt: null }]);
    expect((await client.query(`SELECT id FROM admin_audit`)).rows).toEqual([]);
  });

  it.each(policyCases)("activates $kind by CAS, supersedes prior active, and writes one redacted audit", async ({ kind, table, values }) => {
    await seedActive(kind);
    await createGrowthPolicyDraft(repository(), context(`create-${kind}`), {
      kind,
      policyId: draftIds[kind],
      effectiveAt: now.toISOString(),
      values,
    });

    await expect(activateGrowthPolicy(repository(), context(`activate-${kind}`), {
      kind,
      policyId: draftIds[kind],
      expectedVersion: 2,
    })).resolves.toEqual({ id: draftIds[kind], kind, version: 2, status: "active" });

    const rows = await client.query<{ id: string; version: number; status: string; supersededAt: Date | null }>(
      `SELECT id::text, version, status, superseded_at AS "supersededAt"
       FROM ${table} ORDER BY version`,
    );
    expect(rows.rows).toEqual([
      { id: activeIds[kind], version: 1, status: "superseded", supersededAt: now },
      { id: draftIds[kind], version: 2, status: "active", supersededAt: null },
    ]);
    const audits = await client.query<{
      action: string;
      resourceType: string;
      resourceId: string;
      correlationId: string;
      metadata: Record<string, unknown>;
    }>(`SELECT action, resource_type AS "resourceType", resource_id AS "resourceId",
              correlation_id AS "correlationId", metadata
         FROM admin_audit`);
    expect(audits.rows).toEqual([{
      action: "growth.policy.activated",
      resourceType: `${kind}_policy`,
      resourceId: draftIds[kind],
      correlationId: `activate-${kind}`,
      metadata: { kind, version: 2, status: "active" },
    }]);
  });

  it("rejects stale CAS and wrong-kind confusion without policy or audit writes", async () => {
    await createGrowthPolicyDraft(repository(), context("create-stale"), {
      kind: "loyalty",
      policyId: draftIds.loyalty,
      effectiveAt: now.toISOString(),
      values: policyCases[0].values,
    });

    await expect(activateGrowthPolicy(repository(), context("stale"), {
      kind: "loyalty", policyId: draftIds.loyalty, expectedVersion: 2,
    })).rejects.toThrow(/stale/i);
    await expect(activateGrowthPolicy(repository(), context("wrong-kind"), {
      kind: "referral", policyId: draftIds.loyalty, expectedVersion: 1,
    })).rejects.toThrow(/stale|unavailable/i);

    expect((await client.query(`SELECT status FROM loyalty_policies WHERE id = $1`, [draftIds.loyalty])).rows)
      .toEqual([{ status: "draft" }]);
    expect((await client.query(`SELECT id FROM admin_audit`)).rows).toEqual([]);
  });

  it("rejects overlapping effective windows and malformed persisted domain shape without writes", async () => {
    await seedActive("loyalty");
    await createGrowthPolicyDraft(repository(), context("create-overlap"), {
      kind: "loyalty",
      policyId: draftIds.loyalty,
      effectiveAt: "2026-08-28T19:59:59.000Z",
      values: policyCases[0].values,
    });
    await expect(activateGrowthPolicy(repository(), context("overlap"), {
      kind: "loyalty", policyId: draftIds.loyalty, expectedVersion: 2,
    })).rejects.toThrow(/overlap|effective/i);

    await client.query(`INSERT INTO affiliate_policies
      (id, version, status, attribution_days, first_order_commission_basis_points,
       reorder_commission_basis_points, reorder_window_days, approval_delay_days,
       payout_threshold_minor, currency, effective_at)
      VALUES ($1, 1, 'draft', 31, 1000, 500, 180, 30, 5000, 'USD', $2)`,
    [draftIds.affiliate, now.toISOString()]);
    await expect(activateGrowthPolicy(repository(), context("invalid-domain"), {
      kind: "affiliate", policyId: draftIds.affiliate, expectedVersion: 1,
    })).rejects.toThrow(/domain|invalid/i);

    expect((await client.query(`SELECT version, status FROM loyalty_policies ORDER BY version`)).rows)
      .toEqual([{ version: 1, status: "active" }, { version: 2, status: "draft" }]);
    expect((await client.query(`SELECT version, status FROM affiliate_policies`)).rows)
      .toEqual([{ version: 1, status: "draft" }]);
    expect((await client.query(`SELECT id FROM admin_audit`)).rows).toEqual([]);
  });

  it("rolls back both prior retirement and activation when the audit insert fails", async () => {
    await seedActive("loyalty");
    await createGrowthPolicyDraft(repository(), context("create-audit-failure"), {
      kind: "loyalty",
      policyId: draftIds.loyalty,
      effectiveAt: now.toISOString(),
      values: policyCases[0].values,
    });

    await expect(activateGrowthPolicy(repository(true), context("audit-failure"), {
      kind: "loyalty", policyId: draftIds.loyalty, expectedVersion: 2,
    })).rejects.toThrow(/audit insert failure/i);

    expect((await client.query(`SELECT id::text, version, status, superseded_at AS "supersededAt"
                                  FROM loyalty_policies ORDER BY version`)).rows).toEqual([
      { id: activeIds.loyalty, version: 1, status: "active", supersededAt: null },
      { id: draftIds.loyalty, version: 2, status: "draft", supersededAt: null },
    ]);
    expect((await client.query(`SELECT id FROM admin_audit`)).rows).toEqual([]);
  });

  it("rejects a pure-domain-invalid draft before opening the policy transaction", async () => {
    await expect(createGrowthPolicyDraft(repository(), context("invalid-draft"), {
      kind: "affiliate",
      policyId: draftIds.affiliate,
      effectiveAt: now.toISOString(),
      values: { ...policyCases[2].values, payoutThresholdMinor: 5_001 },
    })).rejects.toThrow(/domain shape/i);
    expect((await client.query(`SELECT id FROM affiliate_policies`)).rows).toEqual([]);
    expect((await client.query(`SELECT id FROM admin_audit`)).rows).toEqual([]);
  });
});
