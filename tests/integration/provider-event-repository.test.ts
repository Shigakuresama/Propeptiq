import { createHash } from "node:crypto";

import type { PGlite } from "@electric-sql/pglite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { normalizeStripeProviderEventV1 } from "@/commerce/provider-events";
import {
  createProviderEventRepository,
  projectProviderEventClaimV1,
  type ProviderEventTransactionRunner,
} from "@/db/repositories/provider-event-repository";

import { createMigratedPglite } from "./helpers/pglite";

const ids = {
  event: "77000000-0000-4000-8000-000000000001",
  audit: "77000000-0000-4000-8000-000000000002",
} as const;
const receivedAt = new Date("2026-08-25T12:00:00.000Z");
const payloadHash = "a".repeat(64);

function normalized(providerEventId = "evt_synthetic_6e_inbox") {
  const result = normalizeStripeProviderEventV1({
    id: providerEventId,
    type: "customer.created",
    created: 1_787_659_200,
    livemode: false,
    data: { object: { arbitrary: "discard" } },
  });
  if (result.status !== "normalized") throw new Error("fixture normalization failed");
  return result;
}

function paidCheckoutNormalization() {
  const result = normalizeStripeProviderEventV1({
    id: "evt_synthetic_6e_fenced_checkout",
    type: "checkout.session.completed",
    created: 1_787_659_200,
    livemode: false,
    data: {
      object: {
        id: "cs_synthetic_6e_fenced_checkout",
        client_reference_id: "77000000-0000-4000-8000-000000000010",
        metadata: {
          orderId: "77000000-0000-4000-8000-000000000010",
          attemptId: "77000000-0000-4000-8000-000000000011",
        },
        payment_intent: "pi_synthetic_6e_fenced_checkout",
        amount_total: 1_000,
        currency: "usd",
        payment_status: "paid",
        status: "complete",
        livemode: false,
      },
    },
  });
  if (result.status !== "normalized") throw new Error("fenced fixture normalization failed");
  return result;
}

function advisoryFenceKey(identity: string): string {
  return createHash("sha256")
    .update(identity, "utf8")
    .digest()
    .readBigInt64BE(0)
    .toString();
}

describe("provider event Transaction A on PGlite", () => {
  let client: PGlite;

  beforeEach(async () => {
    client = await createMigratedPglite();
  });

  afterEach(async () => client.close());

  function repository(
    runTransaction: ProviderEventTransactionRunner = <Value>(
      work: (sql: { query: (text: string, params?: readonly unknown[]) => Promise<{ rows: unknown[] }> }) => Promise<Value>,
      options: Readonly<{
        isolationLevel: "serializable";
        providerIdentityFenceKeys: readonly string[];
      }>,
    ) => {
      if (options.isolationLevel !== "serializable") {
        throw new Error("provider event fixture requires serializable isolation");
      }
      return (
      client.transaction((transaction) =>
        work({
          query: (text, params = []) => transaction.query(text, [...params]),
        }),
      ));
    },
  ) {
    return createProviderEventRepository({ runSerializableTransaction: runTransaction });
  }

  function registration(overrides: Record<string, unknown> = {}) {
    return {
      provider: "stripe" as const,
      databaseEventId: ids.event,
      conflictAuditId: ids.audit,
      payloadHash,
      normalization: normalized(),
      receivedAt,
      claimAt: receivedAt,
      leaseToken: "lease_synthetic_6e_primary",
      leaseExpiresAt: new Date("2026-08-25T12:01:00.000Z"),
      ...overrides,
    };
  }

  it("registers and opaquely claims a new normalized delivery", async () => {
    const result = await repository().registerAndClaim(registration());
    expect(result.status).toBe("claimed");
    if (result.status !== "claimed") return;
    expect(projectProviderEventClaimV1(result.claim)).toEqual({
      databaseEventId: ids.event,
      leaseToken: "lease_synthetic_6e_primary",
      providerIdentityFenceKeys: [],
    });
    expect(projectProviderEventClaimV1({ ...result.claim })).toBeNull();
    expect(() => JSON.stringify(result.claim)).toThrow(/must never be serialized/i);

    const stored = await client.query(`
      SELECT provider, provider_event_id, payload_hash, status, attempt_count,
             lease_token, event_type, schema_version, normalized_payload,
             provider_created_at, livemode
      FROM provider_events WHERE id = '${ids.event}'
    `);
    expect(stored.rows).toMatchObject([{
      provider: "stripe",
      provider_event_id: "evt_synthetic_6e_inbox",
      payload_hash: payloadHash,
      status: "processing",
      attempt_count: 1,
      lease_token: "lease_synthetic_6e_primary",
      event_type: "customer.created",
      schema_version: 1,
      normalized_payload: { kind: "ignored" },
      livemode: false,
    }]);
  });

  it("carries an exact non-null opaque fence on a globally identified processing claim", async () => {
    const result = await repository().registerAndClaim(registration({
      normalization: paidCheckoutNormalization(),
    }));
    if (result.status !== "claimed") throw new Error("expected fenced claim");
    expect(projectProviderEventClaimV1(result.claim)).toEqual({
      databaseEventId: ids.event,
      leaseToken: "lease_synthetic_6e_primary",
      providerIdentityFenceKeys: [advisoryFenceKey(
        "stripe:payment_intent:pi_synthetic_6e_fenced_checkout",
      )],
    });
  });

  it("rejects a fabricated normalized envelope before any privacy-sensitive write", async () => {
    const legitimate = normalized();
    const fabricated = {
      ...legitimate,
      event: {
        ...legitimate.event,
        rawProviderJson: { email: "forbidden@example.test" },
      },
    } as unknown as typeof legitimate;

    await expect(repository().registerAndClaim(registration({
      normalization: fabricated,
    }))).rejects.toThrow(/normalized provider event/i);
    const stored = await client.query(`SELECT count(*)::int AS count FROM provider_events`);
    expect(stored.rows).toEqual([{ count: 0 }]);
  });

  it("rejects a fabricated known event disguised as normalized ignored input", async () => {
    const legitimate = normalized("evt_synthetic_6e_fabricated_known_ignored");
    const fabricated = {
      status: "normalized",
      event: {
        ...legitimate.event,
        eventType: "checkout.session.completed",
      },
    } as unknown as typeof legitimate;

    await expect(repository().registerAndClaim(registration({
      normalization: fabricated,
    }))).rejects.toThrow(/normalized provider event/i);
    const stored = await client.query(`SELECT count(*)::int AS count FROM provider_events`);
    expect(stored.rows).toEqual([{ count: 0 }]);
  });

  it("returns terminal replay without rewriting a processed or conflict row", async () => {
    const repo = repository();
    await repo.registerAndClaim(registration());
    await client.exec(`
      UPDATE provider_events
      SET status = 'processed', lease_token = NULL, lease_expires_at = NULL,
          processed_at = '2026-08-25T12:00:30.000Z'
      WHERE id = '${ids.event}'
    `);
    await expect(repo.registerAndClaim(registration({
      leaseToken: "lease_synthetic_6e_replay",
    }))).resolves.toEqual({ status: "processed" });

    await client.exec(`
      UPDATE provider_events
      SET status = 'conflict', processed_at = '2026-08-25T12:00:40.000Z',
          last_error_redacted = 'synthetic_conflict'
      WHERE id = '${ids.event}'
    `);
    await expect(repo.registerAndClaim(registration())).resolves.toEqual({
      status: "conflict",
    });
  });

  it("makes same-ID different-hash delivery terminal conflict with one redacted audit", async () => {
    const repo = repository();
    await repo.registerAndClaim(registration());
    const conflictInput = registration({
      payloadHash: "b".repeat(64),
      leaseToken: "lease_synthetic_6e_competing",
      claimAt: new Date("2026-08-25T12:00:10.000Z"),
      leaseExpiresAt: new Date("2026-08-25T12:01:10.000Z"),
    });
    await expect(repo.registerAndClaim(conflictInput)).resolves.toEqual({
      status: "conflict",
    });
    await expect(repo.registerAndClaim(conflictInput)).resolves.toEqual({
      status: "conflict",
    });

    const event = await client.query(`
      SELECT status, last_error_redacted, lease_token, processed_at
      FROM provider_events WHERE id = '${ids.event}'
    `);
    expect(event.rows).toMatchObject([{
      status: "conflict",
      last_error_redacted: "payload_hash_mismatch",
      lease_token: null,
    }]);
    const audits = await client.query(`SELECT action, resource_type, resource_id, metadata FROM admin_audit`);
    expect(audits.rows).toEqual([{
      action: "provider_event_conflict",
      resource_type: "provider_event",
      resource_id: ids.event,
      metadata: { schemaVersion: 1, reason: "payload_hash_mismatch" },
    }]);
  });

  it("reclaims pending, failed, deferred, and expired processing but not a live lease", async () => {
    const repo = repository();
    await repo.registerAndClaim(registration());

    const states = [
      { status: "pending", error: null },
      { status: "failed", error: "transient_failure" },
      { status: "deferred", error: "missing_verified_payment" },
    ] as const;
    let expectedAttempts = 1;
    for (const state of states) {
      await client.query(
        `UPDATE provider_events SET status = $1, lease_token = NULL,
          lease_expires_at = NULL, last_error_redacted = $2 WHERE id = $3`,
        [state.status, state.error, ids.event],
      );
      expectedAttempts += 1;
      const result = await repo.registerAndClaim(registration({
        claimAt: new Date(`2026-08-25T12:0${expectedAttempts}:00.000Z`),
        leaseToken: `lease_synthetic_6e_${state.status}`,
        leaseExpiresAt: new Date(`2026-08-25T12:0${expectedAttempts + 1}:00.000Z`),
      }));
      expect(result.status).toBe("claimed");
      const stored = await client.query(
        `SELECT status, attempt_count, last_error_redacted FROM provider_events WHERE id = $1`,
        [ids.event],
      );
      expect(stored.rows).toEqual([{
        status: "processing",
        attempt_count: expectedAttempts,
        last_error_redacted: null,
      }]);
    }

    await expect(repo.registerAndClaim(registration({
      claimAt: new Date("2026-08-25T12:04:30.000Z"),
      leaseToken: "lease_synthetic_6e_busy",
      leaseExpiresAt: new Date("2026-08-25T12:05:30.000Z"),
    }))).resolves.toEqual({ status: "busy" });

    const expired = await repo.registerAndClaim(registration({
      claimAt: new Date("2026-08-25T12:06:01.000Z"),
      leaseToken: "lease_synthetic_6e_expired_reclaim",
      leaseExpiresAt: new Date("2026-08-25T12:07:01.000Z"),
    }));
    expect(expired.status).toBe("claimed");
    const stored = await client.query(`SELECT attempt_count, lease_token FROM provider_events WHERE id = '${ids.event}'`);
    expect(stored.rows).toEqual([{
      attempt_count: 5,
      lease_token: "lease_synthetic_6e_expired_reclaim",
    }]);
  });

  it("stores a known malformed event directly as terminal conflict without a claim", async () => {
    const malformed = normalizeStripeProviderEventV1({
      id: "evt_synthetic_6e_malformed",
      type: "checkout.session.completed",
      created: 1_787_659_200,
      livemode: false,
      data: { object: {} },
    });
    expect(malformed.status).toBe("conflict");
    await expect(repository().registerAndClaim(registration({
      normalization: malformed,
    }))).resolves.toEqual({ status: "conflict" });
    const stored = await client.query(`
      SELECT status, attempt_count, last_error_redacted, normalized_payload
      FROM provider_events WHERE id = '${ids.event}'
    `);
    expect(stored.rows).toMatchObject([{
      status: "conflict",
      attempt_count: 1,
      last_error_redacted: "malformed_known_event",
      normalized_payload: { kind: "ignored" },
    }]);
  });

  it("retries the whole serializable transaction at most three times", async () => {
    let attempts = 0;
    const runTransaction = async <Value>(
      work: (sql: { query: (text: string, params?: readonly unknown[]) => Promise<{ rows: unknown[] }> }) => Promise<Value>,
      options: Readonly<{
        isolationLevel: "serializable";
        providerIdentityFenceKeys: readonly string[];
      }>,
    ) => {
      expect(options).toEqual({
        isolationLevel: "serializable",
        providerIdentityFenceKeys: [],
      });
      attempts += 1;
      if (attempts < 3) throw Object.assign(new Error("synthetic serialization"), { code: attempts === 1 ? "40001" : "40P01" });
      return client.transaction((transaction) => work({
        query: (text, params = []) => transaction.query(text, [...params]),
      }));
    };
    await expect(repository(runTransaction).registerAndClaim(registration())).resolves.toMatchObject({
      status: "claimed",
    });
    expect(attempts).toBe(3);
  });

  it("marks only the still-owned processing lease failed by short CAS", async () => {
    const repo = repository();
    const registered = await repo.registerAndClaim(registration());
    if (registered.status !== "claimed") throw new Error("expected claim");
    await expect(repo.markClaimFailed(registered.claim, {
      now: new Date("2026-08-25T12:00:30.000Z"),
      reason: "provider_event_processing_failed",
    })).resolves.toEqual({ status: "applied" });
    await expect(repo.markClaimFailed(registered.claim, {
      now: new Date("2026-08-25T12:00:40.000Z"),
      reason: "provider_event_processing_failed",
    })).resolves.toEqual({ status: "lease_lost" });
    const stored = await client.query(`
      SELECT status, lease_token, last_error_redacted, processed_at
      FROM provider_events WHERE id = '${ids.event}'
    `);
    expect(stored.rows).toEqual([{
      status: "failed",
      lease_token: null,
      last_error_redacted: "provider_event_processing_failed",
      processed_at: null,
    }]);
  });
});
