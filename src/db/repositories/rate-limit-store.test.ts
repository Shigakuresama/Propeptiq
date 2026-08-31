import { describe, expect, it, vi } from "vitest";

import { createPostgresRateLimitStore } from "@/db/repositories/rate-limit-store";

describe("PostgreSQL rate-limit store", () => {
  it("qualifies the application-owned table outside an auth search_path", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ count: 1 }] });
    const store = createPostgresRateLimitStore({ query });

    await expect(
      store.increment({
        scopeHash: "a".repeat(64),
        windowStart: new Date("2026-08-30T20:00:00.000Z"),
        expiresAt: new Date("2026-08-30T20:01:00.000Z"),
      }),
    ).resolves.toBe(1);

    const sql = query.mock.calls[0]?.[0] as string;
    expect(sql).toContain("INSERT INTO public.rate_limit_windows");
    expect(sql).toContain("public.rate_limit_windows.count + 1");
  });
});
