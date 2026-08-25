import { parseServerEnv } from "@/config/env-schema";

export type PostgresTestDatabaseTarget = Readonly<{
  mode: "postgres";
  url: string;
  isolated: true;
  description: string;
}>;

function looksLikeUnsafeSharedTarget(url: URL): boolean {
  const scope = [url.username, url.hostname, url.pathname, url.search]
    .join("|")
    .toLowerCase();
  return /(^|[^a-z])(prod|production|live|main)([^a-z]|$)/.test(scope);
}

export function resolveTestDatabase(
  input: Record<string, string | undefined> = process.env,
): PostgresTestDatabaseTarget {
  const parsed = parseServerEnv({
    ...input,
    DATABASE_MODE: "test",
  });
  const value = parsed.TEST_DATABASE_URL;
  if (!value) {
    throw new Error("TEST_DATABASE_URL is required for database integration tests");
  }

  const url = new URL(value);
  if (looksLikeUnsafeSharedTarget(url)) {
    throw new Error(
      "TEST_DATABASE_URL is not an acceptable isolated test target",
    );
  }

  return Object.freeze({
    mode: "postgres",
    url: value,
    isolated: true,
    description: `postgres://${url.hostname}${url.port ? `:${url.port}` : ""}${url.pathname}`,
  });
}
