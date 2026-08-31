import type { PGlite } from "@electric-sql/pglite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  createProviderSessionRepository,
  projectDurableCheckoutRequest,
  projectDurableCheckoutRequestV1,
} from "@/db/repositories/provider-session-repository";

import { createMigratedPglite } from "./helpers/pglite";

const ids = {
  buyer: "75000000-0000-4000-8000-000000000001",
  otherBuyer: "75000000-0000-4000-8000-000000000002",
  attestation: "75000000-0000-4000-8000-000000000003",
  acceptance: "75000000-0000-4000-8000-000000000004",
  group: "75000000-0000-4000-8000-000000000005",
  product: "75000000-0000-4000-8000-000000000006",
  price: "75000000-0000-4000-8000-000000000007",
  policy: "75000000-0000-4000-8000-000000000008",
  lot: "75000000-0000-4000-8000-000000000009",
  order: "75000000-0000-4000-8000-000000000010",
  item: "75000000-0000-4000-8000-000000000011",
  attempt: "75000000-0000-4000-8000-000000000012",
  reservation: "75000000-0000-4000-8000-000000000013",
  key: "75000000-0000-4000-8000-000000000014",
  variantA: "75000000-0000-4000-8000-000000000015",
  variantB: "75000000-0000-4000-8000-000000000016",
  priceB: "75000000-0000-4000-8000-000000000017",
  itemB: "75000000-0000-4000-8000-000000000018",
} as const;

describe("durable provider-session repository on PGlite", () => {
  let client: PGlite;

  beforeEach(async () => {
    client = await createMigratedPglite();
    await client.exec(`
      INSERT INTO users (id, clerk_id, email_verified_at) VALUES
        ('${ids.buyer}', 'synthetic-provider-buyer', now()),
        ('${ids.otherBuyer}', 'synthetic-provider-other', now());
      INSERT INTO buyer_profiles (user_id, status, age_confirmed_at, research_purpose) VALUES
        ('${ids.buyer}', 'active', now(), 'analytical'),
        ('${ids.otherBuyer}', 'active', now(), 'analytical');
      INSERT INTO attestation_versions (id, version, content_hash, policy_text, effective_at)
      VALUES ('${ids.attestation}', 1, '${"a".repeat(64)}', 'Synthetic policy', now());
      INSERT INTO attestation_acceptances (id, user_id, attestation_version_id, accepted_at)
      VALUES ('${ids.acceptance}', '${ids.buyer}', '${ids.attestation}', now());
      INSERT INTO product_policy_groups (id, slug, name)
      VALUES ('${ids.group}', 'provider-session-group', 'Provider session group');
      INSERT INTO products
        (id, slug, name, package_form, material_identity, policy_group_id, status)
      VALUES ('${ids.product}', 'provider-session-product', 'Synthetic Product',
              'sealed vial', 'Synthetic identity', '${ids.group}', 'active');
      INSERT INTO product_prices
        (id, product_id, version, amount_minor, currency, effective_at)
      VALUES ('${ids.price}', '${ids.product}', 1, 2000, 'USD', now());
      INSERT INTO destination_policies
        (id, scope_kind, product_id, state_code, result, version, active, effective_at)
      VALUES ('${ids.policy}', 'product', '${ids.product}', 'CA', 'allowed', 1, true, now());
      INSERT INTO lots
        (id, product_id, supplier_name, supplier_lot_code, received_quantity,
         available_quantity, status)
      VALUES ('${ids.lot}', '${ids.product}', 'Synthetic supplier', 'SYN-6D', 10, 9, 'released');
      INSERT INTO orders
        (id, buyer_user_id, buyer_status_snapshot, attestation_acceptance_id,
         destination_state_code, currency, subtotal_minor, discount_minor,
         tax_minor, shipping_minor, total_minor, state)
      VALUES ('${ids.order}', '${ids.buyer}', 'active', '${ids.acceptance}',
              'CA', 'USD', 2000, 0, 180, 200, 2380, 'checkout_pending');
      INSERT INTO order_items
        (id, order_id, product_id, product_price_id, destination_policy_id,
         product_name_snapshot, package_form_snapshot, currency,
         unit_amount_minor, quantity, subtotal_minor, discount_minor, total_minor)
      VALUES ('${ids.item}', '${ids.order}', '${ids.product}', '${ids.price}',
              '${ids.policy}', 'Synthetic Product', 'sealed vial', 'USD',
              2000, 1, 2000, 0, 2000);
      INSERT INTO order_shipping_addresses
        (order_id, recipient_name, address_line1, address_line2, city,
         state_code, postal_code, country)
      VALUES ('${ids.order}', 'Synthetic Buyer', '100 Test Way', NULL,
              'Los Angeles', 'CA', '90001', 'US');
      INSERT INTO checkout_attempts
        (id, order_id, buyer_user_id, idempotency_key, request_hash, status,
         account_gate, attestation_gate, product_gate, destination_gate,
         inventory_gate, payment_provider_gate, permitted, review_required,
         tax_ready, shipping_ready, tax_quote_reference, shipping_quote_reference,
         shipping_service, provider, provider_request_id, provider_request_hash,
         expires_at, provider_customer_email, provider_origin,
         provider_request_schema_version, provider_livemode, provider_scope,
         created_at)
      VALUES ('${ids.attempt}', '${ids.order}', '${ids.buyer}', '${ids.key}',
              '${"b".repeat(64)}', 'created', 'pass', 'pass', 'pass', 'pass',
              'pass', 'pass', true, false, true, true, 'tax_6d', 'ship_6d',
              'Synthetic Ground', 'local_test', 'checkout_attempt:${ids.attempt}',
              '${"c".repeat(64)}', '2026-08-25T20:00:00.000Z',
              'stored.buyer@example.test', 'http://127.0.0.1:3000', 1, false,
              'local_test:synthetic-propeptiq-v1', '2026-08-25T12:00:00.000Z');
      INSERT INTO inventory_reservations
        (id, checkout_attempt_id, idempotency_key, order_id, order_item_id,
         product_id, lot_id, quantity_reserved, quantity_remaining, state,
         expires_at)
      VALUES ('${ids.reservation}', '${ids.attempt}', 'reservation:synthetic-6d',
              '${ids.order}', '${ids.item}', '${ids.product}', '${ids.lot}',
              1, 1, 'active', '2026-08-25T20:00:00.000Z');
    `);
  });

  afterEach(async () => client.close());

  function repository() {
    return createProviderSessionRepository({
      client: { query: (sql, params = []) => client.query(sql, [...params]) },
      runTransaction: (work) => client.transaction((transaction) => work({
        query: (sql, params = []) => transaction.query(sql, [...params]),
      })),
    });
  }

  it("loads the smallest owner-scoped immutable replay projection", async () => {
    const repo = repository();
    await expect(repo.load({
      buyerUserId: ids.otherBuyer,
      idempotencyKey: ids.key,
    })).resolves.toBeNull();
    const durable = await repo.load({ buyerUserId: ids.buyer, idempotencyKey: ids.key });
    expect(durable).toMatchObject({
      buyerUserId: ids.buyer,
      orderId: ids.order,
      attemptId: ids.attempt,
      attemptStatus: "created",
      orderState: "checkout_pending",
      provider: "local_test",
      providerCustomerEmail: "stored.buyer@example.test",
      providerOrigin: "http://127.0.0.1:3000",
      providerRequestSchemaVersion: 1,
      providerLivemode: false,
      providerScope: "local_test:synthetic-propeptiq-v1",
      lines: [{
        productId: ids.product,
        productName: "Synthetic Product",
        packageForm: "sealed vial",
        purchasedQuantity: 1,
        postDiscountTotalMinor: 2000,
      }],
      shippingMinor: 200,
      taxMinor: 180,
      totalMinor: 2380,
    });
    expect(Object.isFrozen(durable)).toBe(true);
    expect(projectDurableCheckoutRequestV1({ ...durable! })).toBeNull();
    expect(projectDurableCheckoutRequestV1(durable)).toBe(durable);
  });

  it("loads two V2 variants of one product without reinterpreting them as legacy V1", async () => {
    const snapshot = {
      schemaVersion: 2,
      lines: [
        {
          variantId: ids.variantA,
          productId: ids.product,
          sku: "SYNTH-A",
          productName: "Synthetic Product",
          variantLabel: "5 mg",
          requestedQuantity: 1,
          netLineMinor: 2_000,
          baseUnitMinor: 2_000,
          currency: "USD",
          priceBookId: ids.price,
          priceVersion: 1,
          stripeProductId: "prod_synthetic_parent",
          stripePriceId: "price_synthetic_a",
        },
        {
          variantId: ids.variantB,
          productId: ids.product,
          sku: "SYNTH-B",
          productName: "Synthetic Product",
          variantLabel: "10 mg",
          requestedQuantity: 1,
          netLineMinor: 2_500,
          baseUnitMinor: 2_500,
          currency: "USD",
          priceBookId: ids.priceB,
          priceVersion: 2,
          stripeProductId: "prod_synthetic_parent",
          stripePriceId: "price_synthetic_b",
        },
      ],
    };
    await client.query(
      `INSERT INTO product_variants
         (id, product_id, sku, label, package_quantity, status,
          stripe_product_id, stripe_price_id)
       VALUES
         ($1::uuid, $3::uuid, 'SYNTH-A', '5 mg', 1, 'active',
          'prod_synthetic_parent', 'price_synthetic_a'),
         ($2::uuid, $3::uuid, 'SYNTH-B', '10 mg', 1, 'active',
          'prod_synthetic_parent', 'price_synthetic_b')`,
      [ids.variantA, ids.variantB, ids.product],
    );
    await client.query(
      "UPDATE product_prices SET variant_id = $1::uuid WHERE id = $2::uuid",
      [ids.variantA, ids.price],
    );
    await client.query(
      `INSERT INTO product_prices
         (id, product_id, variant_id, version, amount_minor, currency, effective_at)
       VALUES ($1::uuid, $2::uuid, $3::uuid, 2, 2500, 'USD', now())`,
      [ids.priceB, ids.product, ids.variantB],
    );
    await client.query(
      "UPDATE order_items SET variant_id = $1::uuid WHERE id = $2::uuid",
      [ids.variantA, ids.item],
    );
    await client.query(
      `INSERT INTO order_items
         (id, order_id, product_id, variant_id, product_price_id,
          destination_policy_id, product_name_snapshot, package_form_snapshot,
          currency, unit_amount_minor, quantity, subtotal_minor,
          discount_minor, total_minor)
       VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid,
          $6::uuid, 'Synthetic Product', 'sealed vial', 'USD', 2500, 1,
          2500, 0, 2500)`,
      [
        ids.itemB,
        ids.order,
        ids.product,
        ids.variantB,
        ids.priceB,
        ids.policy,
      ],
    );
    await client.query(
      `UPDATE orders SET subtotal_minor = 4500, discount_minor = 0,
         total_minor = 4880 WHERE id = $1::uuid`,
      [ids.order],
    );
    await client.query(
      `UPDATE checkout_attempts SET provider_request_schema_version = 2,
         provider_binding_snapshot = $1::jsonb WHERE id = $2::uuid`,
      [JSON.stringify(snapshot), ids.attempt],
    );

    const durable = await repository().load({
      buyerUserId: ids.buyer,
      idempotencyKey: ids.key,
    });
    expect(durable).toMatchObject({
      providerRequestSchemaVersion: 2,
      providerBindingSnapshot: snapshot,
      shippingMinor: 200,
      taxMinor: 180,
      totalMinor: 4_880,
    });
    expect(projectDurableCheckoutRequestV1(durable)).toBeNull();
    expect(projectDurableCheckoutRequest(durable)).toBe(durable);
  });

  it("fails closed when item/allocation totals do not cohere with the order", async () => {
    await client.exec(`
      UPDATE orders SET subtotal_minor = 2100, total_minor = 2480
      WHERE id = '${ids.order}'
    `);
    await expect(repository().load({
      buyerUserId: ids.buyer,
      idempotencyKey: ids.key,
    })).rejects.toThrow("Durable checkout snapshot is incoherent");
  });

  it("CASes open idempotently and rejects a competing session or fabricated expectation", async () => {
    const repo = repository();
    const durable = await repo.load({ buyerUserId: ids.buyer, idempotencyKey: ids.key });
    if (durable === null) throw new Error("missing fixture");
    await expect(repo.recordOpen(durable, "cs_local_synthetic_primary")).resolves.toEqual({ status: "applied" });
    await expect(repo.recordOpen(durable, "cs_local_synthetic_primary")).resolves.toEqual({ status: "idempotent" });
    await expect(repo.recordUnknown(durable, {
      knownProviderSessionId: "cs_local_synthetic_primary",
      integrityFailure: false,
    })).resolves.toEqual({ status: "idempotent" });
    await expect(repo.recordUnknown(durable, {
      knownProviderSessionId: "cs_local_synthetic_primary",
      integrityFailure: true,
    })).resolves.toEqual({ status: "applied" });
    await expect(repo.recordOpen(durable, "cs_local_synthetic_primary")).resolves.toEqual({ status: "applied" });
    await expect(repo.recordOpen(durable, "cs_local_synthetic_competing")).resolves.toEqual({ status: "conflict" });
    await expect(repo.recordOpen({ ...durable } as never, "cs_local_synthetic_primary")).resolves.toEqual({ status: "conflict" });
  });

  it.each(["recordOpen", "recordUnknown"] as const)(
    "rejects %s when the durable global request hash is stale",
    async (operation) => {
      const repo = repository();
      const durable = await repo.load({ buyerUserId: ids.buyer, idempotencyKey: ids.key });
      if (durable === null) throw new Error("missing fixture");
      await client.exec(`
        UPDATE checkout_attempts SET request_hash = '${"d".repeat(64)}'
        WHERE id = '${ids.attempt}'
      `);

      const result = operation === "recordOpen"
        ? repo.recordOpen(durable, "cs_local_synthetic_stale_open")
        : repo.recordUnknown(durable, {
            knownProviderSessionId: "cs_local_synthetic_stale_unknown",
            integrityFailure: true,
          });
      await expect(result).resolves.toEqual({ status: "conflict" });
      const attempt = await client.query(`
        SELECT status, provider_session_id FROM checkout_attempts
        WHERE id = '${ids.attempt}'
      `);
      expect(attempt.rows).toEqual([{ status: "created", provider_session_id: null }]);
    },
  );

  it("retains reservations for unknown outcomes, preserves known IDs, and never regresses terminal state", async () => {
    const repo = repository();
    const durable = await repo.load({ buyerUserId: ids.buyer, idempotencyKey: ids.key });
    if (durable === null) throw new Error("missing fixture");
    await expect(repo.recordUnknown(durable, {
      knownProviderSessionId: "cs_local_synthetic_learned",
      integrityFailure: true,
    })).resolves.toEqual({ status: "applied" });
    await expect(repo.recordUnknown(durable, {
      knownProviderSessionId: "cs_local_synthetic_different",
      integrityFailure: true,
    })).resolves.toEqual({ status: "conflict" });
    const reservation = await client.query(`
      SELECT state, quantity_remaining FROM inventory_reservations
      WHERE id = '${ids.reservation}'
    `);
    expect(reservation.rows).toEqual([{ state: "active", quantity_remaining: 1 }]);
    await client.exec(`UPDATE checkout_attempts SET status = 'failed' WHERE id = '${ids.attempt}'`);
    await expect(repo.recordUnknown(durable, {
      knownProviderSessionId: "cs_local_synthetic_learned",
      integrityFailure: true,
    })).resolves.toEqual({ status: "terminal" });
  });

  it("stores a newly learned ID restrictively when the order is no longer payable", async () => {
    const repo = repository();
    const durable = await repo.load({ buyerUserId: ids.buyer, idempotencyKey: ids.key });
    if (durable === null) throw new Error("missing fixture");
    await client.exec(`UPDATE orders SET state = 'cancelled' WHERE id = '${ids.order}'`);
    await expect(repo.recordOpen(durable, "cs_local_synthetic_nonpayable")).resolves.toEqual({ status: "nonpayable" });
    const attempt = await client.query(`
      SELECT status, provider_session_id FROM checkout_attempts
      WHERE id = '${ids.attempt}'
    `);
    expect(attempt.rows).toEqual([{
      status: "provider_unknown",
      provider_session_id: "cs_local_synthetic_nonpayable",
    }]);
  });
});
