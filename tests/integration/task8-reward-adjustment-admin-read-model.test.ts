import type { PGlite } from "@electric-sql/pglite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { VerifiedIdentity } from "@/auth/identity";
import {
  createPostgresAdminReadRepository,
  type AdminReadSqlClient,
} from "@/db/repositories/admin-read-repository";

import { createMigratedPglite } from "./helpers/pglite";

const adminId = "8c1a3000-0000-4000-8000-000000000001";
const rewardAccountId = "8c1a3000-0000-4000-8000-000000000002";
const adjustmentId = "8c1a3000-0000-4000-8000-000000000003";
const orderEntryId = "8c1a3000-0000-4000-8000-000000000004";
const now = new Date("2026-08-29T18:00:00.000Z");
const identity: VerifiedIdentity = {
  clerkUserId: "clerk-reward-read-admin",
  primaryEmail: "private-admin@example.test",
  emailVerifiedAt: "2026-08-29T17:00:00.000Z",
  mfaConfigured: true,
  secondFactorCompleted: true,
};

describe("Task 8C1A3 reward adjustment admin read projection", () => {
  let database: PGlite;

  beforeEach(async () => {
    database = await createMigratedPglite();
    await database.exec(`
      INSERT INTO users (id, clerk_id, email_verified_at)
      VALUES ('${adminId}', 'clerk-reward-read-admin', '${identity.emailVerifiedAt}');
      INSERT INTO staff_roles
        (user_id, capability, granted_by_user_id, grant_correlation_id)
      VALUES ('${adminId}', 'growth:manage', '${adminId}', 'task-8c1a3-read');
      INSERT INTO reward_accounts
        (id, buyer_user_id, pending_points, available_points, created_at, updated_at)
      VALUES ('${rewardAccountId}', '${adminId}', 7, 1250, '${now.toISOString()}', '${now.toISOString()}');
      INSERT INTO reward_ledger_entries (
        id, reward_account_id, buyer_user_id, kind, source_type, source_id,
        idempotency_key, pending_points_delta, available_points_delta,
        pending_points_balance_after, available_points_balance_after, occurred_at
      ) VALUES
      ('${adjustmentId}', '${rewardAccountId}', '${adminId}', 'admin_adjustment',
       'admin_adjustment', '${"a".repeat(64)}', 'admin_adjustment:private-key',
       0, 250, 7, 1250, '${now.toISOString()}'),
      ('${orderEntryId}', '${rewardAccountId}', '${adminId}', 'order_earned_pending',
       'order', 'private-order-reference', 'private-order-key',
       7, 0, 7, 1000, '2026-08-29T17:00:00.000Z');
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

  it("returns only bounded account balances and immutable adjustment facts", async () => {
    const result = await repository().readSnapshot({
      userId: adminId,
      identity,
      now,
      resource: "reward-adjustments",
    });

    expect(result).toEqual({
      resource: "reward-adjustments",
      limit: 100,
      truncated: false,
      items: [{
        rewardAccountId,
        pendingPoints: 7,
        availablePoints: 1250,
        recentAdjustments: [{
          adjustmentId,
          delta: 250,
          occurredAt: now.toISOString(),
        }],
      }],
    });
    expect(JSON.stringify(result)).not.toMatch(
      /buyer|clerk|email|internalAuditReason|audit|order|payment|cookie|device|fingerprint|idempotency|sourceId/iu,
    );
    expect(Object.isFrozen(result.items)).toBe(true);
    expect(Object.isFrozen(result.items[0]?.recentAdjustments)).toBe(true);
  });
});
