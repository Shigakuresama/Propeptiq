import { describe, expect, it, vi } from "vitest";

import { createReferralLandingLookup } from "./referral-landing-runtime";

const now = new Date("2026-08-28T12:00:00.000Z");
const code = "ref_AbCdEf0123456789";

describe("referral landing lookup adapter", () => {
  it("uses one bounded active-code and current-policy query and freezes the result", async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [{ program: "customer_referral", code, attributionDays: 30 }],
    });
    const lookup = createReferralLandingLookup({ query });

    const result = await lookup({ code, now });

    expect(result).toEqual({
      program: "customer_referral",
      code,
      attributionDays: 30,
    });
    expect(Object.isFrozen(result)).toBe(true);
    expect(query).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenCalledWith(
      expect.stringMatching(/LIMIT 2/u),
      [code, now.toISOString()],
    );
  });

  it("fails closed for zero, ambiguous, malformed, or non-30-day results", async () => {
    for (const rows of [
      [],
      [
        { program: "customer_referral", code, attributionDays: 30 },
        { program: "affiliate", code, attributionDays: 30 },
      ],
      [{ program: "unknown", code, attributionDays: 30 }],
      [{ program: "customer_referral", code: "ref_different123456", attributionDays: 30 }],
      [{ program: "customer_referral", code, attributionDays: 31 }],
    ]) {
      const query = vi.fn().mockResolvedValue({ rows });
      await expect(createReferralLandingLookup({ query })({ code, now })).resolves.toBeNull();
      expect(query).toHaveBeenCalledTimes(1);
    }
  });

  it("does not query affiliate-prefixed codes in the referral-only 5A slice", async () => {
    const query = vi.fn();
    const lookup = createReferralLandingLookup({ query });

    await expect(
      lookup({ code: "aff_AbCdEf0123456789", now }),
    ).resolves.toBeNull();
    expect(query).not.toHaveBeenCalled();
  });
});
