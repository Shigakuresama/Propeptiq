import type { PGlite } from "@electric-sql/pglite";
import { afterEach, describe, expect, it } from "vitest";

import { completeBuyerAccount } from "@/account/account-service";
import { createPostgresAccountRepository } from "@/db/repositories/account-repository";
import { createPostgresRateLimitStore } from "@/db/repositories/rate-limit-store";
import { consumeFixedWindowLimit } from "@/security/rate-limit";

import { createMigratedPglite } from "./helpers/pglite";

const firstNow = new Date("2026-08-25T12:00:00.000Z");
const secondNow = new Date("2026-08-25T13:00:00.000Z");

describe("Task 5 account repository transactions", () => {
  let client: PGlite | undefined;

  afterEach(async () => {
    await client?.close();
    client = undefined;
  });

  async function setup() {
    client = await createMigratedPglite();
    await client.exec(`
      INSERT INTO attestation_versions
        (id, version, content_hash, policy_text, effective_at)
      VALUES
        ('20000000-0000-4000-8000-000000000001', 1, '${"a".repeat(64)}',
         'Research-use attestation', '2026-01-01T00:00:00.000Z')
    `);
    return createPostgresAccountRepository((work) => client!.transaction(work));
  }

  it("commits identity, activation, acceptance, and exactly one redacted audit atomically", async () => {
    const repository = await setup();
    const identity = {
      clerkUserId: "clerk-repository-customer",
      primaryEmail: "customer@example.test",
      emailVerifiedAt: firstNow.toISOString(),
      mfaConfigured: false,
      secondFactorCompleted: false,
    } as const;
    await completeBuyerAccount(repository, {
      identity,
      input: {
        ageConfirmed21Plus: true,
        researchPurpose: "analytical",
        organizationName: "Repository laboratory",
        acceptCurrentAttestation: true,
      },
      now: firstNow,
      correlationId: "repo-account-1",
    });
    await completeBuyerAccount(repository, {
      identity: { ...identity, emailVerifiedAt: secondNow.toISOString() },
      input: {
        ageConfirmed21Plus: true,
        researchPurpose: "analytical",
        organizationName: "Repository laboratory",
        acceptCurrentAttestation: true,
      },
      now: secondNow,
      correlationId: "repo-account-2",
    });

    const persisted = await client!.query<{
      email_verified_at: string;
      status: string;
      acceptances: number;
      audits: number;
      metadata: Record<string, unknown>;
      actions: string[];
    }>(`
      SELECT u.email_verified_at::text, bp.status,
             (SELECT count(*)::int FROM attestation_acceptances aa WHERE aa.user_id = u.id) AS acceptances,
             (SELECT count(*)::int FROM admin_audit a WHERE a.actor_user_id = u.id) AS audits,
             (SELECT metadata FROM admin_audit a WHERE a.actor_user_id = u.id ORDER BY occurred_at LIMIT 1) AS metadata
             ,(SELECT array_agg(action ORDER BY occurred_at) FROM admin_audit a WHERE a.actor_user_id = u.id) AS actions
      FROM users u
      JOIN buyer_profiles bp ON bp.user_id = u.id
      WHERE u.clerk_id = 'clerk-repository-customer'
    `);
    expect(persisted.rows[0]).toMatchObject({
      status: "active",
      acceptances: 1,
      audits: 2,
      metadata: { attestationVersion: 1, status: "active" },
      actions: ["account.onboarding.completed", "account.profile.updated"],
    });
    expect(new Date(persisted.rows[0]!.email_verified_at).toISOString()).toBe(
      firstNow.toISOString(),
    );
    expect(JSON.stringify(persisted.rows[0]!.metadata)).not.toContain("customer@example.test");
  });

  it("rolls back a profile mutation when audit insertion fails and rejects stale writes", async () => {
    const repository = await setup();
    const userId = await repository.transaction(async (tx) => {
      const identity = await tx.upsertIdentity(
        {
          clerkUserId: "clerk-rollback-customer",
          primaryEmail: "rollback@example.test",
          emailVerifiedAt: firstNow.toISOString(),
          mfaConfigured: false,
          secondFactorCompleted: false,
        },
        firstNow,
      );
      return identity.userId;
    });

    await expect(
      repository.transaction(async (tx) => {
        await tx.saveBuyerProfile(
          {
            userId,
            status: "active",
            ageConfirmedAt: firstNow.toISOString(),
            researchPurpose: "in_vitro",
            organizationName: null,
            updatedAt: firstNow.toISOString(),
          },
          null,
        );
        await tx.appendAudit({
          actorUserId: userId,
          action: "account.test",
          resourceId: userId,
          correlationId: "   ",
          metadata: {},
        });
      }),
    ).rejects.toThrow();
    expect(
      (await client!.query(`SELECT 1 FROM buyer_profiles WHERE user_id = '${userId}'`)).rows,
    ).toEqual([]);

    await repository.transaction((tx) =>
      tx.saveBuyerProfile(
        {
          userId,
          status: "active",
          ageConfirmedAt: firstNow.toISOString(),
          researchPurpose: "in_vitro",
          organizationName: null,
          updatedAt: firstNow.toISOString(),
        },
        null,
      ),
    );
    await expect(
      repository.transaction((tx) =>
        tx.saveBuyerProfile(
          {
            userId,
            status: "active",
            ageConfirmedAt: firstNow.toISOString(),
            researchPurpose: "analytical",
            organizationName: null,
            updatedAt: secondNow.toISOString(),
          },
          "2026-08-20T00:00:00.000Z",
        ),
      ),
    ).rejects.toThrow(/stale/i);
    const profile = await client!.query<{ research_purpose: string }>(
      `SELECT research_purpose FROM buyer_profiles WHERE user_id = '${userId}'`,
    );
    expect(profile.rows).toEqual([{ research_purpose: "in_vitro" }]);
  });

  it("increments a valid database-backed rate window atomically and keeps windows isolated", async () => {
    await setup();
    const store = createPostgresRateLimitStore(client!);
    const input = {
      store,
      scope: "b".repeat(64),
      limit: 2,
      windowMs: 60_000,
      now: firstNow,
    };
    await expect(consumeFixedWindowLimit(input)).resolves.toMatchObject({ allowed: true });
    await expect(consumeFixedWindowLimit(input)).resolves.toMatchObject({ allowed: true });
    await expect(consumeFixedWindowLimit(input)).resolves.toMatchObject({ allowed: false });
    await expect(
      consumeFixedWindowLimit({ ...input, now: new Date(firstNow.getTime() + 60_000) }),
    ).resolves.toMatchObject({ allowed: true });

    const rows = await client!.query<{ scope_hash: string; count: number }>(`
      SELECT scope_hash, count FROM rate_limit_windows ORDER BY window_start
    `);
    expect(rows.rows).toEqual([
      { scope_hash: "b".repeat(64), count: 3 },
      { scope_hash: "b".repeat(64), count: 1 },
    ]);
  });

  it("does not lose concurrent rate-window increments and fails closed on store errors", async () => {
    await setup();
    const store = createPostgresRateLimitStore(client!);
    const decisions = await Promise.all(
      Array.from({ length: 12 }, () =>
        consumeFixedWindowLimit({
          store,
          scope: "c".repeat(64),
          limit: 5,
          windowMs: 60_000,
          now: firstNow,
        }),
      ),
    );
    expect(decisions.filter((decision) => decision.allowed)).toHaveLength(5);
    await expect(
      consumeFixedWindowLimit({
        store: {
          async increment() {
            throw new Error("synthetic counter outage");
          },
        },
        scope: "d".repeat(64),
        limit: 1,
        windowMs: 60_000,
        now: firstNow,
      }),
    ).rejects.toThrow(/counter outage/);
  });
});
