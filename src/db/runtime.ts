import "server-only";

import type { PoolClient, QueryResultRow } from "pg";

import type { ServerEnv } from "@/config/env-schema";
import { preparePostgresConnectionUrl } from "@/db/postgres-connection-url";

export type RuntimeDatabaseClient = Readonly<{
  query: <T extends QueryResultRow>(
    sql: string,
    params?: readonly unknown[],
  ) => Promise<Readonly<{ rows: T[] }>>;
}>;

export type RuntimeDatabaseSession = RuntimeDatabaseClient & Readonly<{
  release: (destroy?: boolean) => void;
}>;

let poolPromise: Promise<import("pg").Pool> | null = null;
let poolUrl: string | null = null;

function databaseUrl(environment: ServerEnv): string {
  if (environment.DATABASE_MODE === "test" && environment.TEST_DATABASE_URL) {
    return environment.TEST_DATABASE_URL;
  }
  if (environment.DATABASE_MODE === "live" && environment.DATABASE_URL) {
    return environment.DATABASE_URL;
  }
  throw new Error("Database mode is disabled or incomplete");
}

async function getPool(environment: ServerEnv): Promise<import("pg").Pool> {
  const url = preparePostgresConnectionUrl(databaseUrl(environment));
  if (poolPromise && poolUrl !== url) {
    throw new Error("Runtime database target changed after initialization");
  }
  if (!poolPromise) {
    poolUrl = url;
    poolPromise = import("pg").then(
      ({ Pool }) =>
        new Pool({
          connectionString: url,
          max: 10,
          idleTimeoutMillis: 10_000,
          connectionTimeoutMillis: 5_000,
          allowExitOnIdle: true,
        }),
    );
  }
  return poolPromise;
}

function asQueryPort(client: PoolClient): RuntimeDatabaseClient {
  return {
    async query<T extends QueryResultRow>(
      sql: string,
      params: readonly unknown[] = [],
    ) {
      const result = await client.query<T>(sql, [...params]);
      return { rows: result.rows };
    },
  };
}

export async function connectRuntimeDatabaseSession(
  environment: ServerEnv,
): Promise<RuntimeDatabaseSession> {
  const pool = await getPool(environment);
  const client = await pool.connect();
  const queryPort = asQueryPort(client);
  return Object.freeze({
    query: queryPort.query,
    release(destroy = false) {
      client.release(destroy);
    },
  });
}

export async function withRuntimeTransaction<T>(
  environment: ServerEnv,
  work: (client: RuntimeDatabaseClient) => Promise<T>,
  options: Readonly<{ isolationLevel?: "read committed" | "serializable" }> = {},
): Promise<T> {
  const pool = await getPool(environment);
  const client = await pool.connect();
  try {
    await client.query(
      options.isolationLevel === "serializable"
        ? "BEGIN ISOLATION LEVEL SERIALIZABLE"
        : "BEGIN",
    );
    const result = await work(asQueryPort(client));
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
