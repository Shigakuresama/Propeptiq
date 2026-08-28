import type { PGlite } from "@electric-sql/pglite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  GrowthPersistenceConflict,
  createPostgresGrowthRepository,
  type GrowthSqlClient,
} from "@/db/repositories/growth-repository";
import { createPostgresGrowthReadRepository } from "@/db/repositories/growth-read-repository";
import {
  loadCurrentGrowthConfiguration,
  mapGrowthPolicyStatus,
} from "@/growth/policies";

import { createMigratedPglite } from "./helpers/pglite";

const now = new Date("2026-08-28T12:00:00.000Z");
const customerTermsText = "Synthetic customer growth terms v1";
const affiliateTermsText = "Synthetic affiliate growth terms v1";
const customerTermsHash = "dcca1573b268b2ba22c4e3035db64ce1615d2fb6fbcb3bcbd493502b215535dc";
const affiliateTermsHash = "87490411ae0013e0d401cebddfe232f46bd0aa8df54a31749fbec4537b0262f7";
const overlappingAffiliateTermsText = "Synthetic overlapping affiliate terms";
const overlappingAffiliateTermsHash = "4ea4a9cbaa9fbf9c7012ff1281dbc0dab7da5fe7e9c8f029af2660ea91ab5ca9";

const ids = {
  owner: "83000000-0000-4000-8000-000000000001",
  otherOwner: "83000000-0000-4000-8000-000000000002",
  referred: "83000000-0000-4000-8000-000000000003",
  otherReferred: "83000000-0000-4000-8000-000000000004",
  affiliateBuyer: "83000000-0000-4000-8000-000000000005",
  otherAffiliateBuyer: "83000000-0000-4000-8000-000000000006",
  attestation: "83000000-0000-4000-8000-000000000007",
  referredAcceptance: "83000000-0000-4000-8000-000000000008",
  otherReferredAcceptance: "83000000-0000-4000-8000-000000000009",
  affiliateBuyerAcceptance: "83000000-0000-4000-8000-000000000010",
  otherAffiliateBuyerAcceptance: "83000000-0000-4000-8000-000000000011",
  loyaltyPolicy: "83000000-0000-4000-8000-000000000012",
  referralPolicy: "83000000-0000-4000-8000-000000000013",
  affiliatePolicy: "83000000-0000-4000-8000-000000000014",
  customerTerms: "83000000-0000-4000-8000-000000000015",
  affiliateTerms: "83000000-0000-4000-8000-000000000016",
  ownerAffiliateAcceptance: "83000000-0000-4000-8000-000000000017",
  otherAffiliateAcceptance: "83000000-0000-4000-8000-000000000018",
  ownerRewardAccount: "83000000-0000-4000-8000-000000000019",
  otherRewardAccount: "83000000-0000-4000-8000-000000000020",
  ownerLedger: "83000000-0000-4000-8000-000000000021",
  otherLedger: "83000000-0000-4000-8000-000000000022",
  ownerReferralCode: "83000000-0000-4000-8000-000000000023",
  otherReferralCode: "83000000-0000-4000-8000-000000000024",
  ownerReferralAttribution: "83000000-0000-4000-8000-000000000025",
  otherReferralAttribution: "83000000-0000-4000-8000-000000000026",
  ownerReferralOrder: "83000000-0000-4000-8000-000000000027",
  otherReferralOrder: "83000000-0000-4000-8000-000000000028",
  ownerReferralConversion: "83000000-0000-4000-8000-000000000029",
  otherReferralConversion: "83000000-0000-4000-8000-000000000030",
  ownerAffiliateProfile: "83000000-0000-4000-8000-000000000031",
  otherAffiliateProfile: "83000000-0000-4000-8000-000000000032",
  ownerAffiliateAttribution: "83000000-0000-4000-8000-000000000033",
  otherAffiliateAttribution: "83000000-0000-4000-8000-000000000034",
  ownerAffiliateOrder: "83000000-0000-4000-8000-000000000035",
  otherAffiliateOrder: "83000000-0000-4000-8000-000000000036",
  ownerPayout: "83000000-0000-4000-8000-000000000037",
  otherPayout: "83000000-0000-4000-8000-000000000038",
  ownerCommission: "83000000-0000-4000-8000-000000000039",
  otherCommission: "83000000-0000-4000-8000-000000000040",
  ownerSet: "83000000-0000-4000-8000-000000000041",
  otherSet: "83000000-0000-4000-8000-000000000042",
  productGroup: "83000000-0000-4000-8000-000000000043",
  productOne: "83000000-0000-4000-8000-000000000044",
  productTwo: "83000000-0000-4000-8000-000000000045",
  redemptionAccount: "83000000-0000-4000-8000-000000000046",
  redemptionAttempt: "83000000-0000-4000-8000-000000000047",
  redemption: "83000000-0000-4000-8000-000000000048",
  payoutReplacement: "83000000-0000-4000-8000-000000000049",
  commissionReplacement: "83000000-0000-4000-8000-000000000050",
  activationAcceptance: "83000000-0000-4000-8000-000000000051",
  activationReferralCode: "83000000-0000-4000-8000-000000000052",
  activationSet: "83000000-0000-4000-8000-000000000053",
  activationAffiliateProfile: "83000000-0000-4000-8000-000000000054",
  revokedReferralCode: "83000000-0000-4000-8000-000000000055",
  replacementReferralCode: "83000000-0000-4000-8000-000000000056",
} as const;

function sqlClient(client: PGlite): GrowthSqlClient {
  return {
    query: async <Row extends object>(sql: string, params: readonly unknown[] = []) => {
      const result = await client.query<Row>(sql, [...params]);
      return { rows: result.rows };
    },
  };
}

async function seedUsers(client: PGlite): Promise<void> {
  await client.exec(`
    INSERT INTO users (id, clerk_id, email_verified_at) VALUES
      ('${ids.owner}', 'owner-private-email@example.test', '${now.toISOString()}'),
      ('${ids.otherOwner}', 'other-private-email@example.test', '${now.toISOString()}'),
      ('${ids.referred}', 'referred-private-clerk-id', '${now.toISOString()}'),
      ('${ids.otherReferred}', 'other-referred-private-clerk-id', '${now.toISOString()}'),
      ('${ids.affiliateBuyer}', 'affiliate-buyer-private-clerk-id', '${now.toISOString()}'),
      ('${ids.otherAffiliateBuyer}', 'other-affiliate-buyer-private-clerk-id', '${now.toISOString()}');
  `);
}

async function seedCurrentPoliciesAndTerms(client: PGlite): Promise<void> {
  await client.exec(`
    INSERT INTO loyalty_policies
      (id, version, status, points_per_dollar, redemption_minor_per_point,
       minimum_redemption_points, maximum_redemption_basis_points,
       expires_after_days, effective_at)
    VALUES ('${ids.loyaltyPolicy}', 1, 'active', 2, 1, 500, 2500, null,
            '2026-08-27T00:00:00.000Z');
    INSERT INTO referral_policies
      (id, version, status, attribution_days, referred_discount_basis_points,
       referred_discount_cap_minor, referrer_points_per_dollar,
       referrer_reward_cap_points, effective_at)
    VALUES ('${ids.referralPolicy}', 1, 'active', 30, 1000, 2500, 5, 2500,
            '2026-08-27T00:00:00.000Z');
    INSERT INTO affiliate_policies
      (id, version, status, attribution_days, first_order_commission_basis_points,
       reorder_commission_basis_points, reorder_window_days, approval_delay_days,
       payout_threshold_minor, currency, effective_at)
    VALUES ('${ids.affiliatePolicy}', 1, 'active', 30, 1000, 500, 180, 30,
            5000, 'USD', '2026-08-27T00:00:00.000Z');
    INSERT INTO growth_terms_versions
      (id, program, version, content_hash, terms_text, effective_at)
    VALUES
      ('${ids.customerTerms}', 'customer_rewards_referrals', 1,
       '${customerTermsHash}', '${customerTermsText}', '2026-08-27T00:00:00.000Z'),
      ('${ids.affiliateTerms}', 'affiliate', 1,
       '${affiliateTermsHash}', '${affiliateTermsText}', '2026-08-27T00:00:00.000Z');
  `);
}

function growthRepository(client: PGlite, failOn?: RegExp) {
  return createPostgresGrowthRepository({
    runSerializableTransaction: (work, options) => {
      expect(options).toEqual({ isolationLevel: "serializable" });
      return client.transaction((transaction) =>
        work({
          query: async <Row extends object>(sql: string, params: readonly unknown[] = []) => {
            if (failOn?.test(sql)) throw new Error("synthetic injected persistence failure");
            const result = await transaction.query<Row>(sql, [...params]);
            return { rows: result.rows };
          },
        }),
      );
    },
  });
}

function ledgerInput(overrides: Record<string, unknown> = {}) {
  return {
    entryId: ids.ownerLedger,
    rewardAccountId: ids.ownerRewardAccount,
    buyerUserId: ids.owner,
    kind: "order_earned_pending" as const,
    sourceType: "provider_event",
    sourceId: "evt_private_provider_identifier",
    idempotencyKey: "reward-ledger-provider-event-0001",
    pendingPointsDelta: 250,
    availablePointsDelta: 0,
    occurredAt: now,
    ...overrides,
  };
}

function expectDeeplyFrozen(value: unknown): void {
  if (value === null || typeof value !== "object") return;
  expect(Object.isFrozen(value)).toBe(true);
  for (const nested of Object.values(value as Record<string, unknown>)) {
    expectDeeplyFrozen(nested);
  }
}

describe("growth policy and repository boundary", () => {
  let client: PGlite;

  beforeEach(async () => {
    client = await createMigratedPglite();
    await seedUsers(client);
  });

  afterEach(async () => client.close());

  it("loads exactly one current parsed policy and hash-verified terms row per program", async () => {
    await seedCurrentPoliciesAndTerms(client);

    await expect(loadCurrentGrowthConfiguration(sqlClient(client), now)).resolves.toEqual({
      loyalty: expect.objectContaining({ id: ids.loyaltyPolicy, version: 1, status: "active" }),
      referral: expect.objectContaining({ id: ids.referralPolicy, version: 1, status: "active" }),
      affiliate: expect.objectContaining({ id: ids.affiliatePolicy, version: 1, status: "active" }),
      terms: {
        customerRewardsReferrals: {
          id: ids.customerTerms,
          program: "customer_rewards_referrals",
          version: 1,
          contentHash: customerTermsHash,
          termsText: customerTermsText,
          effectiveAt: "2026-08-27T00:00:00.000Z",
          supersededAt: null,
        },
        affiliate: {
          id: ids.affiliateTerms,
          program: "affiliate",
          version: 1,
          contentHash: affiliateTermsHash,
          termsText: affiliateTermsText,
          effectiveAt: "2026-08-27T00:00:00.000Z",
          supersededAt: null,
        },
      },
    });
  });

  it("fails closed for missing, future, superseded, malformed, overlapping, or hash-mismatched current records", async () => {
    await expect(loadCurrentGrowthConfiguration(sqlClient(client), now)).rejects.toThrow(/exactly one current loyalty policy/i);

    await seedCurrentPoliciesAndTerms(client);
    await client.exec(`
      DROP TRIGGER loyalty_policies_immutable_history ON loyalty_policies;
      DROP TRIGGER growth_terms_versions_immutable_history ON growth_terms_versions;
    `);
    await client.exec(`UPDATE loyalty_policies SET status = 'superseded', superseded_at = '2026-08-28T11:00:00.000Z'`);
    await expect(loadCurrentGrowthConfiguration(sqlClient(client), now)).rejects.toThrow(/exactly one current loyalty policy/i);

    await client.exec(`
      UPDATE loyalty_policies SET status = 'active', superseded_at = null,
        effective_at = '2026-08-29T00:00:00.000Z';
    `);
    await expect(loadCurrentGrowthConfiguration(sqlClient(client), now)).rejects.toThrow(/exactly one current loyalty policy/i);

    await client.exec(`UPDATE loyalty_policies SET effective_at = '2026-08-27T00:00:00.000Z', points_per_dollar = 3`);
    await expect(loadCurrentGrowthConfiguration(sqlClient(client), now)).rejects.toThrow(/invalid current loyalty policy/i);

    await client.exec(`
      UPDATE loyalty_policies SET points_per_dollar = 2;
      DROP INDEX loyalty_policies_current_active_unique;
      INSERT INTO loyalty_policies
        (id, version, status, points_per_dollar, redemption_minor_per_point,
         minimum_redemption_points, maximum_redemption_basis_points,
         expires_after_days, effective_at)
      VALUES ('83000000-0000-4000-8000-000000000099', 2, 'active', 2, 1,
              500, 2500, null, '2026-08-27T01:00:00.000Z');
    `);
    await expect(loadCurrentGrowthConfiguration(sqlClient(client), now)).rejects.toThrow(/exactly one current loyalty policy/i);

    await client.exec(`
      DELETE FROM loyalty_policies WHERE version = 2;
      UPDATE growth_terms_versions
      SET content_hash = '${"f".repeat(64)}'
      WHERE program = 'affiliate';
    `);
    await expect(loadCurrentGrowthConfiguration(sqlClient(client), now)).rejects.toThrow(/terms hash mismatch/i);

    await client.exec(`
      UPDATE growth_terms_versions
      SET content_hash = '${affiliateTermsHash}'
      WHERE program = 'affiliate';
      UPDATE growth_terms_versions
      SET superseded_at = '2026-08-29T00:00:00.000Z'
      WHERE program = 'customer_rewards_referrals';
      INSERT INTO growth_terms_versions
        (id, program, version, content_hash, terms_text, effective_at)
      VALUES ('83000000-0000-4000-8000-000000000098',
              'customer_rewards_referrals', 2, '${"e".repeat(64)}',
              'Overlapping synthetic terms', '2026-08-28T00:00:00.000Z');
    `);
    await expect(loadCurrentGrowthConfiguration(sqlClient(client), now)).rejects.toThrow(/exactly one current customer_rewards_referrals terms/i);
  });

  it("maps persistence superseded to domain retired explicitly and rejects unknown statuses", () => {
    expect(mapGrowthPolicyStatus("draft")).toBe("draft");
    expect(mapGrowthPolicyStatus("active")).toBe("active");
    expect(mapGrowthPolicyStatus("superseded")).toBe("retired");
    expect(() => mapGrowthPolicyStatus("retired")).toThrow(/unknown persistence growth policy status/i);
  });

  it("creates the reward account, appends one ledger fact, and projects balances atomically", async () => {
    const result = await growthRepository(client).appendRewardLedger(ledgerInput());

    expect(result).toEqual({
      status: "applied",
      entry: {
        id: ids.ownerLedger,
        rewardAccountId: ids.ownerRewardAccount,
        buyerUserId: ids.owner,
        kind: "order_earned_pending",
        sourceType: "provider_event",
        sourceId: "evt_private_provider_identifier",
        idempotencyKey: "reward-ledger-provider-event-0001",
        pendingPointsDelta: 250,
        availablePointsDelta: 0,
        pendingPointsBalanceAfter: 250,
        availablePointsBalanceAfter: 0,
        occurredAt: now.toISOString(),
      },
    });
    const rows = await client.query<{ pending: number; available: number; ledgerCount: number }>(`
      SELECT ra.pending_points AS pending, ra.available_points AS available,
             (SELECT count(*)::int FROM reward_ledger_entries) AS "ledgerCount"
      FROM reward_accounts ra WHERE ra.buyer_user_id = '${ids.owner}'
    `);
    expect(rows.rows).toEqual([{ pending: 250, available: 0, ledgerCount: 1 }]);
  });

  it("returns the prior immutable ledger result for an exact replay and fails closed on a conflicting replay", async () => {
    const repository = growthRepository(client);
    const first = await repository.appendRewardLedger(ledgerInput());
    const replay = await repository.appendRewardLedger(ledgerInput());

    expect(replay).toEqual({ ...first, status: "idempotent" });
    await expect(
      repository.appendRewardLedger(ledgerInput({ pendingPointsDelta: 251 })),
    ).rejects.toBeInstanceOf(GrowthPersistenceConflict);
    const counts = await client.query<{ accounts: number; ledger: number }>(`
      SELECT (SELECT count(*)::int FROM reward_accounts) AS accounts,
             (SELECT count(*)::int FROM reward_ledger_entries) AS ledger
    `);
    expect(counts.rows).toEqual([{ accounts: 1, ledger: 1 }]);
  });

  it.each([
    ["ledger append", /INSERT INTO reward_ledger_entries/i],
    ["balance projection", /UPDATE reward_accounts/i],
  ])("rolls back account creation when the %s fails", async (_label, failOn) => {
    await expect(growthRepository(client, failOn).appendRewardLedger(ledgerInput())).rejects.toThrow(
      "synthetic injected persistence failure",
    );
    const counts = await client.query<{ accounts: number; ledger: number }>(`
      SELECT (SELECT count(*)::int FROM reward_accounts) AS accounts,
             (SELECT count(*)::int FROM reward_ledger_entries) AS ledger
    `);
    expect(counts.rows).toEqual([{ accounts: 0, ledger: 0 }]);
  });

  it("returns only the requested blocked owner's deeply immutable redacted growth history", async () => {
    await seedCurrentPoliciesAndTerms(client);
    await seedOwnerPrivacyFixture(client);
    const transactionOptions: unknown[] = [];
    const statements: Readonly<{ sql: string; params: readonly unknown[] }>[] = [];
    const repository = createPostgresGrowthReadRepository((work, options) => {
      transactionOptions.push(options);
      return client.transaction((transaction) =>
        work({
          query: async <Row extends object>(sql: string, params: readonly unknown[] = []) => {
            statements.push({ sql: sql.replace(/\s+/gu, " ").trim(), params });
            const result = await transaction.query<Row>(sql, [...params]);
            return { rows: result.rows };
          },
        }),
      );
    });

    const snapshot = await repository.readOwnerSnapshot({ ownerUserId: ids.owner, now });

    expect(transactionOptions).toEqual([{ isolationLevel: "serializable", readOnly: true }]);
    expect(statements[0]?.sql).toMatch(/SET TRANSACTION READ ONLY/i);
    expect(snapshot).toEqual({
      rewards: expect.objectContaining({
        pendingPoints: 250,
        availablePoints: -50,
        usdEquivalentMinor: -50,
        minimumRedemptionProgress: { currentPoints: 0, requiredPoints: 500 },
        ledger: {
          items: [expect.objectContaining({ kind: "order_earned_pending" })],
          totalCount: 1,
          page: { limit: 50, offset: 0, hasMore: false },
        },
      }),
      referrals: expect.objectContaining({
        code: "ref_ABCDEFGHIJKLMNOP",
        counts: { attributed: 1, pending: 0, qualified: 1, reversed: 0 },
        rewardPointsTotal: 125,
        conversions: {
          items: [expect.objectContaining({ status: "qualified", rewardPoints: 125 })],
          totalCount: 1,
          page: { limit: 50, offset: 0, hasMore: false },
        },
      }),
      sharedSets: {
        items: [expect.objectContaining({
          code: "set_ABCDEFGHIJKLMNOP",
          label: "Owner neutral set",
          itemCount: 2,
        })],
        totalCount: 1,
        page: { limit: 50, offset: 0, hasMore: false },
      },
      affiliate: expect.objectContaining({
        publicCode: "aff_ABCDEFGHIJKLMNOP",
        attributedCount: 1,
        commissionTotalsMinor: { pending: 0, approved: 0, paid: 900, reversed: 0 },
        payoutTotalsMinor: { pending: 0, paid: 900 },
      }),
    });
    expectDeeplyFrozen(snapshot);

    const serialized = JSON.stringify(snapshot);
    for (const forbidden of [
      ids.otherOwner,
      ids.referred,
      ids.affiliateBuyer,
      "owner-private-email@example.test",
      "referred-private-clerk-id",
      "100 Private Address Sentinel",
      "PRIVATE PRODUCT LINE SENTINEL",
      "private-payment-provider",
      "private-provider-reference",
      "203.0.113.42",
      "raw-cookie-envelope-sentinel",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
    expect(serialized).not.toMatch(/email|clerk|address|productId|orderId|payment|provider|rawIp|cookie|envelope|referredUser/i);
    expect(serialized).not.toMatch(/idempotency|payloadHash|expectedUpdatedAt|appliedAt/i);
  });

  it("bounds each owner-history page in SQL while keeping aggregates independent", async () => {
    await seedCurrentPoliciesAndTerms(client);
    await seedOwnerPrivacyFixture(client);
    const statements: Readonly<{ sql: string; params: readonly unknown[] }>[] = [];
    const repository = createPostgresGrowthReadRepository((work) =>
      client.transaction((transaction) => work({
        query: async <Row extends object>(sql: string, params: readonly unknown[] = []) => {
          statements.push({ sql: sql.replace(/\s+/gu, " ").trim(), params });
          const result = await transaction.query<Row>(sql, [...params]);
          return { rows: result.rows };
        },
      })),
    );

    const snapshot = await repository.readOwnerSnapshot({
      ownerUserId: ids.owner,
      now,
      pages: {
        ledger: { limit: 1, offset: 1 },
        referralConversions: { limit: 1, offset: 1 },
        sharedSets: { limit: 1, offset: 1 },
      },
    });

    const ledgerPage = statements.find(({ sql }) => /SELECT le\.occurred_at AS/i.test(sql));
    const conversionPage = statements.find(({ sql }) => /SELECT rc\.id::text AS reference/i.test(sql));
    const sharedSetPage = statements.find(({ sql }) => /GROUP BY s\.id ORDER BY/i.test(sql));
    for (const statement of [ledgerPage, conversionPage, sharedSetPage]) {
      expect(statement?.sql).toMatch(/LIMIT \$2 OFFSET \$3/i);
      expect(statement?.params).toEqual([ids.owner, 1, 1]);
    }
    expect(snapshot.rewards?.ledger).toEqual({
      items: [], totalCount: 1, page: { limit: 1, offset: 1, hasMore: false },
    });
    expect(snapshot.referrals).toMatchObject({
      counts: { attributed: 1, pending: 0, qualified: 1, reversed: 0 },
      rewardPointsTotal: 125,
      conversions: { items: [], totalCount: 1, page: { limit: 1, offset: 1, hasMore: false } },
    });
    expect(snapshot.sharedSets).toEqual({
      items: [], totalCount: 1, page: { limit: 1, offset: 1, hasMore: false },
    });
    expectDeeplyFrozen(snapshot);
  });

  it.each([
    ["zero limit", { ledger: { limit: 0 } }],
    ["excessive limit", { referralConversions: { limit: 101 } }],
    ["negative offset", { sharedSets: { offset: -1 } }],
    ["unsafe limit", { ledger: { limit: Number.MAX_SAFE_INTEGER + 1 } }],
    ["unsafe offset", { referralConversions: { offset: Number.MAX_SAFE_INTEGER + 1 } }],
  ])("rejects an invalid owner-history page: %s", async (_label, pages) => {
    let transactions = 0;
    const repository = createPostgresGrowthReadRepository(async () => {
      transactions += 1;
      throw new Error("owner read should not start");
    });
    await expect(repository.readOwnerSnapshot({ ownerUserId: ids.owner, now, pages }))
      .rejects.toThrow(/invalid owner read page/i);
    expect(transactions).toBe(0);
  });

  it("reserves a redemption once and rejects the same key with a conflicting immutable payload", async () => {
    await seedCurrentPoliciesAndTerms(client);
    await seedOwnerPrivacyFixture(client);
    await client.exec(`
      INSERT INTO reward_accounts (id, buyer_user_id, pending_points, available_points)
      VALUES ('${ids.redemptionAccount}', '${ids.referred}', 0, 1000);
      INSERT INTO checkout_attempts
        (id, order_id, buyer_user_id, idempotency_key, request_hash, status,
         account_gate, attestation_gate, product_gate, destination_gate,
         inventory_gate, payment_provider_gate, permitted, review_required,
         tax_ready, shipping_ready)
      VALUES ('${ids.redemptionAttempt}', '${ids.ownerReferralOrder}', '${ids.referred}',
              'growth-redemption-attempt', '${"b".repeat(64)}', 'created',
              'pass', 'pass', 'pass', 'pass', 'pass', 'pass', false, false, false, false);
    `);
    const repository = growthRepository(client);
    const input = {
      id: ids.redemption,
      buyerUserId: ids.referred,
      orderId: ids.ownerReferralOrder,
      checkoutAttemptId: ids.redemptionAttempt,
      loyaltyPolicyId: ids.loyaltyPolicy,
      loyaltyPolicyVersion: 1,
      idempotencyKey: "reward-redemption-reservation-0001",
      points: 500,
      amountMinor: 500,
      currency: "USD" as const,
      reservedAt: now,
    };

    await expect(repository.reserveRewardRedemption(input)).resolves.toMatchObject({
      status: "applied",
      reservation: { id: ids.redemption, state: "reserved", points: 500 },
    });
    await expect(repository.reserveRewardRedemption(input)).resolves.toMatchObject({
      status: "idempotent",
      reservation: { id: ids.redemption, state: "reserved", points: 500 },
    });
    await expect(
      repository.reserveRewardRedemption({ ...input, points: 501 }),
    ).rejects.toBeInstanceOf(GrowthPersistenceConflict);
  });

  it("qualifies and reverses a referral conversion with exact replay and conflict checks", async () => {
    await seedCurrentPoliciesAndTerms(client);
    await seedOwnerPrivacyFixture(client);
    const repository = growthRepository(client);
    const qualification = {
      conversionId: ids.ownerReferralConversion,
      idempotencyKey: "owner-referral-conversion-key",
      qualifiedAt: now,
    };

    await expect(repository.qualifyReferralConversion(qualification)).resolves.toMatchObject({
      status: "idempotent",
      conversion: { status: "qualified", qualifiedAt: now.toISOString() },
    });
    await expect(
      repository.qualifyReferralConversion({
        ...qualification,
        qualifiedAt: new Date("2026-08-28T12:00:01.000Z"),
      }),
    ).rejects.toBeInstanceOf(GrowthPersistenceConflict);

    const reversal = {
      conversionId: ids.ownerReferralConversion,
      idempotencyKey: "owner-referral-conversion-key",
      reversedAt: new Date("2026-08-29T12:00:00.000Z"),
    };
    await expect(repository.reverseReferralConversion(reversal)).resolves.toMatchObject({
      status: "applied",
      conversion: { status: "reversed", reversedAt: reversal.reversedAt.toISOString() },
    });
    await expect(repository.reverseReferralConversion(reversal)).resolves.toMatchObject({
      status: "idempotent",
    });
    await expect(
      repository.reverseReferralConversion({
        ...reversal,
        reversedAt: new Date("2026-08-29T12:00:01.000Z"),
      }),
    ).rejects.toBeInstanceOf(GrowthPersistenceConflict);
  });

  it("updates and deactivates an owner set by fixed compare-and-swap versions", async () => {
    await seedCurrentPoliciesAndTerms(client);
    await seedOwnerPrivacyFixture(client);
    const repository = growthRepository(client);
    const replacement = {
      setId: ids.ownerSet,
      ownerUserId: ids.owner,
      idempotencyKey: "shared-set-replace-0001",
      expectedUpdatedAt: new Date("2026-08-28T10:00:00.000Z"),
      updatedAt: now,
      label: "Updated neutral set",
      items: [
        { productId: ids.productOne, quantity: 2 },
        { productId: ids.productTwo, quantity: 3 },
      ],
    };

    await expect(repository.replaceSharedResearchSet(replacement)).resolves.toEqual({
      status: "applied",
      set: {
        code: "set_ABCDEFGHIJKLMNOP",
        label: "Updated neutral set",
        active: true,
        itemCount: 2,
        updatedAt: now.toISOString(),
      },
    });
    await expect(repository.replaceSharedResearchSet(replacement)).resolves.toMatchObject({
      status: "idempotent",
    });
    await expect(repository.replaceSharedResearchSet({
      ...replacement,
      expectedUpdatedAt: new Date("2026-08-28T09:59:59.000Z"),
    })).rejects.toBeInstanceOf(GrowthPersistenceConflict);
    await expect(repository.replaceSharedResearchSet({
      ...replacement,
      idempotencyKey: "shared-set-replace-0002",
    })).rejects.toBeInstanceOf(GrowthPersistenceConflict);
    await expect(repository.deactivateSharedResearchSet({
      setId: ids.ownerSet,
      ownerUserId: ids.owner,
      idempotencyKey: replacement.idempotencyKey,
      expectedUpdatedAt: now,
      deactivatedAt: new Date("2026-08-29T12:00:00.000Z"),
    })).rejects.toBeInstanceOf(GrowthPersistenceConflict);
    await expect(repository.replaceSharedResearchSet({
      ...replacement,
      setId: ids.otherSet,
      ownerUserId: ids.otherOwner,
      label: "Other neutral set",
    })).rejects.toBeInstanceOf(GrowthPersistenceConflict);
    await expect(
      repository.replaceSharedResearchSet({ ...replacement, label: "Conflicting neutral set" }),
    ).rejects.toBeInstanceOf(GrowthPersistenceConflict);

    const deactivation = {
      setId: ids.ownerSet,
      ownerUserId: ids.owner,
      idempotencyKey: "shared-set-deactivate-0001",
      expectedUpdatedAt: now,
      deactivatedAt: new Date("2026-08-29T12:00:00.000Z"),
    };
    await expect(repository.deactivateSharedResearchSet(deactivation)).resolves.toMatchObject({
      status: "applied",
      set: { active: false, itemCount: 2 },
    });
    await expect(repository.deactivateSharedResearchSet(deactivation)).resolves.toMatchObject({
      status: "idempotent",
    });
    await expect(repository.deactivateSharedResearchSet({
      ...deactivation,
      expectedUpdatedAt: new Date("2026-08-28T11:59:59.000Z"),
    })).rejects.toBeInstanceOf(GrowthPersistenceConflict);
    await expect(
      repository.deactivateSharedResearchSet({
        ...deactivation,
        deactivatedAt: new Date("2026-08-29T12:00:01.000Z"),
      }),
    ).rejects.toBeInstanceOf(GrowthPersistenceConflict);
    const receipts = await client.query<{ kind: string; total: number }>(`
      SELECT kind, count(*)::int AS total
      FROM shared_research_set_mutations
      GROUP BY kind ORDER BY kind
    `);
    expect(receipts.rows).toEqual([
      { kind: "deactivate", total: 1 },
      { kind: "replace", total: 1 },
    ]);
    await expect(client.exec(`
      UPDATE shared_research_set_mutations SET payload_hash = '${"f".repeat(64)}'
      WHERE idempotency_key = 'shared-set-replace-0001'
    `)).rejects.toThrow(/immutable/i);
    await expect(client.exec(`
      DELETE FROM shared_research_set_mutations
      WHERE idempotency_key = 'shared-set-replace-0001'
    `)).rejects.toThrow(/immutable/i);
  });

  it("rolls back a shared-set CAS when its durable receipt append fails", async () => {
    await seedCurrentPoliciesAndTerms(client);
    await seedOwnerPrivacyFixture(client);
    const input = {
      setId: ids.ownerSet,
      ownerUserId: ids.owner,
      idempotencyKey: "shared-set-receipt-failure-0001",
      expectedUpdatedAt: new Date("2026-08-28T10:00:00.000Z"),
      updatedAt: now,
      label: "Should roll back",
      items: [
        { productId: ids.productOne, quantity: 4 },
        { productId: ids.productTwo, quantity: 5 },
      ],
    };
    await expect(growthRepository(client, /INSERT INTO shared_research_set_mutations/i)
      .replaceSharedResearchSet(input)).rejects.toThrow("synthetic injected persistence failure");
    const state = await client.query<{ label: string; updatedAt: Date | string; itemCount: number }>(`
      SELECT s.label, s.updated_at AS "updatedAt", count(i.product_id)::int AS "itemCount"
      FROM shared_research_sets s
      LEFT JOIN shared_research_set_items i ON i.shared_set_id = s.id
      WHERE s.id = '${ids.ownerSet}' GROUP BY s.id
    `);
    expect(state.rows.map((row) => ({ ...row, updatedAt: new Date(row.updatedAt).toISOString() })))
      .toEqual([{ label: "Owner neutral set", updatedAt: "2026-08-28T10:00:00.000Z", itemCount: 2 }]);
    const receipts = await client.query<{ total: number }>(
      `SELECT count(*)::int AS total FROM shared_research_set_mutations`,
    );
    expect(receipts.rows).toEqual([{ total: 0 }]);
  });

  it.each(["too-short", "x".repeat(201)])(
    "rejects a shared-set mutation idempotency key outside the bounded opaque contract",
    async (idempotencyKey) => {
      await seedCurrentPoliciesAndTerms(client);
      await seedOwnerPrivacyFixture(client);
      await expect(growthRepository(client).replaceSharedResearchSet({
        setId: ids.ownerSet,
        ownerUserId: ids.owner,
        idempotencyKey,
        expectedUpdatedAt: new Date("2026-08-28T10:00:00.000Z"),
        updatedAt: now,
        label: "Bounded key set",
        items: [
          { productId: ids.productOne, quantity: 2 },
          { productId: ids.productTwo, quantity: 3 },
        ],
      })).rejects.toBeInstanceOf(GrowthPersistenceConflict);
      const receipts = await client.query<{ total: number }>(
        `SELECT count(*)::int AS total FROM shared_research_set_mutations`,
      );
      expect(receipts.rows).toEqual([{ total: 0 }]);
    },
  );

  it("records an affiliate payout and marks it paid without exposing or swallowing conflicting payment evidence", async () => {
    await seedCurrentPoliciesAndTerms(client);
    await seedOwnerPrivacyFixture(client);
    await client.exec(`
      DELETE FROM affiliate_commissions WHERE id = '${ids.ownerCommission}';
      DELETE FROM affiliate_payouts WHERE id = '${ids.ownerPayout}';
      INSERT INTO affiliate_commissions
        (id, affiliate_profile_id, affiliate_attribution_id, buyer_user_id,
         order_id, affiliate_policy_id, affiliate_policy_version, idempotency_key,
         gross_commission_minor, reversed_commission_minor, status)
      VALUES ('${ids.ownerCommission}', '${ids.ownerAffiliateProfile}', '${ids.ownerAffiliateAttribution}', '${ids.affiliateBuyer}',
              '${ids.ownerAffiliateOrder}', '${ids.affiliatePolicy}', 1,
              'owner-commission-key', 900, 0, 'approved');
    `);
    const repository = growthRepository(client);
    const reservation = {
      payoutId: ids.payoutReplacement,
      affiliateProfileId: ids.ownerAffiliateProfile,
      affiliatePolicyId: ids.affiliatePolicy,
      affiliatePolicyVersion: 1,
      idempotencyKey: "owner-payout-replacement-key",
      amountMinor: 900,
      currency: "USD" as const,
      commissionIds: [ids.ownerCommission],
      createdAt: now,
    };
    await expect(repository.reserveAffiliatePayout(reservation)).resolves.toMatchObject({
      status: "applied",
      payout: { id: ids.payoutReplacement, state: "pending", amountMinor: 900 },
    });
    await expect(repository.reserveAffiliatePayout(reservation)).resolves.toMatchObject({
      status: "idempotent",
    });
    await expect(
      repository.reserveAffiliatePayout({ ...reservation, amountMinor: 901 }),
    ).rejects.toBeInstanceOf(GrowthPersistenceConflict);

    const paid = {
      payoutId: ids.payoutReplacement,
      idempotencyKey: "owner-payout-replacement-key",
      externalProvider: "synthetic-manual-provider",
      externalReference: "synthetic-private-reference",
      paidAt: new Date("2026-08-30T12:00:00.000Z"),
    };
    await expect(repository.markAffiliatePayoutPaid(paid)).resolves.toMatchObject({
      status: "applied",
      payout: { state: "paid", paidAt: paid.paidAt.toISOString() },
    });
    await expect(repository.markAffiliatePayoutPaid(paid)).resolves.toMatchObject({
      status: "idempotent",
    });
    await expect(
      repository.markAffiliatePayoutPaid({ ...paid, externalReference: "conflicting-reference" }),
    ).rejects.toBeInstanceOf(GrowthPersistenceConflict);
    const commission = await client.query<{ status: string; payoutId: string }>(`
      SELECT status, payout_id::text AS "payoutId" FROM affiliate_commissions
      WHERE id = '${ids.ownerCommission}'
    `);
    expect(commission.rows).toEqual([{ status: "paid", payoutId: ids.payoutReplacement }]);
  });

  it("records and reverses an affiliate commission with exact key and payload replay", async () => {
    await seedCurrentPoliciesAndTerms(client);
    await seedOwnerPrivacyFixture(client);
    await client.exec(`
      DELETE FROM affiliate_commissions WHERE id = '${ids.ownerCommission}';
      DELETE FROM affiliate_payouts WHERE id = '${ids.ownerPayout}';
    `);
    const repository = growthRepository(client);
    const commission = {
      id: ids.commissionReplacement,
      affiliateProfileId: ids.ownerAffiliateProfile,
      affiliateAttributionId: ids.ownerAffiliateAttribution,
      buyerUserId: ids.affiliateBuyer,
      orderId: ids.ownerAffiliateOrder,
      affiliatePolicyId: ids.affiliatePolicy,
      affiliatePolicyVersion: 1,
      idempotencyKey: "owner-commission-replacement-key",
      grossCommissionMinor: 900,
      createdAt: now,
    };
    await expect(repository.recordAffiliateCommission(commission)).resolves.toMatchObject({
      status: "applied",
      commission: { id: ids.commissionReplacement, status: "pending", grossCommissionMinor: 900 },
    });
    await expect(repository.recordAffiliateCommission(commission)).resolves.toMatchObject({
      status: "idempotent",
    });
    await expect(
      repository.recordAffiliateCommission({ ...commission, grossCommissionMinor: 901 }),
    ).rejects.toBeInstanceOf(GrowthPersistenceConflict);

    const reversal = {
      commissionId: ids.commissionReplacement,
      idempotencyKey: "owner-commission-replacement-key",
      reversedCommissionMinor: 400,
      reversedAt: new Date("2026-08-29T12:00:00.000Z"),
    };
    await expect(repository.reverseAffiliateCommission(reversal)).resolves.toMatchObject({
      status: "applied",
      commission: { status: "reversed", reversedCommissionMinor: 400 },
    });
    await expect(repository.reverseAffiliateCommission(reversal)).resolves.toMatchObject({
      status: "idempotent",
    });
    await expect(
      repository.reverseAffiliateCommission({ ...reversal, reversedCommissionMinor: 401 }),
    ).rejects.toBeInstanceOf(GrowthPersistenceConflict);
  });

  it.each([
    ["missing", "", "83000000-0000-4000-8000-000000000099"],
    [
      "future",
      `DROP TRIGGER growth_terms_versions_immutable_history ON growth_terms_versions;
       UPDATE growth_terms_versions SET effective_at = '2026-08-29T00:00:00.000Z'
       WHERE id = '${ids.affiliateTerms}'`,
      ids.affiliateTerms,
    ],
    [
      "superseded",
      `DROP TRIGGER growth_terms_versions_immutable_history ON growth_terms_versions;
       UPDATE growth_terms_versions SET superseded_at = '2026-08-28T11:59:59.000Z'
       WHERE id = '${ids.affiliateTerms}'`,
      ids.affiliateTerms,
    ],
    [
      "malformed",
      `DROP TRIGGER growth_terms_versions_immutable_history ON growth_terms_versions;
       ALTER TABLE growth_terms_versions DROP CONSTRAINT growth_terms_versions_text_nonblank;
       UPDATE growth_terms_versions SET terms_text = '   '
       WHERE id = '${ids.affiliateTerms}'`,
      ids.affiliateTerms,
    ],
    [
      "overlapping",
      `DROP TRIGGER growth_terms_versions_immutable_history ON growth_terms_versions;
       UPDATE growth_terms_versions SET superseded_at = '2026-08-29T00:00:00.000Z'
       WHERE id = '${ids.affiliateTerms}';
       INSERT INTO growth_terms_versions
         (id, program, version, content_hash, terms_text, effective_at)
       VALUES ('83000000-0000-4000-8000-000000000098', 'affiliate', 2,
               '${overlappingAffiliateTermsHash}', '${overlappingAffiliateTermsText}',
               '2026-08-28T00:00:00.000Z')`,
      ids.affiliateTerms,
    ],
  ])("writes no acceptance for a %s exact terms row", async (_label, mutation, termsVersionId) => {
    await seedCurrentPoliciesAndTerms(client);
    if (mutation) await client.exec(mutation);
    await expect(growthRepository(client).recordGrowthTermsAcceptance({
      id: ids.activationAcceptance,
      userId: ids.owner,
      program: "affiliate",
      termsVersionId,
      contentHash: affiliateTermsHash,
      acceptedAt: now,
    })).rejects.toBeInstanceOf(GrowthPersistenceConflict);
    const acceptances = await client.query<{ total: number }>(
      `SELECT count(*)::int AS total FROM growth_terms_acceptances`,
    );
    expect(acceptances.rows).toEqual([{ total: 0 }]);
  });

  it("writes no acceptance when the caller hash differs from the server-computed terms hash", async () => {
    await seedCurrentPoliciesAndTerms(client);
    await expect(growthRepository(client).recordGrowthTermsAcceptance({
      id: ids.activationAcceptance,
      userId: ids.owner,
      program: "affiliate",
      termsVersionId: ids.affiliateTerms,
      contentHash: customerTermsHash,
      acceptedAt: now,
    })).rejects.toBeInstanceOf(GrowthPersistenceConflict);
    const acceptances = await client.query<{ total: number }>(
      `SELECT count(*)::int AS total FROM growth_terms_acceptances`,
    );
    expect(acceptances.rows).toEqual([{ total: 0 }]);
  });

  it("recomputes the stored terms text hash before accepting even when caller and stored hashes agree", async () => {
    await seedCurrentPoliciesAndTerms(client);
    const corruptHash = "f".repeat(64);
    await client.exec(`
      DROP TRIGGER growth_terms_versions_immutable_history ON growth_terms_versions;
      UPDATE growth_terms_versions SET content_hash = '${corruptHash}'
      WHERE id = '${ids.affiliateTerms}'
    `);
    await expect(growthRepository(client).recordGrowthTermsAcceptance({
      id: ids.activationAcceptance,
      userId: ids.owner,
      program: "affiliate",
      termsVersionId: ids.affiliateTerms,
      contentHash: corruptHash,
      acceptedAt: now,
    })).rejects.toBeInstanceOf(GrowthPersistenceConflict);
    const acceptances = await client.query<{ total: number }>(
      `SELECT count(*)::int AS total FROM growth_terms_acceptances`,
    );
    expect(acceptances.rows).toEqual([{ total: 0 }]);
  });

  it("re-verifies the immutable exact terms row before returning an acceptance replay", async () => {
    await seedCurrentPoliciesAndTerms(client);
    const repository = growthRepository(client);
    const acceptance = {
      id: ids.activationAcceptance,
      userId: ids.owner,
      program: "affiliate" as const,
      termsVersionId: ids.affiliateTerms,
      contentHash: affiliateTermsHash,
      acceptedAt: now,
    };
    await expect(repository.recordGrowthTermsAcceptance(acceptance)).resolves.toMatchObject({
      status: "applied",
    });
    await client.exec(`
      DROP TRIGGER growth_terms_versions_immutable_history ON growth_terms_versions;
      UPDATE growth_terms_versions SET terms_text = 'Corrupted synthetic terms text'
      WHERE id = '${ids.affiliateTerms}'
    `);
    await expect(repository.recordGrowthTermsAcceptance(acceptance))
      .rejects.toBeInstanceOf(GrowthPersistenceConflict);
    const acceptances = await client.query<{ total: number }>(
      `SELECT count(*)::int AS total FROM growth_terms_acceptances`,
    );
    expect(acceptances.rows).toEqual([{ total: 1 }]);
  });

  it("allows a revoked owner code to be replaced while preserving revoked id and code collisions", async () => {
    await client.exec(`
      INSERT INTO referral_codes
        (id, owner_user_id, code, status, created_at, revoked_at)
      VALUES
        ('${ids.revokedReferralCode}', '${ids.owner}', 'ref_RevokedCode00001', 'revoked',
         '2026-08-27T10:00:00.000Z', '2026-08-27T11:00:00.000Z')
    `);
    const repository = growthRepository(client);
    await expect(repository.recordReferralCode({
      id: ids.replacementReferralCode,
      ownerUserId: ids.owner,
      code: "ref_Replacement00001",
      createdAt: now,
    })).resolves.toMatchObject({ status: "applied", referralCode: { status: "active" } });
    await expect(repository.recordReferralCode({
      id: ids.revokedReferralCode,
      ownerUserId: ids.otherOwner,
      code: "ref_FreshCodeValue001",
      createdAt: now,
    })).rejects.toBeInstanceOf(GrowthPersistenceConflict);
    await expect(repository.recordReferralCode({
      id: "83000000-0000-4000-8000-000000000057",
      ownerUserId: ids.otherOwner,
      code: "ref_RevokedCode00001",
      createdAt: now,
    })).rejects.toBeInstanceOf(GrowthPersistenceConflict);
    const rows = await client.query<{ code: string; status: string }>(`
      SELECT code, status FROM referral_codes WHERE owner_user_id = '${ids.owner}' ORDER BY code
    `);
    expect(rows.rows).toEqual([
      { code: "ref_Replacement00001", status: "active" },
      { code: "ref_RevokedCode00001", status: "revoked" },
    ]);
  });

  it("persists exact terms acceptance, referral code, shared set, and affiliate profile facts without service orchestration", async () => {
    await seedCurrentPoliciesAndTerms(client);
    await client.exec(`
      INSERT INTO product_policy_groups (id, slug, name)
      VALUES ('${ids.productGroup}', 'activation-group', 'Activation group');
      INSERT INTO products (id, slug, name, package_form, material_identity, policy_group_id, status) VALUES
        ('${ids.productOne}', 'activation-product-one', 'Activation product one', 'sealed unit', 'Synthetic identity', '${ids.productGroup}', 'active'),
        ('${ids.productTwo}', 'activation-product-two', 'Activation product two', 'sealed unit', 'Synthetic identity', '${ids.productGroup}', 'active');
    `);
    const repository = growthRepository(client);
    const acceptance = {
      id: ids.activationAcceptance,
      userId: ids.owner,
      program: "affiliate" as const,
      termsVersionId: ids.affiliateTerms,
      contentHash: affiliateTermsHash,
      acceptedAt: now,
    };
    await expect(repository.recordGrowthTermsAcceptance(acceptance)).resolves.toMatchObject({ status: "applied" });
    await expect(repository.recordGrowthTermsAcceptance(acceptance)).resolves.toMatchObject({ status: "idempotent" });
    await expect(
      repository.recordGrowthTermsAcceptance({ ...acceptance, contentHash: customerTermsHash }),
    ).rejects.toBeInstanceOf(GrowthPersistenceConflict);

    const code = {
      id: ids.activationReferralCode,
      ownerUserId: ids.owner,
      code: "ref_ActivationCode01",
      createdAt: now,
    };
    await expect(repository.recordReferralCode(code)).resolves.toMatchObject({ status: "applied" });
    await expect(repository.recordReferralCode(code)).resolves.toMatchObject({ status: "idempotent" });
    await expect(repository.recordReferralCode({ ...code, code: "ref_ActivationCode02" }))
      .rejects.toBeInstanceOf(GrowthPersistenceConflict);

    const set = {
      id: ids.activationSet,
      ownerUserId: ids.owner,
      publicCode: "set_ActivationCode01",
      label: "Activation neutral set",
      items: [
        { productId: ids.productOne, quantity: 1 },
        { productId: ids.productTwo, quantity: 2 },
      ],
      createdAt: now,
    };
    await expect(repository.createSharedResearchSet(set)).resolves.toMatchObject({ status: "applied" });
    await expect(repository.createSharedResearchSet(set)).resolves.toMatchObject({ status: "idempotent" });
    await expect(repository.createSharedResearchSet({ ...set, label: "Conflicting set" }))
      .rejects.toBeInstanceOf(GrowthPersistenceConflict);

    const profile = {
      id: ids.activationAffiliateProfile,
      userId: ids.owner,
      publicCode: "aff_ActivationCode01",
      publicChannel: "https://example.test/owner-research",
      promotionMethod: "website" as const,
      termsAcceptanceId: ids.activationAcceptance,
      createdAt: now,
    };
    await expect(repository.recordAffiliateProfile(profile)).resolves.toMatchObject({ status: "applied" });
    await expect(repository.recordAffiliateProfile(profile)).resolves.toMatchObject({ status: "idempotent" });
    await expect(repository.recordAffiliateProfile({ ...profile, publicChannel: "https://example.test/conflict" }))
      .rejects.toBeInstanceOf(GrowthPersistenceConflict);
  });
});

async function seedOwnerPrivacyFixture(client: PGlite): Promise<void> {
  await client.exec(`
    INSERT INTO buyer_profiles (user_id, status) VALUES
      ('${ids.owner}', 'blocked'), ('${ids.otherOwner}', 'blocked');
    INSERT INTO attestation_versions (id, version, content_hash, policy_text, effective_at)
    VALUES ('${ids.attestation}', 1, '${"a".repeat(64)}', 'Synthetic attestation', '2026-08-27T00:00:00.000Z');
    INSERT INTO attestation_acceptances (id, user_id, attestation_version_id, accepted_at) VALUES
      ('${ids.referredAcceptance}', '${ids.referred}', '${ids.attestation}', '${now.toISOString()}'),
      ('${ids.otherReferredAcceptance}', '${ids.otherReferred}', '${ids.attestation}', '${now.toISOString()}'),
      ('${ids.affiliateBuyerAcceptance}', '${ids.affiliateBuyer}', '${ids.attestation}', '${now.toISOString()}'),
      ('${ids.otherAffiliateBuyerAcceptance}', '${ids.otherAffiliateBuyer}', '${ids.attestation}', '${now.toISOString()}');
    INSERT INTO orders
      (id, buyer_user_id, buyer_status_snapshot, attestation_acceptance_id,
       destination_state_code, currency, subtotal_minor, discount_minor,
       tax_minor, shipping_minor, total_minor, state)
    VALUES
      ('${ids.ownerReferralOrder}', '${ids.referred}', 'active', '${ids.referredAcceptance}', 'CA', 'USD', 1000, 0, 0, 0, 1000, 'draft'),
      ('${ids.otherReferralOrder}', '${ids.otherReferred}', 'active', '${ids.otherReferredAcceptance}', 'CA', 'USD', 1000, 0, 0, 0, 1000, 'draft'),
      ('${ids.ownerAffiliateOrder}', '${ids.affiliateBuyer}', 'active', '${ids.affiliateBuyerAcceptance}', 'CA', 'USD', 9000, 0, 0, 0, 9000, 'draft'),
      ('${ids.otherAffiliateOrder}', '${ids.otherAffiliateBuyer}', 'active', '${ids.otherAffiliateBuyerAcceptance}', 'CA', 'USD', 9000, 0, 0, 0, 9000, 'draft');
    INSERT INTO order_shipping_addresses
      (order_id, recipient_name, address_line1, city, state_code, postal_code, country)
    VALUES ('${ids.ownerReferralOrder}', 'Private Recipient Sentinel',
            '100 Private Address Sentinel', 'Private City', 'CA', '90210', 'US');

    INSERT INTO reward_accounts (id, buyer_user_id, pending_points, available_points) VALUES
      ('${ids.ownerRewardAccount}', '${ids.owner}', 250, -50),
      ('${ids.otherRewardAccount}', '${ids.otherOwner}', 9999, 9999);
    INSERT INTO reward_ledger_entries
      (id, reward_account_id, buyer_user_id, kind, source_type, source_id,
       idempotency_key, pending_points_delta, available_points_delta,
       pending_points_balance_after, available_points_balance_after, occurred_at)
    VALUES
      ('${ids.ownerLedger}', '${ids.ownerRewardAccount}', '${ids.owner}',
       'order_earned_pending', 'provider_event', 'private-payment-provider',
       'owner-ledger-privacy-key', 250, 0, 250, -50, '${now.toISOString()}'),
      ('${ids.otherLedger}', '${ids.otherRewardAccount}', '${ids.otherOwner}',
       'admin_adjustment', 'raw_cookie', 'raw-cookie-envelope-sentinel',
       'other-ledger-privacy-key', 0, 9999, 9999, 9999, '${now.toISOString()}');

    INSERT INTO referral_codes (id, owner_user_id, code) VALUES
      ('${ids.ownerReferralCode}', '${ids.owner}', 'ref_ABCDEFGHIJKLMNOP'),
      ('${ids.otherReferralCode}', '${ids.otherOwner}', 'ref_QRSTUVWXYZabcdef');
    INSERT INTO referral_attributions
      (id, referral_code_id, referrer_user_id, referred_user_id,
       referral_policy_id, referral_policy_version, clicked_at, expires_at, bound_at)
    VALUES
      ('${ids.ownerReferralAttribution}', '${ids.ownerReferralCode}', '${ids.owner}', '${ids.referred}', '${ids.referralPolicy}', 1,
       '2026-08-27T00:00:00.000Z', '2026-09-26T00:00:00.000Z', '${now.toISOString()}'),
      ('${ids.otherReferralAttribution}', '${ids.otherReferralCode}', '${ids.otherOwner}', '${ids.otherReferred}', '${ids.referralPolicy}', 1,
       '2026-08-27T00:00:00.000Z', '2026-09-26T00:00:00.000Z', '${now.toISOString()}');
    INSERT INTO order_growth_attributions
      (order_id, buyer_user_id, program, referral_attribution_id, referral_policy_id, referral_policy_version)
    VALUES
      ('${ids.ownerReferralOrder}', '${ids.referred}', 'customer_referral', '${ids.ownerReferralAttribution}', '${ids.referralPolicy}', 1),
      ('${ids.otherReferralOrder}', '${ids.otherReferred}', 'customer_referral', '${ids.otherReferralAttribution}', '${ids.referralPolicy}', 1);
    INSERT INTO referral_conversions
      (id, referral_attribution_id, referred_user_id, first_order_id,
       referral_policy_id, referral_policy_version, idempotency_key,
       referred_discount_minor, referrer_reward_points, status, qualified_at)
    VALUES
      ('${ids.ownerReferralConversion}', '${ids.ownerReferralAttribution}', '${ids.referred}', '${ids.ownerReferralOrder}',
       '${ids.referralPolicy}', 1, 'owner-referral-conversion-key', 100, 125, 'qualified', '${now.toISOString()}'),
      ('${ids.otherReferralConversion}', '${ids.otherReferralAttribution}', '${ids.otherReferred}', '${ids.otherReferralOrder}',
       '${ids.referralPolicy}', 1, 'other-referral-conversion-key', 100, 9999, 'qualified', '${now.toISOString()}');

    INSERT INTO growth_terms_acceptances (id, user_id, program, terms_version_id, content_hash) VALUES
      ('${ids.ownerAffiliateAcceptance}', '${ids.owner}', 'affiliate', '${ids.affiliateTerms}', '${affiliateTermsHash}'),
      ('${ids.otherAffiliateAcceptance}', '${ids.otherOwner}', 'affiliate', '${ids.affiliateTerms}', '${affiliateTermsHash}');
    INSERT INTO affiliate_profiles
      (id, user_id, public_code, status, public_channel, promotion_method, terms_acceptance_id)
    VALUES
      ('${ids.ownerAffiliateProfile}', '${ids.owner}', 'aff_ABCDEFGHIJKLMNOP', 'active', 'https://owner.example.test', 'website', '${ids.ownerAffiliateAcceptance}'),
      ('${ids.otherAffiliateProfile}', '${ids.otherOwner}', 'aff_QRSTUVWXYZabcdef', 'active', 'https://other.example.test', 'social', '${ids.otherAffiliateAcceptance}');
    INSERT INTO affiliate_attributions
      (id, affiliate_profile_id, affiliate_user_id, referred_user_id,
       affiliate_policy_id, affiliate_policy_version, clicked_at, expires_at, bound_at)
    VALUES
      ('${ids.ownerAffiliateAttribution}', '${ids.ownerAffiliateProfile}', '${ids.owner}', '${ids.affiliateBuyer}', '${ids.affiliatePolicy}', 1,
       '2026-08-27T00:00:00.000Z', '2026-09-26T00:00:00.000Z', '${now.toISOString()}'),
      ('${ids.otherAffiliateAttribution}', '${ids.otherAffiliateProfile}', '${ids.otherOwner}', '${ids.otherAffiliateBuyer}', '${ids.affiliatePolicy}', 1,
       '2026-08-27T00:00:00.000Z', '2026-09-26T00:00:00.000Z', '${now.toISOString()}');
    INSERT INTO order_growth_attributions
      (order_id, buyer_user_id, program, affiliate_attribution_id, affiliate_policy_id, affiliate_policy_version)
    VALUES
      ('${ids.ownerAffiliateOrder}', '${ids.affiliateBuyer}', 'affiliate', '${ids.ownerAffiliateAttribution}', '${ids.affiliatePolicy}', 1),
      ('${ids.otherAffiliateOrder}', '${ids.otherAffiliateBuyer}', 'affiliate', '${ids.otherAffiliateAttribution}', '${ids.affiliatePolicy}', 1);
    INSERT INTO affiliate_payouts
      (id, affiliate_profile_id, affiliate_policy_id, affiliate_policy_version,
       idempotency_key, amount_minor, currency, state, external_provider,
       external_reference, paid_at)
    VALUES
      ('${ids.ownerPayout}', '${ids.ownerAffiliateProfile}', '${ids.affiliatePolicy}', 1,
       'owner-payout-key', 900, 'USD', 'paid', 'private-payment-provider',
       'private-provider-reference', '${now.toISOString()}'),
      ('${ids.otherPayout}', '${ids.otherAffiliateProfile}', '${ids.affiliatePolicy}', 1,
       'other-payout-key', 9999, 'USD', 'paid', 'other-private-provider',
       'other-private-reference', '${now.toISOString()}');
    INSERT INTO affiliate_commissions
      (id, affiliate_profile_id, affiliate_attribution_id, buyer_user_id,
       order_id, affiliate_policy_id, affiliate_policy_version, idempotency_key,
       gross_commission_minor, reversed_commission_minor, status, payout_id)
    VALUES
      ('${ids.ownerCommission}', '${ids.ownerAffiliateProfile}', '${ids.ownerAffiliateAttribution}', '${ids.affiliateBuyer}',
       '${ids.ownerAffiliateOrder}', '${ids.affiliatePolicy}', 1, 'owner-commission-key', 900, 0, 'paid', '${ids.ownerPayout}'),
      ('${ids.otherCommission}', '${ids.otherAffiliateProfile}', '${ids.otherAffiliateAttribution}', '${ids.otherAffiliateBuyer}',
       '${ids.otherAffiliateOrder}', '${ids.affiliatePolicy}', 1, 'other-commission-key', 9999, 0, 'paid', '${ids.otherPayout}');

    INSERT INTO product_policy_groups (id, slug, name)
    VALUES ('${ids.productGroup}', 'privacy-group', 'Privacy group');
    INSERT INTO products (id, slug, name, package_form, material_identity, policy_group_id, status) VALUES
      ('${ids.productOne}', 'private-product-one', 'PRIVATE PRODUCT LINE SENTINEL', 'sealed unit', 'Synthetic identity', '${ids.productGroup}', 'active'),
      ('${ids.productTwo}', 'private-product-two', 'Other private line', 'sealed unit', 'Synthetic identity', '${ids.productGroup}', 'active');
    INSERT INTO shared_research_sets
      (id, owner_user_id, public_code, label, created_at, updated_at) VALUES
      ('${ids.ownerSet}', '${ids.owner}', 'set_ABCDEFGHIJKLMNOP', 'Owner neutral set',
       '2026-08-28T10:00:00.000Z', '2026-08-28T10:00:00.000Z'),
      ('${ids.otherSet}', '${ids.otherOwner}', 'set_QRSTUVWXYZabcdef', 'Other neutral set',
       '2026-08-28T10:00:00.000Z', '2026-08-28T10:00:00.000Z');
    INSERT INTO shared_research_set_items (shared_set_id, product_id, quantity) VALUES
      ('${ids.ownerSet}', '${ids.productOne}', 1), ('${ids.ownerSet}', '${ids.productTwo}', 2),
      ('${ids.otherSet}', '${ids.productOne}', 25), ('${ids.otherSet}', '${ids.productTwo}', 25);
  `);
}
