import "server-only";

import type { RuntimeDatabaseSession } from "@/db/runtime";

export type ContactDeliveryStore = Readonly<{
  reserve: (key: string, requestHash: string, now: Date) => Promise<"reserved" | "accepted" | "pending" | "conflict">;
  accept: (key: string, requestHash: string, providerId: string, now: Date) => Promise<boolean>;
  reject: (key: string, requestHash: string) => Promise<void>;
}>;

export function createPostgresContactDeliveryStore(session: RuntimeDatabaseSession): ContactDeliveryStore {
  return Object.freeze({
    async reserve(key, requestHash, now) {
      await session.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [key]);
      const existing = await session.query<{ requestHash: string; status: string }>(
        `SELECT request_hash AS "requestHash", status FROM public.contact_email_deliveries WHERE idempotency_key = $1 FOR UPDATE`, [key]);
      const row = existing.rows[0];
      if (row) {
        if (row.requestHash !== requestHash) return "conflict";
        return row.status === "accepted" ? "accepted" : "pending";
      }
      const inserted = await session.query<{ key: string }>(
        `INSERT INTO public.contact_email_deliveries (idempotency_key, request_hash, status, created_at, updated_at)
         VALUES ($1, $2, 'pending', $3::timestamptz, $3::timestamptz)
         ON CONFLICT DO NOTHING RETURNING idempotency_key AS key`, [key, requestHash, now.toISOString()]);
      return inserted.rows[0]?.key === key ? "reserved" : "pending";
    },
    async accept(key, requestHash, providerId, now) {
      const result = await session.query<{ key: string }>(
        `UPDATE public.contact_email_deliveries SET status = 'accepted', provider_id = $3, updated_at = $4::timestamptz
         WHERE idempotency_key = $1 AND request_hash = $2 AND status = 'pending' RETURNING idempotency_key AS key`,
        [key, requestHash, providerId, now.toISOString()]);
      return result.rows[0]?.key === key;
    },
    async reject(key, requestHash) {
      await session.query(`DELETE FROM public.contact_email_deliveries WHERE idempotency_key = $1 AND request_hash = $2 AND status = 'pending'`, [key, requestHash]);
    },
  });
}
