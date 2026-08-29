import type { PGlite } from "@electric-sql/pglite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { VerifiedIdentity } from "@/auth/identity";
import {
  createPostgresAdminReadRepository,
  type AdminReadSqlClient,
} from "@/db/repositories/admin-read-repository";

import { createMigratedPglite } from "./helpers/pglite";

const ids = {
  admin: "8c1a9000-0000-4000-8000-000000000001",
  affiliate: "8c1a9000-0000-4000-8000-000000000002",
  terms: "8c1a9000-0000-4000-8000-000000000003",
  acceptance: "8c1a9000-0000-4000-8000-000000000004",
  profile: "8c1a9000-0000-4000-8000-000000000005",
} as const;
const createdAt = "2026-08-28T20:00:00.000Z";
const updatedAt = "2026-08-28T21:00:00.000Z";
const now = new Date("2026-08-29T22:00:00.000Z");
const identity: VerifiedIdentity = {
  clerkUserId: "clerk-affiliate-read-admin",
  primaryEmail: "private-admin@example.test",
  emailVerifiedAt: "2026-08-28T22:00:00.000Z",
  mfaConfigured: true,
  secondFactorCompleted: true,
};

describe("Task 8 affiliate application admin read projection", () => {
  let database: PGlite;

  beforeEach(async () => {
    database = await createMigratedPglite();
    await database.exec(`
      INSERT INTO users (id, clerk_id, email_verified_at) VALUES
        ('${ids.admin}', 'clerk-affiliate-read-admin', '${identity.emailVerifiedAt}'),
        ('${ids.affiliate}', 'private-affiliate-clerk', '${identity.emailVerifiedAt}');
      INSERT INTO staff_roles (user_id, capability, granted_by_user_id, grant_correlation_id)
      VALUES ('${ids.admin}', 'growth:manage', '${ids.admin}', 'affiliate-read-authority');
      INSERT INTO growth_terms_versions
        (id, program, version, content_hash, terms_text, effective_at)
      VALUES ('${ids.terms}', 'affiliate', 1, '${"a".repeat(64)}',
              'Synthetic affiliate terms fixture', '${createdAt}');
      INSERT INTO growth_terms_acceptances
        (id, user_id, program, terms_version_id, content_hash, accepted_at)
      VALUES ('${ids.acceptance}', '${ids.affiliate}', 'affiliate', '${ids.terms}',
              '${"a".repeat(64)}', '${createdAt}');
      INSERT INTO affiliate_profiles
        (id, user_id, public_code, status, version, public_channel, promotion_method,
         terms_acceptance_id, terms_program, created_at, updated_at)
      VALUES ('${ids.profile}', '${ids.affiliate}', 'aff_ABCDEFGHIJKLMNOP', 'pending', 1,
              'https://partner.example/research', 'website', '${ids.acceptance}', 'affiliate',
              '${createdAt}', '${updatedAt}');
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

  async function read() {
    return repository().readSnapshot({
      userId: ids.admin,
      identity,
      now,
      resource: "affiliate-applications",
    });
  }

  it("returns only bounded public application lifecycle facts", async () => {
    const result = await read();

    expect(result).toEqual({
      resource: "affiliate-applications",
      limit: 100,
      truncated: false,
      items: [{
        affiliateProfileId: ids.profile,
        publicCode: "aff_ABCDEFGHIJKLMNOP",
        status: "pending",
        version: 1,
        publicChannel: "https://partner.example/research",
        promotionMethod: "website",
        createdAt,
        updatedAt,
      }],
    });
    expect(JSON.stringify(result)).not.toMatch(
      /user|buyer|clerk|email|terms|hash|referred|order|payment|cookie|device|audit|correlation|idempotency/iu,
    );
    expect(Object.isFrozen(result.items)).toBe(true);
  });

  it("fails closed on unsafe channels, incoherent state versions, and timestamps", async () => {
    await database.exec(`UPDATE affiliate_profiles
      SET public_channel = 'https://partner.example/treatment' WHERE id = '${ids.profile}'`);
    await expect(read()).rejects.toThrow(/affiliate application admin projection/i);

    await database.exec(`UPDATE affiliate_profiles
      SET public_channel = 'https://partner.example/research', status = 'active', version = 1
      WHERE id = '${ids.profile}'`);
    await expect(read()).rejects.toThrow(/affiliate application admin projection/i);

    await database.exec(`UPDATE affiliate_profiles
      SET status = 'pending', version = 1, updated_at = '2026-08-27T20:00:00.000Z'
      WHERE id = '${ids.profile}'`);
    await expect(read()).rejects.toThrow(/affiliate application admin projection/i);
  });
});
