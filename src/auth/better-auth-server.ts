import "server-only";

import { createHash } from "node:crypto";

import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { emailOTP } from "better-auth/plugins";
import { after } from "next/server";
import { Pool, type PoolConfig } from "pg";
import { Resend } from "resend";

import { createAuthPostgresRateLimitStore } from "@/auth/auth-rate-limit-store";
import {
  buildPasswordResetEmail,
  buildVerificationCodeEmail,
  createAuthEmailSender,
} from "@/auth/better-auth-email";
import { createBetterAuthRateLimitStorage } from "@/auth/better-auth-rate-limit";
import type { ServerEnv } from "@/config/env-schema";
import { preparePostgresConnectionUrl } from "@/db/postgres-connection-url";
import { readServerEnv } from "@/env";

const VERIFICATION_CODE_EXPIRES_IN_SECONDS = 10 * 60;

type ResendLike = Readonly<{
  emails: Readonly<{
    send: (
      payload: Readonly<{
        from: string;
        to: string;
        subject: string;
        text: string;
        html: string;
      }>,
    ) => Promise<Readonly<{ error?: unknown | null }>>;
  }>;
}>;

type ScheduleAfterResponse = (work: () => Promise<void>) => void;

function selectedDatabaseUrl(environment: ServerEnv): string {
  let selected: string;
  if (environment.DATABASE_MODE === "test" && environment.TEST_DATABASE_URL) {
    selected = environment.TEST_DATABASE_URL;
  } else if (environment.DATABASE_MODE === "live" && environment.DATABASE_URL) {
    selected = environment.DATABASE_URL;
  } else {
    throw new Error("Better Auth database configuration is incomplete");
  }

  return preparePostgresConnectionUrl(selected, {
    requirePersistentSession: true,
  });
}

function buildBetterAuthOptions(input: Readonly<{
  environment: ServerEnv;
  pool: Pool;
  resend: ResendLike;
  schedule: ScheduleAfterResponse;
}>) {
  const { environment, pool, resend, schedule } = input;
  if (
    !environment.APP_ORIGIN ||
    !environment.BETTER_AUTH_SECRET ||
    !environment.RATE_LIMIT_SECRET ||
    !environment.RESEND_FROM
  ) {
    throw new Error("Better Auth is enabled without complete configuration");
  }
  const appOrigin = environment.APP_ORIGIN;

  const sendEmail = createAuthEmailSender({
    from: environment.RESEND_FROM,
    deliver: (payload) => resend.emails.send(payload),
  });
  const rateLimitStore = createAuthPostgresRateLimitStore({
    async query<T extends object>(sql: string, params?: unknown[]) {
      const result = await pool.query<T>(sql, params);
      return { rows: result.rows };
    },
  });
  const customStorage = createBetterAuthRateLimitStorage({
    secret: environment.RATE_LIMIT_SECRET,
    store: rateLimitStore,
  });
  const plugins: [ReturnType<typeof emailOTP>, ReturnType<typeof nextCookies>] = [
    emailOTP({
      otpLength: 6,
      expiresIn: VERIFICATION_CODE_EXPIRES_IN_SECONDS,
      allowedAttempts: 3,
      storeOTP: "hashed",
      resendStrategy: "rotate",
      sendVerificationOnSignUp: true,
      overrideDefaultEmailVerification: true,
      async sendVerificationOTP(data) {
        schedule(() =>
          sendEmail(
            buildVerificationCodeEmail({
              ...data,
              expiresInSeconds: VERIFICATION_CODE_EXPIRES_IN_SECONDS,
            }),
          ),
        );
      },
    }),
    nextCookies(),
  ];

  return {
    appName: "PROPEPTIQ",
    baseURL: appOrigin,
    basePath: "/api/auth",
    secret: environment.BETTER_AUTH_SECRET,
    trustedOrigins: [appOrigin],
    database: pool,
    emailVerification: {
      autoSignInAfterVerification: true,
    },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      minPasswordLength: 8,
      maxPasswordLength: 128,
      revokeSessionsOnPasswordReset: true,
      async sendResetPassword({ user, url }: { user: { email: string }; url: string }) {
        schedule(() =>
          sendEmail(
            buildPasswordResetEmail({
              email: user.email,
              url,
              expectedOrigin: appOrigin,
            }),
          ),
        );
      },
    },
    session: {
      cookieCache: { enabled: false },
    },
    rateLimit: {
      enabled: true,
      customStorage,
    },
    advanced: {
      cookiePrefix: "propeptiq",
      useSecureCookies: environment.APP_ENV !== "local",
      database: { generateId: "uuid" as const },
      ipAddress: {
        ipAddressHeaders: ["x-vercel-forwarded-for"],
      },
    },
    plugins,
  };
}

function instantiateBetterAuth(
  options: ReturnType<typeof buildBetterAuthOptions>,
) {
  return betterAuth(options);
}

export type BetterAuthRuntime = ReturnType<typeof instantiateBetterAuth>;

export type BetterAuthDependencies<TAuth = BetterAuthRuntime> = Readonly<{
  createPool: (configuration: PoolConfig) => Pool;
  createAuth: (
    options: ReturnType<typeof buildBetterAuthOptions>,
  ) => TAuth;
  createResend: (apiKey: string) => ResendLike;
  schedule: ScheduleAfterResponse;
}>;

const defaultDependencies: BetterAuthDependencies = Object.freeze({
  createPool: (configuration) => new Pool(configuration),
  createAuth: instantiateBetterAuth,
  createResend: (apiKey) => new Resend(apiKey) as ResendLike,
  schedule: (work) => {
    after(work);
  },
});

export function createBetterAuthForEnvironment<TAuth = BetterAuthRuntime>(
  environment: ServerEnv,
  dependencies: BetterAuthDependencies<TAuth> =
    defaultDependencies as BetterAuthDependencies<TAuth>,
): TAuth | null {
  if (
    environment.AUTH_MODE === "disabled" ||
    environment.LOCAL_TEST_DRIVER === "enabled"
  ) {
    return null;
  }

  if (!environment.RESEND_API_KEY) {
    throw new Error("Better Auth email configuration is incomplete");
  }

  const pool = dependencies.createPool({
    connectionString: selectedDatabaseUrl(environment),
    options: "-c search_path=neon_auth",
    max: 5,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 5_000,
    allowExitOnIdle: true,
  });
  const resend = dependencies.createResend(environment.RESEND_API_KEY);
  return dependencies.createAuth(
    buildBetterAuthOptions({
      environment,
      pool,
      resend,
      schedule: dependencies.schedule,
    }),
  );
}

let cachedAuth:
  | Readonly<{ configurationHash: string; auth: BetterAuthRuntime }>
  | null = null;

function configurationHash(environment: ServerEnv): string {
  return createHash("sha256")
    .update(
      [
        environment.APP_ORIGIN,
        environment.AUTH_MODE,
        environment.DATABASE_MODE,
        environment.DATABASE_URL,
        environment.TEST_DATABASE_URL,
        environment.EMAIL_MODE,
        environment.RESEND_FROM,
        environment.RESEND_API_KEY,
        environment.BETTER_AUTH_SECRET,
        environment.RATE_LIMIT_SECRET,
      ].join("\u0000"),
    )
    .digest("hex");
}

export function getBetterAuthForEnvironment(
  environment: ServerEnv,
): BetterAuthRuntime | null {
  if (
    environment.AUTH_MODE === "disabled" ||
    environment.LOCAL_TEST_DRIVER === "enabled"
  ) {
    return null;
  }

  const nextHash = configurationHash(environment);
  if (cachedAuth && cachedAuth.configurationHash !== nextHash) {
    throw new Error("Better Auth target changed after initialization");
  }
  if (!cachedAuth) {
    const auth = createBetterAuthForEnvironment(environment);
    if (!auth) {
      return null;
    }
    cachedAuth = Object.freeze({ configurationHash: nextHash, auth });
  }
  return cachedAuth.auth;
}

export function getBetterAuth(): BetterAuthRuntime | null {
  return getBetterAuthForEnvironment(readServerEnv());
}
