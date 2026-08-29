import type { PGlite } from "@electric-sql/pglite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  adjustRewardBalance,
  type AdminCommandContext,
} from "@/admin/admin-service";
import {
  createPostgresAdminRepository,
  type AdminSqlClient,
} from "@/db/repositories/admin-repository";
import { createPostgresRateLimitStore } from "@/db/repositories/rate-limit-store";

import { createMigratedPglite } from "./helpers/pglite";

const now = new Date("2026-08-28T23:30:00.000Z");
const userId = "8c1b0000-0000-4000-8000-000000000001";
const accountId = "8c1b0000-0000-4000-8000-000000000002";
const entryId = "8c1b0000-0000-4000-8000-000000000003";
const missingAccountId = "8c1b0000-0000-4000-8000-000000000004";
const unrelatedEntryId = "8c1b0000-0000-4000-8000-000000000005";

function context(correlationId: string): AdminCommandContext {
  return {
    principal: {
      actorId: userId,
      clerkUserId: "clerk-reward-admin",
      buyerStatus: "active",
      capabilities: ["growth:manage"],
      mfaSatisfied: true,
    },
    identity: {
      clerkUserId: "clerk-reward-admin",
      primaryEmail: "admin@example.test",
      emailVerifiedAt: now.toISOString(),
      mfaConfigured: true,
      secondFactorCompleted: true,
    },
    now,
    correlationId,
    rateLimitSecret: "task-8c1a1-pglite-rate-secret-at-least-32-characters",
  };
}

function command(overrides: Record<string, unknown> = {}) {
  return {
    entryId,
    rewardAccountId: accountId,
    delta: 250,
    reason: "account_correction",
    internalAuditReason: "Corrected a verified migration discrepancy.",
    idempotencyKey: "task-8c1a1-pglite-adjustment-0001",
    ...overrides,
  };
}

describe("Task 8C1A1 reward adjustment admin persistence", () => {
  let client: PGlite;

  beforeEach(async () => {
    client = await createMigratedPglite();
    await client.exec(`
      INSERT INTO users (id, clerk_id, email_verified_at)
      VALUES ('${userId}', 'clerk-reward-admin', '${now.toISOString()}');
      INSERT INTO staff_roles
        (user_id, capability, granted_by_user_id, grant_correlation_id)
      VALUES ('${userId}', 'growth:manage', '${userId}', 'task-8c1a1-authority');
      INSERT INTO reward_accounts
        (id, buyer_user_id, pending_points, available_points, created_at, updated_at)
      VALUES ('${accountId}', '${userId}', 0, 1000, '${now.toISOString()}', '${now.toISOString()}');
    `);
  });

  afterEach(async () => client.close());

  function repository(config: Readonly<{
    failAudit?: boolean;
    staleBalance?: boolean;
  }> = {}) {
    return createPostgresAdminRepository(
      (work, transactionOptions) => {
        expect(transactionOptions).toEqual({ isolationLevel: "serializable" });
        return client.transaction((transaction) => work({
          query: async <Row extends object>(sql: string, params: unknown[] = []) => {
            if (config.failAudit && /INSERT INTO admin_audit/iu.test(sql)) {
              throw new Error("synthetic forced audit insert failure");
            }
            if (config.staleBalance && /UPDATE reward_accounts/iu.test(sql)) {
              return { rows: [] as Row[] };
            }
            const result = await transaction.query<Row>(sql, params);
            return { rows: result.rows };
          },
        } satisfies AdminSqlClient));
      },
      createPostgresRateLimitStore(client),
    );
  }

  async function persistedState() {
    return (await client.query<{ balance: number; ledger: number; audits: number }>(`
      SELECT available_points AS balance,
             (SELECT count(*)::int FROM reward_ledger_entries) AS ledger,
             (SELECT count(*)::int FROM admin_audit) AS audits
      FROM reward_accounts WHERE id = $1::uuid
    `, [accountId])).rows;
  }

  it("applies once, returns exact replay without duplicates, and conflicts on a changed fingerprint", async () => {
    const adminRepository = repository();

    await expect(adjustRewardBalance(
      adminRepository,
      context("task-8c1a1-applied"),
      command(),
    )).resolves.toEqual({
      status: "applied",
      entryId,
      rewardAccountId: accountId,
      delta: 250,
      availablePointsBalanceAfter: 1_250,
    });

    const applied = await client.query<{
      buyerUserId: string;
      availablePoints: number;
      kind: string;
      sourceType: string;
      sourceId: string;
      idempotencyKey: string;
      availablePointsDelta: number;
      availablePointsBalanceAfter: number;
      audits: number;
      metadata: Record<string, unknown>;
    }>(`
      SELECT ra.buyer_user_id::text AS "buyerUserId",
             ra.available_points AS "availablePoints", le.kind,
             le.source_type AS "sourceType", le.source_id AS "sourceId",
             le.idempotency_key AS "idempotencyKey",
             le.available_points_delta AS "availablePointsDelta",
             le.available_points_balance_after AS "availablePointsBalanceAfter",
             (SELECT count(*)::int FROM admin_audit) AS audits,
             (SELECT metadata FROM admin_audit LIMIT 1) AS metadata
      FROM reward_accounts ra
      JOIN reward_ledger_entries le ON le.reward_account_id = ra.id
      WHERE ra.id = $1::uuid
    `, [accountId]);
    expect(applied.rows).toHaveLength(1);
    expect(applied.rows[0]).toMatchObject({
      buyerUserId: userId,
      availablePoints: 1_250,
      kind: "admin_adjustment",
      sourceType: "admin_adjustment",
      idempotencyKey: "admin_adjustment:task-8c1a1-pglite-adjustment-0001",
      availablePointsDelta: 250,
      availablePointsBalanceAfter: 1_250,
      audits: 1,
      metadata: {
        delta: 250,
        reason: "account_correction",
        internalAuditReason: "Corrected a verified migration discrepancy.",
      },
    });
    expect(applied.rows[0]!.sourceId).toMatch(/^[0-9a-f]{64}$/u);
    expect(applied.rows[0]!.sourceId).not.toContain("migration discrepancy");

    await expect(adjustRewardBalance(
      adminRepository,
      context("task-8c1a1-replay"),
      command(),
    )).resolves.toEqual({
      status: "idempotent",
      entryId,
      rewardAccountId: accountId,
      delta: 250,
      availablePointsBalanceAfter: 1_250,
    });
    expect(await persistedState()).toEqual([{ balance: 1_250, ledger: 1, audits: 1 }]);

    await expect(adjustRewardBalance(
      adminRepository,
      context("task-8c1a1-conflict"),
      command({ internalAuditReason: "A different internal explanation." }),
    )).rejects.toThrow(/idempotency|fingerprint|conflict/i);
    expect(await persistedState()).toEqual([{ balance: 1_250, ledger: 1, audits: 1 }]);
  });

  it("isolates adjustment idempotency from an unrelated ledger flow using the same raw key", async () => {
    const rawKey = "task-8c1a1-pglite-adjustment-0001";
    await client.query(
      `UPDATE reward_accounts SET pending_points = 5 WHERE id = $1::uuid`,
      [accountId],
    );
    await client.query(`
      INSERT INTO reward_ledger_entries (
        id, reward_account_id, buyer_user_id, kind, source_type, source_id,
        idempotency_key, pending_points_delta, available_points_delta,
        pending_points_balance_after, available_points_balance_after, occurred_at
      ) VALUES (
        $1::uuid, $2::uuid, $3::uuid, 'order_earned_pending', 'order',
        'unrelated-order-source', $4, 5, 0, 5, 1000, $5::timestamptz
      )
    `, [unrelatedEntryId, accountId, userId, rawKey, now.toISOString()]);
    const adminRepository = repository();

    await expect(adjustRewardBalance(
      adminRepository,
      context("task-8c1a1-namespaced-applied"),
      command({ idempotencyKey: rawKey }),
    )).resolves.toMatchObject({ status: "applied", availablePointsBalanceAfter: 1_250 });
    await expect(adjustRewardBalance(
      adminRepository,
      context("task-8c1a1-namespaced-replay"),
      command({ idempotencyKey: rawKey }),
    )).resolves.toMatchObject({ status: "idempotent", availablePointsBalanceAfter: 1_250 });
    await expect(adjustRewardBalance(
      adminRepository,
      context("task-8c1a1-namespaced-conflict"),
      command({ idempotencyKey: rawKey, internalAuditReason: "Changed fingerprint." }),
    )).rejects.toThrow(/idempotency|fingerprint|conflict/i);

    const persisted = await client.query<{
      idempotencyKey: string;
      audits: number;
      metadata: Record<string, unknown>;
    }>(`
      SELECT idempotency_key AS "idempotencyKey",
             (SELECT count(*)::int FROM admin_audit) AS audits,
             (SELECT metadata FROM admin_audit LIMIT 1) AS metadata
      FROM reward_ledger_entries
      ORDER BY idempotency_key
    `);
    expect(persisted.rows.map((row) => row.idempotencyKey)).toEqual([
      "admin_adjustment:task-8c1a1-pglite-adjustment-0001",
      rawKey,
    ]);
    expect(persisted.rows).toHaveLength(2);
    expect(persisted.rows[0]!.audits).toBe(1);
    expect(JSON.stringify(persisted.rows[0]!.metadata)).not.toContain("admin_adjustment:");
  });

  it("rejects a missing exact account without ledger or audit writes", async () => {
    await expect(adjustRewardBalance(
      repository(),
      context("task-8c1a1-missing-account"),
      command({ rewardAccountId: missingAccountId }),
    )).rejects.toThrow(/reward account.*(?:missing|unavailable)/i);

    expect(await persistedState()).toEqual([{ balance: 1_000, ledger: 0, audits: 0 }]);
  });

  it("rejects a balance overflow before ledger, balance, or audit writes", async () => {
    await client.query(
      `UPDATE reward_accounts SET available_points = 9007199254740991 WHERE id = $1::uuid`,
      [accountId],
    );

    await expect(adjustRewardBalance(
      repository(),
      context("task-8c1a1-overflow"),
      command({ delta: 1 }),
    )).rejects.toThrow(/balance.*overflow|unsafe|conflict/i);

    expect(await persistedState()).toEqual([{
      balance: 9_007_199_254_740_991,
      ledger: 0,
      audits: 0,
    }]);
  });

  it("rolls back the ledger insert when the balance CAS is stale", async () => {
    await expect(adjustRewardBalance(
      repository({ staleBalance: true }),
      context("task-8c1a1-stale-balance"),
      command(),
    )).rejects.toThrow(/stale|balance.*conflict/i);

    expect(await persistedState()).toEqual([{ balance: 1_000, ledger: 0, audits: 0 }]);
  });

  it("rolls back ledger and balance changes when audit insertion fails", async () => {
    await expect(adjustRewardBalance(
      repository({ failAudit: true }),
      context("task-8c1a1-audit-failure"),
      command(),
    )).rejects.toThrow(/audit insert failure/i);

    expect(await persistedState()).toEqual([{ balance: 1_000, ledger: 0, audits: 0 }]);
  });
});
