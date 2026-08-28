import { createHash } from "node:crypto";

import type { PGlite } from "@electric-sql/pglite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { GrowthSqlClient } from "@/db/repositories/growth-repository";
import {
  AffiliateAdminError,
  AffiliateApplicationError,
  createPostgresAffiliateAdminMutationTransaction,
  createPostgresAffiliateApplicationTransaction,
} from "@/growth/affiliate-service";

import { createMigratedPglite } from "./helpers/pglite";

const ids = {
  buyer: "6b000000-0000-4000-8000-000000000001",
  otherBuyer: "6b000000-0000-4000-8000-000000000002",
  terms: "6b000000-0000-4000-8000-000000000003",
  overlappingTerms: "6b000000-0000-4000-8000-000000000004",
  acceptance: "6b000000-0000-4000-8000-000000000005",
  replayAcceptance: "6b000000-0000-4000-8000-000000000006",
  profile: "6b000000-0000-4000-8000-000000000007",
  replayProfile: "6b000000-0000-4000-8000-000000000008",
  collisionAcceptance: "6b000000-0000-4000-8000-000000000009",
  collisionProfile: "6b000000-0000-4000-8000-000000000010",
} as const;

const now = new Date("2026-08-28T19:00:00.000Z");
const termsText = "Synthetic affiliate application terms for Task 6A.";
const termsHash = createHash("sha256").update(termsText).digest("hex");

describe("affiliate application transaction on PGlite", () => {
  let client: PGlite;

  beforeEach(async () => {
    client = await createMigratedPglite();
    await client.query(
      `INSERT INTO users (id, clerk_id, email_verified_at) VALUES
         ($1::uuid, 'clerk-task6a-buyer', '2026-08-28T18:00:00.000Z'),
         ($2::uuid, 'clerk-task6a-other', '2026-08-28T18:00:00.000Z')`,
      [ids.buyer, ids.otherBuyer],
    );
    await client.query(
      `INSERT INTO buyer_profiles
         (user_id, status, age_confirmed_at, research_purpose, updated_at) VALUES
         ($1::uuid, 'active', '2026-08-01T00:00:00.000Z', 'analytical',
          '2026-08-28T18:00:00.000Z'),
         ($2::uuid, 'active', '2026-08-01T00:00:00.000Z', 'analytical',
          '2026-08-28T18:00:00.000Z')`,
      [ids.buyer, ids.otherBuyer],
    );
    await client.query(
      `INSERT INTO growth_terms_versions
         (id, program, version, content_hash, terms_text, effective_at)
       VALUES ($1::uuid, 'affiliate', 1, $2, $3,
               '2026-08-28T00:00:00.000Z')`,
      [ids.terms, termsHash, termsText],
    );
  });

  afterEach(async () => client.close());

  function applicationTransaction() {
    return createPostgresAffiliateApplicationTransaction({
      runSerializableTransaction: <Value>(
        work: (sqlClient: GrowthSqlClient) => Promise<Value>,
      ) => client.transaction((transaction) =>
        work({
          query: async <Row extends object>(
            sql: string,
            params: readonly unknown[] = [],
          ) => {
            const result = await transaction.query<Row>(sql, [...params]);
            return { rows: result.rows };
          },
        }),
      ),
    });
  }

  function input(overrides: Record<string, unknown> = {}) {
    return {
      acceptanceId: ids.acceptance,
      profileId: ids.profile,
      buyerUserId: ids.buyer,
      publicCode: "aff_6APgliteStableCode",
      publicChannel: "https://partner.example/research",
      promotionMethod: "website" as const,
      termsVersionId: ids.terms,
      termsContentHash: termsHash,
      acceptedAt: now,
      ...overrides,
    };
  }

  async function storedState() {
    const result = await client.query<{
      acceptances: number;
      profiles: number;
      status: string | null;
      version: number | null;
      channel: string | null;
    }>(
      `SELECT
         (SELECT count(*)::int FROM growth_terms_acceptances) AS acceptances,
         (SELECT count(*)::int FROM affiliate_profiles) AS profiles,
         (SELECT status::text FROM affiliate_profiles LIMIT 1) AS status,
         (SELECT version FROM affiliate_profiles LIMIT 1) AS version,
         (SELECT public_channel FROM affiliate_profiles LIMIT 1) AS channel`,
    );
    return result.rows[0]!;
  }

  it("commits exact affiliate terms and one versioned pending profile, then replays immutably", async () => {
    const apply = applicationTransaction();

    await expect(apply(input())).resolves.toMatchObject({
      status: "applied",
      profile: {
        id: ids.profile,
        buyerUserId: ids.buyer,
        publicCode: "aff_6APgliteStableCode",
        status: "pending",
        version: 1,
        publicChannel: "https://partner.example/research",
        promotionMethod: "website",
        termsAcceptanceId: ids.acceptance,
        createdAt: now.toISOString(),
      },
    });
    await expect(apply(input({
      acceptanceId: ids.replayAcceptance,
      profileId: ids.replayProfile,
      publicCode: "aff_6AUnusedReplayCandidate",
    }))).resolves.toMatchObject({
      status: "idempotent",
      profile: {
        id: ids.profile,
        publicCode: "aff_6APgliteStableCode",
        version: 1,
      },
    });
    await expect(storedState()).resolves.toEqual({
      acceptances: 1,
      profiles: 1,
      status: "pending",
      version: 1,
      channel: "https://partner.example/research",
    });

    await expect(apply(input({ publicChannel: "@changed_partner" })))
      .rejects.toMatchObject({ code: "idempotency_conflict" });
    await expect(storedState()).resolves.toMatchObject({
      acceptances: 1,
      profiles: 1,
      channel: "https://partner.example/research",
    });
  });

  it.each([
    ["stale version", { termsVersionId: ids.overlappingTerms }, "terms_mismatch"],
    ["hash mismatch", { termsContentHash: "0".repeat(64) }, "terms_mismatch"],
  ] as const)("rolls back acceptance and profile on %s", async (_label, patch, code) => {
    await expect(applicationTransaction()(input(patch))).rejects.toMatchObject({ code });
    await expect(storedState()).resolves.toMatchObject({ acceptances: 0, profiles: 0 });
  });

  it("rolls back when current affiliate terms overlap", async () => {
    const overlappingText = "Synthetic overlapping affiliate terms.";
    const overlappingHash = createHash("sha256").update(overlappingText).digest("hex");
    await client.query(`DROP INDEX growth_terms_versions_current_program_unique`);
    await client.query(
      `INSERT INTO growth_terms_versions
         (id, program, version, content_hash, terms_text, effective_at)
       VALUES ($1::uuid, 'affiliate', 2, $2, $3,
               '2026-08-28T12:00:00.000Z')`,
      [ids.overlappingTerms, overlappingHash, overlappingText],
    );

    await expect(applicationTransaction()(input())).rejects.toMatchObject({
      code: "terms_unavailable",
    });
    await expect(storedState()).resolves.toMatchObject({ acceptances: 0, profiles: 0 });
  });

  it.each([
    ["review buyer", "UPDATE buyer_profiles SET status = 'review' WHERE user_id = $1::uuid", "buyer_inactive"],
    ["blocked buyer", "UPDATE buyer_profiles SET status = 'blocked' WHERE user_id = $1::uuid", "buyer_inactive"],
    ["missing verified email", "UPDATE users SET email_verified_at = NULL WHERE id = $1::uuid", "identity_unverified"],
    ["future verified email", "UPDATE users SET email_verified_at = '2026-08-28T19:00:01.000Z' WHERE id = $1::uuid", "identity_unverified"],
  ] as const)("rolls back for database-authoritative %s", async (_label, sql, code) => {
    await client.query(sql, [ids.buyer]);

    await expect(applicationTransaction()(input())).rejects.toMatchObject({ code });
    await expect(storedState()).resolves.toMatchObject({ acceptances: 0, profiles: 0 });
  });

  it("rolls back a just-inserted acceptance when the public code conflicts", async () => {
    await client.query(
      `INSERT INTO growth_terms_acceptances
         (id, user_id, program, terms_version_id, content_hash, accepted_at)
       VALUES ($1::uuid, $2::uuid, 'affiliate', $3::uuid, $4,
               '2026-08-28T18:30:00.000Z')`,
      [ids.collisionAcceptance, ids.otherBuyer, ids.terms, termsHash],
    );
    await client.query(
      `INSERT INTO affiliate_profiles
         (id, user_id, public_code, status, public_channel, promotion_method,
          terms_acceptance_id, terms_program, created_at, updated_at)
       VALUES ($1::uuid, $2::uuid, 'aff_6APgliteStableCode', 'pending',
               '@existing_partner', 'social', $3::uuid, 'affiliate',
               '2026-08-28T18:30:00.000Z', '2026-08-28T18:30:00.000Z')`,
      [ids.collisionProfile, ids.otherBuyer, ids.collisionAcceptance],
    );

    await expect(applicationTransaction()(input())).rejects.toBeInstanceOf(
      AffiliateApplicationError,
    );
    await expect(storedState()).resolves.toMatchObject({ acceptances: 1, profiles: 1 });
  });

  it("replays the immutable stored acceptance after current terms advance but rejects it for a new application", async () => {
    const apply = applicationTransaction();
    const acceptedAt = new Date("2026-08-28T18:30:00.000Z");
    await apply(input({ acceptedAt }));

    const nextTermsText = "Synthetic affiliate application terms version two.";
    const nextTermsHash = createHash("sha256").update(nextTermsText).digest("hex");
    await client.query(
      `UPDATE growth_terms_versions
       SET superseded_at = '2026-08-28T18:45:00.000Z'
       WHERE id = $1::uuid`,
      [ids.terms],
    );
    await client.query(
      `INSERT INTO growth_terms_versions
         (id, program, version, content_hash, terms_text, effective_at)
       VALUES ($1::uuid, 'affiliate', 2, $2, $3,
               '2026-08-28T18:45:00.000Z')`,
      [ids.overlappingTerms, nextTermsHash, nextTermsText],
    );

    await expect(apply(input({
      acceptanceId: ids.replayAcceptance,
      profileId: ids.replayProfile,
      publicCode: "aff_6AUnusedReplayCandidate",
    }))).resolves.toMatchObject({
      status: "idempotent",
      profile: {
        id: ids.profile,
        status: "pending",
        version: 1,
        termsAcceptanceId: ids.acceptance,
      },
    });
    await expect(apply(input({
      acceptanceId: ids.replayAcceptance,
      profileId: ids.replayProfile,
      buyerUserId: ids.otherBuyer,
      publicCode: "aff_6ANewStaleTermsCode",
    }))).rejects.toMatchObject({ code: "terms_mismatch" });
    await expect(storedState()).resolves.toMatchObject({
      acceptances: 1,
      profiles: 1,
      status: "pending",
      version: 1,
    });
  });
});

describe("affiliate admin decision transaction on PGlite", () => {
  let client: PGlite;
  const adminUserId = "6c000000-0000-4000-8000-000000000001";
  const ownerUserId = "6c000000-0000-4000-8000-000000000002";
  const adminTermsId = "6c000000-0000-4000-8000-000000000003";
  const adminAcceptanceId = "6c000000-0000-4000-8000-000000000004";
  const adminProfileId = "6c000000-0000-4000-8000-000000000005";

  beforeEach(async () => {
    client = await createMigratedPglite();
    await client.query(
      `INSERT INTO users (id, clerk_id, email_verified_at) VALUES
         ($1::uuid, 'clerk-task6a-admin', '2026-08-28T17:00:00.000Z'),
         ($2::uuid, 'clerk-task6a-owner', '2026-08-28T17:00:00.000Z'),
         ($3::uuid, 'clerk-task6a-other-owner', '2026-08-28T17:00:00.000Z')`,
      [adminUserId, ownerUserId, ids.otherBuyer],
    );
    await client.query(
      `INSERT INTO buyer_profiles
         (user_id, status, age_confirmed_at, research_purpose, updated_at)
       VALUES ($1::uuid, 'active', '2026-08-01T00:00:00.000Z', 'analytical',
               '2026-08-28T17:00:00.000Z'),
              ($2::uuid, 'active', '2026-08-01T00:00:00.000Z', 'analytical',
               '2026-08-28T17:00:00.000Z')`,
      [ownerUserId, ids.otherBuyer],
    );
    await client.query(
      `INSERT INTO growth_terms_versions
         (id, program, version, content_hash, terms_text, effective_at)
       VALUES ($1::uuid, 'affiliate', 1, $2, $3,
               '2026-08-28T00:00:00.000Z')`,
      [adminTermsId, termsHash, termsText],
    );
    await client.query(
      `INSERT INTO growth_terms_acceptances
         (id, user_id, program, terms_version_id, content_hash, accepted_at)
       VALUES ($1::uuid, $2::uuid, 'affiliate', $3::uuid, $4,
               '2026-08-28T18:00:00.000Z')`,
      [adminAcceptanceId, ownerUserId, adminTermsId, termsHash],
    );
    await client.query(
      `INSERT INTO affiliate_profiles
         (id, user_id, public_code, status, version, public_channel,
          promotion_method, terms_acceptance_id, terms_program, created_at,
          updated_at)
       VALUES ($1::uuid, $2::uuid, 'aff_6AAdminReviewCode', 'pending', 1,
               'https://partner.example/research', 'website', $3::uuid,
               'affiliate', '2026-08-28T18:00:00.000Z',
               '2026-08-28T18:00:00.000Z')`,
      [adminProfileId, ownerUserId, adminAcceptanceId],
    );
  });

  afterEach(async () => client.close());

  function adminMutation() {
    return createPostgresAffiliateAdminMutationTransaction({
      runSerializableTransaction: <Value>(
        work: (sqlClient: GrowthSqlClient) => Promise<Value>,
      ) => client.transaction((transaction) =>
        work({
          query: async <Row extends object>(
            sql: string,
            params: readonly unknown[] = [],
          ) => {
            const result = await transaction.query<Row>(sql, [...params]);
            return { rows: result.rows };
          },
        }),
      ),
    });
  }

  function applicationTransaction() {
    return createPostgresAffiliateApplicationTransaction({
      runSerializableTransaction: <Value>(
        work: (sqlClient: GrowthSqlClient) => Promise<Value>,
      ) => client.transaction((transaction) =>
        work({
          query: async <Row extends object>(
            sql: string,
            params: readonly unknown[] = [],
          ) => {
            const result = await transaction.query<Row>(sql, [...params]);
            return { rows: result.rows };
          },
        }),
      ),
    });
  }

  function applicationReplayInput(overrides: Record<string, unknown> = {}) {
    return {
      acceptanceId: ids.replayAcceptance,
      profileId: ids.replayProfile,
      buyerUserId: ownerUserId,
      publicCode: "aff_6AUnusedReplayCandidate",
      publicChannel: "https://partner.example/research",
      promotionMethod: "website" as const,
      termsVersionId: adminTermsId,
      termsContentHash: termsHash,
      acceptedAt: now,
      ...overrides,
    };
  }

  function adminInput(
    targetStatus: "active" | "rejected" | "suspended",
    overrides: Record<string, unknown> = {},
  ) {
    return {
      actorUserId: adminUserId,
      profileId: adminProfileId,
      expectedVersion: 1,
      targetStatus,
      correlationId: `task-6a-admin-${targetStatus}`,
      mutatedAt: now,
      ...overrides,
    };
  }

  async function adminState() {
    const result = await client.query<{
      status: string;
      version: number;
      updatedAt: Date | string;
      auditCount: number;
      action: string | null;
      metadata: Record<string, unknown> | null;
    }>(
      `SELECT p.status::text AS status, p.version,
              p.updated_at AS "updatedAt",
              (SELECT count(*)::int FROM admin_audit) AS "auditCount",
              (SELECT action FROM admin_audit LIMIT 1) AS action,
              (SELECT metadata FROM admin_audit LIMIT 1) AS metadata
       FROM affiliate_profiles p
       WHERE p.id = $1::uuid`,
      [adminProfileId],
    );
    const row = result.rows[0]!;
    return {
      ...row,
      updatedAt: new Date(row.updatedAt).toISOString(),
    };
  }

  async function immutableReplayState() {
    const result = await client.query<{
      acceptanceCount: number;
      profileCount: number;
      auditCount: number;
      profileId: string;
      publicCode: string;
      status: string;
      version: number;
      publicChannel: string;
      promotionMethod: string;
      acceptanceId: string;
      termsVersionId: string;
      contentHash: string;
      acceptedAt: Date | string;
    }>(
      `SELECT
         (SELECT count(*)::int FROM growth_terms_acceptances) AS "acceptanceCount",
         (SELECT count(*)::int FROM affiliate_profiles) AS "profileCount",
         (SELECT count(*)::int FROM admin_audit) AS "auditCount",
         p.id::text AS "profileId", p.public_code AS "publicCode",
         p.status::text AS status, p.version,
         p.public_channel AS "publicChannel",
         p.promotion_method::text AS "promotionMethod",
         a.id::text AS "acceptanceId",
         a.terms_version_id::text AS "termsVersionId",
         a.content_hash AS "contentHash", a.accepted_at AS "acceptedAt"
       FROM affiliate_profiles p
       JOIN growth_terms_acceptances a ON a.id = p.terms_acceptance_id
       WHERE p.id = $1::uuid`,
      [adminProfileId],
    );
    const row = result.rows[0]!;
    return {
      ...row,
      acceptedAt: new Date(row.acceptedAt).toISOString(),
    };
  }

  it.each(["active", "rejected"] as const)(
    "replays the exact application after pending to %s without changing profile, acceptance, or audit rows",
    async (targetStatus) => {
      await adminMutation()(adminInput(targetStatus));
      const before = await immutableReplayState();

      await expect(applicationTransaction()(applicationReplayInput())).resolves.toMatchObject({
        status: "idempotent",
        profile: {
          id: adminProfileId,
          publicCode: "aff_6AAdminReviewCode",
          status: targetStatus,
          version: 2,
          termsAcceptanceId: adminAcceptanceId,
        },
      });

      await expect(immutableReplayState()).resolves.toEqual(before);
    },
  );

  it("replays the exact application after active to suspended without rerunning either admin mutation", async () => {
    const mutate = adminMutation();
    await mutate(adminInput("active"));
    await mutate(adminInput("suspended", {
      expectedVersion: 2,
      correlationId: "task-6a-admin-suspended-replay",
    }));
    const before = await immutableReplayState();

    await expect(applicationTransaction()(applicationReplayInput())).resolves.toMatchObject({
      status: "idempotent",
      profile: {
        id: adminProfileId,
        publicCode: "aff_6AAdminReviewCode",
        status: "suspended",
        version: 3,
        termsAcceptanceId: adminAcceptanceId,
      },
    });

    await expect(immutableReplayState()).resolves.toEqual(before);
  });

  it("rejects reviewed replay field mismatches without changing profile, acceptance, or audit rows", async () => {
    await adminMutation()(adminInput("active"));
    const before = await immutableReplayState();
    const apply = applicationTransaction();
    const mismatches = [
      { publicChannel: "@changed_partner" },
      { promotionMethod: "social" },
      { termsVersionId: ids.overlappingTerms },
      { termsContentHash: "0".repeat(64) },
      { buyerUserId: ids.otherBuyer, profileId: adminProfileId },
    ];

    for (const mismatch of mismatches) {
      await expect(apply(applicationReplayInput(mismatch))).rejects.toMatchObject({
        code: "idempotency_conflict",
      });
      await expect(immutableReplayState()).resolves.toEqual(before);
    }
  });

  it("rejects reviewed replay candidate ID or code collisions without changing any rows", async () => {
    await adminMutation()(adminInput("active"));
    await client.query(
      `INSERT INTO growth_terms_acceptances
         (id, user_id, program, terms_version_id, content_hash, accepted_at)
       VALUES ($1::uuid, $2::uuid, 'affiliate', $3::uuid, $4,
               '2026-08-28T18:15:00.000Z')`,
      [ids.collisionAcceptance, ids.otherBuyer, adminTermsId, termsHash],
    );
    await client.query(
      `INSERT INTO affiliate_profiles
         (id, user_id, public_code, status, version, public_channel,
          promotion_method, terms_acceptance_id, terms_program, created_at,
          updated_at)
       VALUES ($1::uuid, $2::uuid, 'aff_6ACollisionReviewCode', 'pending', 1,
               '@collision_partner', 'social', $3::uuid, 'affiliate',
               '2026-08-28T18:15:00.000Z', '2026-08-28T18:15:00.000Z')`,
      [ids.collisionProfile, ids.otherBuyer, ids.collisionAcceptance],
    );
    const before = await immutableReplayState();
    const apply = applicationTransaction();
    const collisions = [
      { profileId: ids.collisionProfile },
      { publicCode: "aff_6ACollisionReviewCode" },
      { acceptanceId: ids.collisionAcceptance },
    ];

    for (const collision of collisions) {
      await expect(apply(applicationReplayInput(collision))).rejects.toMatchObject({
        code: "idempotency_conflict",
      });
      await expect(immutableReplayState()).resolves.toEqual(before);
    }
  });

  it("rejects incoherent stored status and version pairs without changing any rows", async () => {
    const apply = applicationTransaction();
    const incoherentStates = [
      ["pending", 2],
      ["active", 1],
      ["rejected", 3],
      ["suspended", 2],
    ] as const;

    for (const [status, version] of incoherentStates) {
      await client.query(
        `UPDATE affiliate_profiles
         SET status = $2::affiliate_profile_status, version = $3
         WHERE id = $1::uuid`,
        [adminProfileId, status, version],
      );
      const before = await immutableReplayState();
      await expect(apply(applicationReplayInput())).rejects.toMatchObject({
        code: "idempotency_conflict",
      });
      await expect(immutableReplayState()).resolves.toEqual(before);
    }
  });

  it.each(["active", "rejected"] as const)(
    "atomically decides pending to %s with exact CAS and one redacted audit",
    async (targetStatus) => {
      await expect(adminMutation()(adminInput(targetStatus))).resolves.toEqual({
        profile: {
          id: adminProfileId,
          status: targetStatus,
          version: 2,
          updatedAt: now.toISOString(),
        },
      });
      const state = await adminState();
      expect(state).toMatchObject({
        status: targetStatus,
        version: 2,
        updatedAt: now.toISOString(),
        auditCount: 1,
        action: `affiliate.application.${targetStatus}`,
        metadata: {
          fromStatus: "pending",
          toStatus: targetStatus,
          fromVersion: 1,
          toVersion: 2,
        },
      });
      const serialized = JSON.stringify(state.metadata);
      expect(serialized).not.toContain("partner.example");
      expect(serialized).not.toContain("clerk-task6a");
      expect(serialized).not.toContain("@example");
    },
  );

  it("atomically suspends active version 2 to suspended version 3 with one audit", async () => {
    await client.query(
      `UPDATE affiliate_profiles
       SET status = 'active', version = 2,
           updated_at = '2026-08-28T18:30:00.000Z'
       WHERE id = $1::uuid`,
      [adminProfileId],
    );

    await expect(adminMutation()(adminInput("suspended", {
      expectedVersion: 2,
      correlationId: "task-6a-admin-suspended",
    }))).resolves.toEqual({
      profile: {
        id: adminProfileId,
        status: "suspended",
        version: 3,
        updatedAt: now.toISOString(),
      },
    });
    await expect(adminState()).resolves.toMatchObject({
      status: "suspended",
      version: 3,
      auditCount: 1,
      action: "affiliate.suspended",
    });
  });

  it.each([
    ["stale version", { expectedVersion: 2 }, "version_conflict"],
    ["invalid pending suspension", { targetStatus: "suspended" }, "invalid_transition"],
  ] as const)("rejects %s with no partial writes", async (_label, patch, code) => {
    await expect(adminMutation()(adminInput("active", patch)))
      .rejects.toMatchObject({ code });
    await expect(adminState()).resolves.toMatchObject({
      status: "pending",
      version: 1,
      auditCount: 0,
    });
  });

  it("rejects a replay deterministically without a second audit", async () => {
    const mutate = adminMutation();
    const input = adminInput("active");
    await mutate(input);

    await expect(mutate(input)).rejects.toMatchObject({ code: "version_conflict" });
    await expect(adminState()).resolves.toMatchObject({
      status: "active",
      version: 2,
      auditCount: 1,
    });
  });

  it("rolls back status and version when the audit insert fails", async () => {
    await client.exec(
      `ALTER TABLE admin_audit
       ADD CONSTRAINT task_6a_forced_audit_failure
       CHECK (correlation_id <> 'task-6a-audit-failure')`,
    );

    await expect(adminMutation()(adminInput("active", {
      correlationId: "task-6a-audit-failure",
    }))).rejects.toBeInstanceOf(AffiliateAdminError);
    await expect(adminState()).resolves.toMatchObject({
      status: "pending",
      version: 1,
      auditCount: 0,
    });
  });
});
