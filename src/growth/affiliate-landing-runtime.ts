import "server-only";

import type { ServerEnv } from "@/config/env-schema";
import {
  connectRuntimeDatabaseSession,
  type RuntimeDatabaseClient,
} from "@/db/runtime";
import { readServerEnv } from "@/env";
import {
  createAffiliateAttributionCandidate,
  type AffiliateAttributionCandidate,
} from "@/growth/affiliate-service";
import type { AttributionEnvironment } from "@/growth/attribution-cookie";

const boundedOpaqueCodePattern = /^aff_[A-Za-z0-9_-]{16,64}$/u;

export type AffiliateLandingLookup = (
  input: Readonly<{ code: string; now: Date }>,
) => Promise<AffiliateAttributionCandidate | null>;

export type AffiliateLandingRuntime = Readonly<{
  attributionSecret: string;
  environment: AttributionEnvironment;
  lookup: AffiliateLandingLookup;
}>;

type EligibleLandingRow = {
  code: string;
  profileStatus: string;
  policyStatus: string;
  attributionDays: number | string;
  effectiveAt: Date | string;
  supersededAt: Date | string | null;
};

export function createAffiliateLandingLookup(
  client: Pick<RuntimeDatabaseClient, "query">,
): AffiliateLandingLookup {
  return async ({ code, now }) => {
    if (!boundedOpaqueCodePattern.test(code) || !Number.isFinite(now.getTime())) {
      return null;
    }

    const result = await client.query<EligibleLandingRow>(
      `SELECT affiliate_profiles.public_code AS code,
              affiliate_profiles.status AS "profileStatus",
              affiliate_policies.status AS "policyStatus",
              affiliate_policies.attribution_days AS "attributionDays",
              affiliate_policies.effective_at AS "effectiveAt",
              affiliate_policies.superseded_at AS "supersededAt"
       FROM affiliate_profiles
       JOIN affiliate_policies
         ON affiliate_profiles.status = 'active'
        AND affiliate_policies.status = 'active'
        AND affiliate_policies.effective_at <= $2::timestamptz
        AND (affiliate_policies.superseded_at IS NULL
             OR affiliate_policies.superseded_at > $2::timestamptz)
       WHERE affiliate_profiles.public_code = $1
       ORDER BY affiliate_policies.effective_at DESC,
                affiliate_policies.version DESC
       LIMIT 2`,
      [code, now.toISOString()],
    );

    return createAffiliateAttributionCandidate({
      requestedCode: code,
      now,
      rows: result.rows.map((row) => ({
        ...row,
        attributionDays: Number(row.attributionDays),
      })),
    });
  };
}

function hasLandingConfiguration(environment: ServerEnv): environment is ServerEnv & {
  RATE_LIMIT_SECRET: string;
  DATABASE_MODE: "test" | "live";
} {
  return (
    environment.DATABASE_MODE !== "disabled" &&
    typeof environment.RATE_LIMIT_SECRET === "string" &&
    environment.RATE_LIMIT_SECRET.length >= 32
  );
}

export async function createAffiliateLandingRuntime(): Promise<
  AffiliateLandingRuntime | null
> {
  let environment: ServerEnv;
  try {
    environment = readServerEnv();
  } catch {
    return null;
  }
  if (!hasLandingConfiguration(environment)) return null;

  return Object.freeze({
    attributionSecret: environment.RATE_LIMIT_SECRET,
    environment: environment.APP_ENV,
    async lookup(input) {
      const session = await connectRuntimeDatabaseSession(environment);
      try {
        return await createAffiliateLandingLookup(session)(input);
      } finally {
        session.release();
      }
    },
  });
}
