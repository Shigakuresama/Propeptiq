import { parseServerEnv } from "@/config/env-schema";

export type PostgresTestDatabaseTarget = Readonly<{
  mode: "postgres";
  url: string;
  isolated: true;
  description: string;
}>;

function decodedTargetScope(url: URL): string | null {
  try {
    return [url.username, url.hostname, url.pathname, url.search]
      .map((component) => decodeURIComponent(component))
      .join("|")
      .toLowerCase();
  } catch {
    return null;
  }
}

function looksLikeUnsafeSharedTarget(url: URL): boolean {
  const scope = decodedTargetScope(url);
  if (scope === null) return true;
  return /(^|[^a-z])(prod|production|live|main|shared)([^a-z]|$)/.test(scope);
}

function looksExplicitlyTestScoped(url: URL): boolean {
  const scope = decodedTargetScope(url);
  if (scope === null) return false;
  return /(^|[^a-z])(test|testing|isolated|ci|sandbox)([^a-z]|$)/.test(scope);
}

export function resolveTestDatabase(
  input: Record<string, string | undefined> = process.env,
): PostgresTestDatabaseTarget {
  if (!input.TEST_DATABASE_URL) {
    throw new Error("TEST_DATABASE_URL is required for database integration tests");
  }
  if (input.TEST_DATABASE_CONFIRMATION !== "isolated-test-database") {
    throw new Error(
      "TEST_DATABASE_CONFIRMATION=isolated-test-database is required before database access",
    );
  }
  const parsed = parseServerEnv({
    ...input,
    DATABASE_MODE: "test",
  });
  const value = parsed.TEST_DATABASE_URL;
  if (!value) {
    throw new Error("TEST_DATABASE_URL is required for database integration tests");
  }

  const url = new URL(value);
  if (looksLikeUnsafeSharedTarget(url) || !looksExplicitlyTestScoped(url)) {
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
