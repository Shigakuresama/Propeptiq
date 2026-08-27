import type { PGlite } from "@electric-sql/pglite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  activateProduct,
  activatePromotion,
  changeStaffCapability,
  decideReviewRequest,
  publishAttestationVersion,
  publishCoaDocument,
  requestRefundIntent,
  retireProduct,
  retirePromotion,
  saveAnalyticalClaimDraft,
  saveCoaDraft,
  saveLotDraft,
  savePendingShipmentMetadata,
  savePolicyGroup,
  saveProductDraft,
  savePromotionDraft,
  setAnalyticalClaimLifecycle,
  setCoaLifecycle,
  setLotLifecycle,
  setPolicyGroupLifecycle,
  supersedeDestinationPolicy,
  supersedeProductPrice,
} from "@/admin/admin-service";
import { createPostgresAdminRepository } from "@/db/repositories/admin-repository";
import { createPostgresRateLimitStore } from "@/db/repositories/rate-limit-store";

import { createMigratedPglite } from "./helpers/pglite";

const ids = {
  admin: "10000000-0000-4000-8000-000000000001",
  buyer: "10000000-0000-4000-8000-000000000002",
  attestation: "10000000-0000-4000-8000-000000000003",
  acceptance: "10000000-0000-4000-8000-000000000004",
  group: "10000000-0000-4000-8000-000000000005",
  product: "10000000-0000-4000-8000-000000000006",
  price: "10000000-0000-4000-8000-000000000007",
  lot: "10000000-0000-4000-8000-000000000008",
  coa: "10000000-0000-4000-8000-000000000009",
  claim: "10000000-0000-4000-8000-000000000010",
  destination: "10000000-0000-4000-8000-000000000011",
  promotion: "10000000-0000-4000-8000-000000000012",
  order: "10000000-0000-4000-8000-000000000013",
  providerEvent: "10000000-0000-4000-8000-000000000014",
  paymentEvent: "10000000-0000-4000-8000-000000000015",
  review: "10000000-0000-4000-8000-000000000016",
  release: "10000000-0000-4000-8000-000000000017",
  product2: "10000000-0000-4000-8000-000000000018",
  price2: "10000000-0000-4000-8000-000000000019",
  lot2: "10000000-0000-4000-8000-000000000020",
  destination2: "10000000-0000-4000-8000-000000000021",
  attempt: "10000000-0000-4000-8000-000000000024",
} as const;

const now = new Date("2026-08-25T12:00:00.000Z");

describe("Task 5 PostgreSQL admin repository", () => {
  let client: PGlite;

  beforeEach(async () => {
    client = await createMigratedPglite();
    await client.exec(`
      INSERT INTO users (id, clerk_id, email_verified_at)
      VALUES
        ('${ids.admin}', 'clerk-admin', '2026-08-01T00:00:00.000Z'),
        ('${ids.buyer}', 'clerk-buyer', '2026-08-01T00:00:00.000Z');
      INSERT INTO staff_roles
        (user_id, capability, granted_by_user_id, grant_correlation_id)
      VALUES
        ('${ids.admin}', 'catalog:publish', '${ids.admin}', 'test-catalog-authority'),
        ('${ids.admin}', 'destination:manage', '${ids.admin}', 'test-destination-authority'),
        ('${ids.admin}', 'promotion:manage', '${ids.admin}', 'test-promotion-authority'),
        ('${ids.admin}', 'review:decide', '${ids.admin}', 'test-review-authority'),
        ('${ids.admin}', 'refund:request', '${ids.admin}', 'test-refund-authority'),
        ('${ids.admin}', 'fulfillment:release:consume', '${ids.admin}', 'test-shipment-authority');
      INSERT INTO buyer_profiles
        (user_id, status, age_confirmed_at, research_purpose, updated_at)
      VALUES
        ('${ids.buyer}', 'review', '2026-08-01T00:00:00.000Z', 'analytical', '2026-08-24T12:00:00.000Z');
      INSERT INTO attestation_versions
        (id, version, content_hash, policy_text, effective_at)
      VALUES
        ('${ids.attestation}', 1, '${"a".repeat(64)}', 'Research-use policy version one.', '2026-08-01T00:00:00.000Z');
      INSERT INTO attestation_acceptances (id, user_id, attestation_version_id, accepted_at)
      VALUES ('${ids.acceptance}', '${ids.buyer}', '${ids.attestation}', '2026-08-02T00:00:00.000Z');
      INSERT INTO product_policy_groups (id, slug, name, active)
      VALUES ('${ids.group}', 'synthetic-group', 'Synthetic policy group', true);
      INSERT INTO products
        (id, slug, name, package_form, material_identity, policy_group_id, status, updated_at)
      VALUES
        ('${ids.product}', 'synthetic-product', 'Reference standard A', 'Sealed unit',
         'Synthetic reference identity A', '${ids.group}', 'draft', '2026-08-24T12:00:00.000Z'),
        ('${ids.product2}', 'synthetic-product-b', 'Reference standard B', 'Sealed unit',
         'Synthetic reference identity B', '${ids.group}', 'active', '2026-08-24T12:00:00.000Z');
      INSERT INTO product_prices
        (id, product_id, version, amount_minor, currency, effective_at)
      VALUES
        ('${ids.price}', '${ids.product}', 1, 5000, 'USD', '2026-08-01T00:00:00.000Z'),
        ('${ids.price2}', '${ids.product2}', 1, 4000, 'USD', '2026-08-01T00:00:00.000Z');
      INSERT INTO lots
        (id, product_id, supplier_name, supplier_lot_code, analytical_method,
         received_quantity, available_quantity, status)
      VALUES
        ('${ids.lot}', '${ids.product}', 'Synthetic supplier', 'SYN-LOT-1', 'HPLC', 5, 5, 'released'),
        ('${ids.lot2}', '${ids.product2}', 'Synthetic supplier', 'SYN-LOT-2', NULL, 5, 5, 'released');
      INSERT INTO coa_documents
        (id, lot_id, evidence_hash, storage_key, public, active)
      VALUES
        ('${ids.coa}', '${ids.lot}', '${"b".repeat(64)}', 'private/synthetic-coa.pdf', true, true);
      INSERT INTO analytical_claims
        (id, product_id, lot_id, coa_document_id, text, active)
      VALUES
        ('${ids.claim}', '${ids.product}', '${ids.lot}', '${ids.coa}', 'HPLC analytical record COA', true);
      INSERT INTO destination_policies
        (id, scope_kind, product_id, state_code, result, version, active, effective_at)
      VALUES
        ('${ids.destination}', 'product', '${ids.product}', 'CA', 'allowed', 1, true, '2026-08-01T00:00:00.000Z'),
        ('${ids.destination2}', 'product', '${ids.product2}', 'CA', 'allowed', 1, true, '2026-08-01T00:00:00.000Z');
      INSERT INTO promotions
        (id, code, name, kind, status, amount_minor, currency, configuration, updated_at)
      VALUES
        ('${ids.promotion}', 'SYN-BUNDLE', 'Reference bundle', 'bundle', 'draft', 8000, 'USD',
         '{"productIds":["${ids.product}","${ids.product2}"]}'::jsonb,
         '2026-08-24T12:00:00.000Z');
      INSERT INTO promotion_targets
        (promotion_id, target_kind, product_id)
      VALUES ('${ids.promotion}', 'product', '${ids.product}');
      INSERT INTO orders
        (id, buyer_user_id, buyer_status_snapshot, attestation_acceptance_id,
         destination_state_code, currency, subtotal_minor, discount_minor,
         tax_minor, shipping_minor, total_minor, state)
      VALUES
        ('${ids.order}', '${ids.buyer}', 'active', '${ids.acceptance}', 'CA', 'USD',
         5000, 0, 0, 0, 5000, 'paid_pending_fulfillment');
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
        ('${ids.attempt}', '${ids.order}', '${ids.buyer}', 'checkout-admin-fixture',
         '${"9".repeat(64)}', 'completed', 'pass', 'pass', 'pass', 'pass',
         'pass', 'pass', true, false, '{}', true, true, 'local_test',
         'checkout_attempt:${ids.attempt}', 'cs_local_admin_fixture', '${"8".repeat(64)}',
         'buyer@example.test', 'http://localhost:3000', 1, false,
         'local_test:synthetic-propeptiq-v1', 'tax_admin_fixture',
         'ship_admin_fixture', 'synthetic_ground', '2027-08-24T11:00:00.000Z');
      INSERT INTO provider_events
        (id, provider, provider_event_id, payload_hash, status, attempt_count,
         received_at, processed_at, event_type, schema_version,
         normalized_payload, provider_created_at, livemode)
      VALUES
        ('${ids.providerEvent}', 'local_test', 'evt_synthetic_paid', '${"c".repeat(64)}',
         'processed', 1, '2026-08-24T10:00:00.000Z', '2026-08-24T10:01:00.000Z',
         'checkout.session.completed', 1,
         '{"schemaVersion":1,"kind":"checkout_session","providerEventId":"evt_synthetic_paid","eventType":"checkout.session.completed","providerCreatedAt":"2026-08-24T10:00:00.000Z","livemode":false,"sessionId":"cs_local_admin_fixture","orderId":"${ids.order}","attemptId":"${ids.attempt}","paymentIntentId":"pay_synthetic","amountMinor":5000,"currency":"usd","paymentStatus":"paid","sessionStatus":"complete"}'::jsonb,
         '2026-08-24T10:00:00.000Z', false);
      INSERT INTO payment_events
        (id, provider_event_id, order_id, event_type, provider_payment_id,
         idempotency_key, amount_minor, currency, occurred_at)
      VALUES
        ('${ids.paymentEvent}', '${ids.providerEvent}', '${ids.order}', 'payment_verified',
         'pay_synthetic', 'local_test:payment_intent:pay_synthetic', 5000, 'USD', '2026-08-24T10:00:00.000Z');
      INSERT INTO review_requests
        (id, user_id, order_id, snapshot_hash, buyer_status_snapshot,
         attestation_version_id, destination_state_code, cart_snapshot,
         buyer_review_required, destination_review_required)
      VALUES
        ('${ids.review}', '${ids.buyer}', '${ids.order}', '${"d".repeat(64)}', 'review',
         '${ids.attestation}', 'CA', '{}'::jsonb, true, false);
      INSERT INTO fulfillment_releases
        (id, order_id, version, idempotency_key, payment_event_id, state, issued_at, expires_at)
      VALUES
        ('${ids.release}', '${ids.order}', 1, 'release-synthetic-1', '${ids.paymentEvent}',
         'issued', '2026-08-25T10:00:00.000Z', '2026-08-26T12:00:00.000Z');
    `);
  });

  afterEach(async () => client.close());

  function repository() {
    return createPostgresAdminRepository(
      (work) => client.transaction(work),
      createPostgresRateLimitStore(client),
    );
  }

  function context(correlationId: string) {
    return {
      principal: {
        actorId: ids.admin,
        clerkUserId: "clerk-admin",
        buyerStatus: null,
        capabilities: [
          "catalog:publish",
          "destination:manage",
          "promotion:manage",
          "review:decide",
          "refund:request",
          "fulfillment:release:consume",
          "staff:manage",
        ],
        mfaSatisfied: true,
      } as const,
      identity: {
        clerkUserId: "clerk-admin",
        primaryEmail: "admin@example.test",
        emailVerifiedAt: now.toISOString(),
        mfaConfigured: true,
        secondFactorCompleted: true,
      } as const,
      now,
      correlationId,
      rateLimitSecret: "task5-rate-limit-secret-at-least-32-characters",
    };
  }

  it("rejects stale product and promotion writes while committing each successful mutation with one audit", async () => {
    const repo = repository();
    await activateProduct(repo, context("repo-product"), {
      productId: ids.product,
      expectedUpdatedAt: "2026-08-24T12:00:00.000Z",
    });
    await expect(
      activateProduct(repo, context("repo-product-stale"), {
        productId: ids.product,
        expectedUpdatedAt: "2026-08-24T12:00:00.000Z",
      }),
    ).rejects.toThrow(/stale/i);
    await activatePromotion(repo, context("repo-promotion"), {
      promotionId: ids.promotion,
      expectedVersion: 1,
      expectedUpdatedAt: "2026-08-24T12:00:00.000Z",
    });
    await expect(
      activatePromotion(repo, context("repo-promotion-stale"), {
        promotionId: ids.promotion,
        expectedVersion: 1,
        expectedUpdatedAt: "2026-08-24T12:00:00.000Z",
      }),
    ).rejects.toThrow(/stale/i);

    const audit = await client.query<{ action: string; correlation_id: string }>(`
      SELECT action, correlation_id FROM admin_audit
      WHERE correlation_id LIKE 'repo-%' ORDER BY occurred_at
    `);
    expect(audit.rows).toEqual([
      { action: "catalog.product.activated", correlation_id: "repo-product" },
      { action: "promotion.activated", correlation_id: "repo-promotion" },
    ]);
  });

  it("rejects product publication when any active analytical claim lacks releasable public evidence", async () => {
    await client.exec(`
      INSERT INTO lots
        (id, product_id, supplier_name, supplier_lot_code,
         received_quantity, available_quantity, status)
      VALUES
        ('10000000-0000-4000-8000-000000000030', '${ids.product}',
         'Synthetic supplier', 'SYN-DRAFT-CLAIM', 1, 1, 'draft');
      INSERT INTO coa_documents
        (id, lot_id, evidence_hash, storage_key, public, active)
      VALUES
        ('10000000-0000-4000-8000-000000000031',
         '10000000-0000-4000-8000-000000000030', '${"e".repeat(64)}',
         'private/unreleased-claim.pdf', false, true);
      INSERT INTO analytical_claims
        (id, product_id, lot_id, coa_document_id, text, active)
      VALUES
        ('10000000-0000-4000-8000-000000000032', '${ids.product}',
         '10000000-0000-4000-8000-000000000030',
         '10000000-0000-4000-8000-000000000031', 'HPLC claim without public release', true);
    `);
    await expect(
      activateProduct(repository(), context("repo-invalid-claim"), {
        productId: ids.product,
        expectedUpdatedAt: "2026-08-24T12:00:00.000Z",
      }),
    ).rejects.toThrow(/content policy/i);
    const state = await client.query<{ status: string; audits: number }>(`
      SELECT status,
        (SELECT count(*)::int FROM admin_audit WHERE correlation_id = 'repo-invalid-claim') AS audits
      FROM products WHERE id = '${ids.product}'
    `);
    expect(state.rows).toEqual([{ status: "draft", audits: 0 }]);
  });

  it("rejects promotion activation when a bundle target is missing or not publishable", async () => {
    await client.exec(`
      UPDATE promotions
      SET configuration = '{"productIds":["${ids.product2}","10000000-0000-4000-8000-000000000099"]}'::jsonb
      WHERE id = '${ids.promotion}'
    `);
    await expect(
      activatePromotion(repository(), context("repo-invalid-promotion-target"), {
        promotionId: ids.promotion,
        expectedVersion: 1,
        expectedUpdatedAt: "2026-08-24T12:00:00.000Z",
      }),
    ).rejects.toThrow(/missing or inactive products/i);
    const state = await client.query<{ status: string; audits: number }>(`
      SELECT status,
        (SELECT count(*)::int FROM admin_audit WHERE correlation_id = 'repo-invalid-promotion-target') AS audits
      FROM promotions WHERE id = '${ids.promotion}'
    `);
    expect(state.rows).toEqual([{ status: "draft", audits: 0 }]);
  });

  it("supersedes the prior current attestation and destination atomically and rolls back on audit failure", async () => {
    const repo = repository();
    await publishAttestationVersion(repo, context("repo-attestation"), {
      policyText: "Research-use policy version two.",
    });
    const attestations = await client.query<{ version: number; current: boolean }>(`
      SELECT version, superseded_at IS NULL AS current FROM attestation_versions ORDER BY version
    `);
    expect(attestations.rows).toEqual([
      { version: 1, current: false },
      { version: 2, current: true },
    ]);

    await client.exec(`
      ALTER TABLE admin_audit
      ADD CONSTRAINT synthetic_destination_audit_failure
      CHECK (action <> 'destination.policy.superseded')
    `);
    await expect(
      supersedeDestinationPolicy(repo, context("repo-destination-fail"), {
        scopeKind: "product",
        targetId: ids.product,
        stateCode: "CA",
        result: "review",
      }),
    ).rejects.toThrow();
    let destinations = await client.query<{ version: number; active: boolean }>(`
      SELECT version, active FROM destination_policies
      WHERE product_id = '${ids.product}' ORDER BY version
    `);
    expect(destinations.rows).toEqual([{ version: 1, active: true }]);

    await client.exec(`ALTER TABLE admin_audit DROP CONSTRAINT synthetic_destination_audit_failure`);
    await supersedeDestinationPolicy(repo, context("repo-destination"), {
      scopeKind: "product",
      targetId: ids.product,
      stateCode: "CA",
      result: "review",
    });
    destinations = await client.query<{ version: number; active: boolean }>(`
      SELECT version, active FROM destination_policies
      WHERE product_id = '${ids.product}' ORDER BY version
    `);
    expect(destinations.rows).toEqual([
      { version: 1, active: false },
      { version: 2, active: true },
    ]);
  });

  it("uses a pending-only compare-and-set review decision with idempotent identical retry", async () => {
    const repo = repository();
    await expect(
      decideReviewRequest(repo, context("repo-review"), {
        reviewRequestId: ids.review,
        outcome: "approved",
      }),
    ).resolves.toMatchObject({ changed: true });
    await expect(
      decideReviewRequest(repo, context("repo-review-retry"), {
        reviewRequestId: ids.review,
        outcome: "approved",
      }),
    ).resolves.toMatchObject({ changed: false });
    await expect(
      decideReviewRequest(repo, context("repo-review-conflict"), {
        reviewRequestId: ids.review,
        outcome: "rejected",
      }),
    ).rejects.toThrow(/already decided/i);
    const counts = await client.query<{ reviews: number; audits: number }>(`
      SELECT
        (SELECT count(*)::int FROM review_requests WHERE outcome = 'approved') AS reviews,
        (SELECT count(*)::int FROM admin_audit WHERE action = 'review.decided') AS audits
    `);
    expect(counts.rows).toEqual([{ reviews: 1, audits: 1 }]);
  });

  it("derives refund provider through verified payment joins, enforces bounds, and keeps retries idempotent", async () => {
    const repo = repository();
    await expect(
      requestRefundIntent(repo, context("repo-refund-too-large"), {
        orderId: ids.order,
        requestedAmountMinor: 5001,
        reasonRedacted: null,
        idempotencyKey: "refund-too-large",
      }),
    ).rejects.toThrow(/remaining balance/i);
    const first = await requestRefundIntent(repo, context("repo-refund"), {
      orderId: ids.order,
      requestedAmountMinor: 2000,
      reasonRedacted: "Synthetic duplicate",
      idempotencyKey: "refund-synthetic-request",
    });
    expect(first).toMatchObject({ provider: "local_test", status: "requested" });
    const retry = await requestRefundIntent(repo, context("repo-refund-retry"), {
      orderId: ids.order,
      requestedAmountMinor: 2000,
      reasonRedacted: "Synthetic duplicate",
      idempotencyKey: "refund-synthetic-request",
    });
    expect(retry.id).toBe(first.id);
    const persisted = await client.query<{
      provider: string;
      verified_payment_event_id: string;
      refunds: number;
      audits: number;
    }>(`
      SELECT
        min(provider) AS provider,
        min(verified_payment_event_id::text) AS verified_payment_event_id,
        count(*)::int AS refunds,
        (SELECT count(*)::int FROM admin_audit WHERE action = 'refund.requested') AS audits
      FROM refunds
    `);
    expect(persisted.rows).toEqual([{
      provider: "local_test",
      verified_payment_event_id: ids.paymentEvent,
      refunds: 1,
      audits: 1,
    }]);
  });

  it("fails closed when the order has multiple or mismatched verified payment authorities", async () => {
    const repo = repository();
    const secondProviderEvent = "10000000-0000-4000-8000-000000000022";
    const secondPaymentEvent = "10000000-0000-4000-8000-000000000023";
    await client.exec(`
      INSERT INTO provider_events
        (id, provider, provider_event_id, payload_hash, status, attempt_count,
         received_at, processed_at, event_type, schema_version,
         normalized_payload, provider_created_at, livemode)
      VALUES
        ('${secondProviderEvent}', 'local_test', 'evt_synthetic_paid_second', '${"e".repeat(64)}',
         'processed', 1, '2026-08-24T10:02:00.000Z', '2026-08-24T10:03:00.000Z',
         'checkout.session.completed', 1,
         '{"providerEventId":"evt_synthetic_paid_second","eventType":"checkout.session.completed","schemaVersion":1,"livemode":false}'::jsonb,
         '2026-08-24T10:02:00.000Z', false);
      INSERT INTO payment_events
        (id, provider_event_id, order_id, event_type, provider_payment_id,
         idempotency_key, amount_minor, currency, occurred_at)
      VALUES
        ('${secondPaymentEvent}', '${secondProviderEvent}', '${ids.order}', 'payment_verified',
         'pay_synthetic_second', 'payment-synthetic-2', 1000, 'USD', '2026-08-24T10:02:00.000Z');
    `);

    await expect(
      requestRefundIntent(repo, context("repo-refund-multiple-payment"), {
        orderId: ids.order,
        requestedAmountMinor: 1000,
        reasonRedacted: null,
        idempotencyKey: "refund-multiple-payment",
      }),
    ).rejects.toThrow(/one exact verified payment/i);
    await client.exec(`
      DELETE FROM payment_events WHERE id = '${secondPaymentEvent}';
      DELETE FROM provider_events WHERE id = '${secondProviderEvent}';
      UPDATE payment_events SET amount_minor = 4000 WHERE id = '${ids.paymentEvent}';
    `);
    await expect(
      requestRefundIntent(repo, context("repo-refund-mismatched-payment"), {
        orderId: ids.order,
        requestedAmountMinor: 1000,
        reasonRedacted: null,
        idempotencyKey: "refund-mismatched-payment",
      }),
    ).rejects.toThrow(/one exact verified payment/i);

    const rows = await client.query<{ refunds: number }>(
      `SELECT count(*)::int AS refunds FROM refunds`,
    );
    expect(rows.rows).toEqual([{ refunds: 0 }]);
  });

  it.each([
    [
      "source provider-event identity drift",
      `ALTER TABLE provider_events
         DROP CONSTRAINT provider_events_normalized_common_coherent;
       UPDATE provider_events
       SET normalized_payload = jsonb_set(
         normalized_payload, '{providerEventId}', '"evt_mismatched_normalized"'
       )
       WHERE id = '${ids.providerEvent}'`,
    ],
    [
      "invalid checkout provider request hash",
      `ALTER TABLE checkout_attempts
         DROP CONSTRAINT checkout_attempts_provider_request_hash;
       ALTER TABLE checkout_attempts
         DROP CONSTRAINT checkout_attempts_provider_coherent;
       UPDATE checkout_attempts SET provider_request_hash = 'invalid'
       WHERE id = '${ids.attempt}'`,
    ],
    [
      "wrong checkout provider request schema version",
      `ALTER TABLE checkout_attempts
         DROP CONSTRAINT checkout_attempts_provider_coherent;
       UPDATE checkout_attempts SET provider_request_schema_version = 2
       WHERE id = '${ids.attempt}'`,
    ],
  ])("rejects refund intent when durable payment provenance has %s", async (_label, mutation) => {
    await client.exec(mutation);
    await expect(
      requestRefundIntent(repository(), context("repo-refund-durable-provenance"), {
        orderId: ids.order,
        requestedAmountMinor: 1000,
        reasonRedacted: null,
        idempotencyKey: "refund-durable-provenance",
      }),
    ).rejects.toThrow(/one exact verified payment/i);
    const rows = await client.query<{ refunds: number; audits: number }>(`
      SELECT count(*)::int AS refunds,
        (SELECT count(*)::int FROM admin_audit
         WHERE action = 'refund.requested') AS audits
      FROM refunds
    `);
    expect(rows.rows).toEqual([{ refunds: 0, audits: 0 }]);
  });

  it("rejects a staff refund intent after physical handoff", async () => {
    const repo = repository();
    await client.exec(`UPDATE orders SET state = 'fulfilled' WHERE id = '${ids.order}'`);
    await expect(
      requestRefundIntent(repo, context("repo-refund-after-handoff"), {
        orderId: ids.order,
        requestedAmountMinor: 1000,
        reasonRedacted: null,
        idempotencyKey: "refund-after-handoff",
      }),
    ).rejects.toThrow(/pre-handoff paid order/i);
    const rows = await client.query<{ refunds: number; audits: number }>(`
      SELECT count(*)::int AS refunds,
        (SELECT count(*)::int FROM admin_audit WHERE action = 'refund.requested') AS audits
      FROM refunds
    `);
    expect(rows.rows).toEqual([{ refunds: 0, audits: 0 }]);
  });

  it("retries the whole refund-intent transaction at most three times without re-consuming the rate limit", async () => {
    let attempts = 0;
    const repo = createPostgresAdminRepository(
      async (work) => {
        attempts += 1;
        if (attempts <= 2) {
          const error = new Error("synthetic serializable retry") as Error & { code: string };
          error.code = attempts === 1 ? "40001" : "40P01";
          throw error;
        }
        return client.transaction(work);
      },
      createPostgresRateLimitStore(client),
    );

    await expect(
      requestRefundIntent(repo, context("repo-refund-retry-policy"), {
        orderId: ids.order,
        requestedAmountMinor: 1000,
        reasonRedacted: null,
        idempotencyKey: "refund-retry-policy",
      }),
    ).resolves.toMatchObject({ status: "requested", changed: true });
    expect(attempts).toBe(3);
    const rows = await client.query<{
      refunds: number;
      audits: number;
      rateCount: number;
    }>(`
      SELECT count(*)::int AS refunds,
        (SELECT count(*)::int FROM admin_audit WHERE action = 'refund.requested') AS audits,
        (SELECT COALESCE(sum(count), 0)::int FROM rate_limit_windows) AS "rateCount"
      FROM refunds
    `);
    expect(rows.rows).toEqual([{ refunds: 1, audits: 1, rateCount: 1 }]);
  });

  it("serializes concurrent refund requests on the order and admits only one outstanding intent", async () => {
    const repo = repository();
    const outcomes = await Promise.allSettled([
      requestRefundIntent(repo, context("repo-refund-concurrent-a"), {
        orderId: ids.order,
        requestedAmountMinor: 3000,
        reasonRedacted: null,
        idempotencyKey: "refund-concurrent-a",
      }),
      requestRefundIntent(repo, context("repo-refund-concurrent-b"), {
        orderId: ids.order,
        requestedAmountMinor: 3000,
        reasonRedacted: null,
        idempotencyKey: "refund-concurrent-b",
      }),
    ]);
    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.status === "rejected")).toHaveLength(1);
    const rows = await client.query<{ refunds: number; audits: number }>(`
      SELECT count(*)::int AS refunds,
        (SELECT count(*)::int FROM admin_audit WHERE action = 'refund.requested') AS audits
      FROM refunds
    `);
    expect(rows.rows).toEqual([{ refunds: 1, audits: 1 }]);
  });

  it("prepares pending shipment metadata without minting or requiring a release", async () => {
    const repo = repository();
    await client.exec(`
      UPDATE fulfillment_releases
      SET state = 'expired', expired_at = '2026-08-25T11:00:00.000Z'
      WHERE id = '${ids.release}'
    `);
    await expect(
      savePendingShipmentMetadata(repo, context("repo-shipment"), {
        orderId: ids.order,
        carrier: "Synthetic carrier",
        trackingReference: "SYN-TRACK-1",
        expectedUpdatedAt: null,
      }),
    ).resolves.toMatchObject({ state: "pending" });
    await expect(
      savePendingShipmentMetadata(repo, context("repo-shipment-update"), {
        orderId: ids.order,
        carrier: "Synthetic carrier",
        trackingReference: "SYN-TRACK-2",
        expectedUpdatedAt: now.toISOString(),
      }),
    ).resolves.toMatchObject({ state: "pending" });
    const shipment = await client.query<{ tracking_reference: string; state: string; fulfillment_release_id: string | null }>(`
      SELECT tracking_reference, state, fulfillment_release_id FROM shipments
    `);
    expect(shipment.rows).toEqual([{
      tracking_reference: "SYN-TRACK-2",
      state: "pending",
      fulfillment_release_id: null,
    }]);

    await client.exec(`UPDATE orders SET state = 'ready_for_fulfillment' WHERE id = '${ids.order}'`);
    await expect(
      savePendingShipmentMetadata(repo, context("repo-shipment-ineligible"), {
        orderId: ids.order,
        carrier: "Synthetic carrier",
        trackingReference: "SYN-TRACK-3",
        expectedUpdatedAt: now.toISOString(),
      }),
    ).rejects.toThrow(/paid pending fulfillment|paid hold/i);
  });

  it("requires persisted active staff:manage before a capability grant can commit", async () => {
    const repo = repository();
    await expect(
      changeStaffCapability(repo, context("repo-staff-denied"), {
        userId: ids.buyer,
        capability: "catalog:publish",
        enabled: true,
      }),
    ).rejects.toThrow(/persisted staff:manage/i);
    await client.exec(`
      INSERT INTO staff_roles
        (user_id, capability, granted_by_user_id, grant_correlation_id)
      VALUES ('${ids.admin}', 'staff:manage', '${ids.admin}', 'operator-bootstrap-test-fixture')
    `);
    await expect(
      changeStaffCapability(repo, context("repo-staff-self-grant"), {
        userId: ids.admin,
        capability: "order:read:any",
        enabled: true,
      }),
    ).rejects.toThrow(/self-targeted/i);
    await expect(
      changeStaffCapability(repo, context("repo-staff-grant"), {
        userId: ids.buyer,
        capability: "catalog:publish",
        enabled: true,
      }),
    ).resolves.toMatchObject({ changed: true });
    const persisted = await client.query<{ roles: number; audits: number }>(`
      SELECT
        (SELECT count(*)::int FROM staff_roles
         WHERE user_id = '${ids.buyer}' AND capability = 'catalog:publish' AND revoked_at IS NULL) AS roles,
        (SELECT count(*)::int FROM admin_audit WHERE action = 'staff.capability.granted') AS audits
    `);
    expect(persisted.rows).toEqual([{ roles: 1, audits: 1 }]);
  });

  it("creates and advances every catalog draft through domain-safe lifecycle commands", async () => {
    const repo = repository();
    const group = await savePolicyGroup(repo, context("lifecycle-group-create"), {
      slug: "new-reference-group",
      name: "New reference group",
    });
    expect(group.active).toBe(false);
    const activeGroup = await setPolicyGroupLifecycle(
      repo,
      context("lifecycle-group-activate"),
      {
        policyGroupId: group.id,
        active: true,
        expectedUpdatedAt: group.updatedAt,
      },
    );

    const product = await saveProductDraft(repo, context("lifecycle-product-create"), {
      slug: "new-reference-standard",
      name: "New reference standard",
      packageForm: "Sealed research unit",
      materialIdentity: "Synthetic task-five reference identity",
      policyGroupId: group.id,
    });
    const price = await supersedeProductPrice(repo, context("lifecycle-price"), {
      productId: product.id,
      amountMinor: 6100,
      currency: "usd",
    });
    expect(price.version).toBe(1);

    const lot = await saveLotDraft(repo, context("lifecycle-lot-create"), {
      productId: product.id,
      supplierName: "Synthetic task-five supplier",
      supplierLotCode: "TASK5-LOT-1",
      analyticalMethod: "HPLC",
      receivedQuantity: 6,
      availableQuantity: 6,
    });
    const releasedLot = await setLotLifecycle(repo, context("lifecycle-lot-release"), {
      lotId: lot.id,
      status: "released",
      expectedUpdatedAt: lot.updatedAt,
    });

    const evidenceHash = "9".repeat(64);
    const coa = await saveCoaDraft(repo, context("lifecycle-coa-create"), {
      lotId: lot.id,
      storageKey: "private/task-five-new-coa.pdf",
      evidenceHash,
    });
    expect(coa).toMatchObject({ active: false, public: false });
    await setCoaLifecycle(repo, context("lifecycle-coa-activate"), {
      coaDocumentId: coa.id,
      active: true,
      expectedStorageKey: "private/task-five-new-coa.pdf",
      expectedEvidenceHash: evidenceHash,
    });
    await publishCoaDocument(
      repo,
      context("lifecycle-coa-publish"),
      { coaDocumentId: coa.id },
      {
        storageVerifier: {
          mode: "test",
          verify: async () => ({ exists: true, sha256: evidenceHash }),
        },
      },
    );

    const claim = await saveAnalyticalClaimDraft(
      repo,
      context("lifecycle-claim-create"),
      {
        productId: product.id,
        lotId: lot.id,
        coaDocumentId: coa.id,
        text: "HPLC analytical record COA",
      },
    );
    const activeClaim = await setAnalyticalClaimLifecycle(
      repo,
      context("lifecycle-claim-activate"),
      {
        claimId: claim.id,
        active: true,
        expectedUpdatedAt: claim.updatedAt,
      },
    );
    await supersedeDestinationPolicy(repo, context("lifecycle-destination"), {
      scopeKind: "product",
      targetId: product.id,
      stateCode: "CA",
      result: "allowed",
    });
    const activatedProduct = await activateProduct(
      repo,
      context("lifecycle-product-activate"),
      { productId: product.id, expectedUpdatedAt: product.updatedAt },
    );
    await retireProduct(repo, context("lifecycle-product-retire"), {
      productId: product.id,
      expectedUpdatedAt: activatedProduct.updatedAt,
    });

    expect(activeGroup).toMatchObject({ active: true });
    expect(releasedLot).toMatchObject({ status: "released" });
    expect(activeClaim).toMatchObject({ active: true });
    const persisted = await client.query<{
      groupActive: boolean;
      productStatus: string;
      priceVersions: number;
      lotStatus: string;
      coaActive: boolean;
      coaPublic: boolean;
      claimActive: boolean;
      audits: number;
    }>(`
      SELECT pg.active AS "groupActive", p.status AS "productStatus",
        (SELECT count(*)::int FROM product_prices WHERE product_id = p.id) AS "priceVersions",
        l.status AS "lotStatus", c.active AS "coaActive", c.public AS "coaPublic",
        ac.active AS "claimActive",
        (SELECT count(*)::int FROM admin_audit WHERE correlation_id LIKE 'lifecycle-%') AS audits
      FROM product_policy_groups pg
      JOIN products p ON p.policy_group_id = pg.id
      JOIN lots l ON l.product_id = p.id
      JOIN coa_documents c ON c.lot_id = l.id
      JOIN analytical_claims ac ON ac.coa_document_id = c.id
      WHERE pg.id = '${group.id}'
    `);
    expect(persisted.rows).toEqual([{
      groupActive: true,
      productStatus: "retired",
      priceVersions: 1,
      lotStatus: "released",
      coaActive: true,
      coaPublic: true,
      claimActive: true,
      audits: 14,
    }]);
  });

  it("persists bounded lot and COA chronology while rejecting impossible or future evidence dates", async () => {
    const repo = repository();
    const manufacturedAt = "2026-07-01T00:00:00.000Z";
    const expiresAt = "2027-07-01T00:00:00.000Z";
    const lot = await saveLotDraft(repo, context("lot-dates-create"), {
      productId: ids.product2,
      supplierName: "Synthetic chronology supplier",
      supplierLotCode: "TASK5-DATED-LOT",
      analyticalMethod: "HPLC",
      receivedQuantity: 2,
      availableQuantity: 2,
      manufacturedAt,
      expiresAt,
    });
    const lotRow = await client.query<{
      manufacturedAt: Date | string | null;
      expiresAt: Date | string | null;
    }>(`
      SELECT manufactured_at AS "manufacturedAt", expires_at AS "expiresAt"
      FROM lots WHERE id = '${lot.id}'
    `);
    expect(new Date(lotRow.rows[0]!.manufacturedAt!).toISOString()).toBe(manufacturedAt);
    expect(new Date(lotRow.rows[0]!.expiresAt!).toISOString()).toBe(expiresAt);

    const issuedAt = "2026-08-20T00:00:00.000Z";
    const coa = await saveCoaDraft(repo, context("coa-issued-create"), {
      lotId: lot.id,
      storageKey: "private/task-five-dated-coa.pdf",
      evidenceHash: "8".repeat(64),
      issuedAt,
    });
    const coaRow = await client.query<{ issuedAt: Date | string | null }>(`
      SELECT issued_at AS "issuedAt" FROM coa_documents WHERE id = '${coa.id}'
    `);
    expect(new Date(coaRow.rows[0]!.issuedAt!).toISOString()).toBe(issuedAt);

    await expect(
      saveLotDraft(repo, context("lot-dates-invalid-order"), {
        lotId: lot.id,
        productId: ids.product2,
        supplierName: "Synthetic chronology supplier",
        supplierLotCode: "TASK5-DATED-LOT",
        analyticalMethod: "HPLC",
        receivedQuantity: 2,
        availableQuantity: 2,
        manufacturedAt: expiresAt,
        expiresAt: manufacturedAt,
        expectedUpdatedAt: lot.updatedAt,
      }),
    ).rejects.toThrow(/expiry.*manufacture/i);
    await expect(
      saveLotDraft(repo, context("lot-dates-future-manufacture"), {
        productId: ids.product2,
        supplierName: "Synthetic future supplier",
        supplierLotCode: "TASK5-FUTURE-LOT",
        receivedQuantity: 1,
        availableQuantity: 1,
        manufacturedAt: "2026-08-26T00:00:00.000Z",
      }),
    ).rejects.toThrow(/manufactured.*future/i);
    await expect(
      saveCoaDraft(repo, context("coa-issued-future"), {
        lotId: lot.id,
        storageKey: "private/task-five-future-coa.pdf",
        evidenceHash: "7".repeat(64),
        issuedAt: "2026-08-26T00:00:00.000Z",
      }),
    ).rejects.toThrow(/issued.*future/i);
  });

  it("keeps retired products and promotions terminal without appending a false reactivation audit", async () => {
    const repo = repository();
    const activeProduct = await activateProduct(repo, context("terminal-product-activate"), {
      productId: ids.product,
      expectedUpdatedAt: "2026-08-24T12:00:00.000Z",
    });
    const retiredProduct = await retireProduct(repo, context("terminal-product-retire"), {
      productId: ids.product,
      expectedUpdatedAt: activeProduct.updatedAt,
    });
    await expect(
      activateProduct(repo, context("terminal-product-reactivate"), {
        productId: ids.product,
        expectedUpdatedAt: retiredProduct.updatedAt,
      }),
    ).rejects.toThrow(/lifecycle|retired|stale/i);

    await client.exec(`
      UPDATE promotions SET status = 'retired'
      WHERE id = '${ids.promotion}';
    `);
    await expect(
      activatePromotion(repo, context("terminal-promotion-reactivate"), {
        promotionId: ids.promotion,
        expectedVersion: 1,
        expectedUpdatedAt: "2026-08-24T12:00:00.000Z",
      }),
    ).rejects.toThrow(/lifecycle|retired|stale/i);
    await expect(
      retirePromotion(repo, context("terminal-promotion-retire-again"), {
        promotionId: ids.promotion,
        expectedVersion: 1,
        expectedUpdatedAt: "2026-08-24T12:00:00.000Z",
      }),
    ).rejects.toThrow(/lifecycle|retired|stale/i);

    const state = await client.query<{
      productStatus: string;
      promotionStatus: string;
      activationAudits: number;
    }>(`
      SELECT
        (SELECT status::text FROM products WHERE id = '${ids.product}') AS "productStatus",
        (SELECT status::text FROM promotions WHERE id = '${ids.promotion}') AS "promotionStatus",
        (SELECT count(*)::int FROM admin_audit
         WHERE action IN ('catalog.product.activated', 'promotion.activated')) AS "activationAudits"
    `);
    expect(state.rows).toEqual([{
      productStatus: "retired",
      promotionStatus: "retired",
      activationAudits: 1,
    }]);
  });

  it("rejects stale draft metadata and rolls back its audit", async () => {
    const repo = repository();
    await expect(
      saveProductDraft(repo, context("lifecycle-stale-product"), {
        productId: ids.product,
        slug: "synthetic-product",
        name: "Reference standard A revised",
        packageForm: "Sealed unit",
        materialIdentity: "Synthetic reference identity A",
        policyGroupId: ids.group,
        expectedUpdatedAt: "2026-08-23T12:00:00.000Z",
      }),
    ).rejects.toThrow(/stale product draft/i);
    const persisted = await client.query<{ name: string; audits: number }>(`
      SELECT name,
        (SELECT count(*)::int FROM admin_audit
         WHERE correlation_id = 'lifecycle-stale-product') AS audits
      FROM products WHERE id = '${ids.product}'
    `);
    expect(persisted.rows).toEqual([{ name: "Reference standard A", audits: 0 }]);
  });

  it("rejects non-USD V1 prices before creating an ambiguous current price", async () => {
    await expect(
      supersedeProductPrice(repository(), context("price-non-usd"), {
        productId: ids.product,
        amountMinor: 4500,
        currency: "EUR",
      }),
    ).rejects.toThrow(/USD/i);
    const persisted = await client.query<{ currentPrices: number; audits: number }>(`
      SELECT count(*)::int AS "currentPrices",
        (SELECT count(*)::int FROM admin_audit
         WHERE correlation_id = 'price-non-usd') AS audits
      FROM product_prices
      WHERE product_id = '${ids.product}' AND superseded_at IS NULL
    `);
    expect(persisted.rows).toEqual([{ currentPrices: 1, audits: 0 }]);
  });

  it("rejects unsafe lot copy before release and terminal-to-released transitions", async () => {
    const repo = repository();
    const unsafe = await saveLotDraft(repo, context("lot-unsafe-draft"), {
      productId: ids.product,
      supplierName: "Synthetic task-five supplier",
      supplierLotCode: "Guaranteed treatment",
      analyticalMethod: "HPLC",
      receivedQuantity: 2,
      availableQuantity: 2,
    });
    await expect(
      setLotLifecycle(repo, context("lot-unsafe-release"), {
        lotId: unsafe.id,
        status: "released",
        expectedUpdatedAt: unsafe.updatedAt,
      }),
    ).rejects.toThrow(/content policy/i);
    await client.exec(`
      UPDATE lots SET status = 'recalled'
      WHERE id = '${unsafe.id}'
    `);
    await expect(
      setLotLifecycle(repo, context("lot-recalled-release"), {
        lotId: unsafe.id,
        status: "released",
        expectedUpdatedAt: unsafe.updatedAt,
      }),
    ).rejects.toThrow(/not permitted/i);
    const persisted = await client.query<{ status: string; releaseAudits: number }>(`
      SELECT status,
        (SELECT count(*)::int FROM admin_audit
         WHERE correlation_id IN ('lot-unsafe-release', 'lot-recalled-release')) AS "releaseAudits"
      FROM lots WHERE id = '${unsafe.id}'
    `);
    expect(persisted.rows).toEqual([{ status: "recalled", releaseAudits: 0 }]);
  });

  it("persists an incomplete promotion draft while activation remains fail closed", async () => {
    const repo = repository();
    const draft = await savePromotionDraft(repo, context("promotion-incomplete-draft"), {
      code: "task5-incomplete",
      name: "Task five incomplete promotion",
      kind: "discount",
      amountMinor: null,
      basisPoints: null,
      currency: null,
      configuration: {},
      targets: [],
    });
    await expect(
      activatePromotion(repo, context("promotion-incomplete-activate"), {
        promotionId: draft.id,
        expectedVersion: draft.version,
        expectedUpdatedAt: draft.updatedAt,
      }),
    ).rejects.toThrow(/canonical shape/i);
    const persisted = await client.query<{ status: string; audits: number }>(`
      SELECT status,
        (SELECT count(*)::int FROM admin_audit
         WHERE correlation_id = 'promotion-incomplete-draft') AS audits
      FROM promotions WHERE id = '${draft.id}'
    `);
    expect(persisted.rows).toEqual([{ status: "draft", audits: 1 }]);
  });

  it("keeps a canonical but untargeted promotion inactive", async () => {
    const repo = repository();
    const draft = await savePromotionDraft(repo, context("promotion-untargeted-draft"), {
      code: "task5-untargeted",
      name: "Task five untargeted promotion",
      kind: "discount",
      amountMinor: null,
      basisPoints: 500,
      currency: null,
      configuration: {},
      targets: [],
    });
    await expect(
      activatePromotion(repo, context("promotion-untargeted-activate"), {
        promotionId: draft.id,
        expectedVersion: draft.version,
        expectedUpdatedAt: draft.updatedAt,
      }),
    ).rejects.toThrow(/missing or inactive products/i);
    const persisted = await client.query<{ status: string; activationAudits: number }>(`
      SELECT status,
        (SELECT count(*)::int FROM admin_audit
         WHERE correlation_id = 'promotion-untargeted-activate') AS "activationAudits"
      FROM promotions WHERE id = '${draft.id}'
    `);
    expect(persisted.rows).toEqual([{ status: "draft", activationAudits: 0 }]);
  });

  it("creates, targets, activates, and retires a canonical promotion", async () => {
    const repo = repository();
    await activateProduct(repo, context("promotion-prerequisite-product"), {
      productId: ids.product,
      expectedUpdatedAt: "2026-08-24T12:00:00.000Z",
    });
    const promotion = await savePromotionDraft(
      repo,
      context("promotion-lifecycle-create"),
      {
        code: "task5-bundle",
        name: "Task five reference bundle",
        kind: "bundle",
        amountMinor: 8200,
        basisPoints: null,
        currency: "USD",
        configuration: { productIds: [ids.product, ids.product2] },
        startsAt: "2026-08-25T12:00:00.000Z",
        endsAt: "2026-09-25T12:00:00.000Z",
        targets: [
          { targetKind: "product", targetId: ids.product },
          { targetKind: "policy_group", targetId: ids.group },
        ],
      },
    );
    const activated = await activatePromotion(
      repo,
      context("promotion-lifecycle-activate"),
      {
        promotionId: promotion.id,
        expectedVersion: promotion.version,
        expectedUpdatedAt: promotion.updatedAt,
      },
    );
    await retirePromotion(repo, context("promotion-lifecycle-retire"), {
      promotionId: promotion.id,
      expectedVersion: promotion.version,
      expectedUpdatedAt: activated.updatedAt,
    });

    const persisted = await client.query<{
      status: string;
      targetKinds: string[];
      targetIds: string[];
      startsAt: Date | string;
      endsAt: Date | string;
      audits: number;
    }>(`
      SELECT p.status,
        array_agg(pt.target_kind::text ORDER BY pt.target_kind) AS "targetKinds",
        array_agg(COALESCE(pt.product_id, pt.policy_group_id)::text ORDER BY pt.target_kind) AS "targetIds",
        p.starts_at AS "startsAt", p.ends_at AS "endsAt",
        (SELECT count(*)::int FROM admin_audit
         WHERE correlation_id LIKE 'promotion-lifecycle-%') AS audits
      FROM promotions p
      JOIN promotion_targets pt ON pt.promotion_id = p.id
      WHERE p.id = '${promotion.id}'
      GROUP BY p.id
    `);
    expect(persisted.rows).toHaveLength(1);
    expect(persisted.rows[0]).toMatchObject({
      status: "retired",
      targetKinds: ["product", "policy_group"],
      targetIds: [ids.product, ids.group],
      audits: 3,
    });
    expect(new Date(persisted.rows[0]!.startsAt).toISOString()).toBe(
      "2026-08-25T12:00:00.000Z",
    );
    expect(new Date(persisted.rows[0]!.endsAt).toISOString()).toBe(
      "2026-09-25T12:00:00.000Z",
    );
  });

  it("treats canonical promotion terms as versioned semantic values", async () => {
    const repo = repository();
    await client.exec(`
      UPDATE promotions
      SET configuration = '{"metadata":{"z":2,"a":1},"productIds":["${ids.product}","${ids.product2}"]}'::jsonb
      WHERE id = '${ids.promotion}'
    `);
    const unchanged = await savePromotionDraft(repo, context("promotion-noop"), {
      promotionId: ids.promotion,
      expectedVersion: 1,
      expectedUpdatedAt: "2026-08-24T12:00:00.000Z",
      code: " syn-bundle ",
      name: "Reference bundle",
      kind: "bundle",
      amountMinor: 8000,
      basisPoints: null,
      currency: "usd",
      configuration: {
        productIds: [ids.product, ids.product2],
        metadata: { a: 1, z: 2 },
      },
      targets: [{ targetKind: "product", targetId: ids.product }],
    });
    expect(unchanged).toEqual({
      id: ids.promotion,
      version: 1,
      updatedAt: "2026-08-24T12:00:00.000Z",
      changed: false,
    });

    const targetChange = await savePromotionDraft(repo, context("promotion-target-change"), {
      promotionId: ids.promotion,
      expectedVersion: 1,
      expectedUpdatedAt: unchanged.updatedAt,
      code: "SYN-BUNDLE",
      name: "Reference bundle",
      kind: "bundle",
      amountMinor: 8000,
      basisPoints: null,
      currency: "USD",
      configuration: {
        metadata: { a: 1, z: 2 },
        productIds: [ids.product, ids.product2],
      },
      targets: [
        { targetKind: "policy_group", targetId: ids.group },
        { targetKind: "product", targetId: ids.product },
      ],
    });
    expect(targetChange).toMatchObject({ version: 2, changed: true });

    const targetOrderNoop = await savePromotionDraft(
      repo,
      context("promotion-target-order-noop"),
      {
        promotionId: ids.promotion,
        expectedVersion: 2,
        expectedUpdatedAt: targetChange.updatedAt,
        code: "SYN-BUNDLE",
        name: "Reference bundle",
        kind: "bundle",
        amountMinor: 8000,
        basisPoints: null,
        currency: "USD",
        configuration: {
          productIds: [ids.product, ids.product2],
          metadata: { z: 2, a: 1 },
        },
        targets: [
          { targetKind: "product", targetId: ids.product },
          { targetKind: "policy_group", targetId: ids.group },
        ],
      },
    );
    expect(targetOrderNoop).toMatchObject({ version: 2, changed: false });

    const termChange = await savePromotionDraft(repo, context("promotion-term-change"), {
      promotionId: ids.promotion,
      expectedVersion: 2,
      expectedUpdatedAt: targetChange.updatedAt,
      code: "SYN-BUNDLE",
      name: "Reference bundle",
      kind: "bundle",
      amountMinor: 8000,
      basisPoints: null,
      currency: "USD",
      configuration: {
        metadata: { a: 1, z: 2 },
        productIds: [ids.product2, ids.product],
      },
      targets: [
        { targetKind: "product", targetId: ids.product },
        { targetKind: "policy_group", targetId: ids.group },
      ],
    });
    expect(termChange).toMatchObject({ version: 3, changed: true });

    const persisted = await client.query<{ version: number; name: string; audits: number; noopAudits: number }>(`
      SELECT version, name,
        (SELECT count(*)::int FROM admin_audit
         WHERE correlation_id IN ('promotion-target-change', 'promotion-term-change')) AS audits,
        (SELECT count(*)::int FROM admin_audit
         WHERE correlation_id IN ('promotion-noop', 'promotion-target-order-noop')) AS "noopAudits"
      FROM promotions WHERE id = '${ids.promotion}'
    `);
    expect(persisted.rows).toEqual([{
      version: 3,
      name: "Reference bundle",
      audits: 2,
      noopAudits: 0,
    }]);
  });

  it("does not bump terms version for lifecycle changes and rejects active edits without target loss", async () => {
    const repo = repository();
    await activateProduct(repo, context("promotion-version-product"), {
      productId: ids.product,
      expectedUpdatedAt: "2026-08-24T12:00:00.000Z",
    });
    const activated = await activatePromotion(repo, context("promotion-version-activate"), {
      promotionId: ids.promotion,
      expectedVersion: 1,
      expectedUpdatedAt: "2026-08-24T12:00:00.000Z",
    });
    expect(activated.version).toBe(1);

    await expect(
      savePromotionDraft(repo, context("promotion-active-edit"), {
        promotionId: ids.promotion,
        expectedVersion: 1,
        expectedUpdatedAt: activated.updatedAt,
        code: "SYN-BUNDLE",
        name: "Forbidden active edit",
        kind: "bundle",
        amountMinor: 8000,
        basisPoints: null,
        currency: "USD",
        configuration: { productIds: [ids.product, ids.product2] },
        targets: [],
      }),
    ).rejects.toThrow(/draft|active/i);

    const retired = await retirePromotion(repo, context("promotion-version-retire"), {
      promotionId: ids.promotion,
      expectedVersion: 1,
      expectedUpdatedAt: activated.updatedAt,
    });
    expect(retired.version).toBe(1);
    const persisted = await client.query<{ version: number; targets: number }>(`
      SELECT p.version,
        (SELECT count(*)::int FROM promotion_targets pt WHERE pt.promotion_id = p.id) AS targets
      FROM promotions p WHERE p.id = '${ids.promotion}'
    `);
    expect(persisted.rows).toEqual([{ version: 1, targets: 1 }]);
  });
});
