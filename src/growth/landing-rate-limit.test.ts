import { describe, expect, it, vi } from "vitest";

import type { RateLimitStore } from "@/security/rate-limit";

import {
  createRateLimitedAttributionLandingLookup,
  readAttributionCallerAddress,
} from "./landing-rate-limit";

const now = new Date("2026-08-28T12:00:00.000Z");
const code = "ref_AbCdEf0123456789";
const secret = "task-9-attribution-lookup-secret-at-least-32-characters";

describe("privacy-minimal attribution landing rate limit", () => {
  it("limits one caller without letting it consume another caller's code budget", async () => {
    const counts = new Map<string, number>();
    const windows: Parameters<RateLimitStore["increment"]>[0][] = [];
    const rateLimitStore: RateLimitStore = {
      async increment(window) {
        windows.push(window);
        const count = (counts.get(window.scopeHash) ?? 0) + 1;
        counts.set(window.scopeHash, count);
        return count;
      },
    };
    const lookup = vi.fn(async () => Object.freeze({ code }));
    const guarded = createRateLimitedAttributionLandingLookup({
      program: "customer_referral",
      lookup,
      rateLimitStore,
      secret,
      limit: 2,
    });

    await expect(guarded({ code, now, callerAddress: "203.0.113.8" })).resolves.toEqual({ code });
    await expect(guarded({ code, now, callerAddress: "203.0.113.8" })).resolves.toEqual({ code });
    await expect(guarded({ code, now, callerAddress: "203.0.113.8" })).resolves.toBeNull();
    await expect(guarded({ code, now, callerAddress: "198.51.100.19" })).resolves.toEqual({ code });

    expect(lookup).toHaveBeenCalledTimes(3);
    expect(windows).toHaveLength(4);
    expect(windows[0]?.scopeHash).toMatch(/^[0-9a-f]{64}$/u);
    expect(windows[0]?.scopeHash).not.toBe(windows[3]?.scopeHash);
    expect(JSON.stringify(windows)).not.toMatch(/ref_AbCdEf|203\.0\.113\.8|198\.51\.100\.19/u);
  });

  it("fails closed without looking up code status when the limiter is unavailable", async () => {
    const lookup = vi.fn();
    const guarded = createRateLimitedAttributionLandingLookup({
      program: "affiliate",
      lookup,
      rateLimitStore: {
        increment: async () => {
          throw new Error("limiter unavailable");
        },
      },
      secret,
    });

    await expect(
      guarded({
        code: "aff_AbCdEf0123456789",
        now,
        callerAddress: "203.0.113.8",
      }),
    ).resolves.toBeNull();
    expect(lookup).not.toHaveBeenCalled();
  });

  it("uses only the Vercel-owned caller header outside local development", () => {
    const request = new Request("https://research.example/r/code", {
      headers: {
        "x-forwarded-for": "198.51.100.200",
        "x-vercel-forwarded-for": "203.0.113.8",
      },
    });

    expect(readAttributionCallerAddress(request, "production")).toBe("203.0.113.8");
    expect(readAttributionCallerAddress(request, "preview")).toBe("203.0.113.8");
    expect(readAttributionCallerAddress(request, "local")).toBe("198.51.100.200");
    expect(readAttributionCallerAddress(new Request(request.url), "production")).toBeNull();
    expect(readAttributionCallerAddress(new Request(request.url), "local")).toBe("127.0.0.1");
    expect(readAttributionCallerAddress(new Request(request.url, {
      headers: { "x-vercel-forwarded-for": "203.0.113.8, 198.51.100.1" },
    }), "production")).toBeNull();
  });
});
