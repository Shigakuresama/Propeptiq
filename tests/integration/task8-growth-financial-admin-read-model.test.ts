import type { PGlite } from "@electric-sql/pglite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { VerifiedIdentity } from "@/auth/identity";
import {
  createPostgresAdminReadRepository,
  type AdminReadSqlClient,
  type AdminReadTransactionOptions,
} from "@/db/repositories/admin-read-repository";

import { createMigratedPglite } from "./helpers/pglite";

const ids = {
  admin: "8f200000-0000-4000-8000-000000000001",
  affiliate: "8f200000-0000-4000-8000-000000000002",
  referred: "8f200000-0000-4000-8000-000000000003",
  affiliateBuyer: "8f200000-0000-4000-8000-000000000004",
  attestation: "8f200000-0000-4000-8000-000000000005",
  referredAcceptance: "8f200000-0000-4000-8000-000000000006",
  affiliateBuyerAcceptance: "8f200000-0000-4000-8000-000000000007",
  referralPolicy: "8f200000-0000-4000-8000-000000000008",
  affiliatePolicy: "8f200000-0000-4000-8000-000000000009",
  referralCode: "8f200000-0000-4000-8000-000000000010",
  referralAttribution: "8f200000-0000-4000-8000-000000000011",
  referralOrder: "8f200000-0000-4000-8000-000000000012",
  referralConversion: "8f200000-0000-4000-8000-000000000013",
  affiliateTerms: "8f200000-0000-4000-8000-000000000014",
  affiliateTermsAcceptance: "8f200000-0000-4000-8000-000000000015",
  affiliateProfile: "8f200000-0000-4000-8000-000000000016",
  affiliateAttribution: "8f200000-0000-4000-8000-000000000017",
  affiliateOrder: "8f200000-0000-4000-8000-000000000018",
  payout: "8f200000-0000-4000-8000-000000000019",
  commission: "8f200000-0000-4000-8000-000000000020",
} as const;

const createdAt = "2026-08-28T18:00:00.000Z";
const eligibleAt = "2026-08-29T18:00:00.000Z";
const settledAt = "2026-08-30T18:00:00.000Z";
const now = new Date("2026-08-31T18:00:00.000Z");
const identity: VerifiedIdentity = {
  clerkUserId: "clerk-growth-financial-admin",
  primaryEmail: "private-admin@example.test",
  emailVerifiedAt: "2026-08-28T12:00:00.000Z",
  mfaConfigured: true,
  secondFactorCompleted: true,
};

describe("Task 8 redacted growth financial administration reads", () => {
  let database: PGlite;
  let optionsSeen: AdminReadTransactionOptions[];
  let statements: Readonly<{ sql: string; params: readonly unknown[] }>[];

  beforeEach(async () => {
    database = await createMigratedPglite();
    optionsSeen = [];
    statements = [];
    await database.exec(`
      INSERT INTO users (id, clerk_id, email_verified_at) VALUES
        ('${ids.admin}', 'clerk-growth-financial-admin', '${identity.emailVerifiedAt}'),
        ('${ids.affiliate}', 'PRIVATE-AFFILIATE-CLERK', '${identity.emailVerifiedAt}'),
        ('${ids.referred}', 'PRIVATE-REFERRED-CLERK', '${identity.emailVerifiedAt}'),
        ('${ids.affiliateBuyer}', 'PRIVATE-BUYER-CLERK', '${identity.emailVerifiedAt}');
      INSERT INTO staff_roles
        (user_id, capability, granted_by_user_id, grant_correlation_id)
      VALUES
        ('${ids.admin}', 'growth:manage', '${ids.admin}', 'growth-financial-read'),
        ('${ids.admin}', 'affiliate:payout', '${ids.admin}', 'payout-financial-read');

      INSERT INTO attestation_versions
        (id, version, content_hash, policy_text, effective_at)
      VALUES ('${ids.attestation}', 1, '${"a".repeat(64)}',
              'Synthetic read fixture', '2026-08-01T00:00:00.000Z');
      INSERT INTO attestation_acceptances
        (id, user_id, attestation_version_id, accepted_at)
      VALUES
        ('${ids.referredAcceptance}', '${ids.referred}', '${ids.attestation}', '2026-08-02T00:00:00.000Z'),
        ('${ids.affiliateBuyerAcceptance}', '${ids.affiliateBuyer}', '${ids.attestation}', '2026-08-02T00:00:00.000Z');

      INSERT INTO referral_policies
        (id, version, status, attribution_days, referred_discount_basis_points,
         referred_discount_cap_minor, referrer_points_per_dollar,
         referrer_reward_cap_points, effective_at)
      VALUES ('${ids.referralPolicy}', 1, 'active', 30, 1000, 2500, 5, 2500,
              '2026-08-01T00:00:00.000Z');
      INSERT INTO affiliate_policies
        (id, version, status, attribution_days,
         first_order_commission_basis_points, reorder_commission_basis_points,
         reorder_window_days, approval_delay_days, payout_threshold_minor,
         currency, effective_at)
      VALUES ('${ids.affiliatePolicy}', 1, 'active', 30, 1000, 500, 180, 30,
              5000, 'USD', '2026-08-01T00:00:00.000Z');

      INSERT INTO referral_codes (id, owner_user_id, code)
      VALUES ('${ids.referralCode}', '${ids.affiliate}', 'ref_ABCDEFGHIJKLMNOP');
      INSERT INTO referral_attributions
        (id, referral_code_id, referrer_user_id, referred_user_id,
         referral_policy_id, referral_policy_version, clicked_at, expires_at, bound_at)
      VALUES ('${ids.referralAttribution}', '${ids.referralCode}', '${ids.affiliate}',
              '${ids.referred}', '${ids.referralPolicy}', 1,
              '2026-08-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z',
              '2026-08-02T00:00:00.000Z');
      INSERT INTO orders
        (id, buyer_user_id, buyer_status_snapshot, attestation_acceptance_id,
         destination_state_code, currency, subtotal_minor, discount_minor,
         tax_minor, shipping_minor, total_minor, state, created_at, updated_at)
      VALUES ('${ids.referralOrder}', '${ids.referred}', 'active',
              '${ids.referredAcceptance}', 'CA', 'USD', 10000, 100, 0, 0, 9900,
              'paid_pending_fulfillment', '${createdAt}', '${createdAt}');
      INSERT INTO order_growth_attributions
        (order_id, buyer_user_id, program, referral_attribution_id,
         referral_policy_id, referral_policy_version)
      VALUES ('${ids.referralOrder}', '${ids.referred}', 'customer_referral',
              '${ids.referralAttribution}', '${ids.referralPolicy}', 1);
      INSERT INTO referral_conversions
        (id, referral_attribution_id, referred_user_id, first_order_id,
         referral_policy_id, referral_policy_version, idempotency_key,
         referred_discount_minor, referrer_reward_points, status,
         created_at, qualified_at)
      VALUES ('${ids.referralConversion}', '${ids.referralAttribution}',
              '${ids.referred}', '${ids.referralOrder}', '${ids.referralPolicy}', 1,
              'PRIVATE-REFERRAL-IDEMPOTENCY', 100, 125, 'qualified',
              '${createdAt}', '${eligibleAt}');

      INSERT INTO growth_terms_versions
        (id, program, version, content_hash, terms_text, effective_at)
      VALUES ('${ids.affiliateTerms}', 'affiliate', 1, '${"b".repeat(64)}',
              'Synthetic affiliate terms', '2026-08-01T00:00:00.000Z');
      INSERT INTO growth_terms_acceptances
        (id, user_id, program, terms_version_id, content_hash, accepted_at)
      VALUES ('${ids.affiliateTermsAcceptance}', '${ids.affiliate}', 'affiliate',
              '${ids.affiliateTerms}', '${"b".repeat(64)}', '2026-08-02T00:00:00.000Z');
      INSERT INTO affiliate_profiles
        (id, user_id, public_code, status, version, public_channel,
         promotion_method, terms_acceptance_id, created_at, updated_at)
      VALUES ('${ids.affiliateProfile}', '${ids.affiliate}', 'aff_ABCDEFGHIJKLMNOP',
              'active', 2, '@research_channel', 'social',
              '${ids.affiliateTermsAcceptance}', '${createdAt}', '${createdAt}');
      INSERT INTO affiliate_attributions
        (id, affiliate_profile_id, affiliate_user_id, referred_user_id,
         affiliate_policy_id, affiliate_policy_version, clicked_at, expires_at, bound_at)
      VALUES ('${ids.affiliateAttribution}', '${ids.affiliateProfile}',
              '${ids.affiliate}', '${ids.affiliateBuyer}', '${ids.affiliatePolicy}', 1,
              '2026-08-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z',
              '2026-08-02T00:00:00.000Z');
      INSERT INTO orders
        (id, buyer_user_id, buyer_status_snapshot, attestation_acceptance_id,
         destination_state_code, currency, subtotal_minor, discount_minor,
         tax_minor, shipping_minor, total_minor, state, created_at, updated_at)
      VALUES ('${ids.affiliateOrder}', '${ids.affiliateBuyer}', 'active',
              '${ids.affiliateBuyerAcceptance}', 'CA', 'USD', 9000, 0, 0, 0, 9000,
              'paid_pending_fulfillment', '${createdAt}', '${createdAt}');
      INSERT INTO order_growth_attributions
        (order_id, buyer_user_id, program, affiliate_attribution_id,
         affiliate_policy_id, affiliate_policy_version)
      VALUES ('${ids.affiliateOrder}', '${ids.affiliateBuyer}', 'affiliate',
              '${ids.affiliateAttribution}', '${ids.affiliatePolicy}', 1);
      INSERT INTO affiliate_payouts
        (id, affiliate_profile_id, affiliate_policy_id, affiliate_policy_version,
         idempotency_key, request_hash, amount_minor, currency, state, version,
         paid_idempotency_key, paid_request_hash, external_provider,
         external_reference, created_at, paid_at)
      VALUES ('${ids.payout}', '${ids.affiliateProfile}', '${ids.affiliatePolicy}', 1,
              'PRIVATE-PAYOUT-IDEMPOTENCY', '${"c".repeat(64)}', 800, 'USD',
              'paid', 2, 'PRIVATE-PAID-IDEMPOTENCY', '${"d".repeat(64)}',
              'PRIVATE-PAYOUT-PROVIDER', 'PRIVATE-PAYOUT-REFERENCE',
              '${createdAt}', '${settledAt}');
      INSERT INTO affiliate_commissions
        (id, affiliate_profile_id, affiliate_attribution_id, buyer_user_id,
         order_id, affiliate_policy_id, affiliate_policy_version, idempotency_key,
         gross_commission_minor, reversed_commission_minor, status,
         approval_eligible_at, payout_id, created_at, updated_at)
      VALUES ('${ids.commission}', '${ids.affiliateProfile}',
              '${ids.affiliateAttribution}', '${ids.affiliateBuyer}',
              '${ids.affiliateOrder}', '${ids.affiliatePolicy}', 1,
              'PRIVATE-COMMISSION-IDEMPOTENCY', 900, 100, 'paid',
              '${eligibleAt}', '${ids.payout}', '${createdAt}', '${settledAt}');
      INSERT INTO affiliate_payout_commissions (payout_id, commission_id, created_at)
      VALUES ('${ids.payout}', '${ids.commission}', '${settledAt}');
    `);
  });

  afterEach(async () => database.close());

  function repository() {
    return createPostgresAdminReadRepository((work, options) => {
      optionsSeen.push(options);
      return database.transaction((transaction) => work({
        query: async <Row extends object>(sql: string, params: readonly unknown[] = []) => {
          statements.push({ sql: sql.replace(/\s+/gu, " ").trim(), params });
          const result = await transaction.query<Row>(sql, [...params]);
          return { rows: result.rows };
        },
      } satisfies AdminReadSqlClient));
    });
  }

  it("returns bounded redacted conversion, commission, and payout lifecycle facts", async () => {
    const referralConversions = await repository().readSnapshot({
      userId: ids.admin, identity, now, resource: "referral-conversions",
    });
    const commissions = await repository().readSnapshot({
      userId: ids.admin, identity, now, resource: "commissions",
    });
    const payouts = await repository().readSnapshot({
      userId: ids.admin, identity, now, resource: "payouts",
    });

    expect(referralConversions).toEqual({
      resource: "referral-conversions", limit: 100, truncated: false,
      items: [{
        conversionId: ids.referralConversion,
        referralPolicyVersion: 1,
        referredDiscountMinor: 100,
        referrerRewardPoints: 125,
        status: "qualified",
        createdAt,
        qualifiedAt: eligibleAt,
        reversedAt: null,
      }],
    });
    expect(commissions).toEqual({
      resource: "commissions", limit: 100, truncated: false,
      items: [{
        commissionId: ids.commission,
        affiliateProfileId: ids.affiliateProfile,
        affiliatePolicyVersion: 1,
        grossCommissionMinor: 900,
        reversedCommissionMinor: 100,
        netCommissionMinor: 800,
        status: "paid",
        approvalEligibleAt: eligibleAt,
        payoutId: ids.payout,
        createdAt,
        updatedAt: settledAt,
      }],
    });
    expect(payouts).toEqual({
      resource: "payouts", limit: 100, truncated: false,
      items: [{
        payoutId: ids.payout,
        affiliateProfileId: ids.affiliateProfile,
        affiliatePolicyVersion: 1,
        amountMinor: 800,
        currency: "USD",
        state: "paid",
        version: 2,
        commissionCount: 1,
        externalEvidenceRecorded: true,
        createdAt,
        paidAt: settledAt,
      }],
    });

    const serialized = JSON.stringify({ referralConversions, commissions, payouts });
    expect(serialized).not.toMatch(
      /PRIVATE-|buyerUserId|referredUserId|orderId|attributionId|policyId|idempotency|requestHash|provider|externalReference|email|clerk|cookie|address|payment/iu,
    );
    expect(optionsSeen).toEqual(Array(3).fill({ isolationLevel: "serializable", readOnly: true }));
    const dataQueries = statements.filter(({ sql }) =>
      !/AS authorized|SET TRANSACTION READ ONLY/iu.test(sql));
    expect(dataQueries).toHaveLength(3);
    for (const query of dataQueries) {
      expect(query.sql).toMatch(/LIMIT \$1/iu);
      expect(query.params).toEqual([101]);
    }
    expect(Object.isFrozen(referralConversions.items)).toBe(true);
    expect(Object.isFrozen(commissions.items)).toBe(true);
    expect(Object.isFrozen(payouts.items)).toBe(true);
  });

  it("fails closed on corrupted lifecycle, unsafe arithmetic, and incomplete payout evidence", async () => {
    await database.exec(`
      ALTER TABLE referral_conversions
        DROP CONSTRAINT referral_conversions_state_coherent;
      UPDATE referral_conversions SET qualified_at = NULL
      WHERE id = '${ids.referralConversion}';
    `);
    await expect(repository().readSnapshot({
      userId: ids.admin, identity, now, resource: "referral-conversions",
    })).rejects.toThrow(/invalid referral conversion admin projection/i);

    await database.exec(`
      UPDATE referral_conversions SET qualified_at = '${eligibleAt}'
      WHERE id = '${ids.referralConversion}';
      ALTER TABLE affiliate_commissions
        DROP CONSTRAINT affiliate_commissions_amounts_safe;
      UPDATE affiliate_commissions SET gross_commission_minor = 9007199254740992
      WHERE id = '${ids.commission}';
    `);
    await expect(repository().readSnapshot({
      userId: ids.admin, identity, now, resource: "commissions",
    })).rejects.toThrow(/unsafe database integer/i);

    await database.exec(`
      UPDATE affiliate_commissions SET gross_commission_minor = 900
      WHERE id = '${ids.commission}';
      ALTER TABLE affiliate_payouts
        DROP CONSTRAINT affiliate_payouts_external_evidence_coherent;
      UPDATE affiliate_payouts SET external_reference = NULL
      WHERE id = '${ids.payout}';
    `);
    await expect(repository().readSnapshot({
      userId: ids.admin, identity, now, resource: "payouts",
    })).rejects.toThrow(/invalid affiliate payout admin projection/i);
  });

  it("requires each exact persisted capability and a nonblocked principal", async () => {
    await database.exec(`
      UPDATE staff_roles SET revoked_at = '${settledAt}',
        revoked_by_user_id = '${ids.admin}', revoke_correlation_id = 'revoke-payout-read'
      WHERE user_id = '${ids.admin}' AND capability = 'affiliate:payout';
    `);
    await expect(repository().readSnapshot({
      userId: ids.admin, identity, now, resource: "payouts",
    })).rejects.toThrow(/persisted affiliate:payout capability/i);

    await database.exec(`
      UPDATE staff_roles SET revoked_at = NULL, revoked_by_user_id = NULL,
        revoke_correlation_id = NULL
      WHERE user_id = '${ids.admin}' AND capability = 'affiliate:payout';
      UPDATE staff_roles SET revoked_at = '${settledAt}',
        revoked_by_user_id = '${ids.admin}', revoke_correlation_id = 'revoke-growth-read'
      WHERE user_id = '${ids.admin}' AND capability = 'growth:manage';
    `);
    await expect(repository().readSnapshot({
      userId: ids.admin, identity, now, resource: "commissions",
    })).rejects.toThrow(/persisted growth:manage capability/i);

    await database.exec(`
      UPDATE staff_roles SET revoked_at = NULL, revoked_by_user_id = NULL,
        revoke_correlation_id = NULL
      WHERE user_id = '${ids.admin}' AND capability = 'growth:manage';
      INSERT INTO buyer_profiles (user_id, status) VALUES ('${ids.admin}', 'blocked');
    `);
    await expect(repository().readSnapshot({
      userId: ids.admin, identity, now, resource: "referral-conversions",
    })).rejects.toThrow(/persisted growth:manage capability/i);
  });
});
