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

export type PublicGrowthReadResult =
  | Readonly<{ status: "active"; projection: PublicGrowthProjection; syntheticLocal?: true }>
  | Readonly<{ status: "inactive"; syntheticLocal?: true }>
  | Readonly<{ status: "read_error"; syntheticLocal?: true }>;

type CurrentRecordRead<Value> =
  | Readonly<{ status: "active"; value: Value }>
  | Readonly<{ status: "inactive" }>
  | Readonly<{ status: "read_error" }>;

async function readCurrentRecord<Value>(
  environment: ReturnType<typeof readServerEnv>,
  countSql: string,
  countParams: readonly unknown[],
  load: Parameters<typeof withRuntimeTransaction<Value>>[1],
): Promise<CurrentRecordRead<Value>> {
  try {
    return await withRuntimeTransaction(
      environment,
      async (client) => {
        const result = await client.query<{ count: number | string }>(
          countSql,
          countParams,
        );
        if (result.rows.length !== 1) throw new Error("Invalid current-record count");
        const count = Number(result.rows[0]?.count);
        if (!Number.isSafeInteger(count) || count < 0) {
          throw new Error("Invalid current-record count");
        }
        if (count === 0) return Object.freeze({ status: "inactive" as const });
        if (count !== 1) throw new Error("Ambiguous current record");
        return Object.freeze({ status: "active" as const, value: await load(client) });
      },
      { isolationLevel: "serializable" },
    );
  } catch {
    return Object.freeze({ status: "read_error" });
  }
}

export async function getPublicGrowthProjection(): Promise<PublicGrowthReadResult> {
  let environment: ReturnType<typeof readServerEnv>;
  try {
    await connection();
    environment = readServerEnv();
  } catch {
    return Object.freeze({ status: "read_error" });
  }
  if (environment.DATABASE_MODE === "disabled") {
    if (environment.LOCAL_TEST_DRIVER === "enabled") {
      try {
        const { getRequestIdentity } = await import("@/auth/server");
        const request = await getRequestIdentity();
        if (request.localDriver !== null) return request.localDriver.growth.publicProjection();
      } catch {
        return Object.freeze({ status: "read_error", syntheticLocal: true });
      }
    }
    return Object.freeze({ status: "inactive" });
  }

  const now = new Date();
  const nowIso = now.toISOString();
  const [loyalty, referral, affiliate, rewardsTerms, partnerTerms] = await Promise.all([
    readCurrentRecord(
      environment,
      `SELECT COUNT(*)::integer AS count FROM loyalty_policies
       WHERE status = 'active' AND effective_at <= $1::timestamptz
         AND (superseded_at IS NULL OR superseded_at > $1::timestamptz)`,
      [nowIso],
      (client) => loadCurrentLoyaltyPolicy(client, now),
    ),
    readCurrentRecord(
      environment,
      `SELECT COUNT(*)::integer AS count FROM referral_policies
       WHERE status = 'active' AND effective_at <= $1::timestamptz
         AND (superseded_at IS NULL OR superseded_at > $1::timestamptz)`,
      [nowIso],
      (client) => loadCurrentReferralPolicy(client, now),
    ),
    readCurrentRecord(
      environment,
      `SELECT COUNT(*)::integer AS count FROM affiliate_policies
       WHERE status = 'active' AND effective_at <= $1::timestamptz
         AND (superseded_at IS NULL OR superseded_at > $1::timestamptz)`,
      [nowIso],
      (client) => loadCurrentAffiliatePolicy(client, now),
    ),
    readCurrentRecord(
      environment,
      `SELECT COUNT(*)::integer AS count FROM growth_terms_versions
       WHERE program = $1::growth_terms_program
         AND effective_at <= $2::timestamptz
         AND (superseded_at IS NULL OR superseded_at > $2::timestamptz)`,
      ["customer_rewards_referrals", nowIso],
      (client) => loadCurrentGrowthTerms(client, "customer_rewards_referrals", now),
    ),
    readCurrentRecord(
      environment,
      `SELECT COUNT(*)::integer AS count FROM growth_terms_versions
       WHERE program = $1::growth_terms_program
         AND effective_at <= $2::timestamptz
         AND (superseded_at IS NULL OR superseded_at > $2::timestamptz)`,
      ["affiliate", nowIso],
      (client) => loadCurrentGrowthTerms(client, "affiliate", now),
    ),
  ]);

  const reads = [loyalty, referral, affiliate, rewardsTerms, partnerTerms] as const;
  if (reads.some((read) => read.status === "read_error")) {
    return Object.freeze({ status: "read_error" });
  }
  if (reads.every((read) => read.status === "inactive")) {
    return Object.freeze({ status: "inactive" });
  }

  return Object.freeze({
    status: "active",
    projection: Object.freeze({
      loyalty: loyalty.status === "active" ? loyalty.value : null,
      referral: referral.status === "active" ? referral.value : null,
      affiliate: affiliate.status === "active" ? affiliate.value : null,
      terms: Object.freeze({
        rewards: rewardsTerms.status === "active" ? rewardsTerms.value : null,
        partner: partnerTerms.status === "active" ? partnerTerms.value : null,
      }),
    }),
  });
}
