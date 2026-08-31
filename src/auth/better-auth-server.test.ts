import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";

import { parseServerEnv } from "@/config/env-schema";

import {
  createBetterAuthForEnvironment,
  type BetterAuthDependencies,
} from "./better-auth-server";

const enabledEnvironment = parseServerEnv({
  APP_ENV: "preview",
  APP_ORIGIN: "https://preview.propeptiq.example.invalid",
  AUTH_MODE: "test",
  BETTER_AUTH_SECRET: "synthetic-better-auth-secret-material-0123456789ABCDEF",
  RATE_LIMIT_SECRET: "synthetic-auth-rate-limit-secret-0123456789ABCDEF",
  DATABASE_MODE: "test",
  TEST_DATABASE_URL:
    "postgresql://synthetic_auth:synthetic_password@db.example.invalid/propeptiq_auth_test",
  TEST_DATABASE_CONFIRMATION: "isolated-test-database",
  EMAIL_MODE: "test",
  RESEND_API_KEY: "re_synthetic_auth_test",
  RESEND_FROM: "accounts@example.test",
});

describe("application-owned Better Auth server configuration", () => {
  const pool = { query: vi.fn() } as unknown as Pool;
  const createPool = vi.fn<BetterAuthDependencies["createPool"]>(
    () => pool,
  );
  const createAuth = vi.fn<
    BetterAuthDependencies<{ marker: string }>["createAuth"]
  >(() => ({ marker: "better-auth" }));
  const createResend = vi.fn<BetterAuthDependencies["createResend"]>(() => ({
    emails: { send: vi.fn().mockResolvedValue({ error: null }) },
  }));
  const schedule = vi.fn<BetterAuthDependencies["schedule"]>();

  beforeEach(() => vi.clearAllMocks());

  it("does not construct dependencies when auth is disabled", () => {
    expect(
      createBetterAuthForEnvironment(parseServerEnv({}), {
        createPool,
        createAuth,
        createResend,
        schedule,
      }),
    ).toBeNull();
    expect(createPool).not.toHaveBeenCalled();
    expect(createAuth).not.toHaveBeenCalled();
    expect(createResend).not.toHaveBeenCalled();
  });

  it("binds Better Auth to the existing Neon schema and security contract", () => {
    const auth = createBetterAuthForEnvironment(enabledEnvironment, {
      createPool,
      createAuth,
      createResend,
      schedule,
    });

    expect(auth).toEqual({ marker: "better-auth" });
    expect(createPool).toHaveBeenCalledWith({
      connectionString: enabledEnvironment.TEST_DATABASE_URL,
      options: "-c search_path=neon_auth",
      max: 5,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 5_000,
      allowExitOnIdle: true,
    });
    expect(createResend).toHaveBeenCalledWith("re_synthetic_auth_test");

    const options = createAuth.mock.calls[0]?.[0];
    expect(options).toBeDefined();
    if (!options) throw new Error("Better Auth options were not captured");
    expect(options).toMatchObject({
      appName: "PROPEPTIQ",
      baseURL: "https://preview.propeptiq.example.invalid",
      basePath: "/api/auth",
      secret: enabledEnvironment.BETTER_AUTH_SECRET,
      trustedOrigins: ["https://preview.propeptiq.example.invalid"],
      database: pool,
      emailVerification: { autoSignInAfterVerification: true },
      emailAndPassword: {
        enabled: true,
        requireEmailVerification: true,
        minPasswordLength: 8,
        maxPasswordLength: 128,
        revokeSessionsOnPasswordReset: true,
      },
      session: { cookieCache: { enabled: false } },
      advanced: {
        cookiePrefix: "propeptiq",
        database: { generateId: "uuid" },
        useSecureCookies: true,
        ipAddress: { ipAddressHeaders: ["x-vercel-forwarded-for"] },
      },
      rateLimit: {
        enabled: true,
        customStorage: {
          consume: expect.any(Function),
        },
      },
    });
    expect(options.plugins.map((plugin: { id: string }) => plugin.id)).toEqual([
      "email-otp",
      "next-cookies",
    ]);
  });

  it("rejects a pooled Neon URL because the auth schema needs a persistent search path", () => {
    const pooledEnvironment = parseServerEnv({
      ...enabledEnvironment,
      TEST_DATABASE_URL:
        "postgresql://synthetic_auth:synthetic_password@ep-example-pooler.us-east-1.aws.neon.tech/propeptiq_auth_test",
    });

    expect(() =>
      createBetterAuthForEnvironment(pooledEnvironment, {
        createPool,
        createAuth,
        createResend,
        schedule,
      }),
    ).toThrow(/direct Neon database URL/i);
    expect(createPool).not.toHaveBeenCalled();
  });

  it("pins full TLS verification for a direct Neon URL", () => {
    const neonEnvironment = parseServerEnv({
      ...enabledEnvironment,
      TEST_DATABASE_URL:
        "postgresql://synthetic_auth:synthetic_password@ep-example.us-east-1.aws.neon.tech/propeptiq_auth_test?sslmode=require&channel_binding=require",
    });

    createBetterAuthForEnvironment(neonEnvironment, {
      createPool,
      createAuth,
      createResend,
      schedule,
    });

    expect(createPool).toHaveBeenCalledWith(
      expect.objectContaining({
        connectionString:
          "postgresql://synthetic_auth:synthetic_password@ep-example.us-east-1.aws.neon.tech/propeptiq_auth_test?sslmode=verify-full&channel_binding=require",
      }),
    );
  });

  it("schedules verification delivery after the response", async () => {
    createBetterAuthForEnvironment(enabledEnvironment, {
      createPool,
      createAuth,
      createResend,
      schedule,
    });
    const options = createAuth.mock.calls[0]?.[0];
    expect(options).toBeDefined();
    if (!options) throw new Error("Better Auth options were not captured");
    const emailPlugin = options.plugins[0];

    await emailPlugin.options.sendVerificationOTP({
      email: "buyer@example.test",
      otp: "482913",
      type: "email-verification",
    });

    expect(schedule).toHaveBeenCalledOnce();
    expect(schedule.mock.calls[0]?.[0]).toBeTypeOf("function");
  });
});
