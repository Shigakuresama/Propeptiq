type PostgresConnectionOptions = Readonly<{
  requirePersistentSession?: boolean;
}>;

function isLoopbackHostname(hostname: string): boolean {
  return (
    hostname.toLowerCase() === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]" ||
    hostname === "::1"
  );
}

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

  if (isLoopbackHostname(databaseUrl.hostname)) return input;

  const sslMode = databaseUrl.searchParams.get("sslmode")?.toLowerCase();
  if (sslMode === "verify-full") return input;
  if (
    sslMode === "disable" ||
    sslMode === "allow" ||
    sslMode === "no-verify"
  ) {
    throw new Error("Remote PostgreSQL connection URL must use verified TLS");
  }

  databaseUrl.searchParams.set("sslmode", "verify-full");
  return databaseUrl.toString();
}
