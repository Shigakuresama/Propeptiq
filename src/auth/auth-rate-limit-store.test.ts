import { describe, expect, it, vi } from "vitest";

import { createAuthPostgresRateLimitStore } from "@/auth/auth-rate-limit-store";

describe("createAuthPostgresRateLimitStore", () => {
  it("increments the dedicated Auth support table atomically", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ count: 2 }] });
    const store = createAuthPostgresRateLimitStore({ query });
    const count = await store.increment({
      scopeHash: "a".repeat(64),
      windowStart: new Date("2026-08-31T00:00:00.000Z"),
      expiresAt: new Date("2026-08-31T00:01:00.000Z"),
    });

    expect(count).toBe(2);
    expect(query).toHaveBeenCalledTimes(1);
    const [sql, params] = query.mock.calls[0] ?? [];
    expect(sql).toContain("INSERT INTO propeptiq_auth.rate_limit_windows");
    expect(sql).toContain("DELETE FROM propeptiq_auth.rate_limit_windows");
    expect(sql).toContain("LIMIT 64");
    expect(sql).toContain(
      "propeptiq_auth.rate_limit_windows.count + 1",
    );
    expect(params).toEqual([
      "a".repeat(64),
      "2026-08-31T00:00:00.000Z",
      "2026-08-31T00:01:00.000Z",
    ]);
  });

  it("rejects a missing or invalid returned count", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const store = createAuthPostgresRateLimitStore({ query });

    await expect(
      store.increment({
        scopeHash: "b".repeat(64),
        windowStart: new Date("2026-08-31T00:00:00.000Z"),
        expiresAt: new Date("2026-08-31T00:01:00.000Z"),
      }),
    ).rejects.toThrow("Auth rate-limit counter update failed");
  });
});
