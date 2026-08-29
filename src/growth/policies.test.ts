import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { loadCurrentGrowthTerms, type GrowthPolicySqlClient } from "./policies";

const now = new Date("2026-08-28T12:00:00.000Z");

function termsClient(termsText: string): GrowthPolicySqlClient {
  const row = {
    id: "9a000000-0000-4000-8000-000000000001",
    program: "customer_rewards_referrals" as const,
    version: 1,
    contentHash: createHash("sha256").update(termsText).digest("hex"),
    termsText,
    effectiveAt: "2026-08-27T00:00:00.000Z",
    supersededAt: null,
  };
  return {
    async query<Row extends object>() {
      return { rows: [row as Row] };
    },
  };
}

describe("growth terms public-copy boundary", () => {
  it("loads one hash-valid neutral current terms record", async () => {
    await expect(
      loadCurrentGrowthTerms(
        termsClient(
          "Rewards are administered by PROPEPTIQ and may be revoked to prevent fraud.",
        ),
        "customer_rewards_referrals",
        now,
      ),
    ).resolves.toMatchObject({ version: 1 });
  });

  it.each([
    "Hurry — only 2 left.",
    "Join 10,000 researchers who already chose us.",
    "Was $999, now $49.",
    "Better than every competing peptide supplier.",
    "Customer testimonial: it changed my life.",
  ])("rejects prohibited public terms copy: %s", async (termsText) => {
    await expect(
      loadCurrentGrowthTerms(
        termsClient(termsText),
        "customer_rewards_referrals",
        now,
      ),
    ).rejects.toThrow(/content policy/i);
  });
});
