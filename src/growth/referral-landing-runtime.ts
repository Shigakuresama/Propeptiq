import "server-only";

import type { ServerEnv } from "@/config/env-schema";
import {
  connectRuntimeDatabaseSession,
  type RuntimeDatabaseClient,
} from "@/db/runtime";
import { readServerEnv } from "@/env";
import type {
  AttributionEnvironment,
  AttributionProgram,
} from "@/growth/attribution-cookie";

const boundedOpaqueCodePattern = /^ref_[A-Za-z0-9_-]{16,64}$/u;

export type EligibleReferralLanding = Readonly<{
  program: AttributionProgram;
  code: string;
  attributionDays: 30;
}>;

export type ReferralLandingLookup = (
  input: Readonly<{ code: string; now: Date }>,
) => Promise<EligibleReferralLanding | null>;

export type ReferralLandingRuntime = Readonly<{
  attributionSecret: string;
  environment: AttributionEnvironment;
  lookup: ReferralLandingLookup;
}>;

type EligibleLandingRow = {
  program: string;
  code: string;
  attributionDays: number | string;
};

export function createReferralLandingLookup(
  client: Pick<RuntimeDatabaseClient, "query">,
): ReferralLandingLookup {
  return async ({ code, now }) => {
    if (
      !boundedOpaqueCodePattern.test(code) ||
      !Number.isFinite(now.getTime())
    ) {
      return null;
    }

    const result = await client.query<EligibleLandingRow>(
      `SELECT 'customer_referral'::text AS program,
              referral_codes.code AS code,
              referral_policies.attribution_days AS "attributionDays"
       FROM referral_codes
       JOIN referral_policies
         ON referral_policies.status = 'active'
        AND referral_policies.effective_at <= $2::timestamptz
        AND (referral_policies.superseded_at IS NULL
             OR referral_policies.superseded_at > $2::timestamptz)
       WHERE referral_codes.code = $1
         AND referral_codes.status = 'active'
       ORDER BY referral_policies.effective_at DESC,
                referral_policies.version DESC
       LIMIT 2`,
      [code, now.toISOString()],
    );

    if (result.rows.length !== 1) return null;
    const row = result.rows[0]!;
    const attributionDays = Number(row.attributionDays);
    if (
      row.program !== "customer_referral" ||
      row.code !== code ||
      !Number.isSafeInteger(attributionDays) ||
      attributionDays !== 30
    ) {
      return null;
    }

    return Object.freeze({
      program: row.program,
      code: row.code,
      attributionDays: 30,
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

export async function createReferralLandingRuntime(): Promise<
  ReferralLandingRuntime | null
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
        return await createReferralLandingLookup(session)(input);
      } finally {
        session.release();
      }
    },
  });
}
