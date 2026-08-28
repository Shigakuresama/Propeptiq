import { createHash } from "node:crypto";

import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { resolveTestDatabase } from "../integration/helpers/database";

// The guard rejects missing confirmation and non-test-scoped targets before
// Pool construction. This file is excluded from ordinary unit/PGlite lanes.
const target = resolveTestDatabase(process.env);
const pool = new Pool({ connectionString: target.url, max: 6 });

function keyedUuid(label: string): string {
  const hex = createHash("sha256")
    .update(`growth-settlement-contention:${label}`)
    .digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

const fixture = Object.freeze({
  referrer: keyedUuid("referrer"),
  buyer: keyedUuid("buyer"),
  attestation: keyedUuid("attestation"),
  acceptance: keyedUuid("acceptance"),
  order: keyedUuid("order"),
  referralCode: keyedUuid("referral-code"),
  primaryPolicy: keyedUuid("primary-policy"),
  alternatePolicy: keyedUuid("alternate-policy"),
  primaryAttribution: keyedUuid("primary-attribution"),
  alternateAttribution: keyedUuid("alternate-attribution"),
  conversion: keyedUuid("conversion"),
});

async function beginBounded(client: PoolClient): Promise<number> {
  await client.query("BEGIN");
  await client.query("SET LOCAL lock_timeout = '4s'");
  await client.query("SET LOCAL statement_timeout = '8s'");
  const result = await client.query<{ pid: number }>(
    "SELECT pg_backend_pid()::int AS pid",
  );
  return result.rows[0]!.pid;
}

async function expectBlocked(pid: number): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const result = await pool.query<{ blocked: boolean }>(
      "SELECT cardinality(pg_blocking_pids($1::int)) > 0 AS blocked",
      [pid],
    );
    if (result.rows[0]?.blocked === true) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("expected settlement contention transaction to be blocked");
}

async function cleanupFixture(): Promise<void> {
  await pool.query(
    `DELETE FROM public.referral_conversions
     WHERE first_order_id = $1::uuid OR id = $2::uuid`,
    [fixture.order, fixture.conversion],
  );
  await pool.query(
    `DELETE FROM public.order_growth_attributions WHERE order_id = $1::uuid`,
    [fixture.order],
  );
  await pool.query(
    `DELETE FROM public.referral_attributions
     WHERE id = ANY($1::uuid[])`,
    [[fixture.primaryAttribution, fixture.alternateAttribution]],
  );
  await pool.query(
    `DELETE FROM public.referral_codes WHERE id = $1::uuid`,
    [fixture.referralCode],
  );
  await pool.query(`DELETE FROM public.orders WHERE id = $1::uuid`, [fixture.order]);
  await pool.query(
    `DELETE FROM public.attestation_acceptances WHERE id = $1::uuid`,
    [fixture.acceptance],
  );
  await pool.query(
    `DELETE FROM public.attestation_versions WHERE id = $1::uuid`,
    [fixture.attestation],
  );
  await pool.query(
    `DELETE FROM public.users WHERE id = ANY($1::uuid[])`,
    [[fixture.referrer, fixture.buyer]],
  );
}

async function seedFixture(): Promise<void> {
  await cleanupFixture();
  await pool.query(
    `INSERT INTO public.referral_policies
       (id, version, status, attribution_days,
        referred_discount_basis_points, referred_discount_cap_minor,
        referrer_points_per_dollar, referrer_reward_cap_points, effective_at)
     VALUES
       ($1::uuid, 910001, 'draft', 30, 1000, 2500, 5, 2500,
        '2026-08-28T00:00:00Z'),
       ($2::uuid, 910002, 'draft', 30, 1000, 2500, 5, 2500,
        '2026-08-29T00:00:00Z')
     ON CONFLICT DO NOTHING`,
    [fixture.primaryPolicy, fixture.alternatePolicy],
  );
  const policies = await pool.query<{ count: number }>(
    `SELECT count(*)::int AS count
     FROM public.referral_policies
     WHERE (id, version) IN (($1::uuid, 910001), ($2::uuid, 910002))`,
    [fixture.primaryPolicy, fixture.alternatePolicy],
  );
  if (policies.rows[0]?.count !== 2) {
    throw new Error("isolated PostgreSQL target has conflicting guarded policy versions");
  }
  await pool.query(
    `INSERT INTO public.users (id, clerk_id, email_verified_at)
     VALUES
       ($1::uuid, 'growth-contention-referrer', '2026-08-28T00:00:00Z'),
       ($2::uuid, 'growth-contention-buyer', '2026-08-28T00:00:00Z');
     INSERT INTO public.attestation_versions
       (id, version, content_hash, policy_text, effective_at)
     VALUES ($3::uuid, 910001, $4, 'Synthetic guarded growth contention',
       '2026-08-28T00:00:00Z');
     INSERT INTO public.attestation_acceptances
       (id, user_id, attestation_version_id, accepted_at)
     VALUES ($5::uuid, $2::uuid, $3::uuid, '2026-08-28T00:00:00Z');
     INSERT INTO public.orders
       (id, buyer_user_id, buyer_status_snapshot, attestation_acceptance_id,
        destination_state_code, currency, subtotal_minor, discount_minor,
        tax_minor, shipping_minor, total_minor, state)
     VALUES ($6::uuid, $2::uuid, 'active', $5::uuid, 'CA', 'USD',
       1000, 0, 0, 0, 1000, 'draft');
     INSERT INTO public.referral_codes (id, owner_user_id, code, status)
     VALUES ($7::uuid, $1::uuid, 'ref_GrowthRaceGuard1', 'active');
     INSERT INTO public.referral_attributions
       (id, referral_code_id, referrer_user_id, referred_user_id,
        referral_policy_id, referral_policy_version, clicked_at, expires_at,
        bound_at)
     VALUES
       ($8::uuid, $7::uuid, $1::uuid, $2::uuid, $10::uuid, 910001,
        '2026-08-28T00:00:00Z', '2026-09-27T00:00:00Z',
        '2026-08-28T00:00:00Z'),
       ($9::uuid, $7::uuid, $1::uuid, $2::uuid, $11::uuid, 910002,
        '2026-08-29T00:00:00Z', '2026-09-28T00:00:00Z',
        '2026-08-29T00:00:00Z');
     INSERT INTO public.order_growth_attributions
       (order_id, buyer_user_id, program, referral_attribution_id,
        referral_policy_id, referral_policy_version)
     VALUES ($6::uuid, $2::uuid, 'customer_referral', $8::uuid,
       $10::uuid, 910001)`,
    [
      fixture.referrer,
      fixture.buyer,
      fixture.attestation,
      "d".repeat(64),
      fixture.acceptance,
      fixture.order,
      fixture.referralCode,
      fixture.primaryAttribution,
      fixture.alternateAttribution,
      fixture.primaryPolicy,
      fixture.alternatePolicy,
    ],
  );
}

async function insertSettlement(client: PoolClient): Promise<void> {
  await client.query(
    `INSERT INTO public.referral_conversions
       (id, referral_attribution_id, referred_user_id, first_order_id,
        program, referral_policy_id, referral_policy_version, idempotency_key,
        referred_discount_minor, referrer_reward_points, status)
     VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, 'customer_referral',
       $5::uuid, 910001, 'growth-contention-conversion', 100, 50, 'pending')`,
    [
      fixture.conversion,
      fixture.primaryAttribution,
      fixture.buyer,
      fixture.order,
      fixture.primaryPolicy,
    ],
  );
}

describe("guarded PostgreSQL growth settlement contention", () => {
  beforeAll(async () => {
    const ready = await pool.query<{
      order_growth_attributions: string | null;
      referral_conversions: string | null;
      relational_fk: boolean;
      hardened_function: boolean;
    }>(`
      SELECT
        to_regclass('public.order_growth_attributions')::text
          AS order_growth_attributions,
        to_regclass('public.referral_conversions')::text
          AS referral_conversions,
        EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'referral_conversions_order_growth_fk'
        ) AS relational_fk,
        EXISTS (
          SELECT 1
          FROM pg_proc AS proc
          JOIN pg_namespace AS namespace
            ON namespace.oid = proc.pronamespace
          WHERE namespace.nspname = 'public'
            AND proc.proname = 'enforce_referral_conversion_selected_growth'
            AND proc.proconfig @> ARRAY[
              'search_path=pg_catalog, public, pg_temp'
            ]::text[]
        ) AS hardened_function
    `);
    expect(ready.rows[0]).toEqual({
      order_growth_attributions: "order_growth_attributions",
      referral_conversions: "referral_conversions",
      relational_fk: true,
      hardened_function: true,
    });
    await cleanupFixture();
  });

  afterAll(async () => {
    await cleanupFixture().catch(() => undefined);
    await pool.end();
  });

  it("makes a parent delete win or the concurrent settlement attach, never both", async () => {
    await seedFixture();
    const parent = await pool.connect();
    const child = await pool.connect();
    let settlement: Promise<void> | null = null;
    try {
      await beginBounded(parent);
      await parent.query(
        `DELETE FROM public.order_growth_attributions WHERE order_id = $1::uuid`,
        [fixture.order],
      );

      const childPid = await beginBounded(child);
      settlement = (async () => {
        try {
          await insertSettlement(child);
          await child.query("COMMIT");
        } catch (error) {
          await child.query("ROLLBACK").catch(() => undefined);
          throw error;
        }
      })();
      await expectBlocked(childPid);
      await parent.query("COMMIT");
      await expect(settlement).rejects.toMatchObject({ code: "23503" });

      const invariant = await pool.query<{ parents: number; children: number }>(
        `SELECT
           (SELECT count(*)::int FROM public.order_growth_attributions
            WHERE order_id = $1::uuid) AS parents,
           (SELECT count(*)::int FROM public.referral_conversions
            WHERE first_order_id = $1::uuid) AS children`,
        [fixture.order],
      );
      expect(invariant.rows[0]).toEqual({ parents: 0, children: 0 });
    } finally {
      await parent.query("ROLLBACK").catch(() => undefined);
      await child.query("ROLLBACK").catch(() => undefined);
      if (settlement !== null) await Promise.allSettled([settlement]);
      parent.release();
      child.release();
      await cleanupFixture();
    }
  });

  it("makes an attached settlement defeat a concurrent parent key update", async () => {
    await seedFixture();
    const child = await pool.connect();
    const parent = await pool.connect();
    let mutation: Promise<void> | null = null;
    try {
      await beginBounded(child);
      await insertSettlement(child);

      const parentPid = await beginBounded(parent);
      mutation = (async () => {
        try {
          await parent.query(
            `UPDATE public.order_growth_attributions
             SET referral_attribution_id = $2::uuid,
                 referral_policy_id = $3::uuid,
                 referral_policy_version = 910002
             WHERE order_id = $1::uuid`,
            [
              fixture.order,
              fixture.alternateAttribution,
              fixture.alternatePolicy,
            ],
          );
          await parent.query("COMMIT");
        } catch (error) {
          await parent.query("ROLLBACK").catch(() => undefined);
          throw error;
        }
      })();
      await expectBlocked(parentPid);
      await child.query("COMMIT");
      await expect(mutation).rejects.toMatchObject({ code: "23503" });

      const invariant = await pool.query<{
        attribution_id: string;
        policy_id: string;
        policy_version: number;
        children: number;
      }>(
        `SELECT referral_attribution_id::text AS attribution_id,
                referral_policy_id::text AS policy_id,
                referral_policy_version::int AS policy_version,
                (SELECT count(*)::int FROM public.referral_conversions
                 WHERE first_order_id = $1::uuid) AS children
         FROM public.order_growth_attributions
         WHERE order_id = $1::uuid`,
        [fixture.order],
      );
      expect(invariant.rows[0]).toEqual({
        attribution_id: fixture.primaryAttribution,
        policy_id: fixture.primaryPolicy,
        policy_version: 910001,
        children: 1,
      });
    } finally {
      await parent.query("ROLLBACK").catch(() => undefined);
      await child.query("ROLLBACK").catch(() => undefined);
      if (mutation !== null) await Promise.allSettled([mutation]);
      parent.release();
      child.release();
      await cleanupFixture();
    }
  });
});
