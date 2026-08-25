type OriginEnvironment = Readonly<{
  APP_ENV: "local" | "preview" | "production";
  APP_ORIGIN?: string;
}>;

function isLocalHostname(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]"
  );
}

export function assertMutationOrigin(
  request: Request,
  environment: OriginEnvironment,
): void {
  const suppliedOrigin = request.headers.get("origin");
  if (!suppliedOrigin || !URL.canParse(suppliedOrigin)) {
    throw new Error("Mutation origin is required");
  }

  const requestOrigin = new URL(request.url).origin;
  const expectedOrigin = environment.APP_ORIGIN
    ? new URL(environment.APP_ORIGIN).origin
    : requestOrigin;
  const normalizedSuppliedOrigin = new URL(suppliedOrigin).origin;
  if (
    normalizedSuppliedOrigin !== expectedOrigin ||
    requestOrigin !== expectedOrigin
  ) {
    throw new Error("Mutation origin does not match APP_ORIGIN");
  }
  if (
    environment.APP_ENV === "local" &&
    !environment.APP_ORIGIN &&
    !isLocalHostname(new URL(expectedOrigin).hostname)
  ) {
    throw new Error("Local mutation origins must use localhost");
  }
}
