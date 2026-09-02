import { createHash } from "node:crypto";

import type { PGlite } from "@electric-sql/pglite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  ExpectedProviderContextV1,
  PaymentProvider,
  RefundProviderResult,
} from "@/commerce/payment-provider";
import { createProviderExecutionContextV1 } from "@/commerce/provider-context";
import type {
  RefundClaimDescriptorV1,
  StrictRefundProviderResultV1,
} from "@/commerce/refund-service";
import { submitOrRecoverRefund } from "@/commerce/refund-service";
import { parseServerEnv } from "@/config/env-schema";
import { createRefundFulfillmentRepository } from "@/db/repositories/refund-fulfillment-repository";

import { createMigratedPglite } from "./helpers/pglite";

const ids = {
  staff: "77000000-0000-4000-8000-000000000001",
  buyer: "77000000-0000-4000-8000-000000000002",
  attestation: "77000000-0000-4000-8000-000000000003",
  acceptance: "77000000-0000-4000-8000-000000000004",
  order: "77000000-0000-4000-8000-000000000005",
  attempt: "77000000-0000-4000-8000-000000000006",
  paidEvent: "77000000-0000-4000-8000-000000000007",
  payment: "77000000-0000-4000-8000-000000000008",
  refund: "77000000-0000-4000-8000-000000000009",
  terminalEvent: "77000000-0000-4000-8000-000000000010",
} as const;
const now = new Date("2026-08-26T12:00:00.000Z");
const providerContext: ExpectedProviderContextV1 = Object.freeze({
  provider: "local_test",
  livemode: false,
  scope: "local_test:synthetic-propeptiq-v1",
});
const sha256 = async (value: string) =>
  createHash("sha256").update(value).digest("hex");

describe("refund and fulfillment PostgreSQL repository on PGlite", () => {
  let client: PGlite;

  beforeEach(async () => {
    client = await createMigratedPglite();
    await client.exec(`
      INSERT INTO users (id, clerk_id, email_verified_at)
      VALUES
        ('${ids.staff}', 'clerk_staff_6f', '2026-08-01T00:00:00.000Z'),
        ('${ids.buyer}', 'clerk_buyer_6f', '2026-08-01T00:00:00.000Z');
      INSERT INTO buyer_profiles
        (user_id, status, age_confirmed_at, research_purpose, updated_at)
      VALUES
        ('${ids.staff}', 'active', '2026-08-01T00:00:00.000Z', 'analytical', '2026-08-25T00:00:00.000Z'),
        ('${ids.buyer}', 'active', '2026-08-01T00:00:00.000Z', 'analytical', '2026-08-25T00:00:00.000Z');
      INSERT INTO staff_roles
        (user_id, capability, granted_by_user_id, grant_correlation_id)
      VALUES
        ('${ids.staff}', 'refund:request', '${ids.staff}', 'refund-authority-6f'),
        ('${ids.staff}', 'fulfillment:release:consume', '${ids.staff}', 'fulfillment-authority-6f');
      INSERT INTO attestation_versions
        (id, version, content_hash, policy_text, effective_at)
      VALUES
        ('${ids.attestation}', 1, '${"1".repeat(64)}', 'Synthetic historical policy.', '2026-08-01T00:00:00.000Z');
      INSERT INTO attestation_acceptances
        (id, user_id, attestation_version_id, accepted_at)
      VALUES
        ('${ids.acceptance}', '${ids.buyer}', '${ids.attestation}', '2026-08-02T00:00:00.000Z');
      INSERT INTO orders
        (id, buyer_user_id, buyer_status_snapshot, attestation_acceptance_id,
         destination_state_code, currency, subtotal_minor, discount_minor,
         tax_minor, shipping_minor, total_minor, state, updated_at)
      VALUES
        ('${ids.order}', '${ids.buyer}', 'active', '${ids.acceptance}', 'CA',
         'USD', 5000, 0, 0, 0, 5000, 'paid_pending_fulfillment',
         '2026-08-25T00:00:00.000Z');
      INSERT INTO checkout_attempts
        (id, order_id, buyer_user_id, idempotency_key, request_hash, status,
         account_gate, attestation_gate, product_gate, destination_gate,
         inventory_gate, payment_provider_gate, permitted, review_required,
         reasons, tax_ready, shipping_ready, provider, provider_request_id,
         provider_session_id, provider_request_hash, provider_customer_email,
         provider_origin, provider_request_schema_version, provider_livemode,
         provider_scope, tax_quote_reference, shipping_quote_reference,
         shipping_service, expires_at)
      VALUES
        ('${ids.attempt}', '${ids.order}', '${ids.buyer}', 'checkout-refund-6f',
         '${"2".repeat(64)}', 'completed', 'pass', 'pass', 'pass', 'pass',
         'pass', 'pass', true, false, '{}', true, true, 'local_test',
         'checkout_attempt:${ids.attempt}', 'cs_refund_6f', '${"3".repeat(64)}',
         'buyer@example.test', 'http://localhost:3000', 1, false,
         'local_test:synthetic-propeptiq-v1', 'tax_refund_6f', 'ship_refund_6f',
         'synthetic_ground', '2027-08-26T12:00:00.000Z');
      INSERT INTO provider_events
        (id, provider, provider_event_id, payload_hash, status, attempt_count,
         received_at, processed_at, event_type, schema_version,
         normalized_payload, provider_created_at, livemode)
      VALUES
        ('${ids.paidEvent}', 'local_test', 'evt_paid_refund_6f', '${"4".repeat(64)}',
         'processed', 1, '2026-08-25T10:00:00.000Z', '2026-08-25T10:01:00.000Z',
         'checkout.session.completed', 1,
         '{"schemaVersion":1,"kind":"checkout_session","providerEventId":"evt_paid_refund_6f","eventType":"checkout.session.completed","providerCreatedAt":"2026-08-25T10:00:00.000Z","livemode":false,"sessionId":"cs_refund_6f","orderId":"${ids.order}","attemptId":"${ids.attempt}","paymentIntentId":"pi_refund_6f","amountMinor":5000,"currency":"usd","paymentStatus":"paid","sessionStatus":"complete"}'::jsonb,
         '2026-08-25T10:00:00.000Z', false);
      INSERT INTO payment_events
        (id, provider_event_id, order_id, event_type, provider_payment_id,
         idempotency_key, amount_minor, currency, occurred_at)
      VALUES
        ('${ids.payment}', '${ids.paidEvent}', '${ids.order}', 'payment_verified',
         'pi_refund_6f', 'local_test:payment_intent:pi_refund_6f', 5000, 'USD',
         '2026-08-25T10:00:00.000Z');
      INSERT INTO refunds
        (id, order_id, requested_by_user_id, verified_payment_event_id,
         provider, idempotency_key, requested_amount_minor, currency, status,
         reason_redacted, requested_at, origin)
      VALUES
        ('${ids.refund}', '${ids.order}', '${ids.staff}', '${ids.payment}',
         'local_test', 'staff-refund-intent-6f', 1200, 'USD', 'requested',
         'Synthetic bounded reason', '2026-08-26T11:00:00.000Z', 'staff_requested');
    `);
  });

  afterEach(async () => client.close());

  function setup(failures: readonly ("40001" | "40P01")[] = []) {
    let transactions = 0;
    const repository = createRefundFulfillmentRepository({
      runSerializableTransaction: (work) => {
        transactions += 1;
        const failure = failures[transactions - 1];
        if (failure !== undefined) {
          throw Object.assign(new Error("synthetic transaction retry"), {
            code: failure,
          });
        }
        return client.transaction((transaction) =>
          work({
            query: (sql, params = []) => transaction.query(sql, [...params]),
          }),
        );
      },
      sha256,
      retrySleep: async () => undefined,
    });
    return { repository, transactionCount: () => transactions };
  }

  function provider(result: unknown): PaymentProvider {
    return Object.freeze({
      context: providerContext,
      createCheckoutSession: vi.fn(async () => {
        throw new Error("checkout is outside this test");
      }),
      retrieveCheckoutSession: vi.fn(async () => {
        throw new Error("checkout is outside this test");
      }),
      createRefund: vi.fn(async () => result as RefundProviderResult),
      retrieveRefund: vi.fn(async () => result as RefundProviderResult),
    });
  }

  async function executionContext(adapter: PaymentProvider) {
    const created = await createProviderExecutionContextV1({
      environment: parseServerEnv({
        APP_ENV: "local",
        LOCAL_TEST_DRIVER: "enabled",
        LOCAL_TEST_SECRET: "task6f-local-secret-at-least-32-characters",
        RATE_LIMIT_SECRET: "task6f-rate-limit-at-least-32-characters",
      }),
      identity: {
        clerkUserId: "clerk_staff_6f",
        primaryEmail: "staff@example.test",
        emailVerifiedAt: "2026-08-26T11:00:00.000Z",
        mfaConfigured: true,
        secondFactorCompleted: true,
      },
      now,
      resolveDatabaseUsersByClerkId: vi.fn(async () => [ids.staff]),
      adapters: { stripe: null, localTest: adapter },
    });
    if (!created.ok) throw new Error("Synthetic provider context did not mint");
    return created.context;
  }

  async function submit(
    repository: ReturnType<typeof setup>["repository"],
    adapter: PaymentProvider,
  ) {
    return submitOrRecoverRefund({
      repository,
      providerContext: await executionContext(adapter),
      actorUserId: ids.staff,
      refundId: ids.refund,
      now,
      authorize: vi.fn(async () => ({
        actorUserId: ids.staff,
        actorClerkUserId: "clerk_staff_6f",
      })),
    });
  }

  async function claim() {
    return setup().repository.claim({
      refundId: ids.refund,
      actorUserId: ids.staff,
      actorClerkUserId: "clerk_staff_6f",
      expectedProviderContext: providerContext,
      now,
    });
  }

  it("accepts canonical checkout provider schema 2 as refund authority", async () => {
    await client.query(
      `UPDATE checkout_attempts
       SET provider_request_schema_version = 2,
           provider_binding_snapshot = $1::jsonb
       WHERE id = $2::uuid`,
      [
        JSON.stringify({
          schemaVersion: 2,
          lines: [{
            variantId: "77000000-0000-4000-8000-000000000011",
            productId: "77000000-0000-4000-8000-000000000012",
            sku: "REFUND-SCHEMA-2",
            productName: "Synthetic refund authority item",
            variantLabel: "5 mg",
            requestedQuantity: 1,
            netLineMinor: 5_000,
            baseUnitMinor: 5_000,
            currency: "USD",
            priceBookId: "77000000-0000-4000-8000-000000000013",
            priceVersion: 1,
            stripeProductId: "prod_refund_schema_2",
            stripePriceId: "price_refund_schema_2",
          }],
        }),
        ids.attempt,
      ],
    );

    await expect(claim()).resolves.toMatchObject({
      status: "call_required",
    });
  });

  it("commits the exact submitted request/hash/attempt before returning an immutable create descriptor", async () => {
    const result = await claim();
    expect(result.status).toBe("call_required");
    if (result.status !== "call_required") return;
    expect(result.descriptor).toMatchObject({
      operation: "create",
      refundId: ids.refund,
      orderId: ids.order,
      verifiedPaymentEventId: ids.payment,
      expectedAttempt: 1,
      expectedProviderContext: providerContext,
      request: {
        provider: "local_test",
        amountMinor: 1200,
        currency: "usd",
        paymentIntentId: "pi_refund_6f",
        chargeId: null,
        providerIdempotencyKey: `refund_request:${ids.refund}`,
      },
    });
    expect(result.descriptor.requestHash).toMatch(/^[a-f0-9]{64}$/u);
    expect(Object.isFrozen(result.descriptor)).toBe(true);
    const persisted = await client.query<{
      status: string;
      providerRequestHash: string;
      attemptCount: number;
      submittedAt: Date;
    }>(`
      SELECT status, provider_request_hash AS "providerRequestHash",
             attempt_count AS "attemptCount", submitted_at AS "submittedAt"
      FROM refunds WHERE id = '${ids.refund}'
    `);
    expect(persisted.rows[0]).toMatchObject({
      status: "submitted",
      providerRequestHash: result.descriptor.requestHash,
      attemptCount: 1,
    });
    expect(new Date(persisted.rows[0]!.submittedAt).toISOString()).toBe(now.toISOString());
  });

  it("rebuilds byte-equivalent same-key create recovery and switches only a known ID to retrieve", async () => {
    const first = await claim();
    expect(first.status).toBe("call_required");
    if (first.status !== "call_required") return;
    const second = await claim();
    expect(second.status).toBe("call_required");
    if (second.status !== "call_required") return;
    expect(second.descriptor).toMatchObject({ operation: "create", expectedAttempt: 2 });
    expect(second.descriptor.request).toEqual(first.descriptor.request);
    expect(second.descriptor.requestHash).toBe(first.descriptor.requestHash);
    await client.exec(`
      UPDATE refunds SET provider_refund_id = 're_known_refund_6f'
      WHERE id = '${ids.refund}'
    `);
    const third = await claim();
    expect(third.status).toBe("call_required");
    if (third.status !== "call_required") return;
    expect(third.descriptor).toMatchObject({
      operation: "retrieve",
      knownProviderRefundId: "re_known_refund_6f",
      expectedAttempt: 3,
    });
    expect(third.descriptor.request).toEqual(first.descriptor.request);
    expect(third.descriptor.requestHash).toBe(first.descriptor.requestHash);
  });

  it("rejects actor/provider/livemode/scope drift and post-handoff or ambiguous payment facts with zero claim mutation", async () => {
    for (const [actorUserId, actorClerkUserId, context] of [
      [ids.buyer, "clerk_buyer_6f", providerContext],
      [ids.staff, "clerk_wrong", providerContext],
      [ids.staff, "clerk_staff_6f", { ...providerContext, livemode: true }],
      [ids.staff, "clerk_staff_6f", { ...providerContext, scope: "local_test:wrong" }],
    ] as const) {
      await expect(
        setup().repository.claim({
          refundId: ids.refund,
          actorUserId,
          actorClerkUserId,
          expectedProviderContext: context,
          now,
        }),
      ).resolves.not.toMatchObject({ status: "call_required" });
    }
    await client.exec(`UPDATE orders SET state = 'fulfilled' WHERE id = '${ids.order}'`);
    await expect(claim()).resolves.toEqual({ status: "ineligible" });
    await client.exec(`UPDATE orders SET state = 'paid_pending_fulfillment' WHERE id = '${ids.order}'`);
    const secondEvent = "77000000-0000-4000-8000-000000000011";
    const secondPayment = "77000000-0000-4000-8000-000000000012";
    await client.exec(`
      INSERT INTO provider_events
        (id, provider, provider_event_id, payload_hash, status, attempt_count,
         received_at, processed_at, event_type, schema_version,
         normalized_payload, provider_created_at, livemode)
      SELECT '${secondEvent}', provider, 'evt_second_payment_6f', '${"5".repeat(64)}',
             status, attempt_count, received_at, processed_at, event_type,
             schema_version,
             jsonb_set(normalized_payload, '{providerEventId}', '"evt_second_payment_6f"'),
             provider_created_at, livemode
      FROM provider_events WHERE id = '${ids.paidEvent}';
      INSERT INTO payment_events
        (id, provider_event_id, order_id, event_type, provider_payment_id,
         idempotency_key, amount_minor, currency, occurred_at)
      VALUES
        ('${secondPayment}', '${secondEvent}', '${ids.order}', 'payment_verified',
         'pi_second_6f', 'local_test:payment_intent:pi_second_6f', 5000, 'USD',
         '2026-08-25T10:02:00.000Z');
    `);
    await expect(claim()).resolves.toEqual({ status: "conflict" });
    const row = await client.query<{ status: string; attemptCount: number }>(`
      SELECT status, attempt_count AS "attemptCount" FROM refunds WHERE id = '${ids.refund}'
    `);
    expect(row.rows).toEqual([{ status: "requested", attemptCount: 0 }]);
  });

  it("rejects a payment source whose normalized provider-event identity differs from its database envelope", async () => {
    await client.exec(`
      ALTER TABLE provider_events
      DROP CONSTRAINT provider_events_normalized_common_coherent;
      UPDATE provider_events
      SET normalized_payload = jsonb_set(
        normalized_payload, '{providerEventId}', '"evt_wrong_payment_source_6f"'
      )
      WHERE id = '${ids.paidEvent}'
    `);
    await expect(claim()).resolves.toEqual({ status: "conflict" });
    const row = await client.query<{ status: string; attempts: number }>(`
      SELECT status, attempt_count AS attempts FROM refunds
      WHERE id = '${ids.refund}'
    `);
    expect(row.rows).toEqual([{ status: "requested", attempts: 0 }]);
  });

  it("rejects a succeeded refund source whose normalized provider-event identity differs from its database envelope", async () => {
    await client.exec(`
      ALTER TABLE provider_events
      DROP CONSTRAINT provider_events_normalized_common_coherent;
      INSERT INTO provider_events
        (id, provider, provider_event_id, payload_hash, status, attempt_count,
         received_at, processed_at, event_type, schema_version,
         normalized_payload, provider_created_at, livemode)
      VALUES
        ('${ids.terminalEvent}', 'local_test', 'evt_refund_database_6f', '${"7".repeat(64)}',
         'processed', 1, '2026-08-26T12:01:00.000Z', '2026-08-26T12:01:01.000Z',
         'refund.updated', 1,
         '{"schemaVersion":1,"kind":"refund","providerEventId":"evt_refund_normalized_6f","eventType":"refund.updated","providerCreatedAt":"2026-08-26T12:01:00.000Z","livemode":false,"providerRefundId":"re_terminal_6f","orderId":"${ids.order}","refundRequestId":"${ids.refund}","paymentIntentId":"pi_refund_6f","chargeId":null,"amountMinor":1200,"currency":"usd","status":"succeeded"}'::jsonb,
         '2026-08-26T12:01:00.000Z', false);
      UPDATE refunds
      SET status = 'succeeded', provider_event_id = '${ids.terminalEvent}',
          provider_refund_id = 're_terminal_6f', confirmed_amount_minor = 1200,
          provider_request_hash = '${"8".repeat(64)}', attempt_count = 1,
          submitted_at = '2026-08-26T12:00:00.000Z',
          confirmed_at = '2026-08-26T12:01:00.000Z'
      WHERE id = '${ids.refund}'
    `);
    await expect(claim()).resolves.toEqual({ status: "conflict" });
  });

  it.each(["succeeded", "failed", "cancelled"] as const)(
    "returns terminal %s replay after the order later crosses physical handoff",
    async (status) => {
      if (status === "succeeded") {
        await client.exec(`
          INSERT INTO provider_events
            (id, provider, provider_event_id, payload_hash, status, attempt_count,
             received_at, processed_at, event_type, schema_version,
             normalized_payload, provider_created_at, livemode)
          VALUES
            ('${ids.terminalEvent}', 'local_test', 'evt_refund_terminal_handoff_6f', '${"9".repeat(64)}',
             'processed', 1, '2026-08-26T12:01:00.000Z', '2026-08-26T12:01:01.000Z',
             'refund.updated', 1,
             '{"schemaVersion":1,"kind":"refund","providerEventId":"evt_refund_terminal_handoff_6f","eventType":"refund.updated","providerCreatedAt":"2026-08-26T12:01:00.000Z","livemode":false,"providerRefundId":"re_terminal_handoff_6f","orderId":"${ids.order}","refundRequestId":"${ids.refund}","paymentIntentId":"pi_refund_6f","chargeId":null,"amountMinor":1200,"currency":"usd","status":"succeeded"}'::jsonb,
             '2026-08-26T12:01:00.000Z', false);
          UPDATE refunds
          SET status = 'succeeded', provider_event_id = '${ids.terminalEvent}',
              provider_refund_id = 're_terminal_handoff_6f',
              confirmed_amount_minor = 1200,
              provider_request_hash = '${"a".repeat(64)}', attempt_count = 1,
              submitted_at = '2026-08-26T12:00:00.000Z',
              confirmed_at = '2026-08-26T12:01:00.000Z'
          WHERE id = '${ids.refund}'
        `);
      } else {
        await client.query(
          `UPDATE refunds
           SET status = $2::refund_status,
               provider_request_hash = $3, attempt_count = 1,
               submitted_at = '2026-08-26T12:00:00.000Z',
               last_error_redacted = $4
           WHERE id = $1::uuid`,
          [
            ids.refund,
            status,
            "b".repeat(64),
            status === "failed" ? "provider_refund_failed" : null,
          ],
        );
      }
      await client.exec(`
        UPDATE orders SET state = 'fulfilled' WHERE id = '${ids.order}'
      `);
      await expect(claim()).resolves.toEqual({
        status: "terminal",
        refundStatus: status,
      });
      const row = await client.query<{ status: string; attempts: number }>(`
        SELECT status, attempt_count AS attempts FROM refunds
        WHERE id = '${ids.refund}'
      `);
      expect(row.rows).toEqual([{ status, attempts: 1 }]);
    },
  );

  it.each([
    [{ kind: "provider_unknown", providerRefundId: null }, "submitted", null, null],
    [{ kind: "provider_unknown", providerRefundId: "re_learned_6f" }, "submitted", "re_learned_6f", null],
    [{ kind: "normalized", providerRefundId: "re_pending_6f", status: "pending" }, "submitted", "re_pending_6f", null],
    [{ kind: "normalized", providerRefundId: "re_action_6f", status: "requires_action" }, "submitted", "re_action_6f", null],
    [{ kind: "normalized", providerRefundId: "re_success_6f", status: "succeeded" }, "awaiting_signed_event", "re_success_6f", null],
    [{ kind: "definite_rejection" }, "failed", null, "provider_refund_rejected"],
    [{ kind: "normalized", providerRefundId: "re_failed_6f", status: "failed" }, "failed", "re_failed_6f", "provider_refund_failed"],
    [{ kind: "normalized", providerRefundId: "re_cancel_6f", status: "canceled" }, "cancelled", "re_cancel_6f", null],
  ] as const)(
    "applies strict result CAS %# without confirming signed-only money",
    async (strictResult, expectedStatus, expectedProviderId, expectedError) => {
      const claimed = await claim();
      expect(claimed.status).toBe("call_required");
      if (claimed.status !== "call_required") return;
      const result = await setup().repository.applyResult({
        descriptor: claimed.descriptor,
        result: strictResult as StrictRefundProviderResultV1,
        now: new Date("2026-08-26T12:01:00.000Z"),
      });
      expect(result.status).toBe(expectedStatus);
      const row = await client.query<{
        status: string;
        providerRefundId: string | null;
        confirmedAmountMinor: number | null;
        providerEventId: string | null;
        lastError: string | null;
      }>(`
        SELECT status, provider_refund_id AS "providerRefundId",
               confirmed_amount_minor AS "confirmedAmountMinor",
               provider_event_id::text AS "providerEventId",
               last_error_redacted AS "lastError"
        FROM refunds WHERE id = '${ids.refund}'
      `);
      expect(row.rows).toEqual([{
        status: expectedStatus === "awaiting_signed_event" ? "submitted" : expectedStatus,
        providerRefundId: expectedProviderId,
        confirmedAmountMinor: null,
        providerEventId: null,
        lastError: expectedError,
      }]);
      const forbiddenAuthority = await client.query<{
        journals: number;
        effects: number;
      }>(`
        SELECT
          (SELECT count(*)::int FROM payment_events
           WHERE event_type = 'refund_verified') AS journals,
          (SELECT count(*)::int FROM downstream_effects
           WHERE effect_type = 'refund_verified') AS effects
      `);
      expect(forbiddenAuthority.rows).toEqual([{ journals: 0, effects: 0 }]);
    },
  );

  it("rolls back Transaction A writes on a known failure and makes no provider call", async () => {
    const adapter = provider({
      status: "provider_unknown",
      knownProviderRefundId: null,
      evidenceCode: "provider_transport_unknown",
    });
    const repository = createRefundFulfillmentRepository({
      runSerializableTransaction: (work) =>
        client.transaction(async (transaction) => {
          await work({
            query: (sql, params = []) => transaction.query(sql, [...params]),
          });
          throw new Error("synthetic known rollback");
        }),
      sha256,
    });
    await expect(submit(repository, adapter)).rejects.toThrow(/known rollback/i);
    expect(adapter.createRefund).not.toHaveBeenCalled();
    const row = await client.query<{ status: string; attempts: number }>(`
      SELECT status, attempt_count AS attempts FROM refunds
      WHERE id = '${ids.refund}'
    `);
    expect(row.rows).toEqual([{ status: "requested", attempts: 0 }]);
  });

  it("makes no provider call after an ambiguous post-commit error and recovers the committed hash explicitly", async () => {
    const adapter = provider({
      status: "provider_unknown",
      knownProviderRefundId: null,
      evidenceCode: "provider_transport_unknown",
    });
    const ambiguous = createRefundFulfillmentRepository({
      runSerializableTransaction: async (work) => {
        await client.transaction((transaction) =>
          work({
            query: (sql, params = []) => transaction.query(sql, [...params]),
          }),
        );
        throw Object.assign(new Error("synthetic ambiguous commit"), {
          code: "08006",
        });
      },
      sha256,
    });
    await expect(submit(ambiguous, adapter)).rejects.toThrow(/ambiguous commit/i);
    expect(adapter.createRefund).not.toHaveBeenCalled();
    const committed = await client.query<{
      status: string;
      requestHash: string;
      attempts: number;
    }>(`
      SELECT status, provider_request_hash AS "requestHash",
             attempt_count AS attempts
      FROM refunds WHERE id = '${ids.refund}'
    `);
    expect(committed.rows[0]).toMatchObject({ status: "submitted", attempts: 1 });
    expect(committed.rows[0]!.requestHash).toMatch(/^[a-f0-9]{64}$/u);

    await expect(submit(setup().repository, adapter)).resolves.toEqual({
      status: "submitted",
    });
    expect(adapter.createRefund).toHaveBeenCalledTimes(1);
    const recovered = await client.query<{ requestHash: string; attempts: number }>(`
      SELECT provider_request_hash AS "requestHash", attempt_count AS attempts
      FROM refunds WHERE id = '${ids.refund}'
    `);
    expect(recovered.rows).toEqual([{
      requestHash: committed.rows[0]!.requestHash,
      attempts: 2,
    }]);
  });

  it("retries only Transaction B for 40001 then 40P01 while calling the provider once", async () => {
    let transactions = 0;
    const repository = createRefundFulfillmentRepository({
      runSerializableTransaction: (work) => {
        transactions += 1;
        if (transactions === 2 || transactions === 3) {
          throw Object.assign(new Error("synthetic result CAS retry"), {
            code: transactions === 2 ? "40001" : "40P01",
          });
        }
        return client.transaction((transaction) =>
          work({
            query: (sql, params = []) => transaction.query(sql, [...params]),
          }),
        );
      },
      sha256,
      retrySleep: async () => undefined,
    });
    const adapter = provider({
      status: "normalized",
      refund: {
        provider: "local_test",
        providerRefundId: "re_result_retry_6f",
        paymentIntentId: "pi_refund_6f",
        chargeId: null,
        amount: 1200,
        currency: "usd",
        status: "pending",
        livemode: false,
      },
    });
    await expect(submit(repository, adapter)).resolves.toEqual({
      status: "submitted",
    });
    expect(adapter.createRefund).toHaveBeenCalledTimes(1);
    expect(transactions).toBe(4);
    const row = await client.query<{ status: string; attempts: number }>(`
      SELECT status, attempt_count AS attempts FROM refunds
      WHERE id = '${ids.refund}'
    `);
    expect(row.rows).toEqual([{ status: "submitted", attempts: 1 }]);
  });

  it("rejects independent stale hash, provider context, refund ID, and provider ID CAS claims with zero writes", async () => {
    const claimed = await claim();
    expect(claimed.status).toBe("call_required");
    if (claimed.status !== "call_required") return;
    const before = await client.query<{
      status: string;
      requestHash: string;
      attempts: number;
      providerRefundId: string | null;
    }>(`
      SELECT status, provider_request_hash AS "requestHash",
             attempt_count AS attempts,
             provider_refund_id AS "providerRefundId"
      FROM refunds WHERE id = '${ids.refund}'
    `);
    const result = {
      kind: "provider_unknown" as const,
      providerRefundId: null,
    };
    const invalidDescriptors: RefundClaimDescriptorV1[] = [
      Object.freeze({ ...claimed.descriptor, requestHash: "b".repeat(64) }),
      Object.freeze({
        ...claimed.descriptor,
        expectedProviderContext: Object.freeze({
          ...claimed.descriptor.expectedProviderContext,
          scope: "local_test:wrong-scope",
        }),
      }),
      Object.freeze({
        ...claimed.descriptor,
        refundId: "77000000-0000-4000-8000-000000000099",
      }),
    ];
    for (const invalid of invalidDescriptors) {
      await expect(
        setup().repository.applyResult({ descriptor: invalid, result, now }),
      ).resolves.toEqual({ status: "conflict" });
    }
    await client.exec(`
      UPDATE refunds SET provider_refund_id = 're_concurrent_winner_6f'
      WHERE id = '${ids.refund}'
    `);
    await expect(
      setup().repository.applyResult({
        descriptor: claimed.descriptor,
        result: {
          kind: "normalized",
          providerRefundId: "re_contradictory_6f",
          status: "pending",
        },
        now,
      }),
    ).resolves.toEqual({ status: "conflict" });
    await client.exec(`
      UPDATE refunds SET provider_refund_id = NULL
      WHERE id = '${ids.refund}'
    `);
    const after = await client.query<{
      status: string;
      requestHash: string;
      attempts: number;
      providerRefundId: string | null;
    }>(`
      SELECT status, provider_request_hash AS "requestHash",
             attempt_count AS attempts,
             provider_refund_id AS "providerRefundId"
      FROM refunds WHERE id = '${ids.refund}'
    `);
    expect(after.rows).toEqual(before.rows);
  });

  it.each([
    ["failed" as const, { kind: "definite_rejection" as const }],
    [
      "cancelled" as const,
      {
        kind: "normalized" as const,
        providerRefundId: "re_terminal_cancel_6f",
        status: "canceled" as const,
      },
    ],
  ])("returns terminal %s replay without another provider call or mutation", async (expected, result) => {
    const claimed = await claim();
    expect(claimed.status).toBe("call_required");
    if (claimed.status !== "call_required") return;
    await expect(
      setup().repository.applyResult({
        descriptor: claimed.descriptor,
        result,
        now,
      }),
    ).resolves.toEqual({ status: expected });
    const before = await client.query<{
      status: string;
      attempts: number;
      requestHash: string;
      providerRefundId: string | null;
    }>(`
      SELECT status, attempt_count AS attempts,
             provider_request_hash AS "requestHash",
             provider_refund_id AS "providerRefundId"
      FROM refunds WHERE id = '${ids.refund}'
    `);
    const adapter = provider({
      status: "provider_unknown",
      knownProviderRefundId: null,
      evidenceCode: "provider_transport_unknown",
    });
    await expect(submit(setup().repository, adapter)).resolves.toEqual({
      status: "terminal",
      refundStatus: expected,
    });
    expect(adapter.createRefund).not.toHaveBeenCalled();
    expect(adapter.retrieveRefund).not.toHaveBeenCalled();
    const after = await client.query<{
      status: string;
      attempts: number;
      requestHash: string;
      providerRefundId: string | null;
    }>(`
      SELECT status, attempt_count AS attempts,
             provider_request_hash AS "requestHash",
             provider_refund_id AS "providerRefundId"
      FROM refunds WHERE id = '${ids.refund}'
    `);
    expect(after.rows).toEqual(before.rows);
  });

  it("keeps a retrieve definite rejection submitted and persists no provider-derived authority", async () => {
    const first = await claim();
    expect(first.status).toBe("call_required");
    if (first.status !== "call_required") return;
    await client.exec(`
      UPDATE refunds SET provider_refund_id = 're_known_rejection_6f'
      WHERE id = '${ids.refund}'
    `);
    const retrieve = await claim();
    expect(retrieve.status).toBe("call_required");
    if (retrieve.status !== "call_required") return;
    expect(retrieve.descriptor.operation).toBe("retrieve");
    await expect(
      setup().repository.applyResult({
        descriptor: retrieve.descriptor,
        result: { kind: "definite_rejection" },
        now,
      }),
    ).resolves.toEqual({ status: "conflict" });
    const row = await client.query<{
      status: string;
      providerRefundId: string;
      error: string | null;
    }>(`
      SELECT status, provider_refund_id AS "providerRefundId",
             last_error_redacted AS error
      FROM refunds WHERE id = '${ids.refund}'
    `);
    expect(row.rows).toEqual([{
      status: "submitted",
      providerRefundId: "re_known_rejection_6f",
      error: null,
    }]);
  });

  it("does not leak returned cyclic provider sentinels to refund, audit, journal, or effect persistence", async () => {
    const sentinel = "SECRET_EMAIL_address_tracking_raw_metadata_pglite";
    const returned: Record<string, unknown> = {
      status: "provider_unknown",
      knownProviderRefundId: null,
      evidenceCode: "provider_transport_unknown",
      metadata: { email: sentinel, address: sentinel, tracking: sentinel },
    };
    returned.self = returned;
    const adapter = provider(returned);
    await expect(submit(setup().repository, adapter)).resolves.toEqual({
      status: "provider_refund_result_invalid",
    });
    expect(adapter.createRefund).toHaveBeenCalledTimes(1);
    const persisted = await client.query<{
      refundText: string;
      audits: number;
      journals: number;
      effects: number;
    }>(`
      SELECT
        (SELECT row_to_json(refund)::text FROM refunds refund
         WHERE id = '${ids.refund}') AS "refundText",
        (SELECT count(*)::int FROM admin_audit) AS audits,
        (SELECT count(*)::int FROM payment_events
         WHERE event_type = 'refund_verified') AS journals,
        (SELECT count(*)::int FROM downstream_effects) AS effects
    `);
    expect(persisted.rows).toEqual([{
      refundText: expect.not.stringContaining(sentinel),
      audits: 0,
      journals: 0,
      effects: 0,
    }]);
    expect(persisted.rows[0]!.refundText).toContain('"status":"submitted"');
  });

  it("lets a signed terminal refund win over result CAS and rejects stale attempt/hash/provider identity", async () => {
    const first = await claim();
    expect(first.status).toBe("call_required");
    if (first.status !== "call_required") return;
    const second = await claim();
    expect(second.status).toBe("call_required");
    if (second.status !== "call_required") return;
    await expect(
      setup().repository.applyResult({
        descriptor: first.descriptor,
        result: { kind: "provider_unknown", providerRefundId: "re_stale_6f" },
        now,
      }),
    ).resolves.toEqual({ status: "stale" });
    await client.exec(`
      INSERT INTO provider_events
        (id, provider, provider_event_id, payload_hash, status, attempt_count,
         received_at, processed_at, event_type, schema_version,
         normalized_payload, provider_created_at, livemode)
      VALUES
        ('${ids.terminalEvent}', 'local_test', 'evt_refund_terminal_6f', '${"6".repeat(64)}',
         'processed', 1, '2026-08-26T12:01:00.000Z', '2026-08-26T12:01:01.000Z',
         'refund.updated', 1,
         '{"schemaVersion":1,"kind":"refund","providerEventId":"evt_refund_terminal_6f","eventType":"refund.updated","providerCreatedAt":"2026-08-26T12:01:00.000Z","livemode":false,"providerRefundId":"re_terminal_6f","orderId":"${ids.order}","refundRequestId":"${ids.refund}","paymentIntentId":"pi_refund_6f","chargeId":null,"amountMinor":1200,"currency":"usd","status":"succeeded"}'::jsonb,
         '2026-08-26T12:01:00.000Z', false);
      UPDATE refunds
      SET status = 'succeeded', provider_event_id = '${ids.terminalEvent}',
          provider_refund_id = 're_terminal_6f', confirmed_amount_minor = 1200,
          confirmed_at = '2026-08-26T12:01:00.000Z'
      WHERE id = '${ids.refund}';
    `);
    await expect(
      setup().repository.applyResult({
        descriptor: second.descriptor,
        result: { kind: "provider_unknown", providerRefundId: null },
        now,
      }),
    ).resolves.toEqual({ status: "terminal", refundStatus: "succeeded" });
    const row = await client.query<{ status: string; providerRefundId: string }>(`
      SELECT status, provider_refund_id AS "providerRefundId"
      FROM refunds WHERE id = '${ids.refund}'
    `);
    expect(row.rows).toEqual([{ status: "succeeded", providerRefundId: "re_terminal_6f" }]);
    const adapter = provider({
      status: "provider_unknown",
      knownProviderRefundId: null,
      evidenceCode: "provider_transport_unknown",
    });
    await expect(submit(setup().repository, adapter)).resolves.toEqual({
      status: "terminal",
      refundStatus: "succeeded",
    });
    expect(adapter.createRefund).not.toHaveBeenCalled();
    expect(adapter.retrieveRefund).not.toHaveBeenCalled();
    const replayed = await client.query<{
      status: string;
      providerRefundId: string;
      attempts: number;
    }>(`
      SELECT status, provider_refund_id AS "providerRefundId",
             attempt_count AS attempts
      FROM refunds WHERE id = '${ids.refund}'
    `);
    expect(replayed.rows).toEqual([{
      status: "succeeded",
      providerRefundId: "re_terminal_6f",
      attempts: 2,
    }]);
  });

  it("retries only serializable callbacks for 40001 then 40P01, at most three attempts", async () => {
    const retrying = setup(["40001", "40P01"]);
    await expect(
      retrying.repository.claim({
        refundId: ids.refund,
        actorUserId: ids.staff,
        actorClerkUserId: "clerk_staff_6f",
        expectedProviderContext: providerContext,
        now,
      }),
    ).resolves.toMatchObject({ status: "call_required" });
    expect(retrying.transactionCount()).toBe(3);
  });
});
