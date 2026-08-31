type PostgresConnectionOptions = Readonly<{
  requirePersistentSession?: boolean;
}>;

export function preparePostgresConnectionUrl(
  input: string,
  options: PostgresConnectionOptions = {},
): string {
  let databaseUrl: URL;
  try {
    databaseUrl = new URL(input);
  } catch {
    throw new Error("Invalid PostgreSQL connection URL");
  }

  const usesNeonPooler = /-pooler(?:\.|$)/i.test(databaseUrl.hostname);
  const declaresPgBouncer =
    databaseUrl.searchParams.get("pgbouncer")?.toLowerCase() === "true";
  if (
    options.requirePersistentSession &&
    (usesNeonPooler || declaresPgBouncer)
  ) {
    throw new Error(
      "Better Auth requires a direct Neon database URL so neon_auth remains the active search path",
    );
  }

  const sslMode = databaseUrl.searchParams.get("sslmode")?.toLowerCase();
  if (
    sslMode === "prefer" ||
    sslMode === "require" ||
    sslMode === "verify-ca"
  ) {
    databaseUrl.searchParams.set("sslmode", "verify-full");
    return databaseUrl.toString();
  }
  return input;
}
