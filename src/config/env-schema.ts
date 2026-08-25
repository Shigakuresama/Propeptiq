import { z } from "zod";

const capabilityMode = z.enum(["disabled", "test", "live"]);
const appEnvironment = z.enum(["local", "preview", "production"]);

const rawServerEnvSchema = z.object({
  APP_ENV: appEnvironment.default("local"),
  APP_ORIGIN: z.url().optional(),
  AUTH_MODE: capabilityMode.default("disabled"),
  DATABASE_MODE: capabilityMode.default("disabled"),
  PAYMENTS_MODE: capabilityMode.default("disabled"),
  STORAGE_MODE: capabilityMode.default("disabled"),
  EMAIL_MODE: capabilityMode.default("disabled"),
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string().min(1).optional(),
  CLERK_SECRET_KEY: z.string().min(1).optional(),
  CLERK_WEBHOOK_SIGNING_SECRET: z.string().min(1).optional(),
  DATABASE_URL: z.string().min(1).optional(),
  DATABASE_MIGRATION_URL: z.string().min(1).optional(),
  TEST_DATABASE_URL: z.string().min(1).optional(),
  STRIPE_SECRET_KEY: z.string().min(1).optional(),
  STRIPE_WEBHOOK_SECRET: z.string().min(1).optional(),
  BLOB_READ_WRITE_TOKEN: z.string().min(1).optional(),
  RESEND_API_KEY: z.string().min(1).optional(),
  RESEND_FROM: z.email().optional(),
  OTEL_SERVICE_NAME: z.string().min(1).default("propeptiq-labs"),
});

export type ServerEnv = z.infer<typeof rawServerEnvSchema>;

const modeKeys = [
  "AUTH_MODE",
  "DATABASE_MODE",
  "PAYMENTS_MODE",
  "STORAGE_MODE",
  "EMAIL_MODE",
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

const serverEnvSchema = rawServerEnvSchema.superRefine((env, context) => {
  requireFields(env, context, "AUTH_MODE", [
    "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
    "CLERK_SECRET_KEY",
  ]);
  requireFields(env, context, "DATABASE_MODE", ["DATABASE_URL"]);
  requireFields(env, context, "PAYMENTS_MODE", [
    "STRIPE_SECRET_KEY",
    "STRIPE_WEBHOOK_SECRET",
  ]);
  requireFields(env, context, "STORAGE_MODE", ["BLOB_READ_WRITE_TOKEN"]);
  requireFields(env, context, "EMAIL_MODE", ["RESEND_API_KEY", "RESEND_FROM"]);

  if (env.APP_ENV !== "local" && !env.APP_ORIGIN) {
    addRequiredIssue(context, "APP_ORIGIN", "AUTH_MODE");
  }

  if (env.APP_ENV !== "local" && env.APP_ORIGIN) {
    const origin = new URL(env.APP_ORIGIN);
    if (
      origin.protocol !== "https:" ||
      origin.hostname === "localhost" ||
      origin.hostname === "127.0.0.1"
    ) {
      context.addIssue({
        code: "custom",
        path: ["APP_ORIGIN"],
        message: "Preview and production require a secure non-local APP_ORIGIN",
      });
    }
  }

  if (env.APP_ENV === "production") {
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
    if (env[modeKey] === "live" && env.APP_ENV !== "production") {
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

  if (env.PAYMENTS_MODE === "live") {
    const dependencies = [
      "AUTH_MODE",
      "DATABASE_MODE",
      "STORAGE_MODE",
      "EMAIL_MODE",
    ] as const;

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
