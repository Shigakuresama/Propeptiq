import { describe, expect, it, vi } from "vitest";

import type { RateLimitStore } from "@/security/rate-limit";

import { createRateLimitedAttributionLandingLookup } from "./landing-rate-limit";

const now = new Date("2026-08-28T12:00:00.000Z");
const code = "ref_AbCdEf0123456789";
const secret = "task-9-attribution-lookup-secret-at-least-32-characters";

describe("privacy-minimal attribution landing rate limit", () => {
  it("limits repeated lookup of one opaque code without retaining the raw code", async () => {
    let count = 0;
    const windows: Parameters<RateLimitStore["increment"]>[0][] = [];
    const rateLimitStore: RateLimitStore = {
      async increment(window) {
        windows.push(window);
        count += 1;
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

    await expect(guarded({ code, now })).resolves.toEqual({ code });
    await expect(guarded({ code, now })).resolves.toEqual({ code });
    await expect(guarded({ code, now })).resolves.toBeNull();

    expect(lookup).toHaveBeenCalledTimes(2);
    expect(windows).toHaveLength(3);
    expect(windows[0]?.scopeHash).toMatch(/^[0-9a-f]{64}$/u);
    expect(JSON.stringify(windows)).not.toContain(code);
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
      guarded({ code: "aff_AbCdEf0123456789", now }),
    ).resolves.toBeNull();
    expect(lookup).not.toHaveBeenCalled();
  });
});
