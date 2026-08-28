import { z } from "zod";

const capabilityMode = z.enum(["disabled", "test", "live"]);
const appEnvironment = z.enum(["local", "preview", "production"]);
const catalogDemoMode = z.enum(["disabled", "enabled"]);
const localTestDriver = z.enum(["disabled", "enabled"]);
const vercelEnvironment = z.enum(["development", "preview", "production"]);
const nonBlank = z.string().trim().min(1);
const stripeAccountId = z.string().min(1).refine(
  (value) =>
    value === value.trim() && /^acct_[A-Za-z0-9]{8,64}$/u.test(value),
  { message: "Expected a Stripe acct_ account ID" },
);
const urlValue = nonBlank.pipe(z.url());
const postgresUrl = urlValue.refine(
  (value) => {
    if (!URL.canParse(value)) {
      return false;
    }

    const protocol = new URL(value).protocol;
    return protocol === "postgres:" || protocol === "postgresql:";
  },
  { message: "Expected a postgres:// or postgresql:// URL" },
);

const rawServerEnvSchema = z.object({
  APP_ENV: appEnvironment.default("local"),
  APP_ORIGIN: urlValue.optional(),
  CATALOG_DEMO_MODE: catalogDemoMode.default("disabled"),
  BROWSE_CATALOG_PUBLICATION: nonBlank.optional(),
  LOCAL_TEST_DRIVER: localTestDriver.default("disabled"),
  LOCAL_TEST_SECRET: z.string().min(32).optional(),
  RATE_LIMIT_SECRET: z.string().min(32).optional(),
  VERCEL_ENV: vercelEnvironment.optional(),
  VERCEL_TARGET_ENV: nonBlank.optional(),
  AUTH_MODE: capabilityMode.default("disabled"),
  DATABASE_MODE: capabilityMode.default("disabled"),
  PAYMENTS_MODE: capabilityMode.default("disabled"),
  STORAGE_MODE: capabilityMode.default("disabled"),
  EMAIL_MODE: capabilityMode.default("disabled"),
  COMMERCE_LIVE_CAPABILITY: z.enum(["disabled", "enabled"]).default("disabled"),
  PAYMENTS_LIVE_CAPABILITY: z.enum(["disabled", "enabled"]).default("disabled"),
  TAX_MODE: capabilityMode.default("disabled"),
  SHIPPING_MODE: capabilityMode.default("disabled"),
  FULFILLMENT_MODE: capabilityMode.default("disabled"),
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: nonBlank.optional(),
  CLERK_SECRET_KEY: nonBlank.optional(),
  CLERK_WEBHOOK_SIGNING_SECRET: nonBlank.optional(),
  DATABASE_URL: postgresUrl.optional(),
  DATABASE_MIGRATION_URL: postgresUrl.optional(),
  TEST_DATABASE_URL: postgresUrl.optional(),
  TEST_DATABASE_CONFIRMATION: z.literal("isolated-test-database").optional(),
  STRIPE_ACCOUNT_ID: stripeAccountId.optional(),
  STRIPE_SECRET_KEY: nonBlank.optional(),
  STRIPE_WEBHOOK_SECRET: nonBlank.optional(),
  BLOB_READ_WRITE_TOKEN: nonBlank.optional(),
  RESEND_API_KEY: nonBlank.optional(),
  RESEND_FROM: nonBlank.pipe(z.email()).optional(),
  OTEL_SERVICE_NAME: nonBlank.default("propeptiq-labs"),
});

export type ServerEnv = z.infer<typeof rawServerEnvSchema>;

export function hasProductionIdentity(
  environment: Pick<
    ServerEnv,
    "APP_ENV" | "VERCEL_ENV" | "VERCEL_TARGET_ENV"
  >,
): boolean {
  return (
    environment.APP_ENV === "production" ||
    environment.VERCEL_ENV === "production" ||
    environment.VERCEL_TARGET_ENV?.trim().toLowerCase() === "production"
  );
}

const modeKeys = [
  "AUTH_MODE",
  "DATABASE_MODE",
  "PAYMENTS_MODE",
  "STORAGE_MODE",
  "EMAIL_MODE",
  "TAX_MODE",
  "SHIPPING_MODE",
  "FULFILLMENT_MODE",
] as const satisfies ReadonlyArray<keyof ServerEnv>;

function addRequiredIssue(
  context: z.core.$RefinementCtx<ServerEnv>,
  field: keyof ServerEnv,
  modeField: (typeof modeKeys)[number],
) {
  context.addIssue({
    code: "custom",
    path: [field],
    message: `${String(field)} is required when ${modeField} is enabled`,
  });
}

function requireFields(
  env: ServerEnv,
  context: z.core.$RefinementCtx<ServerEnv>,
  modeField: (typeof modeKeys)[number],
  fields: ReadonlyArray<keyof ServerEnv>,
) {
  if (env[modeField] === "disabled") {
    return;
  }

  for (const field of fields) {
    if (!env[field]) {
      addRequiredIssue(context, field, modeField);
    }
  }
}

function normalizeHostname(hostname: string): string {
  let normalized = hostname.toLowerCase().replace(/\.+$/, "");
  if (normalized.startsWith("[") && normalized.endsWith("]")) {
    normalized = normalized.slice(1, -1);
  }
  return normalized;
}

function isIpv4Literal(hostname: string): boolean {
  const parts = hostname.split(".");
  if (parts.length !== 4 || parts.some((part) => !/^\d+$/.test(part))) {
    return false;
  }

  const octets = parts.map(Number);
  return octets.every((octet) => octet >= 0 && octet <= 255);
}

function isUnsafeDeploymentHost(hostname: string): boolean {
  const normalized = normalizeHostname(hostname);
  if (
    normalized === "localhost" ||
    normalized.endsWith(".localhost") ||
    normalized.endsWith(".local") ||
    normalized.endsWith(".internal") ||
    normalized.includes(":") ||
    isIpv4Literal(normalized)
  ) {
    return true;
  }

  return false;
}

function looksProductionScopedDatabase(value: string): boolean {
  const url = new URL(value);
  const scope = [url.username, url.hostname, url.pathname, url.search]
    .join("|")
    .toLowerCase();
  return /(^|[^a-z])(prod|production|live)([^a-z]|$)/.test(scope);
}

const serverEnvSchema = rawServerEnvSchema.superRefine((env, context) => {
  const productionDeployment = hasProductionIdentity(env);

  const deploymentIdentityIsInconsistent =
    (productionDeployment && env.APP_ENV !== "production") ||
    (env.APP_ENV === "production" &&
      ((env.VERCEL_ENV !== undefined && env.VERCEL_ENV !== "production") ||
        (env.VERCEL_TARGET_ENV !== undefined &&
          env.VERCEL_TARGET_ENV.trim().toLowerCase() !== "production")));
  if (deploymentIdentityIsInconsistent) {
    context.addIssue({
      code: "custom",
      path: ["APP_ENV"],
      message: "Production deployment identity is inconsistent",
    });
  }

  if (env.CATALOG_DEMO_MODE === "enabled" && productionDeployment) {
    context.addIssue({
      code: "custom",
      path: ["CATALOG_DEMO_MODE"],
      message: "CATALOG_DEMO_MODE cannot be enabled for a production identity",
    });
  }

  if (env.LOCAL_TEST_DRIVER === "enabled") {
    if (
      env.APP_ENV !== "local" ||
      productionDeployment ||
      (env.VERCEL_ENV !== undefined && env.VERCEL_ENV !== "development") ||
      (env.VERCEL_TARGET_ENV !== undefined &&
        env.VERCEL_TARGET_ENV.trim().toLowerCase() !== "development")
    ) {
      context.addIssue({
        code: "custom",
        path: ["LOCAL_TEST_DRIVER"],
        message:
          "LOCAL_TEST_DRIVER is permitted only for an explicit local development identity",
      });
    }
    if (!env.LOCAL_TEST_SECRET) {
      context.addIssue({
        code: "custom",
        path: ["LOCAL_TEST_SECRET"],
        message:
          "LOCAL_TEST_SECRET is required when LOCAL_TEST_DRIVER is enabled",
      });
    }
  }

  if (
    (env.AUTH_MODE !== "disabled" || env.LOCAL_TEST_DRIVER === "enabled") &&
    !env.RATE_LIMIT_SECRET
  ) {
    context.addIssue({
      code: "custom",
      path: ["RATE_LIMIT_SECRET"],
      message:
        "RATE_LIMIT_SECRET is required when an identity adapter is enabled",
    });
  }

  requireFields(env, context, "AUTH_MODE", [
    "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
    "CLERK_SECRET_KEY",
  ]);
  if (env.DATABASE_MODE === "test") {
    requireFields(env, context, "DATABASE_MODE", [
      "TEST_DATABASE_URL",
      "TEST_DATABASE_CONFIRMATION",
    ]);
    if (
      env.TEST_DATABASE_URL &&
      looksProductionScopedDatabase(env.TEST_DATABASE_URL)
    ) {
      context.addIssue({
        code: "custom",
        path: ["TEST_DATABASE_URL"],
        message: "TEST_DATABASE_URL appears production-scoped",
      });
    }
  } else if (env.DATABASE_MODE === "live") {
    requireFields(env, context, "DATABASE_MODE", ["DATABASE_URL"]);
  }
  requireFields(env, context, "PAYMENTS_MODE", [
    "STRIPE_ACCOUNT_ID",
    "STRIPE_SECRET_KEY",
    "STRIPE_WEBHOOK_SECRET",
  ]);
  requireFields(env, context, "STORAGE_MODE", ["BLOB_READ_WRITE_TOKEN"]);
  requireFields(env, context, "EMAIL_MODE", ["RESEND_API_KEY", "RESEND_FROM"]);

  if ((env.APP_ENV !== "local" || productionDeployment) && !env.APP_ORIGIN) {
    addRequiredIssue(context, "APP_ORIGIN", "AUTH_MODE");
  }

  if ((env.APP_ENV !== "local" || productionDeployment) && env.APP_ORIGIN) {
    const origin = new URL(env.APP_ORIGIN);
    if (
      origin.protocol !== "https:" ||
      isUnsafeDeploymentHost(origin.hostname)
    ) {
      context.addIssue({
        code: "custom",
        path: ["APP_ORIGIN"],
        message: "Preview and production require a secure non-local APP_ORIGIN",
      });
    }
  }

  if (productionDeployment) {
    for (const modeKey of modeKeys) {
      if (env[modeKey] === "test") {
        context.addIssue({
          code: "custom",
          path: [modeKey],
          message: `${modeKey} test mode is not permitted in production`,
        });
      }
    }
  }

  for (const modeKey of modeKeys) {
    if (env[modeKey] === "live" && !productionDeployment) {
      context.addIssue({
        code: "custom",
        path: [modeKey],
        message: `${modeKey}=live requires APP_ENV=production`,
      });
    }
  }

  if (env.AUTH_MODE === "test") {
    if (!env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.startsWith("pk_test_")) {
      context.addIssue({
        code: "custom",
        path: ["NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"],
        message: "AUTH_MODE=test requires a Clerk test publishable key",
      });
    }
    if (!env.CLERK_SECRET_KEY?.startsWith("sk_test_")) {
      context.addIssue({
        code: "custom",
        path: ["CLERK_SECRET_KEY"],
        message: "AUTH_MODE=test requires a Clerk test secret key",
      });
    }
  }

  if (env.AUTH_MODE === "live") {
    if (!env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.startsWith("pk_live_")) {
      context.addIssue({
        code: "custom",
        path: ["NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"],
        message: "AUTH_MODE=live requires a Clerk live publishable key",
      });
    }
    if (!env.CLERK_SECRET_KEY?.startsWith("sk_live_")) {
      context.addIssue({
        code: "custom",
        path: ["CLERK_SECRET_KEY"],
        message: "AUTH_MODE=live requires a Clerk live secret key",
      });
    }
  }

  if (
    env.PAYMENTS_MODE === "test" &&
    !env.STRIPE_SECRET_KEY?.startsWith("sk_test_")
  ) {
    context.addIssue({
      code: "custom",
      path: ["STRIPE_SECRET_KEY"],
      message: "PAYMENTS_MODE=test requires a Stripe test secret key",
    });
  }

  if (
    env.PAYMENTS_MODE === "live" &&
    !env.STRIPE_SECRET_KEY?.startsWith("sk_live_")
  ) {
    context.addIssue({
      code: "custom",
      path: ["STRIPE_SECRET_KEY"],
      message: "PAYMENTS_MODE=live requires a Stripe live secret key",
    });
  }

  if (
    env.PAYMENTS_MODE !== "disabled" &&
    !env.STRIPE_WEBHOOK_SECRET?.startsWith("whsec_")
  ) {
    context.addIssue({
      code: "custom",
      path: ["STRIPE_WEBHOOK_SECRET"],
      message: "Enabled payments require a Stripe whsec_ webhook secret",
    });
  }

  if (env.PAYMENTS_MODE === "live") {
    const dependencies = ["DATABASE_MODE"] as const;

    for (const dependency of dependencies) {
      if (env[dependency] !== "live") {
        context.addIssue({
          code: "custom",
          path: [dependency],
          message: `PAYMENTS_MODE=live requires ${dependency}=live`,
        });
      }
    }
  }

  if (env.COMMERCE_LIVE_CAPABILITY === "enabled") {
    for (const dependency of ["AUTH_MODE", "DATABASE_MODE", "TAX_MODE", "SHIPPING_MODE", "FULFILLMENT_MODE"] as const) {
      if (env[dependency] !== "live") context.addIssue({ code: "custom", path: [dependency], message: `COMMERCE_LIVE_CAPABILITY=enabled requires ${dependency}=live` });
    }
    if (env.CATALOG_DEMO_MODE !== "disabled") context.addIssue({ code: "custom", path: ["CATALOG_DEMO_MODE"], message: "COMMERCE_LIVE_CAPABILITY requires demo catalog disabled" });
  }
  if (env.PAYMENTS_LIVE_CAPABILITY === "enabled") {
    for (const dependency of ["DATABASE_MODE", "PAYMENTS_MODE"] as const) {
      if (env[dependency] !== "live") context.addIssue({ code: "custom", path: [dependency], message: `PAYMENTS_LIVE_CAPABILITY=enabled requires ${dependency}=live` });
    }
  }
});

function omitEmptyValues(
  input: Record<string, string | undefined>,
): Record<string, string | undefined> {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== ""),
  );
}

export function parseServerEnv(
  input: Record<string, string | undefined>,
): ServerEnv {
  const result = serverEnvSchema.safeParse(omitEmptyValues(input));

  if (!result.success) {
    const summary = result.error.issues
      .map((issue) => `${issue.path.join(".") || "environment"}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid server configuration: ${summary}`);
  }

  return result.data;
}
