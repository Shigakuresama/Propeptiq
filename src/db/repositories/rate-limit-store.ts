import type { RateLimitStore } from "@/security/rate-limit";

type RateLimitSqlClient = Readonly<{
  query: <T extends object>(
    sql: string,
    params?: unknown[],
  ) => Promise<Readonly<{ rows: T[] }>>;
}>;

export function createPostgresRateLimitStore(
  client: RateLimitSqlClient,
): RateLimitStore {
  return {
    async increment(window) {
      const result = await client.query<{ count: number }>(
        `
          INSERT INTO public.rate_limit_windows
            (scope_hash, window_start, count, expires_at)
          VALUES ($1, $2::timestamptz, 1, $3::timestamptz)
          ON CONFLICT (scope_hash, window_start) DO UPDATE
          SET count = public.rate_limit_windows.count + 1,
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
        throw new Error("Rate-limit counter update failed");
      }
      return count!;
    },
  };
}
