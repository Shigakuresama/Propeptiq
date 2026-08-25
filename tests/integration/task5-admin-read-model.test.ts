import type { PGlite } from "@electric-sql/pglite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { AdminReadResource } from "@/admin/admin-read";
import type { VerifiedIdentity } from "@/auth/identity";
import {
  createPostgresAdminReadRepository,
  type AdminReadSqlClient,
  type AdminReadTransactionOptions,
} from "@/db/repositories/admin-read-repository";

import { createMigratedPglite } from "./helpers/pglite";

const ids = {
  admin: "30000000-0000-4000-8000-000000000001",
  limited: "30000000-0000-4000-8000-000000000002",
  buyer: "30000000-0000-4000-8000-000000000003",
  group: "30000000-0000-4000-8000-000000000004",
  product: "30000000-0000-4000-8000-000000000005",
  price: "30000000-0000-4000-8000-000000000006",
  lot: "30000000-0000-4000-8000-000000000007",
  coa: "30000000-0000-4000-8000-000000000008",
  claim: "30000000-0000-4000-8000-000000000009",
  attestation: "30000000-0000-4000-8000-000000000010",
  acceptance: "30000000-0000-4000-8000-000000000011",
  destination: "30000000-0000-4000-8000-000000000012",
  promotion: "30000000-0000-4000-8000-000000000013",
  promotionTarget: "30000000-0000-4000-8000-000000000014",
  order: "30000000-0000-4000-8000-000000000015",
  review: "30000000-0000-4000-8000-000000000016",
  providerEvent: "30000000-0000-4000-8000-000000000017",
  paymentEvent: "30000000-0000-4000-8000-000000000018",
  refund: "30000000-0000-4000-8000-000000000019",
  release: "30000000-0000-4000-8000-000000000020",
  shipment: "30000000-0000-4000-8000-000000000021",
  audit: "30000000-0000-4000-8000-000000000022",
} as const;

const resources: readonly AdminReadResource[] = [
  "products",
  "prices",
  "policy-groups",
  "lots",
  "coas",
  "analytical-claims",
  "attestations",
  "destination-rules",
  "promotions",
  "buyers",
  "review-requests",
  "orders",
  "refunds",
  "shipments",
  "staff",
  "audit",
];

describe("Task 5 production admin read model", () => {
  let database: PGlite;
  let statements: string[];
  let transactionOptions: AdminReadTransactionOptions[];

  beforeEach(async () => {
    database = await createMigratedPglite();
    statements = [];
    transactionOptions = [];
    await database.exec(`
      INSERT INTO users (id, clerk_id, email_verified_at, created_at, updated_at)
      VALUES
        ('${ids.admin}', 'clerk-admin-read', '2026-08-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z', '2026-08-25T00:00:00.000Z'),
        ('${ids.limited}', 'clerk-limited-read', '2026-08-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z', '2026-08-25T00:00:00.000Z'),
        ('${ids.buyer}', 'clerk-buyer-read', '2026-08-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z', '2026-08-25T00:00:00.000Z');

      INSERT INTO staff_roles
        (user_id, capability, granted_by_user_id, grant_correlation_id, granted_at)
      VALUES
        ('${ids.admin}', 'catalog:publish', '${ids.admin}', 'grant-catalog', '2026-08-01T00:00:00.000Z'),
        ('${ids.admin}', 'destination:manage', '${ids.admin}', 'grant-destination', '2026-08-01T00:00:00.000Z'),
        ('${ids.admin}', 'promotion:manage', '${ids.admin}', 'grant-promotion', '2026-08-01T00:00:00.000Z'),
        ('${ids.admin}', 'review:decide', '${ids.admin}', 'grant-review', '2026-08-01T00:00:00.000Z'),
        ('${ids.admin}', 'order:read:any', '${ids.admin}', 'grant-order', '2026-08-01T00:00:00.000Z'),
        ('${ids.admin}', 'refund:request', '${ids.admin}', 'grant-refund', '2026-08-01T00:00:00.000Z'),
        ('${ids.admin}', 'fulfillment:release:consume', '${ids.admin}', 'grant-shipment', '2026-08-01T00:00:00.000Z'),
        ('${ids.admin}', 'staff:manage', '${ids.admin}', 'grant-staff', '2026-08-01T00:00:00.000Z'),
        ('${ids.limited}', 'promotion:manage', '${ids.admin}', 'grant-limited', '2026-08-01T00:00:00.000Z');

      INSERT INTO buyer_profiles
        (user_id, status, age_confirmed_at, research_purpose, organization_name, created_at, updated_at)
      VALUES
        ('${ids.buyer}', 'review', '2026-08-01T00:00:00.000Z', 'analytical', 'Synthetic research lab', '2026-08-01T00:00:00.000Z', '2026-08-25T01:00:00.000Z');

      INSERT INTO attestation_versions
        (id, version, content_hash, policy_text, effective_at, created_at)
      VALUES
        ('${ids.attestation}', 1, '${"a".repeat(64)}', 'Research use only. Not for human or veterinary use.', '2026-08-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z');
      INSERT INTO attestation_acceptances
        (id, user_id, attestation_version_id, accepted_at)
      VALUES
        ('${ids.acceptance}', '${ids.buyer}', '${ids.attestation}', '2026-08-02T00:00:00.000Z');

      INSERT INTO product_policy_groups (id, slug, name, active, created_at, updated_at)
      VALUES ('${ids.group}', 'synthetic-group', 'Synthetic policy group', true, '2026-08-01T00:00:00.000Z', '2026-08-25T02:00:00.000Z');
      INSERT INTO products
        (id, slug, name, package_form, material_identity, policy_group_id, status, created_at, updated_at)
      VALUES
        ('${ids.product}', 'synthetic-product', 'Synthetic reference standard', 'Sealed unit', 'Synthetic material identity', '${ids.group}', 'active', '2026-08-01T00:00:00.000Z', '2026-08-25T03:00:00.000Z');
      INSERT INTO product_prices
        (id, product_id, version, amount_minor, currency, effective_at, created_at)
      VALUES
        ('${ids.price}', '${ids.product}', 1, 7500, 'USD', '2026-08-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z');
      INSERT INTO lots
        (id, product_id, supplier_name, supplier_lot_code, analytical_method,
         received_quantity, available_quantity, status, manufactured_at, expires_at,
         created_at, updated_at)
      VALUES
        ('${ids.lot}', '${ids.product}', 'Synthetic supplier', 'SYN-LOT-READ', 'HPLC',
         20, 12, 'released', '2026-01-01T00:00:00.000Z', '2027-01-01T00:00:00.000Z',
         '2026-08-01T00:00:00.000Z', '2026-08-25T04:00:00.000Z');
      INSERT INTO coa_documents
        (id, lot_id, evidence_hash, storage_key, public, active, issued_at, created_at)
      VALUES
        ('${ids.coa}', '${ids.lot}', '${"b".repeat(64)}', 'private/NEVER-EXPOSE-COA-KEY.pdf', true, true,
         '2026-08-03T00:00:00.000Z', '2026-08-03T00:00:00.000Z');
      INSERT INTO analytical_claims
        (id, product_id, lot_id, coa_document_id, text, active, created_at, updated_at)
      VALUES
        ('${ids.claim}', '${ids.product}', '${ids.lot}', '${ids.coa}', 'HPLC analytical record is available.', true,
         '2026-08-03T00:00:00.000Z', '2026-08-25T05:00:00.000Z');
      INSERT INTO destination_policies
        (id, scope_kind, product_id, policy_group_id, state_code, result, version,
         active, effective_at, created_at)
      VALUES
        ('${ids.destination}', 'product', '${ids.product}', NULL, 'CA', 'allowed', 1,
         true, '2026-08-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z');
      INSERT INTO promotions
        (id, code, name, kind, status, amount_minor, basis_points, currency,
         configuration, starts_at, ends_at, created_at, updated_at)
      VALUES
        ('${ids.promotion}', 'READ-BUNDLE', 'Read boundary bundle', 'bundle', 'draft', 10000, NULL, 'USD',
         '{"productIds":["${ids.product}","30000000-0000-4000-8000-000000000099"]}'::jsonb,
         '2026-08-20T00:00:00.000Z', '2026-09-20T00:00:00.000Z',
         '2026-08-20T00:00:00.000Z', '2026-08-25T06:00:00.000Z');
      INSERT INTO promotion_targets (id, promotion_id, target_kind, product_id)
      VALUES ('${ids.promotionTarget}', '${ids.promotion}', 'product', '${ids.product}');

      INSERT INTO orders
        (id, buyer_user_id, buyer_status_snapshot, attestation_acceptance_id,
         destination_state_code, currency, subtotal_minor, discount_minor, tax_minor,
         shipping_minor, total_minor, state, created_at, updated_at)
      VALUES
        ('${ids.order}', '${ids.buyer}', 'active', '${ids.acceptance}', 'CA', 'USD',
         7500, 500, 0, 0, 7000, 'paid_pending_clearance',
         '2026-08-24T00:00:00.000Z', '2026-08-25T07:00:00.000Z');
      INSERT INTO order_items
        (order_id, product_id, product_price_id, destination_policy_id,
         product_name_snapshot, package_form_snapshot, currency, unit_amount_minor,
         quantity, subtotal_minor, discount_minor, total_minor, created_at)
      VALUES
        ('${ids.order}', '${ids.product}', '${ids.price}', '${ids.destination}',
         'Synthetic reference standard', 'Sealed unit', 'USD', 7500, 1, 7500, 500, 7000,
         '2026-08-24T00:00:00.000Z');
      INSERT INTO review_requests
        (id, user_id, order_id, snapshot_hash, buyer_status_snapshot,
         attestation_version_id, destination_state_code, cart_snapshot,
         buyer_review_required, destination_review_required, created_at)
      VALUES
        ('${ids.review}', '${ids.buyer}', '${ids.order}', '${"c".repeat(64)}', 'review',
         '${ids.attestation}', 'CA',
         '{"shippingAddress":"PRIVATE FULL ADDRESS SENTINEL","providerToken":"NEVER-EXPOSE-TOKEN"}'::jsonb,
         true, false, '2026-08-24T01:00:00.000Z');
      INSERT INTO provider_events
        (id, provider, provider_event_id, payload_hash, status, attempt_count,
         received_at, processed_at)
      VALUES
        ('${ids.providerEvent}', 'synthetic-provider', 'NEVER-EXPOSE-PROVIDER-EVENT-ID', '${"d".repeat(64)}',
         'processed', 1, '2026-08-24T02:00:00.000Z', '2026-08-24T02:01:00.000Z');
      INSERT INTO payment_events
        (id, provider_event_id, order_id, event_type, provider_payment_id,
         idempotency_key, amount_minor, currency, occurred_at, created_at)
      VALUES
        ('${ids.paymentEvent}', '${ids.providerEvent}', '${ids.order}', 'payment_verified',
         'NEVER-EXPOSE-PROVIDER-PAYMENT-ID', 'NEVER-EXPOSE-PAYMENT-IDEMPOTENCY',
         7000, 'USD', '2026-08-24T02:00:00.000Z', '2026-08-24T02:00:00.000Z');
      INSERT INTO refunds
        (id, order_id, requested_by_user_id, verified_payment_event_id, provider,
         idempotency_key, requested_amount_minor, currency, status, reason_redacted, requested_at)
      VALUES
        ('${ids.refund}', '${ids.order}', '${ids.admin}', '${ids.paymentEvent}', 'synthetic-provider',
         'NEVER-EXPOSE-REFUND-IDEMPOTENCY', 1000, 'USD', 'requested', 'Duplicate synthetic request',
         '2026-08-25T08:00:00.000Z');
      INSERT INTO fulfillment_releases
        (id, order_id, version, idempotency_key, payment_event_id, state, issued_at, expires_at)
      VALUES
        ('${ids.release}', '${ids.order}', 1, 'NEVER-EXPOSE-RELEASE-IDEMPOTENCY', '${ids.paymentEvent}',
         'issued', '2026-08-25T09:00:00.000Z', '2026-08-26T09:00:00.000Z');
      INSERT INTO shipments
        (id, order_id, fulfillment_release_id, carrier, tracking_reference, state,
         created_at, updated_at)
      VALUES
        ('${ids.shipment}', '${ids.order}', '${ids.release}', 'Synthetic carrier', 'SYN-TRACK-READ',
         'pending', '2026-08-25T09:10:00.000Z', '2026-08-25T09:10:00.000Z');
      INSERT INTO admin_audit
        (id, actor_user_id, action, resource_type, resource_id, correlation_id, metadata, occurred_at)
      VALUES
        ('${ids.audit}', '${ids.admin}', 'synthetic.read.fixture', 'product', '${ids.product}',
         'read-fixture-correlation',
         '{"secret":"NEVER-EXPOSE-AUDIT-METADATA","safe":true}'::jsonb,
         '2026-08-25T10:00:00.000Z');
    `);
  });

  afterEach(async () => {
    await database.close();
  });

  function repository() {
    return createPostgresAdminReadRepository(async (work, options) => {
      transactionOptions.push(options);
      return database.transaction(async (transaction) => {
        const client: AdminReadSqlClient = {
          async query<T extends object>(sql: string, params: readonly unknown[] = []) {
            statements.push(sql);
            const result = await transaction.query<T>(sql, [...params]);
            return { rows: result.rows };
          },
        };
        return work(client);
      });
    });
  }

  const actorIdentity: VerifiedIdentity = {
      clerkUserId: "clerk-admin-read",
      primaryEmail: "admin-read@example.test",
      emailVerifiedAt: "2026-08-25T00:00:00.000Z",
      mfaConfigured: true,
      secondFactorCompleted: true,
  };
  const actor = {
    userId: ids.admin,
    identity: actorIdentity,
    now: new Date("2026-08-25T12:00:00.000Z"),
  } as const;

  it("returns a bounded, discriminated product snapshot from one read-only serializable transaction", async () => {
    const snapshot = await repository().readSnapshot({ ...actor, resource: "products" });

    expect(snapshot).toMatchObject({
      resource: "products",
      limit: 100,
      truncated: false,
      items: [
        {
          id: ids.product,
          slug: "synthetic-product",
          name: "Synthetic reference standard",
          packageForm: "Sealed unit",
          materialIdentity: "Synthetic material identity",
          policyGroupId: ids.group,
          policyGroupName: "Synthetic policy group",
          status: "active",
          updatedAt: "2026-08-25T03:00:00.000Z",
        },
      ],
    });
    expect(Object.keys(snapshot).sort()).toEqual(["items", "limit", "resource", "truncated"]);
    expect(transactionOptions).toEqual([{ isolationLevel: "serializable", readOnly: true }]);
    expect(statements).toHaveLength(3);
    expect(statements[0]).toMatch(/SET TRANSACTION READ ONLY/);
    expect(statements[1]).toMatch(/staff_roles/);
    expect(statements[2]).toMatch(/FROM products/);
    expect(statements[2]).not.toMatch(/FROM refunds|FROM shipments|FROM admin_audit/);
  });

  it("rechecks UUID, Clerk identity, exact active capability, and blocked status before any resource query", async () => {
    const readProducts = (userId: string, clerkUserId: string) =>
      repository().readSnapshot({
        userId,
        identity: { ...actorIdentity, clerkUserId },
        now: actor.now,
        resource: "products",
      });

    await expect(readProducts(ids.admin, "wrong-clerk-id")).rejects.toThrow(/persisted catalog:publish capability/i);
    await expect(readProducts(ids.limited, "clerk-limited-read")).rejects.toThrow(/persisted catalog:publish capability/i);
    await database.exec(`
      UPDATE staff_roles SET revoked_at = '2026-08-25T11:00:00.000Z',
        revoked_by_user_id = '${ids.admin}', revoke_correlation_id = 'revoke-read-test'
      WHERE user_id = '${ids.admin}' AND capability = 'catalog:publish'
    `);
    await expect(readProducts(ids.admin, "clerk-admin-read")).rejects.toThrow(/persisted catalog:publish capability/i);
    await database.exec(`
      UPDATE staff_roles SET revoked_at = NULL, revoked_by_user_id = NULL, revoke_correlation_id = NULL
      WHERE user_id = '${ids.admin}' AND capability = 'catalog:publish';
      INSERT INTO buyer_profiles (user_id, status, created_at, updated_at)
      VALUES ('${ids.admin}', 'blocked', '2026-08-25T11:00:00.000Z', '2026-08-25T11:00:00.000Z')
    `);
    await expect(readProducts(ids.admin, "clerk-admin-read")).rejects.toThrow(/persisted catalog:publish capability/i);

    const deniedStatements = statements.filter((sql) => /FROM products/.test(sql));
    expect(deniedStatements).toHaveLength(0);
  });

  it("requires a current verified email and completed configured MFA before opening an admin read", async () => {
    const readWithIdentity = (identity: VerifiedIdentity, now = actor.now) =>
      repository().readSnapshot({ ...actor, identity, now, resource: "products" });

    await expect(readWithIdentity(actor.identity)).resolves.toMatchObject({ resource: "products" });
    statements = [];
    await expect(
      readWithIdentity({ ...actor.identity, emailVerifiedAt: null }),
    ).rejects.toThrow(/verified staff identity and MFA/i);
    await expect(
      readWithIdentity({ ...actor.identity, emailVerifiedAt: "2026-08-26T00:00:00.000Z" }),
    ).rejects.toThrow(/verified staff identity and MFA/i);
    await expect(
      readWithIdentity({ ...actor.identity, mfaConfigured: false }),
    ).rejects.toThrow(/verified staff identity and MFA/i);
    await expect(
      readWithIdentity({ ...actor.identity, secondFactorCompleted: false }),
    ).rejects.toThrow(/verified staff identity and MFA/i);
    expect(statements.filter((sql) => /FROM products/.test(sql))).toHaveLength(0);
  });

  it("supports every Task 5 resource without returning unrelated snapshot sections", async () => {
    for (const resource of resources) {
      const snapshot = await repository().readSnapshot({ ...actor, resource });
      expect(snapshot.resource).toBe(resource);
      expect(Object.keys(snapshot).sort()).toEqual(["items", "limit", "resource", "truncated"]);
      expect(Array.isArray(snapshot.items)).toBe(true);
    }
  });

  it("projects representative operational facts without private storage, cart, payment, idempotency, or audit payloads", async () => {
    const snapshots = await Promise.all(
      (["coas", "review-requests", "orders", "refunds", "shipments", "audit"] as const).map(
        (resource) => repository().readSnapshot({ ...actor, resource }),
      ),
    );
    const serialized = JSON.stringify(snapshots);

    expect(serialized).not.toContain("NEVER-EXPOSE");
    expect(serialized).not.toContain("shippingAddress");
    expect(serialized).not.toContain("storageKey");
    expect(snapshots[0]).toMatchObject({
      resource: "coas",
      items: [{
        id: ids.coa,
        lotId: ids.lot,
        productId: ids.product,
        evidenceHash: "b".repeat(64),
        public: true,
        active: true,
      }],
    });
    expect(snapshots[1]).toMatchObject({
      resource: "review-requests",
      items: [{ id: ids.review, orderId: ids.order, outcome: null }],
    });
    expect(snapshots[2]).toMatchObject({
      resource: "orders",
      items: [{
        id: ids.order,
        totalMinor: 7000,
        itemCount: 1,
        verifiedPaymentEventCount: 1,
        currentReleaseState: "issued",
        providerExecutionBoundary: "task6_managed",
      }],
    });
    expect(snapshots[3]).toMatchObject({
      resource: "refunds",
      items: [{
        id: ids.refund,
        requestedAmountMinor: 1000,
        status: "requested",
        providerRefundRecorded: false,
        providerExecutionBoundary: "task6_managed",
      }],
    });
    expect(snapshots[4]).toMatchObject({
      resource: "shipments",
      items: [{
        id: ids.shipment,
        releaseState: "issued",
        releaseVersion: 1,
        handoffConfirmationBoundary: "task6_managed",
      }],
    });
    expect(snapshots[5]).toMatchObject({
      resource: "audit",
      items: [{
        id: ids.audit,
        action: "synthetic.read.fixture",
        correlationId: "read-fixture-correlation",
      }],
    });
  });

  it("uses stable newest-first ordering and reports truncation after 100 rows", async () => {
    for (let index = 0; index < 105; index += 1) {
      const suffix = String(1000 + index).padStart(12, "0");
      const timestamp = new Date(Date.UTC(2026, 7, 26, 0, 0, index)).toISOString();
      await database.query(
        `
          INSERT INTO products
            (id, slug, name, package_form, material_identity, policy_group_id,
             status, created_at, updated_at)
          VALUES ($1::uuid, $2, $3, 'Sealed unit', 'Synthetic bounded identity',
                  $4::uuid, 'draft', $5::timestamptz, $5::timestamptz)
        `,
        [`40000000-0000-4000-8000-${suffix}`, `bounded-${index}`, `Bounded ${index}`, ids.group, timestamp],
      );
    }

    const snapshot = await repository().readSnapshot({ ...actor, resource: "products" });
    expect(snapshot.truncated).toBe(true);
    expect(snapshot.items).toHaveLength(100);
    expect(snapshot.items[0]).toMatchObject({ slug: "bounded-104" });
    expect(snapshot.items[99]).toMatchObject({ slug: "bounded-5" });
  });
});
