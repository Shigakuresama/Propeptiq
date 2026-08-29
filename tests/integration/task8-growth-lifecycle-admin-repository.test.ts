import type { PGlite } from "@electric-sql/pglite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import * as serviceModule from "@/admin/admin-service";
import type { AdminCommandContext, AdminRepository } from "@/admin/admin-service";
import {
  createPostgresAdminRepository,
  type AdminSqlClient,
} from "@/db/repositories/admin-repository";
import { createPostgresRateLimitStore } from "@/db/repositories/rate-limit-store";

import { createMigratedPglite } from "./helpers/pglite";

const ids = {
  admin: "8c1a5000-0000-4000-8000-000000000001",
  owner: "8c1a5000-0000-4000-8000-000000000002",
  referralCode: "8c1a5000-0000-4000-8000-000000000003",
  sharedSet: "8c1a5000-0000-4000-8000-000000000004",
  productGroup: "8c1a5000-0000-4000-8000-000000000005",
  productOne: "8c1a5000-0000-4000-8000-000000000006",
  productTwo: "8c1a5000-0000-4000-8000-000000000007",
} as const;
const now = new Date("2026-08-29T22:00:00.000Z");
const referralCreatedAt = "2026-08-28T20:00:00.000Z";
const sharedSetUpdatedAt = "2026-08-28T21:00:00.000Z";

type LifecycleServices = Readonly<{
  revokeReferralCode: (repository: AdminRepository, context: AdminCommandContext, input: unknown) => Promise<unknown>;
  deactivateSharedSet: (repository: AdminRepository, context: AdminCommandContext, input: unknown) => Promise<unknown>;
}>;
const services = serviceModule as unknown as Partial<LifecycleServices>;

function context(correlationId: string, current = now): AdminCommandContext {
  return {
    principal: {
      actorId: ids.admin,
      clerkUserId: "clerk-growth-lifecycle-admin",
      buyerStatus: "active",
      capabilities: ["growth:manage"],
      mfaSatisfied: true,
    },
    identity: {
      clerkUserId: "clerk-growth-lifecycle-admin",
      primaryEmail: "admin@example.test",
      emailVerifiedAt: "2026-08-28T22:00:00.000Z",
      mfaConfigured: true,
      secondFactorCompleted: true,
    },
    now: current,
    correlationId,
    rateLimitSecret: "task-8c1a-lifecycle-pglite-secret-at-least-32-characters",
  };
}

async function revoke(
  repository: AdminRepository,
  correlationId: string,
  expectedCreatedAt = referralCreatedAt,
  current = now,
) {
  if (!services.revokeReferralCode) throw new Error("revokeReferralCode service is not implemented");
  return services.revokeReferralCode(repository, context(correlationId, current), {
    referralCodeId: ids.referralCode,
    expectedCreatedAt,
  });
}

async function deactivate(
  repository: AdminRepository,
  correlationId: string,
  expectedUpdatedAt = sharedSetUpdatedAt,
  current = now,
) {
  if (!services.deactivateSharedSet) throw new Error("deactivateSharedSet service is not implemented");
  return services.deactivateSharedSet(repository, context(correlationId, current), {
    sharedSetId: ids.sharedSet,
    expectedUpdatedAt,
  });
}

describe("Task 8C1A admin growth lifecycle persistence", () => {
  let database: PGlite;

  beforeEach(async () => {
    database = await createMigratedPglite();
    await database.exec(`
      INSERT INTO users (id, clerk_id, email_verified_at) VALUES
        ('${ids.admin}', 'clerk-growth-lifecycle-admin', '2026-08-28T22:00:00.000Z'),
        ('${ids.owner}', 'private-owner-clerk', '2026-08-28T22:00:00.000Z');
      INSERT INTO staff_roles
        (user_id, capability, granted_by_user_id, grant_correlation_id)
      VALUES ('${ids.admin}', 'growth:manage', '${ids.admin}', 'task-8c1a-lifecycle-authority');
      INSERT INTO referral_codes
        (id, owner_user_id, code, status, created_at)
      VALUES ('${ids.referralCode}', '${ids.owner}', 'ref_ABCDEFGHIJKLMNOP', 'active', '${referralCreatedAt}');
      INSERT INTO product_policy_groups (id, slug, name)
      VALUES ('${ids.productGroup}', 'lifecycle-test', 'Lifecycle test');
      INSERT INTO products
        (id, slug, name, package_form, material_identity, policy_group_id, status)
      VALUES
        ('${ids.productOne}', 'lifecycle-one', 'Lifecycle one', 'sealed', 'Synthetic fixture', '${ids.productGroup}', 'active'),
        ('${ids.productTwo}', 'lifecycle-two', 'Lifecycle two', 'sealed', 'Synthetic fixture', '${ids.productGroup}', 'active');
      INSERT INTO shared_research_sets
        (id, owner_user_id, public_code, label, active, created_at, updated_at)
      VALUES ('${ids.sharedSet}', '${ids.owner}', 'set_ABCDEFGHIJKLMNOP',
              'Private label sentinel', true, '${sharedSetUpdatedAt}', '${sharedSetUpdatedAt}');
      INSERT INTO shared_research_set_items (shared_set_id, product_id, quantity) VALUES
        ('${ids.sharedSet}', '${ids.productOne}', 1),
        ('${ids.sharedSet}', '${ids.productTwo}', 2);
    `);
  });

  afterEach(async () => database.close());

  function repository(options: Readonly<{ failAudit?: boolean }> = {}) {
    return createPostgresAdminRepository(
      (work, transactionOptions) => {
        expect(transactionOptions).toEqual({ isolationLevel: "serializable" });
        return database.transaction((transaction) => work({
          query: async <Row extends object>(sql: string, params: unknown[] = []) => {
            if (options.failAudit && /INSERT INTO admin_audit/iu.test(sql)) {
              throw new Error("synthetic forced audit failure");
            }
            const result = await transaction.query<Row>(sql, params);
            return { rows: result.rows };
          },
        } satisfies AdminSqlClient));
      },
      createPostgresRateLimitStore(database),
    );
  }

  async function state() {
    return (await database.query<{
      referralStatus: string;
      referralCode: string;
      revokedAt: string | null;
      setActive: boolean;
      setLabel: string;
      setCode: string;
      setUpdatedAt: string;
      setDeactivatedAt: string | null;
      itemCount: number;
      itemQuantity: number;
      auditCount: number;
      historyCount: number;
    }>(`
      SELECT rc.status AS "referralStatus", rc.code AS "referralCode",
             rc.revoked_at::text AS "revokedAt",
             s.active AS "setActive", s.label AS "setLabel", s.public_code AS "setCode",
             s.updated_at::text AS "setUpdatedAt", s.deactivated_at::text AS "setDeactivatedAt",
             (SELECT count(*)::int FROM shared_research_set_items WHERE shared_set_id = s.id) AS "itemCount",
             (SELECT sum(quantity)::int FROM shared_research_set_items WHERE shared_set_id = s.id) AS "itemQuantity",
             (SELECT count(*)::int FROM admin_audit) AS "auditCount"
             ,(SELECT count(*)::int FROM shared_research_set_mutations
               WHERE shared_set_id = s.id AND kind = 'deactivate') AS "historyCount"
      FROM referral_codes rc CROSS JOIN shared_research_sets s
      WHERE rc.id = $1::uuid AND s.id = $2::uuid
    `, [ids.referralCode, ids.sharedSet])).rows[0]!;
  }

  it("soft-transitions both records, preserves immutable facts/items, and returns exact replay", async () => {
    const adminRepository = repository();
    await expect(revoke(adminRepository, "task-8c1a-referral-applied")).resolves.toMatchObject({ status: "applied" });
    await expect(deactivate(adminRepository, "task-8c1a-set-applied")).resolves.toMatchObject({ status: "applied" });
    await expect(revoke(adminRepository, "task-8c1a-referral-replay")).resolves.toMatchObject({ status: "idempotent" });
    await expect(deactivate(adminRepository, "task-8c1a-set-replay")).resolves.toMatchObject({ status: "idempotent" });
    const later = new Date("2026-08-29T22:00:01.000Z");
    await expect(revoke(
      adminRepository,
      "task-8c1a-referral-later-stale",
      referralCreatedAt,
      later,
    )).rejects.toThrow(/stale/i);
    await expect(deactivate(
      adminRepository,
      "task-8c1a-set-later-stale",
      sharedSetUpdatedAt,
      later,
    )).rejects.toThrow(/stale/i);

    expect(await state()).toMatchObject({
      referralStatus: "revoked",
      referralCode: "ref_ABCDEFGHIJKLMNOP",
      setActive: false,
      setLabel: "Private label sentinel",
      setCode: "set_ABCDEFGHIJKLMNOP",
      itemCount: 2,
      itemQuantity: 3,
      auditCount: 2,
      historyCount: 1,
    });
    const audits = await database.query<{
      action: string;
      resourceType: string;
      resourceId: string;
      metadata: Record<string, unknown>;
    }>(`SELECT action, resource_type AS "resourceType", resource_id AS "resourceId", metadata
        FROM admin_audit ORDER BY action`);
    expect(audits.rows).toEqual([
      {
        action: "growth.referral_code.revoked",
        resourceType: "referral_code",
        resourceId: ids.referralCode,
        metadata: { status: "revoked" },
      },
      {
        action: "growth.shared_set.deactivated",
        resourceType: "shared_research_set",
        resourceId: ids.sharedSet,
        metadata: { active: false },
      },
    ]);
    expect(JSON.stringify(audits.rows)).not.toMatch(/private-owner|private label|ref_ABCDEFGHIJKLMNOP|set_ABCDEFGHIJKLMNOP/iu);
  });

  it("rejects stale immutable/CAS facts without mutation or audit", async () => {
    const adminRepository = repository();
    await expect(revoke(adminRepository, "task-8c1a-referral-stale", "2026-08-28T19:59:59.000Z")).rejects.toThrow(/stale/i);
    await expect(deactivate(adminRepository, "task-8c1a-set-stale", "2026-08-28T20:59:59.000Z")).rejects.toThrow(/stale/i);
    expect(await state()).toMatchObject({ referralStatus: "active", setActive: true, auditCount: 0 });
  });

  it("rolls back each lifecycle transition when its audit insert fails", async () => {
    const adminRepository = repository({ failAudit: true });
    await expect(revoke(adminRepository, "task-8c1a-referral-audit-fail")).rejects.toThrow(/audit/i);
    await expect(deactivate(adminRepository, "task-8c1a-set-audit-fail")).rejects.toThrow(/audit/i);
    expect(await state()).toMatchObject({ referralStatus: "active", setActive: true, auditCount: 0 });
  });

  it("requires persisted growth authority before either record can change", async () => {
    await database.exec(`DELETE FROM staff_roles WHERE user_id = '${ids.admin}'`);
    const adminRepository = repository();
    await expect(revoke(adminRepository, "task-8c1a-persisted-deny")).rejects.toThrow(/growth:manage/i);
    expect(await state()).toMatchObject({ referralStatus: "active", setActive: true, auditCount: 0 });
  });
});
