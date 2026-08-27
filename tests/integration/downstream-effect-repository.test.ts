import type { PGlite } from "@electric-sql/pglite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  createDownstreamEffectRepository,
  projectDownstreamEffectClaimV1,
} from "@/db/repositories/downstream-effect-repository";

import { createMigratedPglite } from "./helpers/pglite";

const effectId = "7a000000-0000-4000-8000-000000000001";
const paymentEventId = "7a000000-0000-4000-8000-000000000002";
const now = new Date("2026-08-25T12:00:30.000Z");

describe("downstream effect leases on PGlite", () => {
  let client: PGlite;

  beforeEach(async () => {
    client = await createMigratedPglite();
    await client.query(
      `INSERT INTO downstream_effects
         (id, order_id, provider_event_id, effect_type, payload,
          idempotency_key, status, attempt_count, created_at, updated_at)
       VALUES ($1, NULL, NULL, 'wake_provider_dependencies', $2::jsonb,
               $3, 'pending', 0, $4, $4)`,
      [
        effectId,
        JSON.stringify({ schemaVersion: 1, verifiedPaymentEventId: paymentEventId }),
        `payment_event:${paymentEventId}:wake_provider_dependencies`,
        new Date("2026-08-25T12:00:00.000Z"),
      ],
    );
  });

  afterEach(async () => client.close());

  function repository() {
    return createDownstreamEffectRepository({
      runTransaction: (work) => client.transaction((transaction) => work({
        query: (text, params = []) => transaction.query(text, [...params]),
      })),
      client: {
        query: (text, params = []) => client.query(text, [...params]),
      },
    });
  }

  function claimInput(overrides: Record<string, unknown> = {}) {
    return {
      effectId,
      now,
      leaseToken: "effect_lease_synthetic_6e_primary",
      leaseExpiresAt: new Date("2026-08-25T12:01:30.000Z"),
      ...overrides,
    };
  }

  it("claims pending, completes by lease CAS, and keeps terminal replay stable", async () => {
    const repo = repository();
    const result = await repo.claimEffect(claimInput());
    expect(result.status).toBe("claimed");
    if (result.status !== "claimed") return;
    expect(projectDownstreamEffectClaimV1(result.claim)).toEqual({
      effectId,
      leaseToken: "effect_lease_synthetic_6e_primary",
      effectType: "wake_provider_dependencies",
      payload: { schemaVersion: 1, verifiedPaymentEventId: paymentEventId },
      idempotencyKey: `payment_event:${paymentEventId}:wake_provider_dependencies`,
    });
    expect(projectDownstreamEffectClaimV1({ ...result.claim })).toBeNull();
    expect(() => JSON.stringify(result.claim)).toThrow(/must never be serialized/i);
    await expect(repo.completeClaim(result.claim, {
      now: new Date("2026-08-25T12:00:40.000Z"),
    })).resolves.toEqual({ status: "applied" });
    await expect(repo.claimEffect(claimInput())).resolves.toEqual({
      status: "processed",
    });
  });

  it("does not steal a live lease and reclaims an expired processing lease", async () => {
    const repo = repository();
    const first = await repo.claimEffect(claimInput());
    expect(first.status).toBe("claimed");
    await expect(repo.claimEffect(claimInput({
      leaseToken: "effect_lease_synthetic_6e_competing",
      now: new Date("2026-08-25T12:00:45.000Z"),
      leaseExpiresAt: new Date("2026-08-25T12:01:45.000Z"),
    }))).resolves.toEqual({ status: "busy" });

    const reclaimed = await repo.claimEffect(claimInput({
      leaseToken: "effect_lease_synthetic_6e_reclaimed",
      now: new Date("2026-08-25T12:01:31.000Z"),
      leaseExpiresAt: new Date("2026-08-25T12:02:31.000Z"),
    }));
    expect(reclaimed.status).toBe("claimed");
    const stored = await client.query(`
      SELECT status, attempt_count, lease_token FROM downstream_effects
      WHERE id = '${effectId}'
    `);
    expect(stored.rows).toEqual([{
      status: "processing",
      attempt_count: 2,
      lease_token: "effect_lease_synthetic_6e_reclaimed",
    }]);
  });

  it("fails by exact lease CAS and reclaims failed work with the error cleared", async () => {
    const repo = repository();
    const first = await repo.claimEffect(claimInput());
    if (first.status !== "claimed") throw new Error("expected effect claim");
    await expect(repo.failClaim(first.claim, {
      now: new Date("2026-08-25T12:00:40.000Z"),
      reason: "synthetic_sink_failure",
    })).resolves.toEqual({ status: "applied" });

    const second = await repo.claimEffect(claimInput({
      leaseToken: "effect_lease_synthetic_6e_retry",
    }));
    expect(second.status).toBe("claimed");
    const stored = await client.query(`
      SELECT status, attempt_count, last_error_redacted
      FROM downstream_effects WHERE id = '${effectId}'
    `);
    expect(stored.rows).toEqual([{
      status: "processing",
      attempt_count: 2,
      last_error_redacted: null,
    }]);
  });

  it("describes without claiming so disabled production delivery stays pending", async () => {
    await expect(repository().describeEffect(effectId)).resolves.toEqual({
      effectId,
      effectType: "wake_provider_dependencies",
      status: "pending",
    });
    const stored = await client.query(`SELECT status, attempt_count FROM downstream_effects`);
    expect(stored.rows).toEqual([{ status: "pending", attempt_count: 0 }]);
  });
});
