import type { PGlite } from "@electric-sql/pglite";
import { afterEach, describe, expect, it } from "vitest";

import { createMigratedPglite } from "./helpers/pglite";

const ids = {
  referrer: "82000000-0000-4000-8000-000000000001",
  referred: "82000000-0000-4000-8000-000000000002",
  affiliate: "82000000-0000-4000-8000-000000000003",
  affiliateBuyer: "82000000-0000-4000-8000-000000000004",
  attestation: "82000000-0000-4000-8000-000000000005",
  referredAcceptance: "82000000-0000-4000-8000-000000000006",
  affiliateBuyerAcceptance: "82000000-0000-4000-8000-000000000007",
  group: "82000000-0000-4000-8000-000000000008",
  product1: "82000000-0000-4000-8000-000000000009",
  product2: "82000000-0000-4000-8000-000000000010",
  referredOrder: "82000000-0000-4000-8000-000000000011",
  affiliateOrder: "82000000-0000-4000-8000-000000000012",
  referredAttempt: "82000000-0000-4000-8000-000000000013",
  affiliateAttempt: "82000000-0000-4000-8000-000000000014",
  loyaltyPolicy: "82000000-0000-4000-8000-000000000015",
  referralPolicy: "82000000-0000-4000-8000-000000000016",
  affiliatePolicy: "82000000-0000-4000-8000-000000000017",
  customerTerms: "82000000-0000-4000-8000-000000000018",
  affiliateTerms: "82000000-0000-4000-8000-000000000019",
  customerTermsAcceptance: "82000000-0000-4000-8000-000000000020",
  affiliateTermsAcceptance: "82000000-0000-4000-8000-000000000021",
  rewardAccount: "82000000-0000-4000-8000-000000000022",
  rewardLedger: "82000000-0000-4000-8000-000000000023",
  referralCode: "82000000-0000-4000-8000-000000000024",
  referralAttribution: "82000000-0000-4000-8000-000000000025",
  referralConversion: "82000000-0000-4000-8000-000000000026",
  affiliateProfile: "82000000-0000-4000-8000-000000000027",
  affiliateAttribution: "82000000-0000-4000-8000-000000000028",
  affiliatePayout: "82000000-0000-4000-8000-000000000029",
  affiliateCommission: "82000000-0000-4000-8000-000000000030",
  sharedSet: "82000000-0000-4000-8000-000000000031",
  alternateReferralPolicy: "82000000-0000-4000-8000-000000000032",
  alternateAffiliatePolicy: "82000000-0000-4000-8000-000000000033",
  alternateReferralAttribution: "82000000-0000-4000-8000-000000000034",
  alternateAffiliateAttribution: "82000000-0000-4000-8000-000000000035",
  alternateAffiliatePayout: "82000000-0000-4000-8000-000000000036",
  crossProgramReferralConversion: "82000000-0000-4000-8000-000000000037",
  crossProgramAffiliateCommission: "82000000-0000-4000-8000-000000000038",
  alternateReferredOrder: "82000000-0000-4000-8000-000000000039",
} as const;

const hashA = "a".repeat(64);
const hashB = "b".repeat(64);

async function expectRejected(client: PGlite, statement: string): Promise<void> {
  await expect(client.exec(statement)).rejects.toThrow();
}

async function insertCoreFixture(client: PGlite): Promise<void> {
  await client.exec(`
    INSERT INTO users (id, clerk_id, email_verified_at)
    VALUES
      ('${ids.referrer}', 'growth-referrer', now()),
      ('${ids.referred}', 'growth-referred', now()),
      ('${ids.affiliate}', 'growth-affiliate', now()),
      ('${ids.affiliateBuyer}', 'growth-affiliate-buyer', now());
    INSERT INTO attestation_versions
      (id, version, content_hash, policy_text, effective_at)
    VALUES
      ('${ids.attestation}', 1, '${hashA}', 'Synthetic growth attestation', now());
    INSERT INTO attestation_acceptances
      (id, user_id, attestation_version_id, accepted_at)
    VALUES
      ('${ids.referredAcceptance}', '${ids.referred}', '${ids.attestation}', now()),
      ('${ids.affiliateBuyerAcceptance}', '${ids.affiliateBuyer}', '${ids.attestation}', now());
    INSERT INTO product_policy_groups (id, slug, name)
    VALUES ('${ids.group}', 'growth-test-group', 'Growth test group');
    INSERT INTO products
      (id, slug, name, package_form, material_identity, policy_group_id, status)
    VALUES
      ('${ids.product1}', 'growth-product-one', 'Growth product one',
       'sealed unit', 'Synthetic identity one', '${ids.group}', 'active'),
      ('${ids.product2}', 'growth-product-two', 'Growth product two',
       'sealed unit', 'Synthetic identity two', '${ids.group}', 'active');
    INSERT INTO orders
      (id, buyer_user_id, buyer_status_snapshot, attestation_acceptance_id,
       destination_state_code, currency, subtotal_minor, discount_minor,
       tax_minor, shipping_minor, total_minor, state)
    VALUES
      ('${ids.referredOrder}', '${ids.referred}', 'active',
       '${ids.referredAcceptance}', 'CA', 'USD', 1000, 0, 0, 0, 1000, 'draft'),
      ('${ids.affiliateOrder}', '${ids.affiliateBuyer}', 'active',
       '${ids.affiliateBuyerAcceptance}', 'CA', 'USD', 1000, 0, 0, 0, 1000, 'draft');
    INSERT INTO checkout_attempts
      (id, order_id, buyer_user_id, idempotency_key, request_hash, status,
       account_gate, attestation_gate, product_gate, destination_gate,
       inventory_gate, payment_provider_gate, permitted, review_required,
       tax_ready, shipping_ready)
    VALUES
      ('${ids.referredAttempt}', '${ids.referredOrder}', '${ids.referred}',
       'growth-referred-attempt', '${hashA}', 'created', 'blocked', 'pass',
       'pass', 'pass', 'pass', 'pass', false, false, false, false),
      ('${ids.affiliateAttempt}', '${ids.affiliateOrder}', '${ids.affiliateBuyer}',
       'growth-affiliate-attempt', '${hashB}', 'created', 'blocked', 'pass',
       'pass', 'pass', 'pass', 'pass', false, false, false, false);
  `);
}

async function insertPolicies(client: PGlite): Promise<void> {
  await client.exec(`
    INSERT INTO loyalty_policies
      (id, version, status, points_per_dollar, redemption_minor_per_point,
       minimum_redemption_points, maximum_redemption_basis_points,
       expires_after_days, effective_at)
    VALUES
      ('${ids.loyaltyPolicy}', 1, 'active', 2, 1, 500, 2500, null,
       '2026-08-27T00:00:00Z');
    INSERT INTO referral_policies
      (id, version, status, attribution_days, referred_discount_basis_points,
       referred_discount_cap_minor, referrer_points_per_dollar,
       referrer_reward_cap_points, effective_at)
    VALUES
      ('${ids.referralPolicy}', 1, 'active', 30, 1000, 2500, 5, 2500,
       '2026-08-27T00:00:00Z');
    INSERT INTO affiliate_policies
      (id, version, status, attribution_days,
       first_order_commission_basis_points, reorder_commission_basis_points,
       reorder_window_days, approval_delay_days, payout_threshold_minor,
       currency, effective_at)
    VALUES
      ('${ids.affiliatePolicy}', 1, 'active', 30, 1000, 500, 180, 30,
       5000, 'USD', '2026-08-27T00:00:00Z');
  `);
}

async function insertTerms(client: PGlite): Promise<void> {
  await client.exec(`
    INSERT INTO growth_terms_versions
      (id, program, version, content_hash, terms_text, effective_at)
    VALUES
      ('${ids.customerTerms}', 'customer_rewards_referrals', 1, '${hashA}',
       'Synthetic customer growth terms', '2026-08-27T00:00:00Z'),
      ('${ids.affiliateTerms}', 'affiliate', 1, '${hashB}',
       'Synthetic affiliate growth terms', '2026-08-27T00:00:00Z');
  `);
}

async function insertAffiliateProfileAndAttribution(client: PGlite): Promise<void> {
  await client.exec(`
    INSERT INTO growth_terms_acceptances
      (id, user_id, program, terms_version_id, content_hash)
    VALUES
      ('${ids.affiliateTermsAcceptance}', '${ids.affiliate}', 'affiliate',
       '${ids.affiliateTerms}', '${hashB}');
    INSERT INTO affiliate_profiles
      (id, user_id, public_code, status, public_channel, promotion_method,
       terms_acceptance_id, terms_program)
    VALUES
      ('${ids.affiliateProfile}', '${ids.affiliate}',
       'aff_ABCDEFGHIJKLMNOP', 'active', 'https://example.test/research',
       'website', '${ids.affiliateTermsAcceptance}', 'affiliate');
    INSERT INTO affiliate_attributions
      (id, affiliate_profile_id, affiliate_user_id, referred_user_id,
       affiliate_policy_id, affiliate_policy_version, clicked_at, expires_at,
       bound_at)
    VALUES
      ('${ids.affiliateAttribution}', '${ids.affiliateProfile}',
       '${ids.affiliate}', '${ids.affiliateBuyer}', '${ids.affiliatePolicy}', 1,
       '2026-08-27T00:00:00Z', '2026-09-26T00:00:00Z',
       '2026-08-28T00:00:00Z');
  `);
}

describe("growth database schema", () => {
  let client: PGlite | undefined;

  afterEach(async () => {
    await client?.close();
    client = undefined;
  });

  it("creates every growth table without seeding or activating production policy rows", async () => {
    client = await createMigratedPglite();
    const tables = await client.query<{ table_name: string }>(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN (
          'loyalty_policies', 'referral_policies', 'affiliate_policies',
          'growth_terms_versions', 'growth_terms_acceptances',
          'reward_accounts', 'reward_ledger_entries', 'reward_redemptions',
          'referral_codes', 'referral_attributions', 'referral_conversions',
          'affiliate_profiles', 'affiliate_attributions',
          'affiliate_commissions', 'affiliate_payouts',
          'shared_research_sets', 'shared_research_set_items',
          'order_growth_attributions'
        )
      ORDER BY table_name
    `);
    expect(tables.rows.map(({ table_name }) => table_name)).toEqual([
      "affiliate_attributions",
      "affiliate_commissions",
      "affiliate_payouts",
      "affiliate_policies",
      "affiliate_profiles",
      "growth_terms_acceptances",
      "growth_terms_versions",
      "loyalty_policies",
      "order_growth_attributions",
      "referral_attributions",
      "referral_codes",
      "referral_conversions",
      "referral_policies",
      "reward_accounts",
      "reward_ledger_entries",
      "reward_redemptions",
      "shared_research_set_items",
      "shared_research_sets",
    ]);

    const counts = await client.query<{ total: number }>(`
      SELECT
        (SELECT count(*) FROM loyalty_policies)
        + (SELECT count(*) FROM referral_policies)
        + (SELECT count(*) FROM affiliate_policies)
        + (SELECT count(*) FROM growth_terms_versions) AS total
    `);
    expect(Number(counts.rows[0]?.total)).toBe(0);
  });

  it("binds each settlement to the exact program-specific order growth key", async () => {
    client = await createMigratedPglite();
    const constraints = await client.query<{
      constraint_name: string;
      definition: string;
    }>(`
      SELECT conname AS constraint_name, pg_get_constraintdef(oid) AS definition
      FROM pg_constraint
      WHERE conname IN (
        'referral_conversions_order_growth_fk',
        'affiliate_commissions_order_growth_fk'
      )
      ORDER BY conname
    `);

    expect(constraints.rows).toHaveLength(2);
    expect(constraints.rows[0]?.constraint_name).toBe(
      "affiliate_commissions_order_growth_fk",
    );
    expect(constraints.rows[0]?.definition.replaceAll('"', "")).toContain(
      "FOREIGN KEY (order_id, buyer_user_id, program, affiliate_attribution_id, affiliate_policy_id, affiliate_policy_version) REFERENCES order_growth_attributions(order_id, buyer_user_id, program, affiliate_attribution_id, affiliate_policy_id, affiliate_policy_version) ON DELETE RESTRICT",
    );
    expect(constraints.rows[1]?.constraint_name).toBe(
      "referral_conversions_order_growth_fk",
    );
    expect(constraints.rows[1]?.definition.replaceAll('"', "")).toContain(
      "FOREIGN KEY (first_order_id, referred_user_id, program, referral_attribution_id, referral_policy_id, referral_policy_version) REFERENCES order_growth_attributions(order_id, buyer_user_id, program, referral_attribution_id, referral_policy_id, referral_policy_version) ON DELETE RESTRICT",
    );

    const programs = await client.query<{
      table_name: string;
      column_default: string | null;
    }>(`
      SELECT table_name, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND column_name = 'program'
        AND table_name IN ('referral_conversions', 'affiliate_commissions')
      ORDER BY table_name
    `);
    expect(programs.rows).toHaveLength(2);
    expect(programs.rows[0]?.table_name).toBe("affiliate_commissions");
    expect(programs.rows[0]?.column_default).toContain("affiliate");
    expect(programs.rows[1]?.table_name).toBe("referral_conversions");
    expect(programs.rows[1]?.column_default).toContain("customer_referral");
  });

  it("enforces positive immutable policy versions and one current active row per program", async () => {
    client = await createMigratedPglite();
    await insertPolicies(client);

    await expectRejected(
      client,
      `INSERT INTO loyalty_policies
        (version, status, points_per_dollar, redemption_minor_per_point,
         minimum_redemption_points, maximum_redemption_basis_points,
         effective_at)
       VALUES (2, 'active', 2, 1, 500, 2500, now())`,
    );
    await expectRejected(
      client,
      `INSERT INTO referral_policies
        (version, status, attribution_days, referred_discount_basis_points,
         referred_discount_cap_minor, referrer_points_per_dollar,
         referrer_reward_cap_points, effective_at)
       VALUES (2, 'active', 30, 1000, 2500, 5, 2500, now())`,
    );
    await expectRejected(
      client,
      `INSERT INTO affiliate_policies
        (version, status, attribution_days, first_order_commission_basis_points,
         reorder_commission_basis_points, reorder_window_days,
         approval_delay_days, payout_threshold_minor, currency, effective_at)
       VALUES (2, 'active', 30, 1000, 500, 180, 30, 5000, 'USD', now())`,
    );
    await expectRejected(
      client,
      `INSERT INTO loyalty_policies
        (version, status, points_per_dollar, redemption_minor_per_point,
         minimum_redemption_points, maximum_redemption_basis_points,
         effective_at)
       VALUES (0, 'draft', 2, 1, 500, 2500, now())`,
    );
    await expectRejected(
      client,
      `UPDATE loyalty_policies SET version = 0 WHERE id = '${ids.loyaltyPolicy}'`,
    );
    await expectRejected(
      client,
      `UPDATE referral_policies
       SET superseded_at = now() WHERE id = '${ids.referralPolicy}'`,
    );

    await client.exec(`
      UPDATE loyalty_policies
      SET status = 'superseded', superseded_at = now()
      WHERE id = '${ids.loyaltyPolicy}';
      INSERT INTO loyalty_policies
        (version, status, points_per_dollar, redemption_minor_per_point,
         minimum_redemption_points, maximum_redemption_basis_points,
         effective_at)
      VALUES (2, 'active', 2, 1, 500, 2500, now());
    `);
  });

  it("keeps versioned policy and terms facts immutable while allowing forward lifecycle transitions", async () => {
    client = await createMigratedPglite();
    await insertPolicies(client);
    await insertTerms(client);

    const immutableMutations = [
      `UPDATE loyalty_policies SET id = gen_random_uuid() WHERE id = '${ids.loyaltyPolicy}'`,
      `UPDATE loyalty_policies SET version = 2 WHERE id = '${ids.loyaltyPolicy}'`,
      `UPDATE loyalty_policies SET points_per_dollar = 3 WHERE id = '${ids.loyaltyPolicy}'`,
      `UPDATE loyalty_policies SET redemption_minor_per_point = 2 WHERE id = '${ids.loyaltyPolicy}'`,
      `UPDATE loyalty_policies SET minimum_redemption_points = 600 WHERE id = '${ids.loyaltyPolicy}'`,
      `UPDATE loyalty_policies SET maximum_redemption_basis_points = 3000 WHERE id = '${ids.loyaltyPolicy}'`,
      `UPDATE loyalty_policies SET expires_after_days = 365 WHERE id = '${ids.loyaltyPolicy}'`,
      `UPDATE loyalty_policies SET effective_at = effective_at + interval '1 day' WHERE id = '${ids.loyaltyPolicy}'`,
      `UPDATE loyalty_policies SET created_at = created_at + interval '1 second' WHERE id = '${ids.loyaltyPolicy}'`,
      `DELETE FROM loyalty_policies WHERE id = '${ids.loyaltyPolicy}'`,
      `UPDATE referral_policies SET id = gen_random_uuid() WHERE id = '${ids.referralPolicy}'`,
      `UPDATE referral_policies SET version = 2 WHERE id = '${ids.referralPolicy}'`,
      `UPDATE referral_policies SET attribution_days = 31 WHERE id = '${ids.referralPolicy}'`,
      `UPDATE referral_policies SET referred_discount_basis_points = 1100 WHERE id = '${ids.referralPolicy}'`,
      `UPDATE referral_policies SET referred_discount_cap_minor = 2600 WHERE id = '${ids.referralPolicy}'`,
      `UPDATE referral_policies SET referrer_points_per_dollar = 6 WHERE id = '${ids.referralPolicy}'`,
      `UPDATE referral_policies SET referrer_reward_cap_points = 2600 WHERE id = '${ids.referralPolicy}'`,
      `UPDATE referral_policies SET effective_at = effective_at + interval '1 day' WHERE id = '${ids.referralPolicy}'`,
      `UPDATE referral_policies SET created_at = created_at + interval '1 second' WHERE id = '${ids.referralPolicy}'`,
      `DELETE FROM referral_policies WHERE id = '${ids.referralPolicy}'`,
      `UPDATE affiliate_policies SET id = gen_random_uuid() WHERE id = '${ids.affiliatePolicy}'`,
      `UPDATE affiliate_policies SET version = 2 WHERE id = '${ids.affiliatePolicy}'`,
      `UPDATE affiliate_policies SET attribution_days = 31 WHERE id = '${ids.affiliatePolicy}'`,
      `UPDATE affiliate_policies SET first_order_commission_basis_points = 1100 WHERE id = '${ids.affiliatePolicy}'`,
      `UPDATE affiliate_policies SET reorder_commission_basis_points = 600 WHERE id = '${ids.affiliatePolicy}'`,
      `UPDATE affiliate_policies SET reorder_window_days = 181 WHERE id = '${ids.affiliatePolicy}'`,
      `UPDATE affiliate_policies SET approval_delay_days = 31 WHERE id = '${ids.affiliatePolicy}'`,
      `UPDATE affiliate_policies SET payout_threshold_minor = 5100 WHERE id = '${ids.affiliatePolicy}'`,
      `UPDATE affiliate_policies SET effective_at = effective_at + interval '1 day' WHERE id = '${ids.affiliatePolicy}'`,
      `UPDATE affiliate_policies SET created_at = created_at + interval '1 second' WHERE id = '${ids.affiliatePolicy}'`,
      `DELETE FROM affiliate_policies WHERE id = '${ids.affiliatePolicy}'`,
      `UPDATE growth_terms_versions SET id = gen_random_uuid() WHERE id = '${ids.customerTerms}'`,
      `UPDATE growth_terms_versions SET version = 2 WHERE id = '${ids.customerTerms}'`,
      `UPDATE growth_terms_versions SET content_hash = '${hashB}' WHERE id = '${ids.customerTerms}'`,
      `UPDATE growth_terms_versions SET terms_text = 'Mutated terms' WHERE id = '${ids.customerTerms}'`,
      `UPDATE growth_terms_versions SET effective_at = effective_at + interval '1 day' WHERE id = '${ids.customerTerms}'`,
      `UPDATE growth_terms_versions SET created_at = created_at + interval '1 second' WHERE id = '${ids.customerTerms}'`,
      `DELETE FROM growth_terms_versions WHERE id = '${ids.customerTerms}'`,
    ];

    for (const statement of immutableMutations) {
      await expectRejected(client, statement);
    }

    await client.exec(`
      UPDATE loyalty_policies
      SET status = 'superseded', superseded_at = '2026-09-01T00:00:00Z'
      WHERE id = '${ids.loyaltyPolicy}';
      UPDATE referral_policies
      SET status = 'superseded', superseded_at = '2026-09-01T00:00:00Z'
      WHERE id = '${ids.referralPolicy}';
      UPDATE affiliate_policies
      SET status = 'superseded', superseded_at = '2026-09-01T00:00:00Z'
      WHERE id = '${ids.affiliatePolicy}';
      UPDATE growth_terms_versions
      SET superseded_at = '2026-09-01T00:00:00Z'
      WHERE id = '${ids.customerTerms}';
    `);

    for (const table of [
      "loyalty_policies",
      "referral_policies",
      "affiliate_policies",
    ]) {
      await expectRejected(
        client,
        `UPDATE ${table} SET status = 'active', superseded_at = null WHERE version = 1`,
      );
      await expectRejected(
        client,
        `UPDATE ${table} SET superseded_at = '2026-09-02T00:00:00Z' WHERE version = 1`,
      );
    }
    await expectRejected(
      client,
      `UPDATE growth_terms_versions SET superseded_at = null WHERE id = '${ids.customerTerms}'`,
    );
    await expectRejected(
      client,
      `UPDATE growth_terms_versions
       SET superseded_at = '2026-09-02T00:00:00Z'
       WHERE id = '${ids.customerTerms}'`,
    );

    await client.exec(`
      INSERT INTO loyalty_policies
        (version, status, points_per_dollar, redemption_minor_per_point,
         minimum_redemption_points, maximum_redemption_basis_points,
         effective_at)
      VALUES (2, 'draft', 2, 1, 500, 2500, '2026-09-02T00:00:00Z');
      INSERT INTO referral_policies
        (version, status, attribution_days, referred_discount_basis_points,
         referred_discount_cap_minor, referrer_points_per_dollar,
         referrer_reward_cap_points, effective_at)
      VALUES (2, 'draft', 30, 1000, 2500, 5, 2500,
        '2026-09-02T00:00:00Z');
      INSERT INTO affiliate_policies
        (version, status, attribution_days,
         first_order_commission_basis_points, reorder_commission_basis_points,
         reorder_window_days, approval_delay_days, payout_threshold_minor,
         currency, effective_at)
      VALUES (2, 'draft', 30, 1000, 500, 180, 30, 5000, 'USD',
        '2026-09-02T00:00:00Z');
      UPDATE loyalty_policies SET status = 'active' WHERE version = 2;
      UPDATE referral_policies SET status = 'active' WHERE version = 2;
      UPDATE affiliate_policies SET status = 'active' WHERE version = 2;
    `);
  });

  it("pins growth trigger search paths and schema-qualifies integrity lookups", async () => {
    client = await createMigratedPglite();
    const functions = await client.query<{
      function_name: string;
      configuration: string | null;
      definition: string;
    }>(`
      SELECT p.proname AS function_name,
             array_to_string(p.proconfig, ',') AS configuration,
             pg_get_functiondef(p.oid) AS definition
      FROM pg_proc AS p
      JOIN pg_namespace AS namespace ON namespace.oid = p.pronamespace
      WHERE namespace.nspname = 'public'
        AND p.proname IN (
          'reject_reward_ledger_mutation',
          'enforce_growth_policy_history',
          'enforce_growth_terms_history',
          'enforce_referral_conversion_selected_growth',
          'enforce_affiliate_commission_selected_growth',
          'enforce_order_growth_settlement_integrity'
        )
      ORDER BY p.proname
    `);

    expect(functions.rows).toHaveLength(6);
    for (const row of functions.rows) {
      expect(row.configuration).toBe("search_path=pg_catalog, public, pg_temp");
    }
    const definitions = new Map(
      functions.rows.map((row) => [row.function_name, row.definition]),
    );
    expect(
      definitions.get("enforce_referral_conversion_selected_growth"),
    ).toContain("FROM public.order_growth_attributions");
    expect(
      definitions.get("enforce_affiliate_commission_selected_growth"),
    ).toContain("FROM public.order_growth_attributions");
    expect(
      definitions.get("enforce_order_growth_settlement_integrity"),
    ).toContain("FROM public.referral_conversions");
    expect(
      definitions.get("enforce_order_growth_settlement_integrity"),
    ).toContain("FROM public.affiliate_commissions");
  });

  it("uses common hash-bound terms acceptances for both programs and makes repeats idempotent", async () => {
    client = await createMigratedPglite();
    await insertCoreFixture(client);
    await insertTerms(client);
    await client.exec(`
      INSERT INTO growth_terms_acceptances
        (id, user_id, program, terms_version_id, content_hash)
      VALUES
        ('${ids.customerTermsAcceptance}', '${ids.referrer}',
         'customer_rewards_referrals', '${ids.customerTerms}', '${hashA}'),
        ('${ids.affiliateTermsAcceptance}', '${ids.affiliate}',
         'affiliate', '${ids.affiliateTerms}', '${hashB}');
    `);

    await expectRejected(
      client,
      `INSERT INTO growth_terms_acceptances
        (user_id, program, terms_version_id, content_hash)
       VALUES ('${ids.referrer}', 'customer_rewards_referrals',
         '${ids.customerTerms}', '${hashA}')`,
    );
    await expectRejected(
      client,
      `INSERT INTO growth_terms_acceptances
        (user_id, program, terms_version_id, content_hash)
       VALUES ('${ids.referred}', 'affiliate', '${ids.customerTerms}', '${hashA}')`,
    );
    await expectRejected(
      client,
      `INSERT INTO growth_terms_acceptances
        (user_id, program, terms_version_id, content_hash)
       VALUES ('${ids.referred}', 'customer_rewards_referrals',
         '${ids.customerTerms}', '${hashB}')`,
    );
    await expectRejected(
      client,
      `DELETE FROM growth_terms_versions WHERE id = '${ids.customerTerms}'`,
    );
    await expectRejected(client, `DELETE FROM users WHERE id = '${ids.referrer}'`);
  });

  it("scopes reward ledger idempotency to immutable source flow authority", async () => {
    client = await createMigratedPglite();
    await insertCoreFixture(client);
    await client.exec(`
      INSERT INTO reward_accounts
        (id, buyer_user_id, pending_points, available_points)
      VALUES ('${ids.rewardAccount}', '${ids.referred}', 0, 0);
      INSERT INTO reward_ledger_entries
        (id, reward_account_id, buyer_user_id, kind, source_type, source_id,
         idempotency_key, pending_points_delta, available_points_delta,
         pending_points_balance_after, available_points_balance_after)
      VALUES
        ('10000000-0000-4000-8000-000000000001', '${ids.rewardAccount}', '${ids.referred}',
         'refund_reversal', 'order', 'order-flow-one',
         'exact-cross-flow-key', 0, -1, 0, -1),
        ('10000000-0000-4000-8000-000000000002', '${ids.rewardAccount}', '${ids.referred}',
         'admin_adjustment', 'admin_adjustment', 'admin-fingerprint-one',
         'exact-cross-flow-key', 0, 1, 0, 0);
    `);

    await expectRejected(
      client,
      `INSERT INTO reward_ledger_entries
        (id, reward_account_id, buyer_user_id, kind, source_type, source_id,
         idempotency_key, pending_points_delta, available_points_delta,
         pending_points_balance_after, available_points_balance_after)
       VALUES
        ('10000000-0000-4000-8000-000000000003', '${ids.rewardAccount}', '${ids.referred}',
         'refund_reversal', 'admin_adjustment', 'admin-fingerprint-two',
         'exact-cross-flow-key', 0, -1, 0, -1)`,
    );
    const rows = await client.query<{ sourceType: string }>(`
      SELECT source_type AS "sourceType"
      FROM reward_ledger_entries
      WHERE idempotency_key = 'exact-cross-flow-key'
      ORDER BY source_type
    `);
    expect(rows.rows).toEqual([
      { sourceType: "admin_adjustment" },
      { sourceType: "order" },
    ]);
  });

  it("bounds persisted reward ledger source types at 64 Unicode code points", async () => {
    client = await createMigratedPglite();
    await insertCoreFixture(client);
    await client.exec(`
      INSERT INTO reward_accounts
        (id, buyer_user_id, pending_points, available_points)
      VALUES ('${ids.rewardAccount}', '${ids.referred}', 0, 0);
      INSERT INTO reward_ledger_entries
        (id, reward_account_id, buyer_user_id, kind, source_type, source_id,
         idempotency_key, pending_points_delta, available_points_delta,
         pending_points_balance_after, available_points_balance_after)
      VALUES
        ('20000000-0000-4000-8000-000000000001', '${ids.rewardAccount}', '${ids.referred}',
         'admin_adjustment', '${"🧬".repeat(64)}', 'bounded-source-one',
         'bounded-source-key-one', 0, 1, 0, 1);
    `);

    await expectRejected(
      client,
      `INSERT INTO reward_ledger_entries
        (id, reward_account_id, buyer_user_id, kind, source_type, source_id,
         idempotency_key, pending_points_delta, available_points_delta,
         pending_points_balance_after, available_points_balance_after)
       VALUES
        ('20000000-0000-4000-8000-000000000002', '${ids.rewardAccount}', '${ids.referred}',
         'admin_adjustment', '${"🧬".repeat(65)}', 'bounded-source-two',
         'bounded-source-key-two', 0, 1, 0, 2)`,
    );
    const rows = await client.query<{ sourceType: string }>(`
      SELECT source_type AS "sourceType"
      FROM reward_ledger_entries
      WHERE source_id LIKE 'bounded-source-%'
    `);
    expect(rows.rows).toEqual([{ sourceType: "🧬".repeat(64) }]);
  });

  it("allows verified reversal deficits while bounding pending balances and nonzero signed ledger deltas", async () => {
    client = await createMigratedPglite();
    await insertCoreFixture(client);
    await client.exec(`
      INSERT INTO reward_accounts
        (id, buyer_user_id, pending_points, available_points)
      VALUES ('${ids.rewardAccount}', '${ids.referred}', 0, -25);
      INSERT INTO reward_ledger_entries
        (id, reward_account_id, buyer_user_id, kind, source_type, source_id,
         idempotency_key, pending_points_delta, available_points_delta,
         pending_points_balance_after, available_points_balance_after)
      VALUES
        ('${ids.rewardLedger}', '${ids.rewardAccount}', '${ids.referred}',
         'refund_reversal', 'order', '${ids.referredOrder}',
         'growth-ledger-reversal', 0, -25, 0, -25);
    `);

    await expectRejected(
      client,
      `UPDATE reward_accounts SET pending_points = -1
       WHERE id = '${ids.rewardAccount}'`,
    );
    await expectRejected(
      client,
      `UPDATE reward_accounts SET available_points = 9007199254740992
       WHERE id = '${ids.rewardAccount}'`,
    );
    await expectRejected(
      client,
      `INSERT INTO reward_ledger_entries
        (reward_account_id, buyer_user_id, kind, source_type, source_id,
         idempotency_key, pending_points_delta, available_points_delta,
         pending_points_balance_after, available_points_balance_after)
       VALUES ('${ids.rewardAccount}', '${ids.referred}', 'admin_adjustment',
         'admin_audit', 'zero', 'growth-ledger-zero', 0, 0, 0, -25)`,
    );
    await expectRejected(
      client,
      `INSERT INTO reward_ledger_entries
        (reward_account_id, buyer_user_id, kind, source_type, source_id,
         idempotency_key, pending_points_delta, available_points_delta,
         pending_points_balance_after, available_points_balance_after)
       VALUES ('${ids.rewardAccount}', '${ids.referred}', 'admin_adjustment',
         'admin_audit', 'unsafe', 'growth-ledger-unsafe', 0,
         -9007199254740992, 0, -25)`,
    );
    await expectRejected(
      client,
      `INSERT INTO reward_ledger_entries
        (reward_account_id, buyer_user_id, kind, source_type, source_id,
         idempotency_key, pending_points_delta, available_points_delta,
         pending_points_balance_after, available_points_balance_after)
       VALUES ('${ids.rewardAccount}', '${ids.referred}', 'refund_reversal',
         'order', '${ids.referredOrder}', 'growth-ledger-duplicate-source',
         0, -1, 0, -26)`,
    );
    await expectRejected(
      client,
      `INSERT INTO reward_ledger_entries
        (reward_account_id, buyer_user_id, kind, source_type, source_id,
         idempotency_key, pending_points_delta, available_points_delta,
         pending_points_balance_after, available_points_balance_after)
       VALUES ('${ids.rewardAccount}', '${ids.referred}', 'admin_adjustment',
         'order', 'different', 'growth-ledger-reversal', 0, 1, 0, -24)`,
    );
    await expectRejected(
      client,
      `UPDATE reward_ledger_entries
       SET available_points_delta = -24
       WHERE id = '${ids.rewardLedger}'`,
    );
    await expectRejected(
      client,
      `DELETE FROM reward_ledger_entries WHERE id = '${ids.rewardLedger}'`,
    );
    await expectRejected(
      client,
      `DELETE FROM reward_accounts WHERE id = '${ids.rewardAccount}'`,
    );
  });

  it("deduplicates reward reservations and restricts their order, buyer, attempt, and policy history", async () => {
    client = await createMigratedPglite();
    await insertCoreFixture(client);
    await insertPolicies(client);
    await client.exec(`
      INSERT INTO reward_redemptions
        (buyer_user_id, order_id, checkout_attempt_id, loyalty_policy_id,
         loyalty_policy_version, idempotency_key, points, amount_minor,
         currency, state)
      VALUES
        ('${ids.referred}', '${ids.referredOrder}', '${ids.referredAttempt}',
         '${ids.loyaltyPolicy}', 1, 'growth-redemption-one', 500, 500,
         'USD', 'reserved');
    `);

    await expectRejected(
      client,
      `INSERT INTO reward_redemptions
        (buyer_user_id, order_id, checkout_attempt_id, loyalty_policy_id,
         loyalty_policy_version, idempotency_key, points, amount_minor,
         currency, state)
       VALUES ('${ids.referred}', '${ids.referredOrder}', '${ids.referredAttempt}',
         '${ids.loyaltyPolicy}', 1, 'growth-redemption-two', 500, 500,
         'USD', 'reserved')`,
    );
    await expectRejected(
      client,
      `INSERT INTO reward_redemptions
        (buyer_user_id, order_id, checkout_attempt_id, loyalty_policy_id,
         loyalty_policy_version, idempotency_key, points, amount_minor,
         currency, state)
       VALUES ('${ids.referrer}', '${ids.referredOrder}', '${ids.referredAttempt}',
         '${ids.loyaltyPolicy}', 1, 'growth-redemption-wrong-buyer', 500, 500,
         'USD', 'released')`,
    );
    await expectRejected(
      client,
      `INSERT INTO reward_redemptions
        (buyer_user_id, order_id, checkout_attempt_id, loyalty_policy_id,
         loyalty_policy_version, idempotency_key, points, amount_minor,
         currency, state)
       VALUES ('${ids.referred}', '${ids.referredOrder}', '${ids.referredAttempt}',
         '${ids.loyaltyPolicy}', 2, 'growth-redemption-wrong-policy', 500, 500,
         'USD', 'released')`,
    );
    await expectRejected(
      client,
      `INSERT INTO reward_redemptions
        (buyer_user_id, order_id, checkout_attempt_id, loyalty_policy_id,
         loyalty_policy_version, idempotency_key, points, amount_minor,
         currency, state)
       VALUES ('${ids.referred}', '${ids.referredOrder}', '${ids.referredAttempt}',
         '${ids.loyaltyPolicy}', 1, 'growth-redemption-unsafe',
         9007199254740992, 500, 'USD', 'released')`,
    );
    await expectRejected(
      client,
      `DELETE FROM loyalty_policies WHERE id = '${ids.loyaltyPolicy}'`,
    );
    await expectRejected(
      client,
      `DELETE FROM orders WHERE id = '${ids.referredOrder}'`,
    );
  });

  it("enforces opaque referral identity, no self-referral, and one conversion per first order", async () => {
    client = await createMigratedPglite();
    await insertCoreFixture(client);
    await insertPolicies(client);
    await client.exec(`
      INSERT INTO referral_codes (id, owner_user_id, code, status)
      VALUES ('${ids.referralCode}', '${ids.referrer}',
        'ref_ABCDEFGHIJKLMNOP', 'active');
      INSERT INTO referral_attributions
        (id, referral_code_id, referrer_user_id, referred_user_id,
         referral_policy_id, referral_policy_version, clicked_at, expires_at,
         bound_at)
      VALUES
        ('${ids.referralAttribution}', '${ids.referralCode}', '${ids.referrer}',
         '${ids.referred}', '${ids.referralPolicy}', 1,
         '2026-08-27T00:00:00Z', '2026-09-26T00:00:00Z',
         '2026-08-28T00:00:00Z');
      INSERT INTO orders
        (id, buyer_user_id, buyer_status_snapshot, attestation_acceptance_id,
         destination_state_code, currency, subtotal_minor, discount_minor,
         tax_minor, shipping_minor, total_minor, state)
      VALUES
        ('${ids.alternateReferredOrder}', '${ids.referred}', 'active',
         '${ids.referredAcceptance}', 'CA', 'USD', 1000, 0, 0, 0, 1000,
         'draft');
      INSERT INTO order_growth_attributions
        (order_id, buyer_user_id, program, referral_attribution_id,
         referral_policy_id, referral_policy_version)
      VALUES
        ('${ids.referredOrder}', '${ids.referred}', 'customer_referral',
         '${ids.referralAttribution}', '${ids.referralPolicy}', 1);
      INSERT INTO referral_conversions
        (id, referral_attribution_id, referred_user_id, first_order_id,
         referral_policy_id, referral_policy_version, idempotency_key,
         referred_discount_minor, referrer_reward_points, status)
      VALUES
        ('${ids.referralConversion}', '${ids.referralAttribution}',
         '${ids.referred}', '${ids.referredOrder}', '${ids.referralPolicy}', 1,
         'growth-referral-conversion', 100, 50, 'pending');
    `);
    const referralProgram = await client.query<{ program: string }>(`
      SELECT program FROM referral_conversions
      WHERE id = '${ids.referralConversion}'
    `);
    expect(referralProgram.rows).toEqual([{ program: "customer_referral" }]);
    await expectRejected(
      client,
      `UPDATE referral_conversions SET program = 'affiliate'
       WHERE id = '${ids.referralConversion}'`,
    );

    await expectRejected(
      client,
      `INSERT INTO referral_codes (owner_user_id, code, status)
       VALUES ('${ids.referrer}', 'ref_QRSTUVWXYZabcdef', 'active')`,
    );
    await expectRejected(
      client,
      `INSERT INTO referral_codes (owner_user_id, code, status)
       VALUES ('${ids.affiliate}', 'ref_ABCDEFGHIJKLMNOP', 'revoked')`,
    );
    await expectRejected(
      client,
      `INSERT INTO referral_codes (owner_user_id, code, status)
       VALUES ('${ids.affiliate}', 'predictable-code', 'active')`,
    );
    await expectRejected(
      client,
      `INSERT INTO referral_attributions
        (referral_code_id, referrer_user_id, referred_user_id,
         referral_policy_id, referral_policy_version, clicked_at, expires_at,
         bound_at)
       VALUES ('${ids.referralCode}', '${ids.referrer}', '${ids.referrer}',
         '${ids.referralPolicy}', 1, now(), now() + interval '30 days', now())`,
    );
    await expectRejected(
      client,
      `INSERT INTO referral_attributions
        (referral_code_id, referrer_user_id, referred_user_id,
         referral_policy_id, referral_policy_version, clicked_at, expires_at,
         bound_at)
       VALUES ('${ids.referralCode}', '${ids.referrer}', '${ids.referred}',
         '${ids.referralPolicy}', 1, now(), now() + interval '30 days', now())`,
    );
    await expectRejected(
      client,
      `INSERT INTO referral_conversions
        (referral_attribution_id, referred_user_id, first_order_id,
         referral_policy_id, referral_policy_version, idempotency_key,
         referred_discount_minor, referrer_reward_points, status)
       VALUES ('${ids.referralAttribution}', '${ids.referred}',
         '${ids.referredOrder}', '${ids.referralPolicy}', 1,
         'growth-referral-conversion-two', 100, 50, 'qualified')`,
    );
    await expectRejected(
      client,
      `DELETE FROM order_growth_attributions
       WHERE order_id = '${ids.referredOrder}'`,
    );
    await client.exec(`
      CREATE TEMP TABLE referral_conversions (first_order_id uuid);
      SET search_path = pg_temp, public;
    `);
    await expectRejected(
      client,
      `DELETE FROM public.order_growth_attributions
       WHERE order_id = '${ids.referredOrder}'`,
    );
    await client.exec(`
      SET search_path = public;
      DROP TABLE pg_temp.referral_conversions;
      DROP TRIGGER order_growth_attributions_settlement_integrity
        ON public.order_growth_attributions;
    `);
    await expectRejected(
      client,
      `UPDATE public.order_growth_attributions
       SET order_id = '${ids.alternateReferredOrder}'
       WHERE order_id = '${ids.referredOrder}'`,
    );
    await expectRejected(
      client,
      `DELETE FROM public.order_growth_attributions
       WHERE order_id = '${ids.referredOrder}'`,
    );
  });

  it("deduplicates affiliate commissions and payout consumption while keeping external payout evidence nullable until paid", async () => {
    client = await createMigratedPglite();
    await insertCoreFixture(client);
    await insertPolicies(client);
    await insertTerms(client);
    await insertAffiliateProfileAndAttribution(client);
    await client.exec(`
      INSERT INTO order_growth_attributions
        (order_id, buyer_user_id, program, affiliate_attribution_id,
         affiliate_policy_id, affiliate_policy_version)
      VALUES
        ('${ids.affiliateOrder}', '${ids.affiliateBuyer}', 'affiliate',
         '${ids.affiliateAttribution}', '${ids.affiliatePolicy}', 1);
      INSERT INTO affiliate_payouts
        (id, affiliate_profile_id, affiliate_policy_id,
         affiliate_policy_version, idempotency_key, amount_minor, currency,
         state)
      VALUES
        ('${ids.affiliatePayout}', '${ids.affiliateProfile}',
         '${ids.affiliatePolicy}', 1, 'growth-payout-one', 5000, 'USD',
         'pending');
      INSERT INTO affiliate_commissions
        (id, affiliate_profile_id, affiliate_attribution_id, buyer_user_id, order_id,
         affiliate_policy_id, affiliate_policy_version, idempotency_key,
         gross_commission_minor, reversed_commission_minor, status, payout_id)
      VALUES
        ('${ids.affiliateCommission}', '${ids.affiliateProfile}',
         '${ids.affiliateAttribution}', '${ids.affiliateBuyer}', '${ids.affiliateOrder}',
         '${ids.affiliatePolicy}', 1, 'growth-commission-one', 100, 0,
         'approved', '${ids.affiliatePayout}');
      INSERT INTO affiliate_policies
        (id, version, status, attribution_days,
         first_order_commission_basis_points, reorder_commission_basis_points,
         reorder_window_days, approval_delay_days, payout_threshold_minor,
         currency, effective_at)
      VALUES
        ('${ids.alternateAffiliatePolicy}', 2, 'draft', 30, 1000, 500,
         180, 30, 5000, 'USD', '2026-09-01T00:00:00Z');
      INSERT INTO affiliate_payouts
        (id, affiliate_profile_id, affiliate_policy_id,
         affiliate_policy_version, idempotency_key, amount_minor, currency,
         state)
      VALUES
        ('${ids.alternateAffiliatePayout}', '${ids.affiliateProfile}',
         '${ids.alternateAffiliatePolicy}', 2, 'growth-payout-two', 5000,
         'USD', 'pending');
    `);
    const affiliateProgram = await client.query<{ program: string }>(`
      SELECT program FROM affiliate_commissions
      WHERE id = '${ids.affiliateCommission}'
    `);
    expect(affiliateProgram.rows).toEqual([{ program: "affiliate" }]);
    await expectRejected(
      client,
      `UPDATE affiliate_commissions SET program = 'customer_referral'
       WHERE id = '${ids.affiliateCommission}'`,
    );

    await expectRejected(
      client,
      `INSERT INTO affiliate_attributions
        (affiliate_profile_id, affiliate_user_id, referred_user_id,
         affiliate_policy_id, affiliate_policy_version, clicked_at,
         expires_at, bound_at)
       VALUES ('${ids.affiliateProfile}', '${ids.affiliate}', '${ids.affiliate}',
         '${ids.affiliatePolicy}', 1, now(), now() + interval '30 days', now())`,
    );
    await expectRejected(
      client,
      `INSERT INTO affiliate_commissions
        (affiliate_profile_id, affiliate_attribution_id, buyer_user_id, order_id,
         affiliate_policy_id, affiliate_policy_version, idempotency_key,
         gross_commission_minor, reversed_commission_minor, status, payout_id)
       VALUES ('${ids.affiliateProfile}', '${ids.affiliateAttribution}',
         '${ids.affiliateBuyer}', '${ids.affiliateOrder}', '${ids.affiliatePolicy}', 1,
         'growth-commission-two', 100, 0, 'approved', '${ids.affiliatePayout}')`,
    );
    await expectRejected(
      client,
      `INSERT INTO affiliate_payouts
        (affiliate_profile_id, affiliate_policy_id, affiliate_policy_version,
         idempotency_key, amount_minor, currency, state)
       VALUES ('${ids.affiliateProfile}', '${ids.affiliatePolicy}', 1,
         'growth-payout-one', 5000, 'USD', 'pending')`,
    );
    await expectRejected(
      client,
      `UPDATE affiliate_payouts
       SET state = 'paid' WHERE id = '${ids.affiliatePayout}'`,
    );
    await expectRejected(
      client,
      `UPDATE affiliate_payouts
       SET external_provider = 'bank', external_reference = '   '
       WHERE id = '${ids.affiliatePayout}'`,
    );
    await expectRejected(
      client,
      `UPDATE affiliate_payouts SET request_hash = 'not-a-sha256'
       WHERE id = '${ids.affiliatePayout}'`,
    );
    await expectRejected(
      client,
      `UPDATE affiliate_payouts SET paid_request_hash = 'not-a-sha256'
       WHERE id = '${ids.affiliatePayout}'`,
    );
    await expectRejected(
      client,
      `INSERT INTO affiliate_commissions
        (affiliate_profile_id, affiliate_attribution_id, buyer_user_id, order_id,
         affiliate_policy_id, affiliate_policy_version, idempotency_key,
         gross_commission_minor, reversed_commission_minor, status)
       VALUES ('${ids.affiliateProfile}', '${ids.affiliateAttribution}',
         '${ids.referred}', '${ids.referredOrder}', '${ids.affiliatePolicy}', 1,
         'growth-commission-wrong-buyer', 100, 0, 'pending')`,
    );
    await expectRejected(
      client,
      `UPDATE affiliate_commissions
       SET status = 'paid', payout_id = null
       WHERE id = '${ids.affiliateCommission}'`,
    );
    await expectRejected(
      client,
      `UPDATE affiliate_commissions
       SET gross_commission_minor = 9007199254740992
       WHERE id = '${ids.affiliateCommission}'`,
    );
    await expectRejected(
      client,
      `UPDATE affiliate_commissions
       SET payout_id = '${ids.alternateAffiliatePayout}'
       WHERE id = '${ids.affiliateCommission}'`,
    );
    await expectRejected(
      client,
      `DELETE FROM order_growth_attributions
       WHERE order_id = '${ids.affiliateOrder}'`,
    );
    await client.exec(`
      DROP TRIGGER order_growth_attributions_settlement_integrity
        ON public.order_growth_attributions;
    `);
    await expectRejected(
      client,
      `DELETE FROM public.order_growth_attributions
       WHERE order_id = '${ids.affiliateOrder}'`,
    );
  });

  it("rejects affiliate policy rows whose immutable V1 payout threshold is not exactly 5000 minor", async () => {
    client = await createMigratedPglite();
    await expectRejected(
      client,
      `INSERT INTO affiliate_policies
         (id, version, status, attribution_days,
          first_order_commission_basis_points, reorder_commission_basis_points,
          reorder_window_days, approval_delay_days, payout_threshold_minor,
          currency, effective_at)
       VALUES ('82000000-0000-4000-8000-000000000099', 99, 'draft', 30,
               1000, 500, 180, 30, 5100, 'USD', '2026-08-28T00:00:00Z')`,
    );
  });

  it("rejects an affiliate commission when the order selected customer referral", async () => {
    client = await createMigratedPglite();
    await insertCoreFixture(client);
    await insertPolicies(client);
    await insertTerms(client);
    await insertAffiliateProfileAndAttribution(client);
    await client.exec(`
      INSERT INTO referral_codes (id, owner_user_id, code, status)
      VALUES ('${ids.referralCode}', '${ids.referrer}',
        'ref_ABCDEFGHIJKLMNOP', 'active');
      INSERT INTO referral_attributions
        (id, referral_code_id, referrer_user_id, referred_user_id,
         referral_policy_id, referral_policy_version, clicked_at, expires_at,
         bound_at)
      VALUES
        ('${ids.referralAttribution}', '${ids.referralCode}', '${ids.referrer}',
         '${ids.referred}', '${ids.referralPolicy}', 1,
         '2026-08-27T00:00:00Z', '2026-09-26T00:00:00Z',
         '2026-08-28T00:00:00Z');
      INSERT INTO affiliate_attributions
        (id, affiliate_profile_id, affiliate_user_id, referred_user_id,
         affiliate_policy_id, affiliate_policy_version, clicked_at,
         expires_at, bound_at)
      VALUES
        ('${ids.alternateAffiliateAttribution}', '${ids.affiliateProfile}',
         '${ids.affiliate}', '${ids.referred}', '${ids.affiliatePolicy}', 1,
         '2026-08-27T00:00:00Z', '2026-09-26T00:00:00Z',
         '2026-08-28T00:00:00Z');
      INSERT INTO order_growth_attributions
        (order_id, buyer_user_id, program, referral_attribution_id,
         referral_policy_id, referral_policy_version)
      VALUES
        ('${ids.referredOrder}', '${ids.referred}', 'customer_referral',
         '${ids.referralAttribution}', '${ids.referralPolicy}', 1);
    `);

    await expectRejected(
      client,
      `INSERT INTO affiliate_commissions
        (id, affiliate_profile_id, affiliate_attribution_id, buyer_user_id,
         order_id, affiliate_policy_id, affiliate_policy_version,
         idempotency_key, gross_commission_minor,
         reversed_commission_minor, status)
       VALUES ('${ids.crossProgramAffiliateCommission}',
         '${ids.affiliateProfile}', '${ids.alternateAffiliateAttribution}',
         '${ids.referred}', '${ids.referredOrder}', '${ids.affiliatePolicy}', 1,
         'growth-cross-program-affiliate', 100, 0, 'pending')`,
    );
  });

  it("rejects a referral conversion when the order selected affiliate", async () => {
    client = await createMigratedPglite();
    await insertCoreFixture(client);
    await insertPolicies(client);
    await insertTerms(client);
    await insertAffiliateProfileAndAttribution(client);
    await client.exec(`
      INSERT INTO referral_codes (id, owner_user_id, code, status)
      VALUES ('${ids.referralCode}', '${ids.referrer}',
        'ref_ABCDEFGHIJKLMNOP', 'active');
      INSERT INTO referral_attributions
        (id, referral_code_id, referrer_user_id, referred_user_id,
         referral_policy_id, referral_policy_version, clicked_at, expires_at,
         bound_at)
      VALUES
        ('${ids.alternateReferralAttribution}', '${ids.referralCode}',
         '${ids.referrer}', '${ids.affiliateBuyer}', '${ids.referralPolicy}', 1,
         '2026-08-27T00:00:00Z', '2026-09-26T00:00:00Z',
         '2026-08-28T00:00:00Z');
      INSERT INTO order_growth_attributions
        (order_id, buyer_user_id, program, affiliate_attribution_id,
         affiliate_policy_id, affiliate_policy_version)
      VALUES
        ('${ids.affiliateOrder}', '${ids.affiliateBuyer}', 'affiliate',
         '${ids.affiliateAttribution}', '${ids.affiliatePolicy}', 1);
      CREATE TEMP TABLE order_growth_attributions (
        order_id uuid,
        buyer_user_id uuid,
        program public.growth_attribution_program,
        referral_attribution_id uuid,
        referral_policy_id uuid,
        referral_policy_version integer,
        affiliate_attribution_id uuid,
        affiliate_policy_id uuid,
        affiliate_policy_version integer
      );
      INSERT INTO pg_temp.order_growth_attributions
        (order_id, buyer_user_id, program, referral_attribution_id,
         referral_policy_id, referral_policy_version)
      VALUES
        ('${ids.affiliateOrder}', '${ids.affiliateBuyer}', 'customer_referral',
         '${ids.alternateReferralAttribution}', '${ids.referralPolicy}', 1);
      SET search_path = pg_temp, public;
    `);

    await expectRejected(
      client,
      `INSERT INTO public.referral_conversions
        (id, referral_attribution_id, referred_user_id, first_order_id,
         referral_policy_id, referral_policy_version, idempotency_key,
         referred_discount_minor, referrer_reward_points, status)
       VALUES ('${ids.crossProgramReferralConversion}',
         '${ids.alternateReferralAttribution}', '${ids.affiliateBuyer}',
         '${ids.affiliateOrder}', '${ids.referralPolicy}', 1,
         'growth-cross-program-referral', 100, 50, 'pending')`,
    );
  });

  it("requires settlement attribution, policy, and buyer facts to match the selected order growth facts", async () => {
    client = await createMigratedPglite();
    await insertCoreFixture(client);
    await insertPolicies(client);
    await insertTerms(client);
    await insertAffiliateProfileAndAttribution(client);
    await client.exec(`
      INSERT INTO referral_policies
        (id, version, status, attribution_days,
         referred_discount_basis_points, referred_discount_cap_minor,
         referrer_points_per_dollar, referrer_reward_cap_points, effective_at)
      VALUES
        ('${ids.alternateReferralPolicy}', 2, 'draft', 30, 1000, 2500, 5,
         2500, '2026-09-01T00:00:00Z');
      INSERT INTO affiliate_policies
        (id, version, status, attribution_days,
         first_order_commission_basis_points, reorder_commission_basis_points,
         reorder_window_days, approval_delay_days, payout_threshold_minor,
         currency, effective_at)
      VALUES
        ('${ids.alternateAffiliatePolicy}', 2, 'draft', 30, 1000, 500,
         180, 30, 5000, 'USD', '2026-09-01T00:00:00Z');
      INSERT INTO referral_codes (id, owner_user_id, code, status)
      VALUES ('${ids.referralCode}', '${ids.referrer}',
        'ref_ABCDEFGHIJKLMNOP', 'active');
      INSERT INTO referral_attributions
        (id, referral_code_id, referrer_user_id, referred_user_id,
         referral_policy_id, referral_policy_version, clicked_at, expires_at,
         bound_at)
      VALUES
        ('${ids.referralAttribution}', '${ids.referralCode}', '${ids.referrer}',
         '${ids.referred}', '${ids.referralPolicy}', 1,
         '2026-08-27T00:00:00Z', '2026-09-26T00:00:00Z',
         '2026-08-28T00:00:00Z'),
        ('${ids.alternateReferralAttribution}', '${ids.referralCode}',
         '${ids.referrer}', '${ids.referred}',
         '${ids.alternateReferralPolicy}', 2, '2026-08-27T00:00:00Z',
         '2026-09-26T00:00:00Z', '2026-08-28T00:00:00Z');
      INSERT INTO affiliate_attributions
        (id, affiliate_profile_id, affiliate_user_id, referred_user_id,
         affiliate_policy_id, affiliate_policy_version, clicked_at,
         expires_at, bound_at)
      VALUES
        ('${ids.alternateAffiliateAttribution}', '${ids.affiliateProfile}',
         '${ids.affiliate}', '${ids.affiliateBuyer}',
         '${ids.alternateAffiliatePolicy}', 2, '2026-08-27T00:00:00Z',
         '2026-09-26T00:00:00Z', '2026-08-28T00:00:00Z');
      INSERT INTO order_growth_attributions
        (order_id, buyer_user_id, program, referral_attribution_id,
         referral_policy_id, referral_policy_version)
      VALUES
        ('${ids.referredOrder}', '${ids.referred}', 'customer_referral',
         '${ids.referralAttribution}', '${ids.referralPolicy}', 1);
      INSERT INTO order_growth_attributions
        (order_id, buyer_user_id, program, affiliate_attribution_id,
         affiliate_policy_id, affiliate_policy_version)
      VALUES
        ('${ids.affiliateOrder}', '${ids.affiliateBuyer}', 'affiliate',
         '${ids.affiliateAttribution}', '${ids.affiliatePolicy}', 1);
    `);

    await expectRejected(
      client,
      `INSERT INTO referral_conversions
        (referral_attribution_id, referred_user_id, first_order_id,
         referral_policy_id, referral_policy_version, idempotency_key,
         referred_discount_minor, referrer_reward_points, status)
       VALUES ('${ids.alternateReferralAttribution}', '${ids.referred}',
         '${ids.referredOrder}', '${ids.alternateReferralPolicy}', 2,
         'growth-referral-mismatched-facts', 100, 50, 'pending')`,
    );
    await expectRejected(
      client,
      `INSERT INTO affiliate_commissions
        (affiliate_profile_id, affiliate_attribution_id, buyer_user_id,
         order_id, affiliate_policy_id, affiliate_policy_version,
         idempotency_key, gross_commission_minor,
         reversed_commission_minor, status)
       VALUES ('${ids.affiliateProfile}',
         '${ids.alternateAffiliateAttribution}', '${ids.affiliateBuyer}',
         '${ids.affiliateOrder}', '${ids.alternateAffiliatePolicy}', 2,
         'growth-affiliate-mismatched-facts', 100, 0, 'pending')`,
    );
    await expectRejected(
      client,
      `INSERT INTO affiliate_commissions
        (affiliate_profile_id, affiliate_attribution_id, buyer_user_id,
         order_id, affiliate_policy_id, affiliate_policy_version,
         idempotency_key, gross_commission_minor,
         reversed_commission_minor, status)
       VALUES ('${ids.affiliateProfile}', '${ids.affiliateAttribution}',
         '${ids.referred}', '${ids.referredOrder}', '${ids.affiliatePolicy}', 1,
         'growth-affiliate-mismatched-buyer', 100, 0, 'pending')`,
    );
  });

  it("enforces shared-set bounds and exactly one order growth attribution program", async () => {
    client = await createMigratedPglite();
    await insertCoreFixture(client);
    await insertPolicies(client);
    await insertTerms(client);
    await client.exec(`
      INSERT INTO referral_codes (id, owner_user_id, code, status)
      VALUES ('${ids.referralCode}', '${ids.referrer}',
        'ref_ABCDEFGHIJKLMNOP', 'active');
      INSERT INTO referral_attributions
        (id, referral_code_id, referrer_user_id, referred_user_id,
         referral_policy_id, referral_policy_version, clicked_at, expires_at,
         bound_at)
      VALUES
        ('${ids.referralAttribution}', '${ids.referralCode}', '${ids.referrer}',
         '${ids.referred}', '${ids.referralPolicy}', 1,
         '2026-08-27T00:00:00Z', '2026-09-26T00:00:00Z',
         '2026-08-28T00:00:00Z');
      INSERT INTO shared_research_sets
        (id, owner_user_id, public_code, label, active)
      VALUES
        ('${ids.sharedSet}', '${ids.referrer}', 'set_ABCDEFGHIJKLMNOP',
         'Neutral research set', true);
      INSERT INTO shared_research_set_items (shared_set_id, product_id, quantity)
      VALUES
        ('${ids.sharedSet}', '${ids.product1}', 1),
        ('${ids.sharedSet}', '${ids.product2}', 25);
      INSERT INTO order_growth_attributions
        (order_id, buyer_user_id, program, referral_attribution_id,
         referral_policy_id, referral_policy_version)
      VALUES
        ('${ids.referredOrder}', '${ids.referred}', 'customer_referral',
         '${ids.referralAttribution}', '${ids.referralPolicy}', 1);
    `);

    await expectRejected(
      client,
      `INSERT INTO shared_research_sets
        (owner_user_id, public_code, label, active)
       VALUES ('${ids.affiliate}', 'set_ABCDEFGHIJKLMNOP', 'Another set', true)`,
    );
    await expectRejected(
      client,
      `INSERT INTO shared_research_sets
        (owner_user_id, public_code, label, active)
       VALUES ('${ids.affiliate}', 'set_QRSTUVWXYZabcdef', repeat('x', 121), true)`,
    );
    await expectRejected(
      client,
      `INSERT INTO shared_research_set_items
        (shared_set_id, product_id, quantity)
       VALUES ('${ids.sharedSet}', '${ids.product1}', 2)`,
    );
    await expectRejected(
      client,
      `INSERT INTO shared_research_set_items
        (shared_set_id, product_id, quantity)
       VALUES ('${ids.sharedSet}', '${ids.product1}', 0)`,
    );
    await expectRejected(
      client,
      `UPDATE shared_research_sets SET active = false
       WHERE id = '${ids.sharedSet}'`,
    );
    await client.exec(`
      UPDATE shared_research_sets
      SET active = false, deactivated_at = now()
      WHERE id = '${ids.sharedSet}'
    `);
    await expectRejected(
      client,
      `INSERT INTO order_growth_attributions
        (order_id, buyer_user_id, program, referral_attribution_id,
         referral_policy_id, referral_policy_version)
       VALUES ('${ids.referredOrder}', '${ids.referred}', 'customer_referral',
         '${ids.referralAttribution}', '${ids.referralPolicy}', 1)`,
    );

    await insertAffiliateProfileAndAttribution(client);
    await expectRejected(
      client,
      `UPDATE order_growth_attributions
       SET program = 'affiliate',
           affiliate_attribution_id = '${ids.affiliateAttribution}',
           affiliate_policy_id = '${ids.affiliatePolicy}',
           affiliate_policy_version = 1
       WHERE order_id = '${ids.referredOrder}'`,
    );
    await expectRejected(
      client,
      `DELETE FROM referral_attributions WHERE id = '${ids.referralAttribution}'`,
    );

    await client.exec(`DELETE FROM shared_research_sets WHERE id = '${ids.sharedSet}'`);
    const items = await client.query<{ count: number }>(`
      SELECT count(*)::int AS count FROM shared_research_set_items
      WHERE shared_set_id = '${ids.sharedSet}'
    `);
    expect(items.rows).toEqual([{ count: 0 }]);
  });
});
