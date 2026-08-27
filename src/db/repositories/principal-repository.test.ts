import { describe, expect, it, vi } from "vitest";

import { projectPrincipalFromIdentity, type PrincipalQueryPort } from "./principal-repository";

const now = new Date("2026-08-25T12:00:00.000Z");

describe("request identity projection", () => {
  it("does not query or create a user for an unverified identity", async () => {
    const query = vi.fn();
    await expect(
      projectPrincipalFromIdentity(
        { query },
        {
          clerkUserId: "clerk-unverified",
          primaryEmail: "unverified@example.test",
          emailVerifiedAt: null,
          mfaConfigured: false,
          secondFactorCompleted: false,
        },
        now,
      ),
    ).resolves.toBeNull();
    expect(query).not.toHaveBeenCalled();
  });

  it("uses insert-if-missing without updating an existing user during a read", async () => {
    const statements: string[] = [];
    const query = vi.fn(async (sql: string) => {
      statements.push(sql);
      if (/SELECT u\.id/i.test(sql)) {
        return { rows: [{ actorId: "10000000-0000-4000-8000-000000000001", buyerStatus: "blocked" }] };
      }
      if (/SELECT capability/i.test(sql)) return { rows: [] };
      return { rows: [] };
    });
    const client: PrincipalQueryPort = {
      async query<T extends object>(sql: string) {
        const result = await query(sql);
        return { rows: result.rows as T[] };
      },
    };
    await expect(
      projectPrincipalFromIdentity(
        client,
        {
          clerkUserId: "clerk-blocked",
          primaryEmail: "blocked@example.test",
          emailVerifiedAt: now.toISOString(),
          mfaConfigured: false,
          secondFactorCompleted: false,
        },
        now,
      ),
    ).resolves.toMatchObject({ buyerStatus: "blocked" });
    expect(statements[0]).toMatch(/ON CONFLICT \(clerk_id\) DO NOTHING/i);
    expect(statements[0]).not.toMatch(/DO UPDATE|updated_at\s*=/i);
  });
});
