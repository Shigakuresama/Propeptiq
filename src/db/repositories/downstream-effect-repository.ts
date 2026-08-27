import "server-only";

import { isCanonicalUuid } from "@/commerce/checkout-identity";

export type DownstreamEffectSqlClient = Readonly<{
  query: (
    sql: string,
    parameters?: readonly unknown[],
  ) => Promise<Readonly<{ rows: unknown[] }>>;
}>;

export type DownstreamEffectClaimV1 = Readonly<{
  toJSON: () => never;
}>;

export type DownstreamEffectDeliveryV1 = Readonly<{
  effectType: string;
  payload: unknown;
  idempotencyKey: string;
}>;

export type DownstreamEffectClaimProjectionV1 = Readonly<{
  effectId: string;
  leaseToken: string;
  effectType: string;
  payload: unknown;
  idempotencyKey: string;
}>;

export type DownstreamEffectRepository = Readonly<{
  describeEffect: (effectId: string) => Promise<Readonly<{
    effectId: string;
    effectType: string;
    status: "pending" | "processing" | "processed" | "failed";
  }> | null>;
  claimEffect: (input: Readonly<{
    effectId: string;
    now: Date;
    leaseToken: string;
    leaseExpiresAt: Date;
  }>) => Promise<
    | Readonly<{
        status: "claimed";
        claim: DownstreamEffectClaimV1;
        delivery: DownstreamEffectDeliveryV1;
      }>
    | Readonly<{ status: "busy" | "processed" | "missing" }>
  >;
  completeClaim: (
    claim: DownstreamEffectClaimV1,
    input: Readonly<{ now: Date }>,
  ) => Promise<Readonly<{ status: "applied" | "lease_lost" }>>;
  failClaim: (
    claim: DownstreamEffectClaimV1,
    input: Readonly<{ now: Date; reason: string }>,
  ) => Promise<Readonly<{ status: "applied" | "lease_lost" }>>;
}>;

type EffectRow = Readonly<{
  id: string;
  effectType: string;
  payload: unknown;
  idempotencyKey: string;
  status: "pending" | "processing" | "processed" | "failed";
  attemptCount: number | string;
  leaseToken: string | null;
  leaseExpiresAt: Date | string | null;
}>;

const claims = new WeakMap<object, DownstreamEffectClaimProjectionV1>();
const BOUNDED_TEXT = /^[\x20-\x7e]{1,255}$/u;

function resultRows<Row>(result: Readonly<{ rows: unknown[] }>): Row[] {
  return result.rows as Row[];
}

function mintClaim(row: EffectRow, leaseToken: string): Readonly<{
  claim: DownstreamEffectClaimV1;
  delivery: DownstreamEffectDeliveryV1;
}> {
  const projection = Object.freeze({
    effectId: row.id,
    leaseToken,
    effectType: row.effectType,
    payload: row.payload,
    idempotencyKey: row.idempotencyKey,
  });
  const claim = Object.freeze({
    toJSON(): never {
      throw new Error("Downstream effect claims must never be serialized");
    },
  });
  claims.set(claim, projection);
  return Object.freeze({
    claim,
    delivery: Object.freeze({
      effectType: projection.effectType,
      payload: projection.payload,
      idempotencyKey: projection.idempotencyKey,
    }),
  });
}

export function projectDownstreamEffectClaimV1(
  value: unknown,
): DownstreamEffectClaimProjectionV1 | null {
  return typeof value === "object" && value !== null
    ? claims.get(value) ?? null
    : null;
}

function validClaimInput(input: Readonly<{
  effectId: string;
  now: Date;
  leaseToken: string;
  leaseExpiresAt: Date;
}>): boolean {
  return (
    isCanonicalUuid(input.effectId) &&
    BOUNDED_TEXT.test(input.leaseToken) &&
    Number.isFinite(input.now.getTime()) &&
    Number.isFinite(input.leaseExpiresAt.getTime()) &&
    input.leaseExpiresAt > input.now
  );
}

export function createDownstreamEffectRepository(dependencies: Readonly<{
  client: DownstreamEffectSqlClient;
  runTransaction: <Value>(
    work: (client: DownstreamEffectSqlClient) => Promise<Value>,
  ) => Promise<Value>;
}>): DownstreamEffectRepository {
  return Object.freeze({
    async describeEffect(effectId) {
      if (!isCanonicalUuid(effectId)) return null;
      const found = resultRows<EffectRow>(await dependencies.client.query(
        `SELECT id::text AS id, effect_type AS "effectType", payload,
                idempotency_key AS "idempotencyKey", status,
                attempt_count AS "attemptCount", lease_token AS "leaseToken",
                lease_expires_at AS "leaseExpiresAt"
         FROM downstream_effects WHERE id = $1::uuid`,
        [effectId],
      ));
      const row = found[0];
      return row === undefined || found.length !== 1
        ? null
        : Object.freeze({
            effectId: row.id,
            effectType: row.effectType,
            status: row.status,
          });
    },
    claimEffect(input) {
      if (!validClaimInput(input)) {
        return Promise.resolve(Object.freeze({ status: "missing" as const }));
      }
      return dependencies.runTransaction(async (client) => {
        const found = resultRows<EffectRow>(await client.query(
          `SELECT id::text AS id, effect_type AS "effectType", payload,
                  idempotency_key AS "idempotencyKey", status,
                  attempt_count AS "attemptCount", lease_token AS "leaseToken",
                  lease_expires_at AS "leaseExpiresAt"
           FROM downstream_effects WHERE id = $1::uuid FOR UPDATE`,
          [input.effectId],
        ));
        const row = found[0];
        if (row === undefined || found.length !== 1) {
          return Object.freeze({ status: "missing" as const });
        }
        if (row.status === "processed") {
          return Object.freeze({ status: "processed" as const });
        }
        if (
          row.status === "processing" &&
          row.leaseExpiresAt !== null &&
          new Date(row.leaseExpiresAt).getTime() > input.now.getTime()
        ) {
          return Object.freeze({ status: "busy" as const });
        }
        const updated = resultRows<EffectRow>(await client.query(
          `UPDATE downstream_effects
           SET status = 'processing', attempt_count = attempt_count + 1,
               lease_token = $2, lease_expires_at = $3, updated_at = $4,
               processed_at = NULL, last_error_redacted = NULL
           WHERE id = $1::uuid
           RETURNING id::text AS id, effect_type AS "effectType", payload,
                     idempotency_key AS "idempotencyKey", status,
                     attempt_count AS "attemptCount", lease_token AS "leaseToken",
                     lease_expires_at AS "leaseExpiresAt"`,
          [input.effectId, input.leaseToken, input.leaseExpiresAt, input.now],
        ));
        const claimed = updated[0];
        if (claimed === undefined) return Object.freeze({ status: "missing" as const });
        const minted = mintClaim(claimed, input.leaseToken);
        return Object.freeze({
          status: "claimed" as const,
          claim: minted.claim,
          delivery: minted.delivery,
        });
      });
    },
    async completeClaim(claim, input) {
      const projection = projectDownstreamEffectClaimV1(claim);
      if (projection === null || !Number.isFinite(input.now.getTime())) {
        return Object.freeze({ status: "lease_lost" });
      }
      return dependencies.runTransaction(async (client) => {
        const updated = await client.query(
          `UPDATE downstream_effects
           SET status = 'processed', lease_token = NULL, lease_expires_at = NULL,
               processed_at = $3, updated_at = $3, last_error_redacted = NULL
           WHERE id = $1::uuid AND status = 'processing' AND lease_token = $2
           RETURNING id`,
          [projection.effectId, projection.leaseToken, input.now],
        );
        return Object.freeze({
          status: updated.rows.length === 1 ? "applied" as const : "lease_lost" as const,
        });
      });
    },
    async failClaim(claim, input) {
      const projection = projectDownstreamEffectClaimV1(claim);
      if (
        projection === null ||
        !Number.isFinite(input.now.getTime()) ||
        !BOUNDED_TEXT.test(input.reason)
      ) {
        return Object.freeze({ status: "lease_lost" });
      }
      return dependencies.runTransaction(async (client) => {
        const updated = await client.query(
          `UPDATE downstream_effects
           SET status = 'failed', lease_token = NULL, lease_expires_at = NULL,
               processed_at = NULL, updated_at = $3, last_error_redacted = $4
           WHERE id = $1::uuid AND status = 'processing' AND lease_token = $2
           RETURNING id`,
          [projection.effectId, projection.leaseToken, input.now, input.reason],
        );
        return Object.freeze({
          status: updated.rows.length === 1 ? "applied" as const : "lease_lost" as const,
        });
      });
    },
  });
}
