import { createHash } from "node:crypto";

import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createCheckoutService } from "@/commerce/checkout-service";
import {
  createPostgresCheckoutRepository,
  type CheckoutSqlClient,
} from "@/db/repositories/checkout-repository";
import { resolveTestDatabase } from "../integration/helpers/database";

// resolveTestDatabase validates the exact confirmation and target name before
// Pool construction. This file is excluded from every normal local test lane.
const target = resolveTestDatabase(process.env);
const pool = new Pool({ connectionString: target.url, max: 12 });
const now = new Date("2026-08-25T12:00:00.000Z");
const sha256 = async (value: string) =>
  createHash("sha256").update(value).digest("hex");

function keyedUuid(label: string): string {
  const hex = createHash("sha256").update(`postgres-lane:${label}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

type Fixture = Readonly<{
  scope: string;
  buyers: readonly string[];
  acceptances: readonly string[];
  attestation: string;
  group: string;
  products: readonly string[];
  prices: readonly string[];
  lots: readonly string[];
  policies: readonly string[];
  promotion: string;
  promotionTarget: string;
}>;

function fixture(scope: string, productCount = 1): Fixture {
  return Object.freeze({
    scope,
    buyers: Object.freeze([keyedUuid(`${scope}:buyer:1`), keyedUuid(`${scope}:buyer:2`)]),
    acceptances: Object.freeze([
      keyedUuid(`${scope}:acceptance:1`),
      keyedUuid(`${scope}:acceptance:2`),
    ]),
    attestation: keyedUuid(`${scope}:attestation`),
    group: keyedUuid(`${scope}:group`),
    products: Object.freeze(
      Array.from({ length: productCount }, (_, index) =>
        keyedUuid(`${scope}:product:${index + 1}`),
      ),
    ),
    prices: Object.freeze(
      Array.from({ length: productCount }, (_, index) =>
        keyedUuid(`${scope}:price:${index + 1}`),
      ),
    ),
    lots: Object.freeze(
      Array.from({ length: productCount * 2 }, (_, index) =>
        keyedUuid(`${scope}:lot:${index + 1}`),
      ),
    ),
    policies: Object.freeze(
      Array.from({ length: productCount }, (_, index) =>
        keyedUuid(`${scope}:policy:${index + 1}`),
      ),
    ),
    promotion: keyedUuid(`${scope}:promotion`),
    promotionTarget: keyedUuid(`${scope}:promotion-target`),
  });
}

async function serializable<Value>(
  work: (client: CheckoutSqlClient) => Promise<Value>,
): Promise<Value> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
    const result = await work({
      query: async (sql, params = []) => {
        const queried = await client.query(sql, [...params]);
        return { rows: queried.rows };
      },
    });
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

function repository() {
  return createPostgresCheckoutRepository({
    client: {
      query: async (sql, params = []) => {
        const queried = await pool.query(sql, [...params]);
        return { rows: queried.rows };
      },
    },
    runTransaction: (work) => serializable(work),
    sha256,
    keyedUuid,
    retrySleep: async (retry) => {
      await new Promise((resolve) => setTimeout(resolve, retry * 5));
    },
  });
}

function service() {
  return createCheckoutService({
    repository: repository(),
    shippingQuotePort: {
      async quoteShipping(input) {
        return {
          status: "ready",
          bindingHash: input.bindingHash,
          reference: `ship_${createHash("sha256").update(input.bindingHash).digest("hex").slice(0, 12)}`,
          service: "Synthetic isolated PostgreSQL ground",
          amountMinor: 700,
          currency: "USD",
        };
      },
    },
    taxQuotePort: {
      async quoteTax(input) {
        return {
          status: "ready",
          bindingHash: input.bindingHash,
          reference: `tax_${createHash("sha256").update(input.bindingHash).digest("hex").slice(0, 12)}`,
          amountMinor: 325,
          currency: "USD",
        };
      },
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
}

async function seedFixture(
  data: Fixture,
  options: Readonly<{
    quantityPerLot?: number;
    promotion?: boolean;
  }> = {},
): Promise<void> {
  const quantityPerLot = options.quantityPerLot ?? 1;
  await pool.query(
    `INSERT INTO users (id, clerk_id, email_verified_at)
     VALUES ($1::uuid, $3, $5::timestamptz), ($2::uuid, $4, $5::timestamptz)`,
    [
      data.buyers[0],
      data.buyers[1],
      `clerk-${data.scope}-1`,
      `clerk-${data.scope}-2`,
      "2026-08-01T00:00:00.000Z",
    ],
  );
  await pool.query(
    `INSERT INTO buyer_profiles
       (user_id, status, age_confirmed_at, research_purpose)
     VALUES ($1::uuid, 'active', $3::timestamptz, 'analytical'),
            ($2::uuid, 'active', $3::timestamptz, 'analytical')`,
    [data.buyers[0], data.buyers[1], "2026-08-01T00:00:00.000Z"],
  );
  await pool.query(
    `INSERT INTO attestation_versions
       (id, version, content_hash, policy_text, effective_at)
     VALUES ($1::uuid, 1, $2, 'Synthetic isolated contention policy', $3::timestamptz)`,
    [data.attestation, "a".repeat(64), "2026-08-01T00:00:00.000Z"],
  );
  await pool.query(
    `INSERT INTO attestation_acceptances
       (id, user_id, attestation_version_id, accepted_at)
     VALUES ($1::uuid, $3::uuid, $5::uuid, $6::timestamptz),
            ($2::uuid, $4::uuid, $5::uuid, $6::timestamptz)`,
    [
      data.acceptances[0],
      data.acceptances[1],
      data.buyers[0],
      data.buyers[1],
      data.attestation,
      "2026-08-02T00:00:00.000Z",
    ],
  );
  await pool.query(
    `INSERT INTO product_policy_groups (id, slug, name, active)
     VALUES ($1::uuid, $2, $3, true)`,
    [data.group, `pg-${data.scope}`, `Synthetic group ${data.scope}`],
  );
  for (let index = 0; index < data.products.length; index += 1) {
    await pool.query(
      `INSERT INTO products
         (id, slug, name, package_form, material_identity, policy_group_id, status)
       VALUES ($1::uuid, $2, $3, 'Sealed synthetic unit', $4, $5::uuid, 'active')`,
      [
        data.products[index],
        `pg-${data.scope}-p${index + 1}`,
        `Synthetic contention product ${index + 1}`,
        `Synthetic identity ${data.scope}-${index + 1}`,
        data.group,
      ],
    );
    await pool.query(
      `INSERT INTO product_prices
         (id, product_id, version, amount_minor, currency, effective_at)
       VALUES ($1::uuid, $2::uuid, 1, $3, 'USD', $4::timestamptz)`,
      [data.prices[index], data.products[index], 5000 + index * 1000, "2026-08-01T00:00:00.000Z"],
    );
    for (let lotOffset = 0; lotOffset < 2; lotOffset += 1) {
      const lotIndex = index * 2 + lotOffset;
      await pool.query(
        `INSERT INTO lots
           (id, product_id, supplier_name, supplier_lot_code,
            received_quantity, available_quantity, status, expires_at)
         VALUES ($1::uuid, $2::uuid, 'Synthetic isolated supplier', $3,
                 $4, $4, 'released', $5::timestamptz)`,
        [
          data.lots[lotIndex],
          data.products[index],
          `${data.scope}-LOT-${lotIndex + 1}`,
          quantityPerLot,
          lotOffset === 0
            ? "2026-09-01T00:00:00.000Z"
            : "2026-12-01T00:00:00.000Z",
        ],
      );
    }
    await pool.query(
      `INSERT INTO destination_policies
         (id, scope_kind, product_id, state_code, result, version, active, effective_at)
       VALUES ($1::uuid, 'product', $2::uuid, 'CA', 'allowed', 1, true, $3::timestamptz)`,
      [data.policies[index], data.products[index], "2026-08-01T00:00:00.000Z"],
    );
  }
  if (options.promotion) {
    await pool.query(
      `INSERT INTO promotions
         (id, code, version, name, kind, status, basis_points, starts_at, ends_at)
       VALUES ($1::uuid, $2, 1, 'Synthetic contention discount', 'discount',
               'active', 1000, $3::timestamptz, $4::timestamptz)`,
      [
        data.promotion,
        `PG-${data.scope}`,
        "2026-08-01T00:00:00.000Z",
        "2026-09-01T00:00:00.000Z",
      ],
    );
    await pool.query(
      `INSERT INTO promotion_targets (id, promotion_id, target_kind, product_id)
       VALUES ($1::uuid, $2::uuid, 'product', $3::uuid)`,
      [data.promotionTarget, data.promotion, data.products[0]],
    );
  }
}

async function cleanupFixture(data: Fixture): Promise<void> {
  const productIds = [...data.products];
  const buyerIds = [...data.buyers];
  const cleanup = async (sql: string, params: readonly unknown[]) => {
    await pool.query(sql, [...params]);
  };
  await cleanup(
    `DELETE FROM inventory_events WHERE order_id IN
       (SELECT id FROM orders WHERE buyer_user_id = ANY($1::uuid[]))`,
    [buyerIds],
  );
  await cleanup(
    `DELETE FROM inventory_reservations WHERE order_id IN
       (SELECT id FROM orders WHERE buyer_user_id = ANY($1::uuid[]))`,
    [buyerIds],
  );
  await cleanup(
    `DELETE FROM review_request_destination_policies WHERE review_request_id IN
       (SELECT id FROM review_requests WHERE user_id = ANY($1::uuid[]))`,
    [buyerIds],
  );
  await cleanup(`DELETE FROM review_requests WHERE user_id = ANY($1::uuid[])`, [buyerIds]);
  await cleanup(`DELETE FROM checkout_attempts WHERE buyer_user_id = ANY($1::uuid[])`, [buyerIds]);
  await cleanup(`DELETE FROM orders WHERE buyer_user_id = ANY($1::uuid[])`, [buyerIds]);
  await cleanup(`DELETE FROM promotion_targets WHERE promotion_id = $1::uuid`, [data.promotion]);
  await cleanup(`DELETE FROM promotions WHERE id = $1::uuid`, [data.promotion]);
  await cleanup(`DELETE FROM destination_policies WHERE product_id = ANY($1::uuid[])`, [productIds]);
  await cleanup(`DELETE FROM lots WHERE product_id = ANY($1::uuid[])`, [productIds]);
  await cleanup(`DELETE FROM product_prices WHERE product_id = ANY($1::uuid[])`, [productIds]);
  await cleanup(`DELETE FROM products WHERE id = ANY($1::uuid[])`, [productIds]);
  await cleanup(`DELETE FROM product_policy_groups WHERE id = $1::uuid`, [data.group]);
  await cleanup(`DELETE FROM attestation_acceptances WHERE user_id = ANY($1::uuid[])`, [buyerIds]);
  await cleanup(`DELETE FROM attestation_versions WHERE id = $1::uuid`, [data.attestation]);
  await cleanup(`DELETE FROM buyer_profiles WHERE user_id = ANY($1::uuid[])`, [buyerIds]);
  await cleanup(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [buyerIds]);
}

function checkoutRequest(data: Fixture, quantity = 1, promotion = false) {
  return {
    items: data.products.map((productId) => ({ productId, quantity })),
    destination: {
      recipientName: "Synthetic Isolated Researcher",
      line1: "100 Contention Test Way",
      line2: null,
      city: "Testville",
      stateCode: "CA",
      postalCode: "90001",
      countryCode: "US",
    },
    promotionIds: promotion ? [data.promotion] : [],
  };
}

async function quote(data: Fixture, buyerIndex: number, key: string, request: unknown) {
  const checkout = service();
  const result = await checkout.quote({
    buyerUserId: data.buyers[buyerIndex]!,
    idempotencyKey: key,
    paymentProviderAvailable: true,
    request,
  });
  if (result.status !== "quoted") throw new Error(`Quote failed: ${result.status}`);
  return { checkout, result };
}

function providerPreparation(attemptId: string) {
  return {
    authority: "server_prepared_provider_request" as const,
    provider: "local_test" as const,
    providerIdempotencyKey: `checkout_attempt:${attemptId}`,
    providerRequestHash: "c".repeat(64),
    providerExpiresAt: "2026-08-25T13:00:00.000Z",
  };
}

beforeAll(async () => {
  const ready = await pool.query<{ attempts: string | null; reservations: string | null }>(
    `SELECT to_regclass('public.checkout_attempts')::text AS attempts,
            to_regclass('public.inventory_reservations')::text AS reservations`,
  );
  if (!ready.rows[0]?.attempts || !ready.rows[0]?.reservations) {
    throw new Error(
      "The isolated PostgreSQL target must be separately prepared through migration 0003",
    );
  }
});

afterAll(async () => pool.end());

describe("guarded PostgreSQL checkout contention", () => {
  it("allows only one buyer to reserve the actual last unit and never makes stock negative", async () => {
    const data = fixture("last-unit");
    await seedFixture(data, { quantityPerLot: 1 });
    try {
      await pool.query(`UPDATE lots SET available_quantity = 0 WHERE id = $1::uuid`, [data.lots[1]]);
      const request = checkoutRequest(data);
      const first = await quote(data, 0, keyedUuid("last-unit:key:1"), request);
      const second = await quote(data, 1, keyedUuid("last-unit:key:2"), request);
      const results = await Promise.all([
        first.checkout.prepare(
          first.result.plan,
          providerPreparation(first.result.plan.identity.attemptId),
        ),
        second.checkout.prepare(
          second.result.plan,
          providerPreparation(second.result.plan.identity.attemptId),
        ),
      ]);
      expect(results.filter((result) => result.status === "prepared")).toHaveLength(1);
      const stock = await pool.query<{ available: number; reservations: number }>(
        `SELECT (SELECT available_quantity FROM lots WHERE id = $1::uuid) AS available,
                (SELECT count(*)::int FROM inventory_reservations
                 WHERE lot_id = $1::uuid AND state = 'active') AS reservations`,
        [data.lots[0]],
      );
      expect(stock.rows[0]).toEqual({ available: 0, reservations: 1 });
    } finally {
      await cleanupFixture(data);
    }
  });

  it("converges concurrent same-buyer same-key requests to one order and conflicts changed input", async () => {
    const data = fixture("same-key");
    await seedFixture(data, { quantityPerLot: 3 });
    try {
      const key = keyedUuid("same-key:key");
      const request = checkoutRequest(data);
      const first = await quote(data, 0, key, request);
      const second = await quote(data, 0, key, request);
      const sameResults = await Promise.all([
        first.checkout.prepare(
          first.result.plan,
          providerPreparation(first.result.plan.identity.attemptId),
        ),
        second.checkout.prepare(
          second.result.plan,
          providerPreparation(second.result.plan.identity.attemptId),
        ),
      ]);
      expect(sameResults.map((result) => result.status).toSorted()).toEqual([
        "loaded",
        "prepared",
      ]);
      const count = await pool.query<{ attempts: number; orders: number }>(
        `SELECT (SELECT count(*)::int FROM checkout_attempts
                 WHERE buyer_user_id = $1::uuid AND idempotency_key = $2) AS attempts,
                (SELECT count(*)::int FROM orders WHERE buyer_user_id = $1::uuid) AS orders`,
        [data.buyers[0], key],
      );
      expect(count.rows[0]).toEqual({ attempts: 1, orders: 1 });

      const changed = await service().quote({
        buyerUserId: data.buyers[0]!,
        idempotencyKey: key,
        paymentProviderAvailable: true,
        request: checkoutRequest(data, 2),
      });
      expect(changed).toEqual({ status: "idempotency_conflict" });
    } finally {
      await cleanupFixture(data);
    }
  });

  it("serializes promotion retirement against prepare without committing a retired snapshot", async () => {
    const data = fixture("promotion-race");
    await seedFixture(data, { quantityPerLot: 3, promotion: true });
    try {
      const planned = await quote(
        data,
        0,
        keyedUuid("promotion-race:key"),
        checkoutRequest(data, 1, true),
      );
      const retire = serializable(async (client) => {
        await client.query(`SELECT id FROM promotions WHERE id = $1::uuid FOR UPDATE`, [
          data.promotion,
        ]);
        await client.query(`UPDATE promotions SET status = 'retired' WHERE id = $1::uuid`, [
          data.promotion,
        ]);
        return "retired" as const;
      });
      const [prepared] = await Promise.all([
        planned.checkout.prepare(
          planned.result.plan,
          providerPreparation(planned.result.plan.identity.attemptId),
        ),
        retire,
      ]);
      const persisted = await pool.query<{ orders: number; retired: boolean }>(
        `SELECT (SELECT count(*)::int FROM orders WHERE buyer_user_id = $1::uuid) AS orders,
                (SELECT status = 'retired' FROM promotions WHERE id = $2::uuid) AS retired`,
        [data.buyers[0], data.promotion],
      );
      expect(persisted.rows[0]?.retired).toBe(true);
      if (prepared.status === "facts_changed_retry") {
        expect(persisted.rows[0]?.orders).toBe(0);
      } else {
        expect(prepared.status).toBe("prepared");
        expect(persisted.rows[0]?.orders).toBe(1);
      }
    } finally {
      await cleanupFixture(data);
    }
  });

  it("completes canonical multi-product multi-lot work without deadlock and bounded retry", async () => {
    const data = fixture("multi-lot", 2);
    await seedFixture(data, { quantityPerLot: 2 });
    try {
      const request = checkoutRequest(data, 2);
      const keys = [keyedUuid("multi-lot:key:1"), keyedUuid("multi-lot:key:2")] as const;
      const first = await quote(data, 0, keys[0], request);
      const second = await quote(data, 1, keys[1], request);
      const initialResults = await Promise.all([
        first.checkout.prepare(
          first.result.plan,
          providerPreparation(first.result.plan.identity.attemptId),
        ),
        second.checkout.prepare(
          second.result.plan,
          providerPreparation(second.result.plan.identity.attemptId),
        ),
      ]);
      const results = await Promise.all(
        initialResults.map(async (result, buyerIndex) => {
          if (result.status !== "facts_changed_retry") return result;
          // A serialization winner can legitimately change the losing plan's
          // inventory hash. That requires a new external quote cycle, not reuse
          // of stale quotes inside the transaction retry loop.
          const refreshed = await quote(data, buyerIndex, keys[buyerIndex]!, request);
          return refreshed.checkout.prepare(
            refreshed.result.plan,
            providerPreparation(refreshed.result.plan.identity.attemptId),
          );
        }),
      );
      expect(results.every((result) => result.status === "prepared")).toBe(true);
      const stock = await pool.query<{ minimum: number; active: number }>(
        `SELECT (SELECT min(available_quantity)::int FROM lots
                 WHERE product_id = ANY($1::uuid[])) AS minimum,
                (SELECT count(*)::int FROM inventory_reservations
                 WHERE product_id = ANY($1::uuid[]) AND state = 'active') AS active`,
        [[...data.products]],
      );
      expect(stock.rows[0]?.minimum).toBeGreaterThanOrEqual(0);
      expect(stock.rows[0]?.active).toBeGreaterThanOrEqual(4);
    } finally {
      await cleanupFixture(data);
    }
  });
});
