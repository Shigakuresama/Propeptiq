import { describe, expect, it, vi } from "vitest";

import { createBetterAuthRateLimitStorage } from "@/auth/better-auth-rate-limit";

describe("Better Auth distributed rate-limit storage", () => {
  it("atomically consumes an HMAC-scoped fixed-window counter", async () => {
    const increment = vi.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(4);
    const storage = createBetterAuthRateLimitStorage({
      secret: "synthetic-auth-rate-limit-secret-0123456789ABCDEF",
      store: { increment },
      now: () => new Date("2026-08-30T20:00:05.000Z"),
    });

    await expect(
      storage.consume("203.0.113.7:/sign-in/email", { window: 60, max: 3 }),
    ).resolves.toEqual({ allowed: true, retryAfter: null });
    await expect(
      storage.consume("203.0.113.7:/sign-in/email", { window: 60, max: 3 }),
    ).resolves.toEqual({ allowed: false, retryAfter: 55 });

    expect(increment).toHaveBeenCalledTimes(2);
    expect(increment.mock.calls[0]?.[0]).toMatchObject({
      scopeHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      windowStart: new Date("2026-08-30T20:00:00.000Z"),
      expiresAt: new Date("2026-08-30T20:01:00.000Z"),
    });
    expect(JSON.stringify(increment.mock.calls)).not.toContain("203.0.113.7");
  });

  it("rejects invalid provider rules before touching storage", async () => {
    const increment = vi.fn();
    const storage = createBetterAuthRateLimitStorage({
      secret: "synthetic-auth-rate-limit-secret-0123456789ABCDEF",
      store: { increment },
      now: () => new Date("2026-08-30T20:00:05.000Z"),
    });

    await expect(
      storage.consume("key", { window: 0, max: 3 }),
    ).rejects.toThrow(/rate-limit rule/i);
    expect(increment).not.toHaveBeenCalled();
  });
});
