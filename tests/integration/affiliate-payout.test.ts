import type { PGlite } from "@electric-sql/pglite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { GrowthSqlClient } from "@/db/repositories/growth-repository";
import {
  createPostgresAffiliatePayoutCreateTransaction,
  createPostgresAffiliatePayoutPaidTransaction,
} from "@/growth/affiliate-service";

import { createMigratedPglite } from "./helpers/pglite";

const ids = {
  admin: "6c100000-0000-4000-8000-000000000001",
  affiliate: "6c100000-0000-4000-8000-000000000002",
  buyerOne: "6c100000-0000-4000-8000-000000000003",
  buyerTwo: "6c100000-0000-4000-8000-000000000004",
  attestation: "6c100000-0000-4000-8000-000000000005",
  buyerOneAcceptance: "6c100000-0000-4000-8000-000000000006",
  buyerTwoAcceptance: "6c100000-0000-4000-8000-000000000007",
  affiliateTerms: "6c100000-0000-4000-8000-000000000008",
  affiliateTermsAcceptance: "6c100000-0000-4000-8000-000000000009",
  profile: "6c100000-0000-4000-8000-000000000010",
  policy: "6c100000-0000-4000-8000-000000000011",
  orderOne: "6c100000-0000-4000-8000-000000000012",
  orderTwo: "6c100000-0000-4000-8000-000000000013",
  attributionOne: "6c100000-0000-4000-8000-000000000014",
  attributionTwo: "6c100000-0000-4000-8000-000000000015",
  commissionOne: "6c100000-0000-4000-8000-000000000016",
  commissionTwo: "6c100000-0000-4000-8000-000000000017",
  consumedPayout: "6c100000-0000-4000-8000-000000000018",
  payout: "6c100000-0000-4000-8000-000000000019",
  adjustmentProviderEvent: "6c100000-0000-4000-8000-000000000020",
  adjustmentPaymentEvent: "6c100000-0000-4000-8000-000000000021",
  adjustment: "6c100000-0000-4000-8000-000000000022",
} as const;

const createdAt = new Date("2026-08-28T19:00:00.000Z");
const paidAt = new Date("2026-08-28T20:00:00.000Z");

describe("affiliate payout transactions on PGlite", () => {
  let client: PGlite;

  beforeEach(async () => {
    client = await createMigratedPglite();
    await client.exec(`
      INSERT INTO users (id, clerk_id, email_verified_at) VALUES
        ('${ids.admin}', 'task6c-admin', '2026-08-01T00:00:00Z'),
        ('${ids.affiliate}', 'task6c-affiliate', '2026-08-01T00:00:00Z'),
        ('${ids.buyerOne}', 'task6c-buyer-one', '2026-08-01T00:00:00Z'),
        ('${ids.buyerTwo}', 'task6c-buyer-two', '2026-08-01T00:00:00Z');
      INSERT INTO attestation_versions
        (id, version, content_hash, policy_text, effective_at)
      VALUES ('${ids.attestation}', 1, '${"a".repeat(64)}',
              'Synthetic payout transaction attestation', '2026-08-01T00:00:00Z');
      INSERT INTO attestation_acceptances
        (id, user_id, attestation_version_id, accepted_at) VALUES
        ('${ids.buyerOneAcceptance}', '${ids.buyerOne}', '${ids.attestation}', '2026-08-02T00:00:00Z'),
        ('${ids.buyerTwoAcceptance}', '${ids.buyerTwo}', '${ids.attestation}', '2026-08-02T00:00:00Z');
      INSERT INTO growth_terms_versions
        (id, program, version, content_hash, terms_text, effective_at)
      VALUES ('${ids.affiliateTerms}', 'affiliate', 1, '${"b".repeat(64)}',
              'Synthetic payout transaction affiliate terms', '2026-08-01T00:00:00Z');
      INSERT INTO growth_terms_acceptances
        (id, user_id, program, terms_version_id, content_hash, accepted_at)
      VALUES ('${ids.affiliateTermsAcceptance}', '${ids.affiliate}', 'affiliate',
              '${ids.affiliateTerms}', '${"b".repeat(64)}', '2026-08-02T00:00:00Z');
      INSERT INTO affiliate_policies
        (id, version, status, attribution_days,
         first_order_commission_basis_points, reorder_commission_basis_points,
         reorder_window_days, approval_delay_days, payout_threshold_minor,
         currency, effective_at)
      VALUES ('${ids.policy}', 1, 'active', 30, 1000, 500, 180, 30, 5000,
              'USD', '2026-08-01T00:00:00Z');
      INSERT INTO affiliate_profiles
        (id, user_id, public_code, status, version, public_channel,
         promotion_method, terms_acceptance_id, created_at, updated_at)
      VALUES ('${ids.profile}', '${ids.affiliate}', 'aff_Task6CPayoutProfile',
              'active', 2, '@task6c_affiliate', 'social',
              '${ids.affiliateTermsAcceptance}', '2026-08-02T00:00:00Z',
              '2026-08-02T00:00:00Z');
      INSERT INTO orders
        (id, buyer_user_id, buyer_status_snapshot, attestation_acceptance_id,
         destination_state_code, currency, subtotal_minor, discount_minor,
         tax_minor, shipping_minor, total_minor, state) VALUES
        ('${ids.orderOne}', '${ids.buyerOne}', 'active', '${ids.buyerOneAcceptance}',
         'CA', 'USD', 50000, 0, 0, 0, 50000, 'paid_pending_fulfillment'),
        ('${ids.orderTwo}', '${ids.buyerTwo}', 'active', '${ids.buyerTwoAcceptance}',
         'CA', 'USD', 70000, 0, 0, 0, 70000, 'paid_pending_fulfillment');
      INSERT INTO affiliate_attributions
        (id, affiliate_profile_id, affiliate_user_id, referred_user_id,
         affiliate_policy_id, affiliate_policy_version, clicked_at, expires_at,
         bound_at) VALUES
        ('${ids.attributionOne}', '${ids.profile}', '${ids.affiliate}', '${ids.buyerOne}',
         '${ids.policy}', 1, '2026-08-01T00:00:00Z', '2026-08-31T00:00:00Z',
         '2026-08-02T00:00:00Z'),
        ('${ids.attributionTwo}', '${ids.profile}', '${ids.affiliate}', '${ids.buyerTwo}',
         '${ids.policy}', 1, '2026-08-01T00:00:00Z', '2026-08-31T00:00:00Z',
         '2026-08-02T00:00:00Z');
      INSERT INTO order_growth_attributions
        (order_id, buyer_user_id, program, affiliate_attribution_id,
         affiliate_policy_id, affiliate_policy_version) VALUES
        ('${ids.orderOne}', '${ids.buyerOne}', 'affiliate', '${ids.attributionOne}', '${ids.policy}', 1),
        ('${ids.orderTwo}', '${ids.buyerTwo}', 'affiliate', '${ids.attributionTwo}', '${ids.policy}', 1);
      INSERT INTO affiliate_payouts
        (id, affiliate_profile_id, affiliate_policy_id, affiliate_policy_version,
         idempotency_key, amount_minor, currency, state, created_at)
      VALUES ('${ids.consumedPayout}', '${ids.profile}', '${ids.policy}', 1,
              'task-6c-consumed-payout', 7000, 'USD', 'pending',
              '2026-08-27T00:00:00Z');
      INSERT INTO affiliate_commissions
        (id, affiliate_profile_id, affiliate_attribution_id, buyer_user_id,
         order_id, affiliate_policy_id, affiliate_policy_version, idempotency_key,
         gross_commission_minor, reversed_commission_minor, status,
         approval_eligible_at, payout_id, created_at, updated_at) VALUES
        ('${ids.commissionOne}', '${ids.profile}', '${ids.attributionOne}', '${ids.buyerOne}',
         '${ids.orderOne}', '${ids.policy}', 1, 'task-6c-commission-one',
         5000, 0, 'approved', '2026-08-27T00:00:00Z', NULL,
         '2026-08-01T00:00:00Z', '2026-08-27T00:00:00Z'),
        ('${ids.commissionTwo}', '${ids.profile}', '${ids.attributionTwo}', '${ids.buyerTwo}',
         '${ids.orderTwo}', '${ids.policy}', 1, 'task-6c-commission-two',
         7000, 0, 'approved', '2026-08-27T00:00:00Z', '${ids.consumedPayout}',
         '2026-08-01T00:00:00Z', '2026-08-27T00:00:00Z');
    `);
  });

  afterEach(async () => client.close());

  const runSerializableTransaction = <Value>(
    work: (sqlClient: GrowthSqlClient) => Promise<Value>,
  ) => client.transaction((transaction) => work({
    query: async <Row extends object>(sql: string, params: readonly unknown[] = []) => {
      const result = await transaction.query<Row>(sql, [...params]);
      return { rows: result.rows };
    },
  }));

  function createTransaction() {
    return createPostgresAffiliatePayoutCreateTransaction({ runSerializableTransaction });
  }

  function paidTransaction() {
    return createPostgresAffiliatePayoutPaidTransaction({ runSerializableTransaction });
  }

  function createInput(overrides: Record<string, unknown> = {}) {
    return {
      actorUserId: ids.admin,
      payoutId: ids.payout,
      profileId: ids.profile,
      idempotencyKey: "task-6c-create-payout-one",
      correlationId: "task-6c-create-payout-correlation",
      createdAt,
      ...overrides,
    };
  }

  it("approves and consumes an approval-eligible pending commission in the same batch transaction", async () => {
    await client.query(
      `UPDATE affiliate_commissions SET status = 'pending' WHERE id = $1::uuid`,
      [ids.commissionOne],
    );

    await expect(createTransaction()(createInput())).resolves.toMatchObject({
      status: "applied",
      payout: { amountMinor: 5000, commissionIds: [ids.commissionOne] },
    });
    const commission = await client.query<{ status: string; payoutId: string }>(
      `SELECT status::text, payout_id::text AS "payoutId"
       FROM affiliate_commissions WHERE id = $1::uuid`,
      [ids.commissionOne],
    );
    expect(commission.rows).toEqual([{ status: "approved", payoutId: ids.payout }]);
  });

  it("maps a superseded database policy to the retired domain snapshot and pays earned commission", async () => {
    await client.query(
      `UPDATE affiliate_policies
       SET status = 'superseded', superseded_at = '2026-08-20T00:00:00Z'
       WHERE id = $1::uuid`,
      [ids.policy],
    );

    await expect(createTransaction()(createInput())).resolves.toMatchObject({
      status: "applied",
      payout: { amountMinor: 5000, affiliatePolicyId: ids.policy },
    });
  });

  it.each([4999, 5100])(
    "fails closed when stored policy threshold drifts to %i even if database guards are missing",
    async (threshold) => {
      await client.exec(`
        DROP TRIGGER affiliate_policies_immutable_history ON affiliate_policies;
        ALTER TABLE affiliate_policies
          DROP CONSTRAINT IF EXISTS affiliate_policies_payout_threshold_v1;
      `);
      await client.query(
        `UPDATE affiliate_policies SET payout_threshold_minor = $2 WHERE id = $1::uuid`,
        [ids.policy, threshold],
      );

      await expect(createTransaction()(createInput()))
        .rejects.toMatchObject({ code: "persistence_conflict" });
      const state = await client.query<{ payouts: number; audits: number; payoutId: string | null }>(
        `SELECT (SELECT count(*)::int FROM affiliate_payouts) AS payouts,
                (SELECT count(*)::int FROM admin_audit) AS audits,
                payout_id::text AS "payoutId"
         FROM affiliate_commissions WHERE id = $1::uuid`,
        [ids.commissionOne],
      );
      expect(state.rows[0]).toEqual({ payouts: 1, audits: 0, payoutId: null });
    },
  );

  it("atomically selects only eligible unconsumed commission at the exact policy threshold and replays once", async () => {
    const create = createTransaction();
    const first = await create(createInput());
    const replay = await create(createInput({
      payoutId: "6c100000-0000-4000-8000-000000000099",
      createdAt: new Date("2026-08-28T19:05:00.000Z"),
    }));

    expect(first).toEqual({
      status: "applied",
      payout: {
        id: ids.payout,
        affiliateProfileId: ids.profile,
        affiliatePolicyId: ids.policy,
        affiliatePolicyVersion: 1,
        idempotencyKey: "task-6c-create-payout-one",
        amountMinor: 5000,
        currency: "USD",
        state: "pending",
        version: 1,
        commissionIds: [ids.commissionOne],
        providerName: null,
        externalReference: null,
        paidAt: null,
        createdAt: createdAt.toISOString(),
      },
    });
    expect(replay).toEqual({ ...first, status: "idempotent" });

    const stored = await client.query<{
      payouts: number; audits: number; selectedPayoutId: string; consumedPayoutId: string;
      metadata: Record<string, unknown>;
    }>(`SELECT
      (SELECT count(*)::int FROM affiliate_payouts) AS payouts,
      (SELECT count(*)::int FROM admin_audit WHERE action = 'affiliate.payout.created') AS audits,
      (SELECT metadata FROM admin_audit WHERE action = 'affiliate.payout.created') AS metadata,
      (SELECT payout_id::text FROM affiliate_commissions WHERE id = '${ids.commissionOne}') AS "selectedPayoutId",
      (SELECT payout_id::text FROM affiliate_commissions WHERE id = '${ids.commissionTwo}') AS "consumedPayoutId"`);
    expect(stored.rows[0]).toEqual({
      payouts: 2,
      audits: 1,
      metadata: {
        amountMinor: 5000,
        currency: "USD",
        commissionCount: 1,
        affiliatePolicyVersion: 1,
        fromVersion: 0,
        toVersion: 1,
      },
      selectedPayoutId: ids.payout,
      consumedPayoutId: ids.consumedPayout,
    });
  });

  it("requires an exact canonical creation request for same-key replay", async () => {
    const create = createTransaction();
    await create(createInput());
    for (const conflicting of [
      createInput({ actorUserId: ids.affiliate }),
      createInput({ profileId: "6c100000-0000-4000-8000-000000000098" }),
      createInput({ correlationId: "task-6c-create-payout-different-correlation" }),
    ]) {
      await expect(create(conflicting)).rejects.toMatchObject({ code: "idempotency_conflict" });
    }
    const state = await client.query<{ payouts: number; audits: number }>(
      `SELECT (SELECT count(*)::int FROM affiliate_payouts) AS payouts,
              (SELECT count(*)::int FROM admin_audit
               WHERE action = 'affiliate.payout.created') AS audits`,
    );
    expect(state.rows[0]).toEqual({ payouts: 2, audits: 1 });
  });

  it("consumes one outstanding paid-reversal adjustment against the next payout exactly once", async () => {
    await client.exec(`
      UPDATE affiliate_payouts
      SET state = 'paid', version = 2,
          paid_idempotency_key = 'task-6-paid-source-evidence',
          external_provider = 'Synthetic offline operator',
          external_reference = 'synthetic-source-paid-reference',
          paid_at = '2026-08-27T12:00:00Z'
      WHERE id = '${ids.consumedPayout}';
      UPDATE affiliate_commissions SET status = 'paid'
      WHERE id = '${ids.commissionTwo}';
      UPDATE affiliate_commissions SET gross_commission_minor = 7000
      WHERE id = '${ids.commissionOne}';
      INSERT INTO provider_events
        (id, provider, provider_event_id, payload_hash, status, attempt_count,
         processed_at, event_type, schema_version, normalized_payload,
         provider_created_at, livemode)
      VALUES ('${ids.adjustmentProviderEvent}', 'stripe',
              'evt_task6_paid_adjustment_source', '${"c".repeat(64)}',
              'processed', 1, '2026-08-27T13:00:00Z', 'refund_verified', 1,
              '{}'::jsonb, '2026-08-27T13:00:00Z', false);
      INSERT INTO payment_events
        (id, provider_event_id, order_id, event_type, provider_payment_id,
         idempotency_key, amount_minor, currency, occurred_at)
      VALUES ('${ids.adjustmentPaymentEvent}', '${ids.adjustmentProviderEvent}',
              '${ids.orderTwo}', 'refund_verified', 'refund_task6_adjustment',
              'task6-paid-adjustment-source', 1000, 'USD',
              '2026-08-27T13:00:00Z');
      INSERT INTO affiliate_commission_adjustments
        (id, affiliate_profile_id, affiliate_commission_id, source_payout_id,
         source_payment_event_id, settlement_payout_id, amount_minor, created_at)
      VALUES ('${ids.adjustment}', '${ids.profile}', '${ids.commissionTwo}',
              '${ids.consumedPayout}', '${ids.adjustmentPaymentEvent}', NULL,
              1000, '2026-08-27T13:00:00Z');
    `);

    const first = await createTransaction()(createInput());
    expect(first).toMatchObject({
      status: "applied",
      payout: { id: ids.payout, amountMinor: 6000 },
    });
    const adjustment = await client.query<{ settlementPayoutId: string }>(
      `SELECT settlement_payout_id::text AS "settlementPayoutId"
       FROM affiliate_commission_adjustments WHERE id = $1::uuid`,
      [ids.adjustment],
    );
    expect(adjustment.rows).toEqual([{ settlementPayoutId: ids.payout }]);

    await expect(createTransaction()(createInput())).resolves.toEqual({
      ...first,
      status: "idempotent",
    });
    await expect(paidTransaction()({
      actorUserId: ids.admin,
      payoutId: ids.payout,
      expectedVersion: 1,
      idempotencyKey: "task-6c-paid-adjusted-payout",
      providerName: "ACH operator",
      externalReference: "bank-confirmation-adjusted-001",
      correlationId: "task-6c-paid-adjusted-correlation",
      paidAt,
    })).resolves.toMatchObject({
      status: "applied",
      payout: { state: "paid", amountMinor: 6000 },
    });
  });

  it("rejects below-threshold and conflicting replay without a payout, audit, or consumption", async () => {
    await client.query(
      `UPDATE affiliate_commissions SET gross_commission_minor = 4999 WHERE id = $1::uuid`,
      [ids.commissionOne],
    );
    await expect(createTransaction()(createInput())).rejects.toMatchObject({ code: "threshold_not_met" });
    await client.query(
      `UPDATE affiliate_commissions SET gross_commission_minor = 5000 WHERE id = $1::uuid`,
      [ids.commissionOne],
    );
    await createTransaction()(createInput());
    await expect(createTransaction()(createInput({ profileId: "6c100000-0000-4000-8000-000000000098" })))
      .rejects.toMatchObject({ code: "idempotency_conflict" });
    const state = await client.query<{ audits: number; payoutId: string }>(
      `SELECT (SELECT count(*)::int FROM admin_audit WHERE action = 'affiliate.payout.created') AS audits,
              payout_id::text AS "payoutId"
       FROM affiliate_commissions WHERE id = $1::uuid`,
      [ids.commissionOne],
    );
    expect(state.rows[0]).toEqual({ audits: 1, payoutId: ids.payout });
  });

  it("rolls back payout and consumption when its one audit insert fails", async () => {
    await client.exec(`ALTER TABLE admin_audit ADD CONSTRAINT task_6c_audit_failure
      CHECK (correlation_id <> 'task-6c-audit-rollback')`);
    await expect(createTransaction()(createInput({ correlationId: "task-6c-audit-rollback" })))
      .rejects.toMatchObject({ code: "audit_conflict" });
    const state = await client.query<{ payouts: number; audits: number; payoutId: string | null }>(
      `SELECT (SELECT count(*)::int FROM affiliate_payouts) AS payouts,
              (SELECT count(*)::int FROM admin_audit) AS audits,
              payout_id::text AS "payoutId"
       FROM affiliate_commissions WHERE id = $1::uuid`,
      [ids.commissionOne],
    );
    expect(state.rows[0]).toEqual({ payouts: 1, audits: 0, payoutId: null });
  });

  it("marks paid with CAS and exact replay while denying stale and double-paid attempts", async () => {
    await createTransaction()(createInput());
    const markPaid = paidTransaction();
    const paidInput = {
      actorUserId: ids.admin,
      payoutId: ids.payout,
      expectedVersion: 1,
      idempotencyKey: "task-6c-record-paid-one",
      providerName: "ACH operator",
      externalReference: "bank-confirmation-6c-001",
      correlationId: "task-6c-record-paid-correlation",
      paidAt,
    };
    await expect(markPaid({ ...paidInput, expectedVersion: 2 }))
      .rejects.toMatchObject({ code: "version_conflict" });
    const first = await markPaid(paidInput);
    const replay = await markPaid(paidInput);
    expect(first.status).toBe("applied");
    expect(first.payout).toMatchObject({ state: "paid", version: 2,
      providerName: "ACH operator", externalReference: "bank-confirmation-6c-001",
      paidAt: paidAt.toISOString() });
    expect(replay).toEqual({ ...first, status: "idempotent" });
    await expect(markPaid({ ...paidInput, idempotencyKey: "task-6c-record-paid-two" }))
      .rejects.toMatchObject({ code: "invalid_transition" });
    const state = await client.query<{ audits: number; status: string }>(
      `SELECT (SELECT count(*)::int FROM admin_audit WHERE action = 'affiliate.payout.paid') AS audits,
              status::text FROM affiliate_commissions WHERE id = $1::uuid`,
      [ids.commissionOne],
    );
    expect(state.rows[0]).toEqual({ audits: 1, status: "paid" });
  });

  it("requires an exact canonical paid request for same-key replay", async () => {
    await createTransaction()(createInput());
    const markPaid = paidTransaction();
    const paidInput = {
      actorUserId: ids.admin,
      payoutId: ids.payout,
      expectedVersion: 1,
      idempotencyKey: "task-6c-record-paid-fingerprint",
      providerName: "ACH operator",
      externalReference: "bank-confirmation-fingerprint-001",
      correlationId: "task-6c-record-paid-fingerprint-correlation",
      paidAt,
    };
    await markPaid(paidInput);
    for (const conflicting of [
      { ...paidInput, actorUserId: ids.affiliate },
      { ...paidInput, expectedVersion: 2 },
      { ...paidInput, providerName: "Different offline operator" },
      { ...paidInput, externalReference: "different-bank-reference" },
      { ...paidInput, correlationId: "task-6c-record-paid-different-correlation" },
      { ...paidInput, paidAt: new Date("2026-08-28T20:00:01.000Z") },
    ]) {
      await expect(markPaid(conflicting)).rejects.toMatchObject({ code: "idempotency_conflict" });
    }
    const audits = await client.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM admin_audit
       WHERE action = 'affiliate.payout.paid'`,
    );
    expect(audits.rows).toEqual([{ count: 1 }]);
  });

  it("rolls back paid state, evidence, commissions, and paid audit when the audit insert fails", async () => {
    await createTransaction()(createInput());
    await client.exec(`ALTER TABLE admin_audit ADD CONSTRAINT task_6c_paid_audit_failure
      CHECK (correlation_id <> 'task-6c-paid-audit-rollback')`);

    await expect(paidTransaction()({
      actorUserId: ids.admin,
      payoutId: ids.payout,
      expectedVersion: 1,
      idempotencyKey: "task-6c-record-paid-rollback",
      providerName: "ACH operator",
      externalReference: "bank-confirmation-6c-rollback",
      correlationId: "task-6c-paid-audit-rollback",
      paidAt,
    })).rejects.toMatchObject({ code: "audit_conflict" });

    const state = await client.query<{
      payoutState: string; version: number; provider: string | null;
      reference: string | null; paidAt: string | null; commissionStatus: string;
      paidAudits: number;
    }>(`SELECT p.state::text AS "payoutState", p.version,
              p.external_provider AS provider, p.external_reference AS reference,
              p.paid_at::text AS "paidAt", c.status::text AS "commissionStatus",
              (SELECT count(*)::int FROM admin_audit
               WHERE action = 'affiliate.payout.paid') AS "paidAudits"
       FROM affiliate_payouts p
       JOIN affiliate_commissions c ON c.payout_id = p.id
       WHERE p.id = $1::uuid`, [ids.payout]);
    expect(state.rows[0]).toEqual({
      payoutState: "pending",
      version: 1,
      provider: null,
      reference: null,
      paidAt: null,
      commissionStatus: "approved",
      paidAudits: 0,
    });
  });
});
