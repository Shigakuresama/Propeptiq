import type { PGlite } from "@electric-sql/pglite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { VerifiedIdentity } from "@/auth/identity";
import {
  createPostgresAdminReadRepository,
  type AdminReadSqlClient,
} from "@/db/repositories/admin-read-repository";

import { createMigratedPglite } from "./helpers/pglite";

const ids = {
  admin: "8c1a6000-0000-4000-8000-000000000001",
  owner: "8c1a6000-0000-4000-8000-000000000002",
  referralCode: "8c1a6000-0000-4000-8000-000000000003",
  sharedSet: "8c1a6000-0000-4000-8000-000000000004",
  productGroup: "8c1a6000-0000-4000-8000-000000000005",
  productOne: "8c1a6000-0000-4000-8000-000000000006",
  productTwo: "8c1a6000-0000-4000-8000-000000000007",
} as const;
const createdAt = "2026-08-28T20:00:00.000Z";
const updatedAt = "2026-08-28T21:00:00.000Z";
const now = new Date("2026-08-29T22:00:00.000Z");
const identity: VerifiedIdentity = {
  clerkUserId: "clerk-growth-read-admin",
  primaryEmail: "private-admin@example.test",
  emailVerifiedAt: "2026-08-28T22:00:00.000Z",
  mfaConfigured: true,
  secondFactorCompleted: true,
};

describe("Task 8 growth lifecycle admin read projections", () => {
  let database: PGlite;

  beforeEach(async () => {
    database = await createMigratedPglite();
    await database.exec(`
      INSERT INTO users (id, clerk_id, email_verified_at) VALUES
        ('${ids.admin}', 'clerk-growth-read-admin', '${identity.emailVerifiedAt}'),
        ('${ids.owner}', 'private-owner-clerk', '${identity.emailVerifiedAt}');
      INSERT INTO staff_roles (user_id, capability, granted_by_user_id, grant_correlation_id)
      VALUES ('${ids.admin}', 'growth:manage', '${ids.admin}', 'growth-read-authority');
      INSERT INTO referral_codes (id, owner_user_id, code, status, created_at)
      VALUES ('${ids.referralCode}', '${ids.owner}', 'ref_ABCDEFGHIJKLMNOP', 'active', '${createdAt}');
      INSERT INTO product_policy_groups (id, slug, name)
      VALUES ('${ids.productGroup}', 'growth-read', 'Growth read fixture');
      INSERT INTO products
        (id, slug, name, package_form, material_identity, policy_group_id, status)
      VALUES
        ('${ids.productOne}', 'growth-read-one', 'Growth read one', 'sealed', 'Fixture', '${ids.productGroup}', 'active'),
        ('${ids.productTwo}', 'growth-read-two', 'Growth read two', 'sealed', 'Fixture', '${ids.productGroup}', 'active');
      INSERT INTO shared_research_sets
        (id, owner_user_id, public_code, label, active, created_at, updated_at)
      VALUES ('${ids.sharedSet}', '${ids.owner}', 'set_ABCDEFGHIJKLMNOP', 'Research set', true,
              '${createdAt}', '${updatedAt}');
      INSERT INTO shared_research_set_items (shared_set_id, product_id, quantity) VALUES
        ('${ids.sharedSet}', '${ids.productOne}', 1),
        ('${ids.sharedSet}', '${ids.productTwo}', 2);
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

  it("returns only bounded public referral-code and shared-set lifecycle facts", async () => {
    const referralCodes = await repository().readSnapshot({
      userId: ids.admin, identity, now, resource: "referral-codes",
    });
    const sharedSets = await repository().readSnapshot({
      userId: ids.admin, identity, now, resource: "shared-sets",
    });

    expect(referralCodes).toEqual({
      resource: "referral-codes", limit: 100, truncated: false,
      items: [{ referralCodeId: ids.referralCode, code: "ref_ABCDEFGHIJKLMNOP", status: "active", createdAt, revokedAt: null }],
    });
    expect(sharedSets).toEqual({
      resource: "shared-sets", limit: 100, truncated: false,
      items: [{ sharedSetId: ids.sharedSet, publicCode: "set_ABCDEFGHIJKLMNOP", label: "Research set", active: true, itemCount: 2, createdAt, updatedAt, deactivatedAt: null }],
    });
    expect(JSON.stringify({ referralCodes, sharedSets })).not.toMatch(
      /owner|buyer|userId|clerk|email|attribution|order|payment|audit|idempotency/iu,
    );
    expect(Object.isFrozen(referralCodes.items)).toBe(true);
    expect(Object.isFrozen(sharedSets.items)).toBe(true);
  });
});
