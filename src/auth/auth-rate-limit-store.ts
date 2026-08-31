import type { RateLimitStore } from "@/security/rate-limit";

type AuthRateLimitSqlClient = Readonly<{
  query: <T extends object>(
    sql: string,
    params?: unknown[],
  ) => Promise<Readonly<{ rows: T[] }>>;
}>;

/**
 * Auth rate limits deliberately live outside both the provider-owned
 * `neon_auth` schema and the source-only commerce migration chain.
 */
export function createAuthPostgresRateLimitStore(
  client: AuthRateLimitSqlClient,
): RateLimitStore {
  return {
    async increment(window) {
      const result = await client.query<{ count: number }>(
        `
          WITH expired AS (
            SELECT scope_hash, window_start
            FROM propeptiq_auth.rate_limit_windows
            WHERE expires_at <= now()
            ORDER BY expires_at
            LIMIT 64
            FOR UPDATE SKIP LOCKED
          ), pruned AS (
            DELETE FROM propeptiq_auth.rate_limit_windows AS target
            USING expired
            WHERE target.scope_hash = expired.scope_hash
              AND target.window_start = expired.window_start
          )
          INSERT INTO propeptiq_auth.rate_limit_windows
            (scope_hash, window_start, count, expires_at)
          VALUES ($1, $2::timestamptz, 1, $3::timestamptz)
          ON CONFLICT (scope_hash, window_start) DO UPDATE
          SET count = propeptiq_auth.rate_limit_windows.count + 1,
              expires_at = EXCLUDED.expires_at
          RETURNING count
        `,
        [
          window.scopeHash,
          window.windowStart.toISOString(),
          window.expiresAt.toISOString(),
        ],
      );
      const count = result.rows[0]?.count;
      if (!Number.isSafeInteger(count) || (count ?? 0) <= 0) {
        throw new Error("Auth rate-limit counter update failed");
      }
      return count!;
    },
  };
}
