import "server-only";

import { connection } from "next/server";

import { withRuntimeTransaction } from "@/db/runtime";
import type { AffiliatePolicy } from "@/domain/affiliates";
import type { ReferralPolicy } from "@/domain/referrals";
import type { LoyaltyPolicy } from "@/domain/rewards";
import { readServerEnv } from "@/env";
import {
  loadCurrentAffiliatePolicy,
  loadCurrentGrowthTerms,
  loadCurrentLoyaltyPolicy,
  loadCurrentReferralPolicy,
  type CurrentGrowthTerms,
} from "@/growth/policies";

export type PublicGrowthProjection = Readonly<{
  loyalty: LoyaltyPolicy | null;
  referral: ReferralPolicy | null;
  affiliate: AffiliatePolicy | null;
  terms: Readonly<{
    rewards: CurrentGrowthTerms | null;
    partner: CurrentGrowthTerms | null;
  }>;
}>;

async function failClosed<Value>(work: () => Promise<Value>): Promise<Value | null> {
  try {
    return await work();
  } catch {
    return null;
  }
}

export async function getPublicGrowthProjection(): Promise<PublicGrowthProjection | null> {
  await connection();
  const environment = readServerEnv();
  if (environment.DATABASE_MODE === "disabled") return null;

  const now = new Date();
  const [loyalty, referral, affiliate, rewardsTerms, partnerTerms] = await Promise.all([
    failClosed(() =>
      withRuntimeTransaction(environment, (client) => loadCurrentLoyaltyPolicy(client, now)),
    ),
    failClosed(() =>
      withRuntimeTransaction(environment, (client) => loadCurrentReferralPolicy(client, now)),
    ),
    failClosed(() =>
      withRuntimeTransaction(environment, (client) => loadCurrentAffiliatePolicy(client, now)),
    ),
    failClosed(() =>
      withRuntimeTransaction(environment, (client) =>
        loadCurrentGrowthTerms(client, "customer_rewards_referrals", now),
      ),
    ),
    failClosed(() =>
      withRuntimeTransaction(environment, (client) =>
        loadCurrentGrowthTerms(client, "affiliate", now),
      ),
    ),
  ]);

  if (
    loyalty === null &&
    referral === null &&
    affiliate === null &&
    rewardsTerms === null &&
    partnerTerms === null
  ) {
    return null;
  }

  return Object.freeze({
    loyalty,
    referral,
    affiliate,
    terms: Object.freeze({ rewards: rewardsTerms, partner: partnerTerms }),
  });
}
