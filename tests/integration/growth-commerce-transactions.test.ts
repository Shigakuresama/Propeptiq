import { createHash } from "node:crypto";

import type { PGlite } from "@electric-sql/pglite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createCheckoutService } from "@/commerce/checkout-service";
import { createPostgresCheckoutRepository } from "@/db/repositories/checkout-repository";
import type {
  GrowthSqlClient,
  GrowthTransactionRunner,
} from "@/db/repositories/growth-repository";
import {
  createPostgresReferralCandidateLookup,
  createReferralCheckoutService,
} from "@/growth/referral-service";
import {
  createAffiliateCheckoutService,
  createPostgresAffiliatePayoutCreateTransaction,
  createPostgresAffiliatePayoutPaidTransaction,
  createPostgresAffiliateCandidateLookup,
} from "@/growth/affiliate-service";
import {
  createPostgresRewardsCheckoutAtomicPort,
  createPostgresRewardsLifecycleService,
  createRewardsService,
} from "@/growth/rewards-service";

import { createMigratedPglite } from "./helpers/pglite";

const ids = {
  buyer: "92000000-0000-4000-8000-000000000001",
  attestation: "92000000-0000-4000-8000-000000000002",
  attestationAcceptance: "92000000-0000-4000-8000-000000000003",
  group: "92000000-0000-4000-8000-000000000004",
  product: "92000000-0000-4000-8000-000000000005",
  price: "92000000-0000-4000-8000-000000000006",
  lot: "92000000-0000-4000-8000-000000000007",
  destinationPolicy: "92000000-0000-4000-8000-000000000008",
  loyaltyPolicy: "92000000-0000-4000-8000-000000000009",
  terms: "92000000-0000-4000-8000-000000000010",
  termsAcceptance: "92000000-0000-4000-8000-000000000011",
  rewardAccount: "92000000-0000-4000-8000-000000000012",
  keyA: "92000000-0000-4000-8000-000000000013",
  keyB: "92000000-0000-4000-8000-000000000014",
  referrer: "92000000-0000-4000-8000-000000000015",
  referralPolicy: "92000000-0000-4000-8000-000000000016",
  referralCode: "92000000-0000-4000-8000-000000000017",
  affiliatePolicy: "92000000-0000-4000-8000-000000000018",
  affiliateTerms: "92000000-0000-4000-8000-000000000019",
  affiliateTermsAcceptance: "92000000-0000-4000-8000-000000000020",
  affiliateProfile: "92000000-0000-4000-8000-000000000021",
  affiliateAttribution: "92000000-0000-4000-8000-000000000022",
} as const;

const now = new Date("2026-08-28T12:00:00.000Z");
const termsText = "Synthetic customer rewards terms version one.";
const termsHash = createHash("sha256").update(termsText).digest("hex");
const affiliateTermsText = "Synthetic affiliate terms version one.";
const affiliateTermsHash = createHash("sha256").update(affiliateTermsText).digest("hex");
const sha256 = async (value: string) =>
  createHash("sha256").update(value).digest("hex");

function keyedUuid(label: string): string {
  const hex = createHash("sha256").update(`task4:${label}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

const request = {
  items: [{ productId: ids.product, quantity: 2 }],
  destination: {
    recipientName: "Synthetic Researcher",
    line1: "100 Test Way",
    line2: null,
    city: "Testville",
    stateCode: "CA",
    postalCode: "90001",
    countryCode: "US" as const,
  },
  promotionIds: [] as string[],
  rewardRedemptionPoints: 750,
};

describe("growth and commerce transaction boundary on PGlite", () => {
  let client: PGlite;

  beforeEach(async () => {
    client = await createMigratedPglite();
    await client.query(
      `INSERT INTO users (id, clerk_id, email_verified_at)
       VALUES
         ($1::uuid, 'clerk-task4-buyer', '2026-08-01T00:00:00.000Z'),
         ($2::uuid, 'clerk-task5b-referrer', '2026-08-01T00:00:00.000Z')`,
      [ids.buyer, ids.referrer],
    );
    await client.query(
      `INSERT INTO buyer_profiles
         (user_id, status, age_confirmed_at, research_purpose, updated_at)
       VALUES
         ($1::uuid, 'active', '2026-08-01T00:00:00.000Z',
          'analytical', '2026-08-27T00:00:00.000Z'),
         ($2::uuid, 'active', '2026-08-01T00:00:00.000Z',
          'analytical', '2026-08-27T00:00:00.000Z')`,
      [ids.buyer, ids.referrer],
    );
    await client.query(
      `INSERT INTO attestation_versions
         (id, version, content_hash, policy_text, effective_at)
       VALUES ($1::uuid, 1, $2, 'Synthetic research-use policy.',
               '2026-08-01T00:00:00.000Z')`,
      [ids.attestation, "b".repeat(64)],
    );
    await client.query(
      `INSERT INTO attestation_acceptances
         (id, user_id, attestation_version_id, accepted_at)
       VALUES ($1::uuid, $2::uuid, $3::uuid, '2026-08-02T00:00:00.000Z')`,
      [ids.attestationAcceptance, ids.buyer, ids.attestation],
    );
    await client.query(
      `INSERT INTO product_policy_groups (id, slug, name, active)
       VALUES ($1::uuid, 'task4-group', 'Task 4 group', true)`,
      [ids.group],
    );
    await client.query(
      `INSERT INTO products
         (id, slug, name, package_form, material_identity, policy_group_id, status)
       VALUES ($1::uuid, 'task4-product', 'Synthetic Reference', 'Sealed unit',
               'Synthetic identity', $2::uuid, 'active')`,
      [ids.product, ids.group],
    );
    await client.query(
      `INSERT INTO product_prices
         (id, product_id, version, amount_minor, currency, effective_at)
       VALUES ($1::uuid, $2::uuid, 1, 5000, 'USD',
               '2026-08-01T00:00:00.000Z')`,
      [ids.price, ids.product],
    );
    await client.query(
      `INSERT INTO lots
         (id, product_id, supplier_name, supplier_lot_code, received_quantity,
          available_quantity, status, expires_at)
       VALUES ($1::uuid, $2::uuid, 'Synthetic supplier', 'TASK4-LOT',
               10, 10, 'released', '2027-01-01T00:00:00.000Z')`,
      [ids.lot, ids.product],
    );
    await client.query(
      `INSERT INTO destination_policies
         (id, scope_kind, product_id, state_code, result, version, active, effective_at)
       VALUES ($1::uuid, 'product', $2::uuid, 'CA', 'allowed', 1, true,
               '2026-08-01T00:00:00.000Z')`,
      [ids.destinationPolicy, ids.product],
    );
    await client.query(
      `INSERT INTO loyalty_policies
         (id, version, status, points_per_dollar, redemption_minor_per_point,
          minimum_redemption_points, maximum_redemption_basis_points,
          expires_after_days, effective_at)
       VALUES ($1::uuid, 1, 'active', 2, 1, 500, 2500, NULL,
               '2026-08-01T00:00:00.000Z')`,
      [ids.loyaltyPolicy],
    );
    await client.query(
      `INSERT INTO growth_terms_versions
         (id, program, version, content_hash, terms_text, effective_at)
       VALUES ($1::uuid, 'customer_rewards_referrals', 1, $2, $3,
               '2026-08-01T00:00:00.000Z')`,
      [ids.terms, termsHash, termsText],
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
       VALUES ($1::uuid, $2::uuid, 'ref_5BGrowthCommerce', 'active',
               '2026-08-20T00:00:00.000Z')`,
      [ids.referralCode, ids.referrer],
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
      [ids.affiliateTermsAcceptance, ids.referrer, ids.affiliateTerms,
        affiliateTermsHash],
    );
    await client.query(
      `INSERT INTO affiliate_profiles
         (id, user_id, public_code, status, version, public_channel,
          promotion_method, terms_acceptance_id, created_at, updated_at)
       VALUES ($1::uuid, $2::uuid, 'aff_6BOpaqueAttribution9', 'active', 2,
               '@synthetic_affiliate', 'social', $3::uuid,
               '2026-08-02T00:00:00.000Z', '2026-08-02T00:00:00.000Z')`,
      [ids.affiliateProfile, ids.referrer, ids.affiliateTermsAcceptance],
    );
    await client.query(
      `INSERT INTO growth_terms_acceptances
         (id, user_id, program, terms_version_id, content_hash, accepted_at)
       VALUES ($1::uuid, $2::uuid, 'customer_rewards_referrals', $3::uuid,
               $4, '2026-08-02T00:00:00.000Z')`,
      [ids.termsAcceptance, ids.buyer, ids.terms, termsHash],
    );
    await client.query(
      `INSERT INTO reward_accounts
         (id, buyer_user_id, pending_points, available_points,
          created_at, updated_at)
       VALUES ($1::uuid, $2::uuid, 0, 1000,
               '2026-08-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z')`,
      [ids.rewardAccount, ids.buyer],
    );
  });

  afterEach(async () => client.close());

  function setup() {
    const runTransaction = <Value>(
      work: (sqlClient: GrowthSqlClient) => Promise<Value>,
    ) => client.transaction((transaction) =>
      work({
        query: async <Row extends object>(sql: string, params: readonly unknown[] = []) => {
          const result = await transaction.query<Row>(sql, [...params]);
          return { rows: result.rows };
        },
      }),
    );
    const atomicPort = createPostgresRewardsCheckoutAtomicPort({
      client: { query: (sql, params = []) => client.query(sql, [...params]) },
      runSerializableTransaction: (work) => runTransaction(work),
      keyedUuid,
    });
    const repository = createPostgresCheckoutRepository({
      client: { query: (sql, params = []) => client.query(sql, [...params]) },
      runTransaction: (work) => runTransaction(work),
      sha256,
      keyedUuid,
      retrySleep: async () => undefined,
    });
    const rewardsService = createRewardsService({ atomicPort });
    const referralService = createReferralCheckoutService({
      verifyCookie(value) {
        return value === "signed-task5b-cookie"
          ? Object.freeze({
              schemaVersion: 1 as const,
              program: "customer_referral" as const,
              code: "ref_5BGrowthCommerce",
              issuedAt: "2026-08-20T12:00:00.000Z",
              expiresAt: "2026-09-19T12:00:00.000Z",
            })
          : null;
      },
      loadCandidate: createPostgresReferralCandidateLookup({
        client: { query: (sql, params = []) => client.query(sql, [...params]) },
      }),
    });
    const affiliateService = createAffiliateCheckoutService({
      verifyCookie(value) {
        return value === "signed-task6b-cookie"
          ? Object.freeze({
              schemaVersion: 1 as const,
              program: "affiliate" as const,
              code: "aff_6BOpaqueAttribution9",
              issuedAt: "2026-08-20T12:00:00.000Z",
              expiresAt: "2026-09-19T12:00:00.000Z",
            })
          : null;
      },
      loadCandidate: createPostgresAffiliateCandidateLookup({
        client: { query: (sql, params = []) => client.query(sql, [...params]) },
      }),
    });
    const service = createCheckoutService({
      repository,
      rewardsService,
      referralService,
      affiliateService,
      shippingQuotePort: {
        quoteShipping: async (input) => ({
          status: "ready",
          bindingHash: input.bindingHash,
          reference: "ship_task4",
          service: "Synthetic Ground",
          amountMinor: 700,
          currency: "USD",
        }),
      },
      taxQuotePort: {
        quoteTax: async (input) => ({
          status: "ready",
          bindingHash: input.bindingHash,
          reference: "tax_task4",
          amountMinor: 325,
          currency: "USD",
        }),
      },
      sha256,
      clock: () => new Date(now),
      keyedUuid,
      moneyPolicy: {
        allowedCurrencies: ["USD"],
        maximumLineCount: 50,
        maximumQuantityPerLine: 25,
        maximumOrderAmountMinor: 1_000_000,
      },
    });
    return { service, repository };
  }

  async function quote(
    key: string,
    attributionCookie?: string,
    checkoutRequest = request,
  ) {
    const value = await setup().service.quote({
      buyerUserId: ids.buyer,
      idempotencyKey: key,
      paymentProviderAvailable: true,
      ...(attributionCookie === undefined ? {} : { attributionCookie }),
      request: checkoutRequest,
    });
    expect(value.status).toBe("quoted");
    if (value.status !== "quoted") throw new Error("expected quote");
    return value;
  }

  function providerPreparation(attemptId: string) {
    return {
      authority: "server_prepared_provider_request" as const,
      provider: "local_test" as const,
      providerIdempotencyKey: `checkout_attempt:${attemptId}`,
      providerRequestHash: "c".repeat(64),
      providerExpiresAt: "2026-08-28T13:00:00.000Z",
      providerCustomerEmail: "synthetic.buyer@example.test",
      providerOrigin: "http://127.0.0.1:3000",
      providerRequestSchemaVersion: 1 as const,
      providerLivemode: false,
      providerScope: "local_test:synthetic-propeptiq-v1",
    };
  }

  function lifecycleService() {
    const runTransaction = <Value>(
      work: (sqlClient: GrowthSqlClient) => Promise<Value>,
    ) => client.transaction((transaction) =>
      work({
        query: async <Row extends object>(sql: string, params: readonly unknown[] = []) => {
          const result = await transaction.query<Row>(sql, [...params]);
          return { rows: result.rows };
        },
      }),
    );
    return createPostgresRewardsLifecycleService({
      client: { query: (sql, params = []) => client.query(sql, [...params]) },
      runSerializableTransaction: (work) => runTransaction(work),
      keyedUuid,
    });
  }

  function payoutTransactions() {
    const runSerializableTransaction: GrowthTransactionRunner = (work) =>
      client.transaction((transaction) => work({
        query: async <Row extends object>(sql: string, params: readonly unknown[] = []) => {
          const result = await transaction.query<Row>(sql, [...params]);
          return { rows: result.rows };
        },
      }));
    return {
      create: createPostgresAffiliatePayoutCreateTransaction({ runSerializableTransaction }),
      markPaid: createPostgresAffiliatePayoutPaidTransaction({ runSerializableTransaction }),
    };
  }

  async function prepareAffiliatePayout(providerEventId: string) {
    await client.query(
      `UPDATE lots SET received_quantity = 25, available_quantity = 25
       WHERE id = $1::uuid`,
      [ids.lot],
    );
    const { service } = setup();
    const quoted = await quote(ids.keyA, "signed-task6b-cookie", {
      ...request,
      items: [{ productId: ids.product, quantity: 12 }],
    });
    const prepared = await service.prepare(
      quoted.plan,
      providerPreparation(quoted.plan.identity.attemptId),
    );
    if (prepared.status !== "prepared") throw new Error("expected prepared affiliate order");
    await seedProcessedPayment(prepared.orderId, providerEventId);
    await lifecycleService().reconcileProcessedProviderEvent({
      provider: "stripe",
      providerEventId,
      now,
    });
    await client.query(
      `UPDATE affiliate_commissions
       SET approval_eligible_at = '2026-09-01T00:00:00.000Z'
       WHERE order_id = $1::uuid`,
      [prepared.orderId],
    );
    const payoutId = keyedUuid(`payout:${providerEventId}`);
    const payout = payoutTransactions();
    await payout.create({
      actorUserId: ids.referrer,
      payoutId,
      profileId: ids.affiliateProfile,
      idempotencyKey: `task6-review-payout:${providerEventId}`,
      correlationId: `task6-review-payout-correlation:${providerEventId}`,
      createdAt: new Date("2026-09-30T00:00:00.000Z"),
    });
    return { prepared, payoutId, payout };
  }

  async function seedProcessedPayment(
    orderId: string,
    providerEventId: string,
    occurredAt = now,
  ) {
    const providerDatabaseId = keyedUuid(`provider:${providerEventId}`);
    const paymentEventId = keyedUuid(`payment:${providerEventId}`);
    const total = await client.query<{ totalMinor: number }>(
      `SELECT total_minor AS "totalMinor" FROM orders WHERE id = $1::uuid`,
      [orderId],
    );
    await client.query(
      `INSERT INTO provider_events
         (id, provider, provider_event_id, payload_hash, status, attempt_count,
          received_at, processed_at, event_type, schema_version,
          normalized_payload, provider_created_at, livemode)
       VALUES ($1::uuid, 'stripe', $2, $3, 'processed', 1,
               $4::timestamptz, $4::timestamptz,
               'checkout.session.completed', 1, '{}'::jsonb, $4::timestamptz, false)`,
      [providerDatabaseId, providerEventId, "d".repeat(64), occurredAt.toISOString()],
    );
    await client.query(
      `INSERT INTO payment_events
         (id, provider_event_id, order_id, event_type, provider_payment_id,
          idempotency_key, amount_minor, currency, occurred_at)
       VALUES ($1::uuid, $2::uuid, $3::uuid, 'payment_verified', $4, $5,
               $6, 'USD', $7::timestamptz)`,
      [
        paymentEventId,
        providerDatabaseId,
        orderId,
        `pi_${providerEventId}`,
        `stripe:payment:${providerEventId}`,
        total.rows[0]!.totalMinor,
        occurredAt.toISOString(),
      ],
    );
    return { providerDatabaseId, paymentEventId };
  }

  async function seedProcessedFinancialEvent(input: Readonly<{
    orderId: string;
    providerEventId: string;
    eventType: "refund_verified" | "dispute_recorded";
    amountMinor: number;
    occurredAt: Date;
  }>) {
    const providerDatabaseId = keyedUuid(`provider:${input.providerEventId}`);
    await client.query(
      `INSERT INTO provider_events
         (id, provider, provider_event_id, payload_hash, status, attempt_count,
          processed_at, event_type, schema_version, normalized_payload,
          provider_created_at, livemode)
       VALUES ($1::uuid, 'stripe', $2, $3, 'processed', 1,
               $4::timestamptz, $5, 1, '{}'::jsonb,
               $4::timestamptz, false)`,
      [providerDatabaseId, input.providerEventId, "9".repeat(64),
        input.occurredAt.toISOString(), input.eventType],
    );
    await client.query(
      `INSERT INTO payment_events
         (id, provider_event_id, order_id, event_type, provider_payment_id,
          idempotency_key, amount_minor, currency, occurred_at)
       VALUES ($1::uuid, $2::uuid, $3::uuid, $4::payment_event_type,
               $5, $6, $7, 'USD', $8::timestamptz)`,
      [keyedUuid(`payment:${input.providerEventId}`), providerDatabaseId,
        input.orderId, input.eventType,
        `${input.eventType}_${input.providerEventId}`,
        `stripe:${input.eventType}:${input.providerEventId}`,
        input.amountMinor, input.occurredAt.toISOString()],
    );
  }

  async function preparePaidOrder() {
    const { service } = setup();
    const quoted = await quote(ids.keyA);
    const prepared = await service.prepare(
      quoted.plan,
      providerPreparation(quoted.plan.identity.attemptId),
    );
    if (prepared.status !== "prepared") throw new Error("expected prepared");
    await seedProcessedPayment(prepared.orderId, "evt_task4_payment");
    const lifecycle = lifecycleService();
    await lifecycle.reconcileProcessedProviderEvent({
      provider: "stripe",
      providerEventId: "evt_task4_payment",
      now,
    });
    return { prepared, lifecycle };
  }

  it("appends one pending affiliate commission, schedules delivery eligibility, and applies cumulative proportional reversals", async () => {
    const { service } = setup();
    const quoted = await quote(ids.keyA, "signed-task6b-cookie");
    const prepared = await service.prepare(
      quoted.plan,
      providerPreparation(quoted.plan.identity.attemptId),
    );
    if (prepared.status !== "prepared") throw new Error("expected prepared affiliate order");
    const binding = await client.query<{ attributions: number; snapshots: number }>(
      `SELECT (SELECT count(*)::int FROM affiliate_attributions) AS attributions,
              (SELECT count(*)::int FROM order_growth_attributions
               WHERE order_id = $1::uuid AND program = 'affiliate') AS snapshots`,
      [prepared.orderId],
    );
    expect(binding.rows[0]).toEqual({ attributions: 1, snapshots: 1 });
    await expect(service.prepare(
      quoted.plan,
      providerPreparation(quoted.plan.identity.attemptId),
    )).resolves.toMatchObject({ status: "loaded" });
    const replayedBinding = await client.query<{ attributions: number; snapshots: number }>(
      `SELECT (SELECT count(*)::int FROM affiliate_attributions) AS attributions,
              (SELECT count(*)::int FROM order_growth_attributions
               WHERE order_id = $1::uuid AND program = 'affiliate') AS snapshots`,
      [prepared.orderId],
    );
    expect(replayedBinding.rows[0]).toEqual({ attributions: 1, snapshots: 1 });
    await seedProcessedPayment(prepared.orderId, "evt_task6b_payment");
    const lifecycle = lifecycleService();

    await expect(lifecycle.reconcileProcessedProviderEvent({
      provider: "stripe",
      providerEventId: "evt_task6b_payment",
      now,
    })).resolves.toEqual({ status: "applied" });
    await expect(lifecycle.reconcileProcessedProviderEvent({
      provider: "stripe",
      providerEventId: "evt_task6b_payment",
      now,
    })).resolves.toEqual({ status: "idempotent" });
    const paid = await client.query<{
      count: number;
      gross: number;
      reversed: number;
      status: string;
      eligibleAt: Date | string | null;
    }>(
      `SELECT count(*)::int AS count, max(gross_commission_minor)::int AS gross,
              max(reversed_commission_minor)::int AS reversed,
              max(status)::text AS status,
              max(approval_eligible_at) AS "eligibleAt"
       FROM affiliate_commissions WHERE order_id = $1::uuid`,
      [prepared.orderId],
    );
    expect(paid.rows[0]).toEqual({
      count: 1,
      gross: 925,
      reversed: 0,
      status: "pending",
      eligibleAt: null,
    });

    const payment = await client.query<{ id: string }>(
      `SELECT id::text AS id FROM payment_events
       WHERE order_id = $1::uuid AND event_type = 'payment_verified'`,
      [prepared.orderId],
    );
    const releaseId = keyedUuid(`task6b-release:${prepared.orderId}`);
    const deliveredAt = new Date("2026-08-28T12:04:00.000Z");
    await client.query(
      `INSERT INTO fulfillment_releases
         (id, order_id, version, idempotency_key, payment_event_id, state,
          issued_at, expires_at, consumed_at)
       VALUES ($1::uuid, $2::uuid, 1, $3, $4::uuid, 'consumed',
               '2026-08-28T12:01:00.000Z', '2026-08-29T12:01:00.000Z',
               '2026-08-28T12:02:00.000Z')`,
      [releaseId, prepared.orderId, `task6b-release:${prepared.orderId}`,
        payment.rows[0]!.id],
    );
    await client.query(
      `INSERT INTO shipments
         (id, order_id, fulfillment_release_id, carrier, tracking_reference,
          state, handed_off_at, delivered_at)
       VALUES ($1::uuid, $2::uuid, $3::uuid, 'SYNTHETIC-6B', $4, 'delivered',
               '2026-08-28T12:03:00.000Z', $5::timestamptz)`,
      [keyedUuid(`task6b-shipment:${prepared.orderId}`), prepared.orderId,
        releaseId, `task6b-${prepared.orderId}`, deliveredAt.toISOString()],
    );
    await expect(lifecycle.reconcileDeliveredOrder({
      orderId: prepared.orderId,
      now: deliveredAt,
    })).resolves.toEqual({ status: "applied" });
    await expect(lifecycle.reconcileDeliveredOrder({
      orderId: prepared.orderId,
      now: deliveredAt,
    })).resolves.toEqual({ status: "idempotent" });
    const eligibility = await client.query<{ eligibleAt: Date | string }>(
      `SELECT approval_eligible_at AS "eligibleAt" FROM affiliate_commissions
       WHERE order_id = $1::uuid`,
      [prepared.orderId],
    );
    expect(new Date(eligibility.rows[0]!.eligibleAt).toISOString())
      .toBe("2026-09-27T12:04:00.000Z");

    await seedProcessedFinancialEvent({
      orderId: prepared.orderId,
      providerEventId: "evt_task6b_tax_refund",
      eventType: "refund_verified",
      amountMinor: 325,
      occurredAt: new Date("2026-08-29T12:00:00.000Z"),
    });
    await lifecycle.reconcileProcessedProviderEvent({
      provider: "stripe",
      providerEventId: "evt_task6b_tax_refund",
      now: new Date("2026-08-29T12:00:00.000Z"),
    });
    let reversal = await client.query<{ reversed: number; status: string }>(
      `SELECT reversed_commission_minor::int AS reversed, status::text
       FROM affiliate_commissions WHERE order_id = $1::uuid`,
      [prepared.orderId],
    );
    expect(reversal.rows[0]).toEqual({ reversed: 0, status: "pending" });

    await seedProcessedFinancialEvent({
      orderId: prepared.orderId,
      providerEventId: "evt_task6b_shipping_refund",
      eventType: "refund_verified",
      amountMinor: 700,
      occurredAt: new Date("2026-08-29T12:01:00.000Z"),
    });
    await lifecycle.reconcileProcessedProviderEvent({
      provider: "stripe",
      providerEventId: "evt_task6b_shipping_refund",
      now: new Date("2026-08-29T12:01:00.000Z"),
    });
    reversal = await client.query<{ reversed: number; status: string }>(
      `SELECT reversed_commission_minor::int AS reversed, status::text
       FROM affiliate_commissions WHERE order_id = $1::uuid`,
      [prepared.orderId],
    );
    expect(reversal.rows[0]).toEqual({ reversed: 0, status: "pending" });

    await seedProcessedFinancialEvent({
      orderId: prepared.orderId,
      providerEventId: "evt_task6b_merchandise_refund",
      eventType: "refund_verified",
      amountMinor: 4_625,
      occurredAt: new Date("2026-08-29T12:02:00.000Z"),
    });
    await lifecycle.reconcileProcessedProviderEvent({
      provider: "stripe",
      providerEventId: "evt_task6b_merchandise_refund",
      now: new Date("2026-08-29T12:02:00.000Z"),
    });
    reversal = await client.query<{ reversed: number; status: string }>(
      `SELECT reversed_commission_minor::int AS reversed, status::text
       FROM affiliate_commissions WHERE order_id = $1::uuid`,
      [prepared.orderId],
    );
    expect(reversal.rows[0]).toEqual({ reversed: 462, status: "pending" });

    await seedProcessedFinancialEvent({
      orderId: prepared.orderId,
      providerEventId: "evt_task6b_chargeback",
      eventType: "dispute_recorded",
      amountMinor: 10_275,
      occurredAt: new Date("2026-08-30T12:00:00.000Z"),
    });
    await lifecycle.reconcileProcessedProviderEvent({
      provider: "stripe",
      providerEventId: "evt_task6b_chargeback",
      now: new Date("2026-08-30T12:00:00.000Z"),
    });
    await expect(lifecycle.reconcileProcessedProviderEvent({
      provider: "stripe",
      providerEventId: "evt_task6b_chargeback",
      now: new Date("2026-08-30T12:00:00.000Z"),
    })).resolves.toEqual({ status: "idempotent" });
    const reversed = await client.query<{
      count: number;
      gross: number;
      reversed: number;
      status: string;
    }>(
      `SELECT count(*)::int AS count, max(gross_commission_minor)::int AS gross,
              max(reversed_commission_minor)::int AS reversed,
              max(status)::text AS status
       FROM affiliate_commissions WHERE order_id = $1::uuid`,
      [prepared.orderId],
    );
    expect(reversed.rows[0]).toEqual({
      count: 1,
      gross: 925,
      reversed: 925,
      status: "reversed",
    });
  });

  it("settles the immutable order-bound policy after it is superseded while denying a currently ineligible partner", async () => {
    const { service } = setup();
    const quoted = await quote(ids.keyA, "signed-task6b-cookie");
    const prepared = await service.prepare(
      quoted.plan,
      providerPreparation(quoted.plan.identity.attemptId),
    );
    if (prepared.status !== "prepared") throw new Error("expected prepared affiliate order");

    await client.query(
      `UPDATE affiliate_policies
       SET status = 'superseded', superseded_at = $2::timestamptz
       WHERE id = $1::uuid`,
      [ids.affiliatePolicy, "2026-08-28T12:01:00.000Z"],
    );
    await seedProcessedPayment(
      prepared.orderId,
      "evt_task6_bound_policy_superseded",
      new Date("2026-08-28T12:02:00.000Z"),
    );

    const lifecycle = lifecycleService();
    await expect(lifecycle.reconcileProcessedProviderEvent({
      provider: "stripe",
      providerEventId: "evt_task6_bound_policy_superseded",
      now: new Date("2026-08-28T12:02:00.000Z"),
    })).resolves.toEqual({ status: "applied" });
    const commission = await client.query<{
      count: number;
      gross: number;
      status: string;
      policyId: string;
      policyVersion: number;
    }>(
      `SELECT count(*)::int AS count,
              max(gross_commission_minor)::int AS gross,
              max(status)::text AS status,
              max(affiliate_policy_id::text) AS "policyId",
              max(affiliate_policy_version)::int AS "policyVersion"
       FROM affiliate_commissions WHERE order_id = $1::uuid`,
      [prepared.orderId],
    );
    expect(commission.rows[0]).toEqual({
      count: 1,
      gross: 925,
      status: "pending",
      policyId: ids.affiliatePolicy,
      policyVersion: 1,
    });
  });

  it.each(["suspended", "rejected"] as const)(
    "does not create a commission for a currently %s partner after order binding",
    async (profileStatus) => {
      const { service } = setup();
      const quoted = await quote(ids.keyA, "signed-task6b-cookie");
      const prepared = await service.prepare(
        quoted.plan,
        providerPreparation(quoted.plan.identity.attemptId),
      );
      if (prepared.status !== "prepared") throw new Error("expected prepared affiliate order");
      await client.query(
        `UPDATE affiliate_profiles SET status = $2::affiliate_profile_status
         WHERE id = $1::uuid`,
        [ids.affiliateProfile, profileStatus],
      );
      const providerEventId = `evt_task6_bound_partner_${profileStatus}`;
      await seedProcessedPayment(prepared.orderId, providerEventId);

      await expect(lifecycleService().reconcileProcessedProviderEvent({
        provider: "stripe",
        providerEventId,
        now,
      })).resolves.toEqual({ status: "applied" });
      const commissions = await client.query<{ count: number }>(
        `SELECT count(*)::int AS count FROM affiliate_commissions
         WHERE order_id = $1::uuid`,
        [prepared.orderId],
      );
      expect(commissions.rows).toEqual([{ count: 0 }]);
    },
  );

  it("adjusts then cancels an unpaid payout as cumulative verified loss reaches the original commission", async () => {
    const { prepared, payoutId, payout } = await prepareAffiliatePayout("evt_task6_unpaid_reversal_payment");
    const lifecycle = lifecycleService();
    await seedProcessedFinancialEvent({
      orderId: prepared.orderId,
      providerEventId: "evt_task6_unpaid_partial_refund",
      eventType: "refund_verified",
      amountMinor: 11_025,
      occurredAt: new Date("2026-10-01T00:00:00.000Z"),
    });

    await expect(lifecycle.reconcileProcessedProviderEvent({
      provider: "stripe",
      providerEventId: "evt_task6_unpaid_partial_refund",
      now: new Date("2026-10-01T00:00:00.000Z"),
    })).resolves.toEqual({ status: "applied" });
    let state = await client.query<{
      reversed: number;
      commissionStatus: string;
      commissionPayoutId: string | null;
      payoutAmount: number;
      payoutState: string;
      adjustmentTotal: number;
    }>(
      `SELECT ac.reversed_commission_minor::int AS reversed,
              ac.status::text AS "commissionStatus",
              ac.payout_id::text AS "commissionPayoutId",
              ap.amount_minor::int AS "payoutAmount",
              ap.state::text AS "payoutState",
              (SELECT coalesce(sum(amount_minor), 0)::int
               FROM affiliate_commission_adjustments
               WHERE affiliate_commission_id = ac.id) AS "adjustmentTotal"
       FROM affiliate_commissions ac
       JOIN affiliate_payouts ap ON ap.id = $2::uuid
       WHERE ac.order_id = $1::uuid`,
      [prepared.orderId, payoutId],
    );
    expect(state.rows[0]).toEqual({
      reversed: 1_000,
      commissionStatus: "approved",
      commissionPayoutId: null,
      payoutAmount: 5_925,
      payoutState: "cancelled",
      adjustmentTotal: 1_000,
    });

    await seedProcessedFinancialEvent({
      orderId: prepared.orderId,
      providerEventId: "evt_task6_unpaid_full_chargeback",
      eventType: "dispute_recorded",
      amountMinor: 60_275,
      occurredAt: new Date("2026-10-02T00:00:00.000Z"),
    });
    await expect(lifecycle.reconcileProcessedProviderEvent({
      provider: "stripe",
      providerEventId: "evt_task6_unpaid_full_chargeback",
      now: new Date("2026-10-02T00:00:00.000Z"),
    })).resolves.toEqual({ status: "applied" });
    await expect(lifecycle.reconcileProcessedProviderEvent({
      provider: "stripe",
      providerEventId: "evt_task6_unpaid_full_chargeback",
      now: new Date("2026-10-02T00:00:00.000Z"),
    })).resolves.toEqual({ status: "idempotent" });
    state = await client.query(
      `SELECT ac.reversed_commission_minor::int AS reversed,
              ac.status::text AS "commissionStatus",
              ac.payout_id::text AS "commissionPayoutId",
              ap.amount_minor::int AS "payoutAmount",
              ap.state::text AS "payoutState",
              (SELECT coalesce(sum(amount_minor), 0)::int
               FROM affiliate_commission_adjustments
               WHERE affiliate_commission_id = ac.id) AS "adjustmentTotal"
       FROM affiliate_commissions ac
       JOIN affiliate_payouts ap ON ap.id = $2::uuid
       WHERE ac.order_id = $1::uuid`,
      [prepared.orderId, payoutId],
    );
    expect(state.rows[0]).toEqual({
      reversed: 5_925,
      commissionStatus: "reversed",
      commissionPayoutId: null,
      payoutAmount: 5_925,
      payoutState: "cancelled",
      adjustmentTotal: 5_925,
    });
    await expect(payout.create({
      actorUserId: ids.referrer,
      payoutId,
      profileId: ids.affiliateProfile,
      idempotencyKey: "task6-review-payout:evt_task6_unpaid_reversal_payment",
      correlationId: "task6-review-payout-correlation:evt_task6_unpaid_reversal_payment",
      createdAt: new Date("2026-09-30T00:00:00.000Z"),
    })).resolves.toMatchObject({
      status: "idempotent",
      payout: {
        id: payoutId,
        amountMinor: 5_925,
        commissionIds: [keyedUuid(`affiliate-commission:${prepared.orderId}`)],
      },
    });
  });

  it("preserves paid evidence and appends a bounded outstanding liability adjustment", async () => {
    const { prepared, payoutId, payout } = await prepareAffiliatePayout("evt_task6_paid_reversal_payment");
    const paidAt = new Date("2026-10-01T00:00:00.000Z");
    await payout.markPaid({
      actorUserId: ids.referrer,
      payoutId,
      expectedVersion: 1,
      idempotencyKey: "task6-review-paid-reversal",
      providerName: "Synthetic offline operator",
      externalReference: "synthetic-paid-evidence-001",
      correlationId: "task6-review-paid-reversal-correlation",
      paidAt,
    });
    await seedProcessedFinancialEvent({
      orderId: prepared.orderId,
      providerEventId: "evt_task6_paid_full_refund",
      eventType: "refund_verified",
      amountMinor: 60_275,
      occurredAt: new Date("2026-10-02T00:00:00.000Z"),
    });

    const lifecycle = lifecycleService();
    await expect(lifecycle.reconcileProcessedProviderEvent({
      provider: "stripe",
      providerEventId: "evt_task6_paid_full_refund",
      now: new Date("2026-10-02T00:00:00.000Z"),
    })).resolves.toEqual({ status: "applied" });
    await expect(lifecycle.reconcileProcessedProviderEvent({
      provider: "stripe",
      providerEventId: "evt_task6_paid_full_refund",
      now: new Date("2026-10-02T00:00:00.000Z"),
    })).resolves.toEqual({ status: "idempotent" });
    const state = await client.query<{
      payoutState: string;
      payoutAmount: number;
      provider: string;
      reference: string;
      paidAt: Date | string;
      commissionStatus: string;
      reversed: number;
      adjustmentAmount: number;
      settlementPayoutId: string | null;
    }>(
      `SELECT ap.state::text AS "payoutState", ap.amount_minor::int AS "payoutAmount",
              ap.external_provider AS provider, ap.external_reference AS reference,
              ap.paid_at AS "paidAt", ac.status::text AS "commissionStatus",
              ac.reversed_commission_minor::int AS reversed,
              adj.amount_minor::int AS "adjustmentAmount",
              adj.settlement_payout_id::text AS "settlementPayoutId"
       FROM affiliate_payouts ap
       JOIN affiliate_commissions ac ON ac.payout_id = ap.id
       JOIN affiliate_commission_adjustments adj ON adj.affiliate_commission_id = ac.id
       WHERE ap.id = $1::uuid`,
      [payoutId],
    );
    expect({ ...state.rows[0], paidAt: new Date(state.rows[0]!.paidAt).toISOString() }).toEqual({
      payoutState: "paid",
      payoutAmount: 5_925,
      provider: "Synthetic offline operator",
      reference: "synthetic-paid-evidence-001",
      paidAt: paidAt.toISOString(),
      commissionStatus: "paid",
      reversed: 5_925,
      adjustmentAmount: 5_925,
      settlementPayoutId: null,
    });
  });

  it("reserves points with checkout preparation and exact replay subtracts available balance once", async () => {
    const { service } = setup();
    const quoted = await quote(ids.keyA);
    const prepared = await service.prepare(
      quoted.plan,
      providerPreparation(quoted.plan.identity.attemptId),
    );
    expect(prepared).toMatchObject({ status: "prepared" });
    await expect(
      service.prepare(
        quoted.plan,
        providerPreparation(quoted.plan.identity.attemptId),
      ),
    ).resolves.toMatchObject({ status: "loaded" });

    const state = await client.query<{
      availablePoints: number;
      reservations: number;
      ledgerEntries: number;
      redemptionState: string;
    }>(
      `SELECT
         (SELECT available_points FROM reward_accounts WHERE buyer_user_id = $1::uuid)
           AS "availablePoints",
         (SELECT count(*)::int FROM reward_redemptions) AS reservations,
         (SELECT count(*)::int FROM reward_ledger_entries
          WHERE kind = 'redemption_reserved') AS "ledgerEntries",
         (SELECT state FROM reward_redemptions LIMIT 1) AS "redemptionState"`,
      [ids.buyer],
    );
    expect(state.rows[0]).toEqual({
      availablePoints: 250,
      reservations: 1,
      ledgerEntries: 1,
      redemptionState: "reserved",
    });
  });

  it("binds one server-verified referral to the first prepared order and snapshots only the winning acquisition discount", async () => {
    const { service } = setup();
    const quoted = await quote(ids.keyA, "signed-task5b-cookie");
    expect(quoted.quote).toMatchObject({
      promotionDiscountMinor: 0,
      referralDiscountMinor: 1_000,
      rewardRedemptionMinor: 750,
      discountMinor: 1_750,
    });

    const prepared = await service.prepare(
      quoted.plan,
      providerPreparation(quoted.plan.identity.attemptId),
    );
    expect(prepared).toMatchObject({ status: "prepared" });
    if (prepared.status !== "prepared") throw new Error("expected prepared referral order");
    await expect(service.prepare(
      quoted.plan,
      providerPreparation(quoted.plan.identity.attemptId),
    )).resolves.toMatchObject({ status: "loaded" });

    const growth = await client.query<{
      attributions: number;
      orderAttributions: number;
      conversions: number;
      policyId: string;
      policyVersion: number;
      referredDiscountMinor: number;
      referrerRewardPoints: number;
    }>(
      `SELECT
         (SELECT count(*)::int FROM referral_attributions) AS attributions,
         (SELECT count(*)::int FROM order_growth_attributions) AS "orderAttributions",
         (SELECT count(*)::int FROM referral_conversions) AS conversions,
         rc.referral_policy_id::text AS "policyId",
         rc.referral_policy_version AS "policyVersion",
         rc.referred_discount_minor AS "referredDiscountMinor",
         rc.referrer_reward_points AS "referrerRewardPoints"
       FROM referral_conversions rc`,
    );
    expect(growth.rows[0]).toEqual({
      attributions: 1,
      orderAttributions: 1,
      conversions: 1,
      policyId: ids.referralPolicy,
      policyVersion: 1,
      referredDiscountMinor: 1_000,
      referrerRewardPoints: 412,
    });

    await seedProcessedPayment(prepared.orderId, "evt_task5b_referral_payment");
    const lifecycle = lifecycleService();
    await expect(lifecycle.reconcileProcessedProviderEvent({
      provider: "stripe",
      providerEventId: "evt_task5b_referral_payment",
      now,
    })).resolves.toEqual({ status: "applied" });
    await expect(lifecycle.reconcileProcessedProviderEvent({
      provider: "stripe",
      providerEventId: "evt_task5b_referral_payment",
      now,
    })).resolves.toEqual({ status: "idempotent" });
    const referralReward = await client.query<{
      pending: number;
      available: number;
      entries: number;
      conversionStatus: string;
    }>(
      `SELECT pending_points AS pending, available_points AS available,
              (SELECT count(*)::int FROM reward_ledger_entries
               WHERE buyer_user_id = $1::uuid
                 AND kind = 'referral_earned_pending') AS entries,
              (SELECT status FROM referral_conversions
               WHERE first_order_id = $2::uuid) AS "conversionStatus"
       FROM reward_accounts WHERE buyer_user_id = $1::uuid`,
      [ids.referrer, prepared.orderId],
    );
    expect(referralReward.rows[0]).toEqual({
      pending: 412,
      available: 0,
      entries: 1,
      conversionStatus: "qualified",
    });

    const payment = await client.query<{ id: string }>(
      `SELECT id::text AS id FROM payment_events
       WHERE order_id = $1::uuid AND event_type = 'payment_verified'`,
      [prepared.orderId],
    );
    const releaseId = keyedUuid(`task5b-release:${prepared.orderId}`);
    await client.query(
      `INSERT INTO fulfillment_releases
         (id, order_id, version, idempotency_key, payment_event_id, state,
          issued_at, expires_at, consumed_at)
       VALUES ($1::uuid, $2::uuid, 1, $3, $4::uuid, 'consumed',
               $5::timestamptz, $6::timestamptz, $7::timestamptz)`,
      [releaseId, prepared.orderId, `task5b-release:${prepared.orderId}`,
        payment.rows[0]!.id, "2026-08-28T12:01:00.000Z",
        "2026-08-29T12:01:00.000Z", "2026-08-28T12:02:00.000Z"],
    );
    await client.query(
      `INSERT INTO shipments
         (id, order_id, fulfillment_release_id, carrier, tracking_reference,
          state, handed_off_at, delivered_at)
       VALUES ($1::uuid, $2::uuid, $3::uuid, 'SYNTHETIC-5B', $4,
               'delivered', $5::timestamptz, $6::timestamptz)`,
      [keyedUuid(`task5b-shipment:${prepared.orderId}`), prepared.orderId,
        releaseId, `task5b-${prepared.orderId}`, "2026-08-28T12:03:00.000Z",
        "2026-08-28T12:04:00.000Z"],
    );
    await expect(lifecycle.reconcileDeliveredOrder({
      orderId: prepared.orderId,
      now: new Date("2026-08-28T12:04:00.000Z"),
    })).resolves.toEqual({ status: "applied" });
    await expect(lifecycle.reconcileDeliveredOrder({
      orderId: prepared.orderId,
      now: new Date("2026-08-28T12:04:00.000Z"),
    })).resolves.toEqual({ status: "idempotent" });
    const deliveredReward = await client.query<{
      pending: number;
      available: number;
      entries: number;
    }>(
      `SELECT pending_points AS pending, available_points AS available,
              (SELECT count(*)::int FROM reward_ledger_entries
               WHERE buyer_user_id = $1::uuid
                 AND kind = 'referral_earned_available') AS entries
       FROM reward_accounts WHERE buyer_user_id = $1::uuid`,
      [ids.referrer],
    );
    expect(deliveredReward.rows[0]).toEqual({
      pending: 0,
      available: 412,
      entries: 1,
    });

    // Spending after delivery may leave the referrer unable to cover a later
    // authoritative reversal; the approved ledger permits a negative balance.
    await client.query(
      `UPDATE reward_accounts SET available_points = 100
       WHERE buyer_user_id = $1::uuid`,
      [ids.referrer],
    );
    const insertFinancialEvent = async (
      providerEventId: string,
      eventType: "refund_verified" | "dispute_recorded",
      amountMinor: number,
      occurredAt = now,
    ) => {
      const providerDatabaseId = keyedUuid(`provider:${providerEventId}`);
      await client.query(
        `INSERT INTO provider_events
           (id, provider, provider_event_id, payload_hash, status, attempt_count,
            processed_at, event_type, schema_version, normalized_payload,
            provider_created_at, livemode)
         VALUES ($1::uuid, 'stripe', $2, $3, 'processed', 1,
                 $4::timestamptz, $5, 1, '{}'::jsonb,
                 $4::timestamptz, false)`,
        [providerDatabaseId, providerEventId, "a".repeat(64),
          occurredAt.toISOString(), eventType],
      );
      await client.query(
        `INSERT INTO payment_events
           (id, provider_event_id, order_id, event_type, provider_payment_id,
            idempotency_key, amount_minor, currency, occurred_at)
         VALUES ($1::uuid, $2::uuid, $3::uuid, $4::payment_event_type,
                 $5, $6, $7, 'USD', $8::timestamptz)`,
        [keyedUuid(`payment:${providerEventId}`), providerDatabaseId,
          prepared.orderId, eventType, `${eventType}_${providerEventId}`,
          `stripe:${eventType}:${providerEventId}`, amountMinor,
          occurredAt.toISOString()],
      );
    };
    await insertFinancialEvent("evt_task5b_refund", "refund_verified", 4_125);
    await expect(lifecycle.reconcileProcessedProviderEvent({
      provider: "stripe",
      providerEventId: "evt_task5b_refund",
      now,
    })).resolves.toEqual({ status: "applied" });
    await insertFinancialEvent("evt_task5b_chargeback", "dispute_recorded", 8_250);
    await expect(lifecycle.reconcileProcessedProviderEvent({
      provider: "stripe",
      providerEventId: "evt_task5b_chargeback",
      now,
    })).resolves.toEqual({ status: "applied" });
    await expect(lifecycle.reconcileProcessedProviderEvent({
      provider: "stripe",
      providerEventId: "evt_task5b_chargeback",
      now,
    })).resolves.toEqual({ status: "idempotent" });
    await insertFinancialEvent(
      "evt_task5b_post_full_refund",
      "refund_verified",
      100,
      new Date("2026-08-28T12:00:01.000Z"),
    );
    await expect(lifecycle.reconcileProcessedProviderEvent({
      provider: "stripe",
      providerEventId: "evt_task5b_post_full_refund",
      now,
    })).resolves.toEqual({ status: "idempotent" });
    const reversedReward = await client.query<{
      available: number;
      reversals: number;
      reversedPoints: number;
      conversionStatus: string;
    }>(
      `SELECT available_points AS available,
              (SELECT count(*)::int FROM reward_ledger_entries
               WHERE buyer_user_id = $1::uuid
                 AND source_type = 'referral_payment_event'
                 AND kind IN ('refund_reversal', 'chargeback_reversal')) AS reversals,
              (SELECT -sum(available_points_delta)::int FROM reward_ledger_entries
               WHERE buyer_user_id = $1::uuid
                 AND source_type = 'referral_payment_event') AS "reversedPoints",
              (SELECT status FROM referral_conversions
               WHERE first_order_id = $2::uuid) AS "conversionStatus"
       FROM reward_accounts WHERE buyer_user_id = $1::uuid`,
      [ids.referrer, prepared.orderId],
    );
    expect(reversedReward.rows[0]).toEqual({
      available: -312,
      reversals: 2,
      reversedPoints: 412,
      conversionStatus: "reversed",
    });
    await expect(lifecycle.reconcileProcessedProviderEvent({
      provider: "stripe",
      providerEventId: "evt_task5b_referral_payment",
      now,
    })).resolves.toEqual({ status: "idempotent" });
    const paymentReplay = await client.query<{
      conversionStatus: string;
      referralEntries: number;
    }>(
      `SELECT
         (SELECT status FROM referral_conversions
          WHERE first_order_id = $1::uuid) AS "conversionStatus",
         (SELECT count(*)::int FROM reward_ledger_entries
          WHERE buyer_user_id = $2::uuid
            AND kind IN ('referral_earned_pending', 'referral_earned_available',
                         'refund_reversal', 'chargeback_reversal'))
           AS "referralEntries"`,
      [prepared.orderId, ids.referrer],
    );
    expect(paymentReplay.rows[0]).toEqual({
      conversionStatus: "reversed",
      referralEntries: 4,
    });
  });

  it("fully reverses a qualified zero-point referral without appending ledger points", async () => {
    await client.query(
      `UPDATE product_prices SET amount_minor = 1 WHERE id = $1::uuid`,
      [ids.price],
    );
    const { service } = setup();
    const quoted = await quote(ids.keyA, "signed-task5b-cookie");
    const prepared = await service.prepare(
      quoted.plan,
      providerPreparation(quoted.plan.identity.attemptId),
    );
    if (prepared.status !== "prepared") throw new Error("expected prepared zero-point referral");
    await seedProcessedPayment(prepared.orderId, "evt_task5b_zero_referral_payment");
    const lifecycle = lifecycleService();
    await expect(lifecycle.reconcileProcessedProviderEvent({
      provider: "stripe",
      providerEventId: "evt_task5b_zero_referral_payment",
      now,
    })).resolves.toEqual({ status: "applied" });
    await seedProcessedFinancialEvent({
      orderId: prepared.orderId,
      providerEventId: "evt_task5b_zero_referral_partial_refund",
      eventType: "refund_verified",
      amountMinor: 1,
      occurredAt: new Date("2026-08-28T12:00:01.000Z"),
    });

    await expect(lifecycle.reconcileProcessedProviderEvent({
      provider: "stripe",
      providerEventId: "evt_task5b_zero_referral_partial_refund",
      now: new Date("2026-08-28T12:00:01.000Z"),
    })).resolves.toEqual({ status: "idempotent" });
    const partialState = await client.query<{ status: string }>(
      `SELECT status FROM referral_conversions WHERE first_order_id = $1::uuid`,
      [prepared.orderId],
    );
    expect(partialState.rows[0]).toEqual({ status: "qualified" });
    await seedProcessedFinancialEvent({
      orderId: prepared.orderId,
      providerEventId: "evt_task5b_zero_referral_final_refund",
      eventType: "refund_verified",
      amountMinor: 1,
      occurredAt: new Date("2026-08-28T12:00:02.000Z"),
    });

    await expect(lifecycle.reconcileProcessedProviderEvent({
      provider: "stripe",
      providerEventId: "evt_task5b_zero_referral_final_refund",
      now: new Date("2026-08-28T12:00:02.000Z"),
    })).resolves.toEqual({ status: "applied" });
    const state = await client.query<{
      status: string;
      rewardPoints: number;
      referralLedgerEntries: number;
      referrerAccounts: number;
    }>(
      `SELECT status, referrer_reward_points AS "rewardPoints",
              (SELECT count(*)::int FROM reward_ledger_entries
               WHERE source_type IN ('referral_conversion',
                                     'referral_payment_event'))
                AS "referralLedgerEntries",
              (SELECT count(*)::int FROM reward_accounts
               WHERE buyer_user_id = $1::uuid) AS "referrerAccounts"
       FROM referral_conversions WHERE first_order_id = $2::uuid`,
      [ids.referrer, prepared.orderId],
    );
    expect(state.rows[0]).toEqual({
      status: "reversed",
      rewardPoints: 0,
      referralLedgerEntries: 0,
      referrerAccounts: 0,
    });
  });

  it.each([
    ["revoked code", async () => client.query(
      `UPDATE referral_codes SET status = 'revoked', revoked_at = $2::timestamptz
       WHERE id = $1::uuid`,
      [ids.referralCode, now.toISOString()],
    )],
    ["overlapping current policy", async () => {
      await client.query(`DROP INDEX referral_policies_current_active_unique`);
      await client.query(
        `INSERT INTO referral_policies
           (id, version, status, attribution_days, referred_discount_basis_points,
            referred_discount_cap_minor, referrer_points_per_dollar,
            referrer_reward_cap_points, effective_at)
         VALUES ($1::uuid, 2, 'active', 30, 1000, 2500, 5, 2500,
                 '2026-08-20T00:00:00.000Z')`,
        [keyedUuid("task5b-overlapping-referral-policy")],
      );
    }],
  ] as const)("rolls back checkout, rewards, inventory, and growth writes for %s after quote", async (_label, mutate) => {
    const { service } = setup();
    const quoted = await quote(ids.keyA, "signed-task5b-cookie");
    await mutate();

    await expect(service.prepare(
      quoted.plan,
      providerPreparation(quoted.plan.identity.attemptId),
    )).resolves.toEqual({ status: "facts_changed_retry" });

    const state = await client.query<{
      orders: number;
      attempts: number;
      reservations: number;
      redemptions: number;
      attributions: number;
      conversions: number;
      availableQuantity: number;
      availablePoints: number;
    }>(
      `SELECT
         (SELECT count(*)::int FROM orders) AS orders,
         (SELECT count(*)::int FROM checkout_attempts) AS attempts,
         (SELECT count(*)::int FROM inventory_reservations) AS reservations,
         (SELECT count(*)::int FROM reward_redemptions) AS redemptions,
         (SELECT count(*)::int FROM referral_attributions) AS attributions,
         (SELECT count(*)::int FROM referral_conversions) AS conversions,
         (SELECT available_quantity FROM lots WHERE id = $1::uuid) AS "availableQuantity",
         (SELECT available_points FROM reward_accounts WHERE buyer_user_id = $2::uuid)
           AS "availablePoints"`,
      [ids.lot, ids.buyer],
    );
    expect(state.rows[0]).toEqual({
      orders: 0,
      attempts: 0,
      reservations: 0,
      redemptions: 0,
      attributions: 0,
      conversions: 0,
      availableQuantity: 10,
      availablePoints: 1_000,
    });
  });

  it("treats a future-dated current terms acceptance as unavailable at the supplied quote instant", async () => {
    await client.query(
      `UPDATE growth_terms_acceptances
       SET accepted_at = $2::timestamptz
       WHERE id = $1::uuid`,
      [ids.termsAcceptance, "2026-08-28T12:00:00.001Z"],
    );

    const result = await setup().service.quote({
      buyerUserId: ids.buyer,
      idempotencyKey: ids.keyA,
      paymentProviderAvailable: true,
      request,
    });

    expect(result.status).toBe("quoted");
    if (result.status !== "quoted") throw new Error("expected fallback quote");
    expect(result.quote).toMatchObject({
      rewardRedemptionPoints: 0,
      rewardRedemptionMinor: 0,
      pendingBaseEarnPoints: 0,
      rewardsBenefitAvailable: false,
      rewardsUnavailableReason: "acceptance_unavailable",
    });
    const growthWrites = await client.query<{ redemptions: number; ledger: number }>(
      `SELECT (SELECT count(*)::int FROM reward_redemptions) AS redemptions,
              (SELECT count(*)::int FROM reward_ledger_entries) AS ledger`,
    );
    expect(growthWrites.rows[0]).toEqual({ redemptions: 0, ledger: 0 });
  });

  it("does not append base earn for a future-dated acceptance on the negative-balance catch-up path", async () => {
    const { service } = setup();
    const ordinaryRequest = {
      items: request.items,
      destination: request.destination,
      promotionIds: request.promotionIds,
    };
    const ordinary = await service.quote({
      buyerUserId: ids.buyer,
      idempotencyKey: ids.keyA,
      paymentProviderAvailable: true,
      request: ordinaryRequest,
    });
    expect(ordinary.status).toBe("quoted");
    if (ordinary.status !== "quoted") throw new Error("expected ordinary quote");
    const prepared = await service.prepare(
      ordinary.plan,
      providerPreparation(ordinary.plan.identity.attemptId),
    );
    if (prepared.status !== "prepared") throw new Error("expected prepared order");
    await client.query(
      `UPDATE reward_accounts SET available_points = -25
       WHERE buyer_user_id = $1::uuid`,
      [ids.buyer],
    );
    await client.query(
      `UPDATE growth_terms_acceptances
       SET accepted_at = $2::timestamptz
       WHERE id = $1::uuid`,
      [ids.termsAcceptance, "2026-08-28T12:00:00.001Z"],
    );
    await seedProcessedPayment(prepared.orderId, "evt_task4_future_acceptance");

    await expect(lifecycleService().reconcileProcessedProviderEvent({
      provider: "stripe",
      providerEventId: "evt_task4_future_acceptance",
      now,
    })).resolves.toEqual({ status: "idempotent" });
    const state = await client.query<{ pending: number; available: number; earns: number }>(
      `SELECT pending_points AS pending, available_points AS available,
              (SELECT count(*)::int FROM reward_ledger_entries
               WHERE kind = 'order_earned_pending') AS earns
       FROM reward_accounts WHERE buyer_user_id = $1::uuid`,
      [ids.buyer],
    );
    expect(state.rows[0]).toEqual({ pending: 0, available: -25, earns: 0 });
  });

  it("allows only one of two prequoted attempts to reserve the same available balance", async () => {
    const first = await quote(ids.keyA);
    const second = await quote(ids.keyB);
    const firstService = setup().service;
    const secondService = setup().service;

    await expect(
      firstService.prepare(
        first.plan,
        providerPreparation(first.plan.identity.attemptId),
      ),
    ).resolves.toMatchObject({ status: "prepared" });
    // Restore the second prequote's inventory fact so only the locked rewards
    // balance can decide the competing attempt.
    await client.query(
      `UPDATE lots SET available_quantity = 10 WHERE id = $1::uuid`,
      [ids.lot],
    );
    await expect(
      secondService.prepare(
        second.plan,
        providerPreparation(second.plan.identity.attemptId),
      ),
    ).resolves.toEqual({ status: "facts_changed_retry" });

    const state = await client.query<{
      availablePoints: number;
      redemptions: number;
      orders: number;
      availableInventory: number;
    }>(
      `SELECT
         (SELECT available_points FROM reward_accounts WHERE buyer_user_id = $1::uuid)
           AS "availablePoints",
         (SELECT count(*)::int FROM reward_redemptions) AS redemptions,
         (SELECT count(*)::int FROM orders) AS orders,
         (SELECT available_quantity FROM lots WHERE id = $2::uuid)
           AS "availableInventory"`,
      [ids.buyer, ids.lot],
    );
    expect(state.rows[0]).toEqual({
      availablePoints: 250,
      redemptions: 1,
      orders: 1,
      availableInventory: 10,
    });
  });

  it("releases a failed checkout redemption exactly once in the inventory release transaction", async () => {
    const { service, repository } = setup();
    const quoted = await quote(ids.keyA);
    const prepared = await service.prepare(
      quoted.plan,
      providerPreparation(quoted.plan.identity.attemptId),
    );
    if (prepared.status !== "prepared") throw new Error("expected prepared");
    const release = {
      authority: "authoritative_provider_terminal" as const,
      cause: "definite_rejection" as const,
      providerEvidenceId: "task4-definite-rejection",
      attemptId: prepared.attemptId,
      orderId: prepared.orderId,
      provider: "local_test" as const,
      providerIdempotencyKey: `checkout_attempt:${prepared.attemptId}`,
      targetAttemptStatus: "failed" as const,
    };
    await expect(repository.releaseDefiniteFailure(release)).resolves.toEqual({
      status: "released",
    });
    await expect(repository.releaseDefiniteFailure(release)).resolves.toEqual({
      status: "already_released",
    });

    const state = await client.query<{
      availablePoints: number;
      redemptionState: string;
      reservedEntries: number;
      releasedEntries: number;
    }>(
      `SELECT
         (SELECT available_points FROM reward_accounts WHERE buyer_user_id = $1::uuid)
           AS "availablePoints",
         (SELECT state FROM reward_redemptions LIMIT 1) AS "redemptionState",
         (SELECT count(*)::int FROM reward_ledger_entries
          WHERE kind = 'redemption_reserved') AS "reservedEntries",
         (SELECT count(*)::int FROM reward_ledger_entries
          WHERE kind = 'redemption_released') AS "releasedEntries"`,
      [ids.buyer],
    );
    expect(state.rows[0]).toEqual({
      availablePoints: 1_000,
      redemptionState: "released",
      reservedEntries: 1,
      releasedEntries: 1,
    });
  });

  it("releases reserved points once when a processed payment-failure journal is replayed", async () => {
    const { service } = setup();
    const quoted = await quote(ids.keyA);
    const prepared = await service.prepare(
      quoted.plan,
      providerPreparation(quoted.plan.identity.attemptId),
    );
    if (prepared.status !== "prepared") throw new Error("expected prepared");
    const providerEventId = "evt_task4_payment_failed";
    const providerDatabaseId = keyedUuid(`provider:${providerEventId}`);
    await client.query(
      `INSERT INTO provider_events
         (id, provider, provider_event_id, payload_hash, status, attempt_count,
          processed_at, event_type, schema_version, normalized_payload,
          provider_created_at, livemode)
       VALUES ($1::uuid, 'stripe', $2, $3, 'processed', 1, $4::timestamptz,
               'checkout.session.async_payment_failed', 1, '{}'::jsonb,
               $4::timestamptz, false)`,
      [providerDatabaseId, providerEventId, "f".repeat(64), now.toISOString()],
    );
    await client.query(
      `INSERT INTO payment_events
         (id, provider_event_id, order_id, event_type, provider_payment_id,
          idempotency_key, amount_minor, currency, occurred_at)
       VALUES ($1::uuid, $2::uuid, $3::uuid, 'payment_failed', NULL, $4,
               0, 'USD', $5::timestamptz)`,
      [
        keyedUuid(`payment:${providerEventId}`),
        providerDatabaseId,
        prepared.orderId,
        `stripe:payment-failed:${providerEventId}`,
        now.toISOString(),
      ],
    );
    const lifecycle = lifecycleService();
    await expect(lifecycle.reconcileProcessedProviderEvent({
      provider: "stripe",
      providerEventId,
      now,
    })).resolves.toEqual({ status: "applied" });
    await expect(lifecycle.reconcileProcessedProviderEvent({
      provider: "stripe",
      providerEventId,
      now,
    })).resolves.toEqual({ status: "idempotent" });
    const state = await client.query<{ available: number; redemptionState: string; releases: number }>(
      `SELECT available_points AS available,
              (SELECT state FROM reward_redemptions WHERE order_id = $1::uuid)
                AS "redemptionState",
              (SELECT count(*)::int FROM reward_ledger_entries
               WHERE kind = 'redemption_released') AS releases
       FROM reward_accounts WHERE buyer_user_id = $2::uuid`,
      [prepared.orderId, ids.buyer],
    );
    expect(state.rows[0]).toEqual({
      available: 1_000,
      redemptionState: "released",
      releases: 1,
    });
  });

  it("consumes a redemption and appends pending base earn once after verified payment", async () => {
    const { prepared, lifecycle } = await preparePaidOrder();
    await expect(lifecycle.reconcileProcessedProviderEvent({
      provider: "stripe",
      providerEventId: "evt_task4_payment",
      now,
    })).resolves.toEqual({ status: "idempotent" });

    const state = await client.query<{
      redemptionState: string;
      pendingPoints: number;
      availablePoints: number;
      earnEntries: number;
      earnedPoints: number;
    }>(
      `SELECT
         (SELECT state FROM reward_redemptions WHERE order_id = $1::uuid)
           AS "redemptionState",
         pending_points AS "pendingPoints", available_points AS "availablePoints",
         (SELECT count(*)::int FROM reward_ledger_entries
          WHERE kind = 'order_earned_pending') AS "earnEntries",
         (SELECT pending_points_delta FROM reward_ledger_entries
          WHERE kind = 'order_earned_pending') AS "earnedPoints"
       FROM reward_accounts WHERE buyer_user_id = $2::uuid`,
      [prepared.orderId, ids.buyer],
    );
    expect(state.rows[0]).toEqual({
      redemptionState: "consumed",
      pendingPoints: 185,
      availablePoints: 250,
      earnEntries: 1,
      earnedPoints: 185,
    });
  });

  it("moves the exact pending earn to available once after verified delivery", async () => {
    const { prepared, lifecycle } = await preparePaidOrder();
    const payment = await client.query<{ id: string }>(
      `SELECT id::text AS id FROM payment_events
       WHERE order_id = $1::uuid AND event_type = 'payment_verified'`,
      [prepared.orderId],
    );
    const releaseId = keyedUuid(`release:${prepared.orderId}`);
    await client.query(
      `INSERT INTO fulfillment_releases
         (id, order_id, version, idempotency_key, payment_event_id, state,
          issued_at, expires_at, consumed_at)
       VALUES ($1::uuid, $2::uuid, 1, $3, $4::uuid, 'consumed',
               $5::timestamptz, $6::timestamptz, $7::timestamptz)`,
      [
        releaseId,
        prepared.orderId,
        `release:${prepared.orderId}`,
        payment.rows[0]!.id,
        "2026-08-28T12:01:00.000Z",
        "2026-08-29T12:01:00.000Z",
        "2026-08-28T12:02:00.000Z",
      ],
    );
    await client.query(
      `INSERT INTO shipments
         (id, order_id, fulfillment_release_id, carrier, tracking_reference,
          state, handed_off_at, delivered_at)
       VALUES ($1::uuid, $2::uuid, $3::uuid, 'SYNTHETIC', $4, 'delivered',
               $5::timestamptz, $6::timestamptz)`,
      [
        keyedUuid(`shipment:${prepared.orderId}`),
        prepared.orderId,
        releaseId,
        `tracking-${prepared.orderId}`,
        "2026-08-28T12:03:00.000Z",
        "2026-08-28T12:04:00.000Z",
      ],
    );

    await expect(lifecycle.reconcileDeliveredOrder({
      orderId: prepared.orderId,
      now: new Date("2026-08-28T12:04:00.000Z"),
    })).resolves.toEqual({ status: "applied" });
    await expect(lifecycle.reconcileDeliveredOrder({
      orderId: prepared.orderId,
      now: new Date("2026-08-28T12:04:00.000Z"),
    })).resolves.toEqual({ status: "idempotent" });
    const balance = await client.query<{ pending: number; available: number; entries: number }>(
      `SELECT pending_points AS pending, available_points AS available,
              (SELECT count(*)::int FROM reward_ledger_entries
               WHERE kind = 'order_earned_available') AS entries
       FROM reward_accounts WHERE buyer_user_id = $1::uuid`,
      [ids.buyer],
    );
    expect(balance.rows[0]).toEqual({ pending: 0, available: 435, entries: 1 });
  });

  it("reverses cumulative refund then chargeback earn once and permits a negative delivered balance", async () => {
    const { prepared, lifecycle } = await preparePaidOrder();
    const verifiedPayment = await client.query<{ id: string }>(
      `SELECT id::text AS id FROM payment_events
       WHERE order_id = $1::uuid AND event_type = 'payment_verified'`,
      [prepared.orderId],
    );
    const releaseId = keyedUuid(`refund-release:${prepared.orderId}`);
    await client.query(
      `INSERT INTO fulfillment_releases
         (id, order_id, version, idempotency_key, payment_event_id, state,
          issued_at, expires_at, consumed_at)
       VALUES ($1::uuid, $2::uuid, 1, $3, $4::uuid, 'consumed',
               $5::timestamptz, $6::timestamptz, $7::timestamptz)`,
      [
        releaseId,
        prepared.orderId,
        `refund-release:${prepared.orderId}`,
        verifiedPayment.rows[0]!.id,
        "2026-08-28T12:01:00.000Z",
        "2026-08-29T12:01:00.000Z",
        "2026-08-28T12:02:00.000Z",
      ],
    );
    await client.query(
      `INSERT INTO shipments
         (id, order_id, fulfillment_release_id, carrier, tracking_reference,
          state, handed_off_at, delivered_at)
       VALUES ($1::uuid, $2::uuid, $3::uuid, 'SYNTHETIC-REFUND', $4,
               'delivered', $5::timestamptz, $6::timestamptz)`,
      [
        keyedUuid(`refund-shipment:${prepared.orderId}`),
        prepared.orderId,
        releaseId,
        `refund-tracking-${prepared.orderId}`,
        "2026-08-28T12:03:00.000Z",
        "2026-08-28T12:04:00.000Z",
      ],
    );
    await lifecycle.reconcileDeliveredOrder({ orderId: prepared.orderId, now });
    await client.query(
      `UPDATE reward_accounts SET available_points = 35
       WHERE buyer_user_id = $1::uuid`,
      [ids.buyer],
    );
    const insertFinancialEvent = async (
      providerEventId: string,
      eventType: "refund_verified" | "dispute_recorded",
      amountMinor: number,
    ) => {
      const providerDatabaseId = keyedUuid(`provider:${providerEventId}`);
      await client.query(
        `INSERT INTO provider_events
           (id, provider, provider_event_id, payload_hash, status, attempt_count,
            processed_at, event_type, schema_version, normalized_payload,
            provider_created_at, livemode)
         VALUES ($1::uuid, 'stripe', $2, $3, 'processed', 1, $4::timestamptz,
                 $5, 1, '{}'::jsonb, $4::timestamptz, false)`,
        [providerDatabaseId, providerEventId, "e".repeat(64), now.toISOString(), eventType],
      );
      await client.query(
        `INSERT INTO payment_events
           (id, provider_event_id, order_id, event_type, provider_payment_id,
            idempotency_key, amount_minor, currency, occurred_at)
         VALUES ($1::uuid, $2::uuid, $3::uuid, $4::payment_event_type,
                 $5, $6, $7, 'USD', $8::timestamptz)`,
        [
          keyedUuid(`payment:${providerEventId}`),
          providerDatabaseId,
          prepared.orderId,
          eventType,
          `${eventType}_${providerEventId}`,
          `stripe:${eventType}:${providerEventId}`,
          amountMinor,
          now.toISOString(),
        ],
      );
    };
    await insertFinancialEvent("evt_task4_refund", "refund_verified", 4_625);
    await lifecycle.reconcileProcessedProviderEvent({
      provider: "stripe",
      providerEventId: "evt_task4_refund",
      now,
    });
    await insertFinancialEvent("evt_task4_chargeback", "dispute_recorded", 9_250);
    await lifecycle.reconcileProcessedProviderEvent({
      provider: "stripe",
      providerEventId: "evt_task4_chargeback",
      now,
    });
    await lifecycle.reconcileProcessedProviderEvent({
      provider: "stripe",
      providerEventId: "evt_task4_chargeback",
      now,
    });

    const state = await client.query<{ available: number; refund: number; chargeback: number }>(
      `SELECT available_points AS available,
              (SELECT count(*)::int FROM reward_ledger_entries
               WHERE kind = 'refund_reversal') AS refund,
              (SELECT count(*)::int FROM reward_ledger_entries
               WHERE kind = 'chargeback_reversal') AS chargeback
       FROM reward_accounts WHERE buyer_user_id = $1::uuid`,
      [ids.buyer],
    );
    expect(state.rows[0]).toEqual({ available: -150, refund: 1, chargeback: 1 });
  });
});
