import { createHash } from "node:crypto";

import type { PGlite } from "@electric-sql/pglite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { GrowthSqlClient } from "@/db/repositories/growth-repository";
import { createAttributionCookie } from "@/growth/attribution-cookie";
import {
  ReferralEnrollmentError,
  createPostgresReferralEnrollmentTransaction,
  createPostgresReferralCandidateLookup,
  createPostgresReferralCheckoutService,
} from "@/growth/referral-service";

import { createMigratedPglite } from "./helpers/pglite";

const ids = {
  buyer: "52000000-0000-4000-8000-000000000001",
  otherBuyer: "52000000-0000-4000-8000-000000000002",
  terms: "52000000-0000-4000-8000-000000000003",
  overlappingTerms: "52000000-0000-4000-8000-000000000004",
  acceptance: "52000000-0000-4000-8000-000000000005",
  replayAcceptance: "52000000-0000-4000-8000-000000000006",
  code: "52000000-0000-4000-8000-000000000007",
  replayCode: "52000000-0000-4000-8000-000000000008",
  collisionCode: "52000000-0000-4000-8000-000000000009",
  referralPolicy: "52000000-0000-4000-8000-000000000010",
  secondReferralPolicy: "52000000-0000-4000-8000-000000000011",
  ownedReferralCode: "52000000-0000-4000-8000-000000000012",
  existingAttribution: "52000000-0000-4000-8000-000000000013",
  affiliateTerms: "52000000-0000-4000-8000-000000000014",
  affiliateAcceptance: "52000000-0000-4000-8000-000000000015",
  affiliatePolicy: "52000000-0000-4000-8000-000000000016",
  affiliateProfile: "52000000-0000-4000-8000-000000000017",
  affiliateAttribution: "52000000-0000-4000-8000-000000000018",
} as const;

const now = new Date("2026-08-28T18:00:00.000Z");
const termsText = "Synthetic customer referral terms for Task 5B.";
const termsHash = createHash("sha256").update(termsText).digest("hex");

describe("customer referral enrollment transaction on PGlite", () => {
  let client: PGlite;

  beforeEach(async () => {
    client = await createMigratedPglite();
    await client.query(
      `INSERT INTO users (id, clerk_id, email_verified_at) VALUES
         ($1::uuid, 'clerk-task5b-buyer', '2026-08-28T17:00:00.000Z'),
         ($2::uuid, 'clerk-task5b-other', '2026-08-28T17:00:00.000Z')`,
      [ids.buyer, ids.otherBuyer],
    );
    await client.query(
      `INSERT INTO buyer_profiles
         (user_id, status, age_confirmed_at, research_purpose, updated_at) VALUES
         ($1::uuid, 'active', '2026-08-01T00:00:00.000Z', 'analytical',
          '2026-08-28T17:00:00.000Z'),
         ($2::uuid, 'active', '2026-08-01T00:00:00.000Z', 'analytical',
          '2026-08-28T17:00:00.000Z')`,
      [ids.buyer, ids.otherBuyer],
    );
    await client.query(
      `INSERT INTO growth_terms_versions
         (id, program, version, content_hash, terms_text, effective_at)
       VALUES ($1::uuid, 'customer_rewards_referrals', 1, $2, $3,
               '2026-08-28T00:00:00.000Z')`,
      [ids.terms, termsHash, termsText],
    );
  });

  afterEach(async () => client.close());

  function enrollmentTransaction() {
    return createPostgresReferralEnrollmentTransaction({
      runSerializableTransaction: <Value>(
        work: (sqlClient: GrowthSqlClient) => Promise<Value>,
      ) => client.transaction((transaction) =>
        work({
          query: async <Row extends object>(
            sql: string,
            params: readonly unknown[] = [],
          ) => {
            const result = await transaction.query<Row>(sql, [...params]);
            return { rows: result.rows };
          },
        }),
      ),
    });
  }

  function input(overrides: Record<string, unknown> = {}) {
    return {
      acceptanceId: ids.acceptance,
      referralCodeId: ids.code,
      buyerUserId: ids.buyer,
      termsVersionId: ids.terms,
      termsContentHash: termsHash,
      code: "ref_5BPgliteStableCode",
      acceptedAt: now,
      ...overrides,
    };
  }

  async function counts() {
    const result = await client.query<{ acceptances: number; codes: number }>(
      `SELECT
         (SELECT count(*)::int FROM growth_terms_acceptances) AS acceptances,
         (SELECT count(*)::int FROM referral_codes) AS codes`,
    );
    return result.rows[0]!;
  }

  it("commits exact terms acceptance and one active opaque code, then replays to the stable code", async () => {
    const enroll = enrollmentTransaction();

    await expect(enroll(input())).resolves.toEqual({
      status: "applied",
      code: "ref_5BPgliteStableCode",
      createdAt: now.toISOString(),
    });
    await expect(enroll(input({
      acceptanceId: ids.replayAcceptance,
      referralCodeId: ids.replayCode,
      code: "ref_5BPgliteNewCandidate",
    }))).resolves.toEqual({
      status: "idempotent",
      code: "ref_5BPgliteStableCode",
      createdAt: now.toISOString(),
    });
    await expect(counts()).resolves.toEqual({ acceptances: 1, codes: 1 });
  });

  it.each([
    ["stale version", { termsVersionId: ids.overlappingTerms }, "terms_mismatch"],
    ["hash mismatch", { termsContentHash: "0".repeat(64) }, "terms_mismatch"],
  ] as const)("rolls back acceptance and code on %s", async (_label, override, code) => {
    await expect(enrollmentTransaction()(input(override))).rejects.toMatchObject({ code });
    await expect(counts()).resolves.toEqual({ acceptances: 0, codes: 0 });
  });

  it("rolls back when current terms overlap", async () => {
    const overlappingText = "Synthetic overlapping customer referral terms.";
    const overlappingHash = createHash("sha256")
      .update(overlappingText)
      .digest("hex");
    await client.query(`DROP INDEX growth_terms_versions_current_program_unique`);
    await client.query(
      `INSERT INTO growth_terms_versions
         (id, program, version, content_hash, terms_text, effective_at)
       VALUES ($1::uuid, 'customer_rewards_referrals', 2, $2, $3,
               '2026-08-28T12:00:00.000Z')`,
      [ids.overlappingTerms, overlappingHash, overlappingText],
    );

    await expect(enrollmentTransaction()(input())).rejects.toBeInstanceOf(
      ReferralEnrollmentError,
    );
    await expect(counts()).resolves.toEqual({ acceptances: 0, codes: 0 });
  });

  it.each(["review", "blocked"] as const)(
    "rolls back for a database-authoritative %s buyer",
    async (status) => {
      await client.query(
        `UPDATE buyer_profiles SET status = $2::buyer_status WHERE user_id = $1::uuid`,
        [ids.buyer, status],
      );

      await expect(enrollmentTransaction()(input())).rejects.toMatchObject({
        code: "buyer_inactive",
      });
      await expect(counts()).resolves.toEqual({ acceptances: 0, codes: 0 });
    },
  );

  it("rolls back a just-inserted acceptance when opaque code uniqueness conflicts", async () => {
    await client.query(
      `INSERT INTO referral_codes (id, owner_user_id, code, status, created_at)
       VALUES ($1::uuid, $2::uuid, 'ref_5BPgliteCollision', 'active',
               '2026-08-28T17:30:00.000Z')`,
      [ids.collisionCode, ids.otherBuyer],
    );

    await expect(enrollmentTransaction()(input({
      code: "ref_5BPgliteCollision",
    }))).rejects.toBeInstanceOf(ReferralEnrollmentError);
    await expect(counts()).resolves.toEqual({ acceptances: 0, codes: 1 });
  });
});

describe("customer referral candidate lookup on PGlite", () => {
  let client: PGlite;

  beforeEach(async () => {
    client = await createMigratedPglite();
    await client.query(
      `INSERT INTO users (id, clerk_id, email_verified_at) VALUES
         ($1::uuid, 'clerk-task5b-referred', '2026-08-28T17:00:00.000Z'),
         ($2::uuid, 'clerk-task5b-referrer', '2026-08-28T17:00:00.000Z')`,
      [ids.buyer, ids.otherBuyer],
    );
    await client.query(
      `INSERT INTO buyer_profiles
         (user_id, status, age_confirmed_at, research_purpose, updated_at) VALUES
         ($1::uuid, 'active', '2026-08-01T00:00:00.000Z', 'analytical',
          '2026-08-28T17:00:00.000Z'),
         ($2::uuid, 'active', '2026-08-01T00:00:00.000Z', 'analytical',
          '2026-08-28T17:00:00.000Z')`,
      [ids.buyer, ids.otherBuyer],
    );
    await client.query(
      `INSERT INTO referral_policies
         (id, version, status, attribution_days, referred_discount_basis_points,
          referred_discount_cap_minor, referrer_points_per_dollar,
          referrer_reward_cap_points, effective_at)
       VALUES ($1::uuid, 1, 'active', 30, 1000, 2500, 5, 2500,
               '2026-08-01T00:00:00.000Z')`,
      [ids.referralPolicy],
    );
    await client.query(
      `INSERT INTO referral_codes (id, owner_user_id, code, status, created_at)
       VALUES ($1::uuid, $2::uuid, 'ref_5BCandidateOpaque', 'active',
               '2026-08-10T00:00:00.000Z')`,
      [ids.ownedReferralCode, ids.otherBuyer],
    );
  });

  afterEach(async () => client.close());

  function lookup() {
    return createPostgresReferralCandidateLookup({
      client: {
        query: async <Row extends object>(sql: string, params: readonly unknown[] = []) => {
          const result = await client.query<Row>(sql, [...params]);
          return { rows: result.rows };
        },
      },
    });
  }

  const candidateInput = {
    buyerUserId: ids.buyer,
    code: "ref_5BCandidateOpaque",
    clickedAt: "2026-08-20T18:00:00.000Z",
    expiresAt: "2026-09-19T18:00:00.000Z",
    now,
  } as const;

  it("loads exactly one active code and current 30-day policy without owner disclosure fields", async () => {
    const result = await lookup()(candidateInput);

    expect(result).toMatchObject({
      status: "eligible",
      referralCodeId: ids.ownedReferralCode,
      referrerUserId: ids.otherBuyer,
      policy: { id: ids.referralPolicy, version: 1 },
    });
    expect(Object.isFrozen(result)).toBe(true);
    expect(result).not.toHaveProperty("email");
    expect(result).not.toHaveProperty("clerkUserId");
  });

  it("verifies the real 5A HMAC cookie before authoritative candidate lookup", async () => {
    const secret = "task-5b-real-cookie-verification-secret-32-characters";
    const cookie = createAttributionCookie({
      schemaVersion: 1,
      program: "customer_referral",
      code: candidateInput.code,
      issuedAt: candidateInput.clickedAt,
      expiresAt: candidateInput.expiresAt,
    }, { environment: "local", now, secret });
    if (cookie === null) throw new Error("expected synthetic attribution cookie");
    const service = createPostgresReferralCheckoutService({
      client: { query: (sql, params = []) => client.query(sql, [...params]) },
      environment: "local",
      secret,
    });

    await expect(service.quoteCustomerReferral({
      buyerUserId: ids.buyer,
      attributionCookie: cookie.value,
      merchandiseSubtotalMinor: 10_000,
      currency: "USD",
      now,
    })).resolves.toMatchObject({ status: "eligible", referralDiscountMinor: 1_000 });
    await expect(service.quoteCustomerReferral({
      buyerUserId: ids.buyer,
      attributionCookie: `${cookie.value}tampered`,
      merchandiseSubtotalMinor: 10_000,
      currency: "USD",
      now,
    })).resolves.toEqual({ status: "unavailable", reason: "attribution_invalid" });
  });

  it.each([
    ["revoked code", async (): Promise<unknown> => client.query(
      `UPDATE referral_codes SET status = 'revoked', revoked_at = $2::timestamptz
       WHERE id = $1::uuid`,
      [ids.ownedReferralCode, now.toISOString()],
    ), "code_inactive"],
    ["expired click", async (): Promise<unknown> => undefined, "code_inactive"],
  ] as const)("fails closed for %s", async (label, mutate, reason) => {
    await mutate();
    const input = label === "expired click"
      ? { ...candidateInput, clickedAt: "2026-07-01T00:00:00.000Z", expiresAt: "2026-07-31T00:00:00.000Z" }
      : candidateInput;

    await expect(lookup()(input)).resolves.toEqual({ status: "unavailable", reason });
  });

  it("rejects a buyer already attributed under the current referral policy", async () => {
    await client.query(
      `INSERT INTO referral_attributions
         (id, referral_code_id, referrer_user_id, referred_user_id,
          referral_policy_id, referral_policy_version, clicked_at, expires_at, bound_at)
       VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid, 1,
               '2026-08-18T00:00:00.000Z', '2026-09-17T00:00:00.000Z',
               '2026-08-20T00:00:00.000Z')`,
      [ids.existingAttribution, ids.ownedReferralCode, ids.otherBuyer, ids.buyer,
        ids.referralPolicy],
    );

    await expect(lookup()(candidateInput)).resolves.toEqual({
      status: "unavailable",
      reason: "buyer_already_referred",
    });
  });

  it("rejects an authoritative customer-versus-affiliate attribution conflict", async () => {
    const affiliateTermsText = "Synthetic affiliate terms for conflict coverage.";
    const affiliateTermsHash = createHash("sha256")
      .update(affiliateTermsText)
      .digest("hex");
    await client.query(
      `INSERT INTO growth_terms_versions
         (id, program, version, content_hash, terms_text, effective_at)
       VALUES ($1::uuid, 'affiliate', 1, $2, $3,
               '2026-08-01T00:00:00.000Z')`,
      [ids.affiliateTerms, affiliateTermsHash, affiliateTermsText],
    );
    await client.query(
      `INSERT INTO growth_terms_acceptances
         (id, user_id, program, terms_version_id, content_hash, accepted_at)
       VALUES ($1::uuid, $2::uuid, 'affiliate', $3::uuid, $4,
               '2026-08-02T00:00:00.000Z')`,
      [ids.affiliateAcceptance, ids.otherBuyer, ids.affiliateTerms,
        affiliateTermsHash],
    );
    await client.query(
      `INSERT INTO affiliate_policies
         (id, version, status, attribution_days,
          first_order_commission_basis_points, reorder_commission_basis_points,
          reorder_window_days, approval_delay_days, payout_threshold_minor,
          currency, effective_at)
       VALUES ($1::uuid, 1, 'active', 30, 1000, 500, 180, 30, 5000,
               'USD', '2026-08-01T00:00:00.000Z')`,
      [ids.affiliatePolicy],
    );
    await client.query(
      `INSERT INTO affiliate_profiles
         (id, user_id, public_code, status, public_channel, promotion_method,
          terms_acceptance_id, terms_program, created_at, updated_at)
       VALUES ($1::uuid, $2::uuid, 'aff_5BConflictOpaque', 'active',
               'synthetic.test', 'website', $3::uuid, 'affiliate',
               '2026-08-02T00:00:00.000Z', '2026-08-02T00:00:00.000Z')`,
      [ids.affiliateProfile, ids.otherBuyer, ids.affiliateAcceptance],
    );
    await client.query(
      `INSERT INTO affiliate_attributions
         (id, affiliate_profile_id, affiliate_user_id, referred_user_id,
          affiliate_policy_id, affiliate_policy_version, clicked_at,
          expires_at, bound_at)
       VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid, 1,
               '2026-08-18T00:00:00.000Z', '2026-09-17T00:00:00.000Z',
               '2026-08-20T00:00:00.000Z')`,
      [ids.affiliateAttribution, ids.affiliateProfile, ids.otherBuyer,
        ids.buyer, ids.affiliatePolicy],
    );

    await expect(lookup()(candidateInput)).resolves.toEqual({
      status: "unavailable",
      reason: "affiliate_conflict",
    });
  });

  it("fails closed when current referral policies overlap", async () => {
    await client.query(`DROP INDEX referral_policies_current_active_unique`);
    await client.query(
      `INSERT INTO referral_policies
         (id, version, status, attribution_days, referred_discount_basis_points,
          referred_discount_cap_minor, referrer_points_per_dollar,
          referrer_reward_cap_points, effective_at)
       VALUES ($1::uuid, 2, 'active', 30, 1000, 2500, 5, 2500,
               '2026-08-20T00:00:00.000Z')`,
      [ids.secondReferralPolicy],
    );

    await expect(lookup()(candidateInput)).resolves.toEqual({
      status: "unavailable",
      reason: "policy_unavailable",
    });
  });
});
