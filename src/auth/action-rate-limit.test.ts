import { describe, expect, it, vi } from "vitest";

import {
  createAuthActionRateLimiter,
} from "@/auth/action-rate-limit";
import { readAuthCallerAddress } from "@/auth/caller-address";

const secret = "synthetic-auth-rate-limit-secret-0123456789ABCDEF";
const now = new Date("2026-08-30T20:00:05.000Z");

describe("Better Auth server-action rate limiting", () => {
  it("trusts only Vercel's single-value caller header outside local development", () => {
    const headers = new Headers({
      "x-forwarded-for": "198.51.100.200",
      "x-vercel-forwarded-for": "203.0.113.8",
    });

    expect(readAuthCallerAddress(headers, "production")).toBe("203.0.113.8");
    expect(readAuthCallerAddress(headers, "preview")).toBe("203.0.113.8");
    expect(readAuthCallerAddress(headers, "local")).toBe("198.51.100.200");
    expect(readAuthCallerAddress(new Headers(), "production")).toBeNull();
    expect(readAuthCallerAddress(new Headers(), "local")).toBe("127.0.0.1");
    expect(
      readAuthCallerAddress(
        new Headers({
          "x-vercel-forwarded-for": "203.0.113.8, 198.51.100.1",
        }),
        "production",
      ),
    ).toBeNull();
  });

  it("uses independent HMAC-scoped operation budgets without storing caller data", async () => {
    const counts = new Map<string, number>();
    const windows: Array<Readonly<{ scopeHash: string }>> = [];
    const limiter = createAuthActionRateLimiter({
      secret,
      store: {
        async increment(window) {
          windows.push(window);
          const count = (counts.get(window.scopeHash) ?? 0) + 1;
          counts.set(window.scopeHash, count);
          return count;
        },
      },
      limits: { signIn: 1, requestPasswordReset: 2 },
    });

    await expect(
      limiter({ callerAddress: "203.0.113.8", operation: "signIn", now }),
    ).resolves.toBe(true);
    await expect(
      limiter({ callerAddress: "203.0.113.8", operation: "signIn", now }),
    ).resolves.toBe(false);
    await expect(
      limiter({
        callerAddress: "203.0.113.8",
        operation: "requestPasswordReset",
        now,
      }),
    ).resolves.toBe(true);

    expect(windows.map((window) => window.scopeHash)).toEqual([
      expect.stringMatching(/^[a-f0-9]{64}$/),
      expect.stringMatching(/^[a-f0-9]{64}$/),
      expect.stringMatching(/^[a-f0-9]{64}$/),
    ]);
    expect(windows[0]?.scopeHash).not.toBe(windows[2]?.scopeHash);
    expect(JSON.stringify(windows)).not.toContain("203.0.113.8");
  });

  it("fails closed when the shared counter is unavailable", async () => {
    const limiter = createAuthActionRateLimiter({
      secret,
      store: {
        increment: vi.fn().mockRejectedValue(new Error("database unavailable")),
      },
    });

    await expect(
      limiter({ callerAddress: "203.0.113.8", operation: "signUp", now }),
    ).resolves.toBe(false);
  });
});
