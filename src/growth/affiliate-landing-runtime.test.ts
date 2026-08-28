import { describe, expect, it, vi } from "vitest";

import { createAffiliateLandingLookup } from "./affiliate-landing-runtime";

const now = new Date("2026-08-28T19:00:00.000Z");
const code = "aff_6BOpaqueAttribution9";
const activeRow = Object.freeze({
  code,
  profileStatus: "active",
  policyStatus: "active",
  attributionDays: 30,
  effectiveAt: "2026-08-28T00:00:00.000Z",
  supersededAt: null,
});

describe("affiliate landing lookup adapter", () => {
  it("uses one bounded active-profile and current-policy query and returns no identity", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [activeRow] });
    const lookup = createAffiliateLandingLookup({ query });

    const result = await lookup({ code, now });

    expect(result).toEqual({ program: "affiliate", code, attributionDays: 30 });
    expect(Object.isFrozen(result)).toBe(true);
    expect(query).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenCalledWith(
      expect.stringMatching(/affiliate_profiles\.status = 'active'[\s\S]*affiliate_policies\.status = 'active'[\s\S]*LIMIT 2/u),
      [code, now.toISOString()],
    );
    expect(JSON.stringify(result)).not.toMatch(
      /buyer|partner|email|channel|profile.?id|user.?id|order|payment|address|ip|device/i,
    );
  });

  it("fails closed for invalid, inactive, suspended, rejected, or overlapping results", async () => {
    for (const rows of [
      [],
      [activeRow, activeRow],
      [{ ...activeRow, profileStatus: "pending" }],
      [{ ...activeRow, profileStatus: "suspended" }],
      [{ ...activeRow, profileStatus: "rejected" }],
      [{ ...activeRow, policyStatus: "draft" }],
      [{ ...activeRow, supersededAt: now.toISOString() }],
    ]) {
      const query = vi.fn().mockResolvedValue({ rows });
      await expect(createAffiliateLandingLookup({ query })({ code, now })).resolves.toBeNull();
      expect(query).toHaveBeenCalledTimes(1);
    }
  });

  it("does not query customer-referral, malformed, or unbounded codes", async () => {
    for (const invalidCode of [
      "ref_AbCdEf0123456789",
      "aff_short",
      `aff_${"A".repeat(65)}`,
      "aff_has.dot123456789",
    ]) {
      const query = vi.fn();
      await expect(
        createAffiliateLandingLookup({ query })({ code: invalidCode, now }),
      ).resolves.toBeNull();
      expect(query).not.toHaveBeenCalled();
    }
  });
});
