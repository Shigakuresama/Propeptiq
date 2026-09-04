import { describe, expect, it } from "vitest";

import {
  parseServerEnv,
  resolveNeonAuthBaseUrl,
} from "@/config/env-schema";

const neonAuthBaseUrl =
  "https://ep-synthetic.neonauth.c-10.us-east-1.aws.neon.tech/neondb/auth";
const neonAuthCookieSecret =
  "synthetic-neon-auth-cookie-secret-at-least-32-characters";
const betterAuthSecret =
  "synthetic-better-auth-secret-material-0123456789ABCDEF";
const newsletterRateLimitSecret =
  "synthetic-newsletter-rate-limit-secret-0123456789ABCDEF";
const newsletterTopicId = "11111111-1111-4111-8111-111111111111";

const newsletterTestInput = {
  NEWSLETTER_MODE: "test",
  NEWSLETTER_RESEND_API_KEY: "re_synthetic_newsletter_test",
  NEWSLETTER_RESEND_TOPIC_ID: newsletterTopicId,
  NEWSLETTER_RATE_LIMIT_MAX: "5",
  NEWSLETTER_RATE_LIMIT_WINDOW_SECONDS: "600",
  RATE_LIMIT_SECRET: newsletterRateLimitSecret,
  DATABASE_MODE: "test",
  TEST_DATABASE_URL:
    "postgresql://synthetic_newsletter:synthetic_password@db.example.invalid/propeptiq_newsletter_test",
  TEST_DATABASE_CONFIRMATION: "isolated-test-database",
} as const;

const applicationOwnedAuthTestInput = {
  APP_ORIGIN: "http://localhost:3000",
  AUTH_MODE: "test",
  BETTER_AUTH_SECRET: betterAuthSecret,
  RATE_LIMIT_SECRET: "synthetic-auth-rate-limit-secret-0123456789ABCDEF",
  DATABASE_MODE: "test",
  TEST_DATABASE_URL:
    "postgresql://synthetic_auth:synthetic_password@db.example.invalid/propeptiq_auth_test",
  TEST_DATABASE_CONFIRMATION: "isolated-test-database",
  EMAIL_MODE: "test",
  RESEND_API_KEY: "re_synthetic_auth_test",
  RESEND_FROM: "accounts@example.test",
} as const;

const exactPreviewInput = {
  APP_ENV: "preview",
  VERCEL_ENV: "preview",
  APP_ORIGIN: "https://preview.propeptiq.example.invalid",
  CATALOG_DEMO_MODE: "enabled",
  LOCAL_TEST_DRIVER: "disabled",
  LOCAL_TEST_SECRET: "",
  AUTH_MODE: "test",
  AUTH_PASSWORD_RESET_SESSION_REVOCATION: "verified",
  BETTER_AUTH_SECRET: betterAuthSecret,
  RATE_LIMIT_SECRET: "synthetic-task7-preview-rate-limit-secret-0001",
  DATABASE_MODE: "test",
  TEST_DATABASE_URL:
    "postgresql://synthetic_task7:synthetic_password@db.example.invalid/propeptiq_task7_test",
  TEST_DATABASE_CONFIRMATION: "isolated-test-database",
  DATABASE_URL: "",
  DATABASE_MIGRATION_URL: "",
  PAYMENTS_MODE: "test",
  STRIPE_ACCOUNT_ID: "acct_SyntheticTask7Preview",
  STRIPE_SECRET_KEY: "sk_test_synthetic_task7_preview",
  STRIPE_WEBHOOK_SECRET: "whsec_synthetic_task7_preview",
  STORAGE_MODE: "disabled",
  EMAIL_MODE: "test",
  RESEND_API_KEY: "re_synthetic_task7_preview",
  RESEND_FROM: "accounts@example.test",
  TAX_MODE: "disabled",
  SHIPPING_MODE: "disabled",
  FULFILLMENT_MODE: "disabled",
  COMMERCE_LIVE_CAPABILITY: "disabled",
  PAYMENTS_LIVE_CAPABILITY: "disabled",
} as const;

const productionIdentity = {
  APP_ENV: "production",
  VERCEL_ENV: "production",
  APP_ORIGIN: "https://production.propeptiq.example.invalid",
} as const;

const liveAuthInput = {
  ...productionIdentity,
  AUTH_MODE: "live",
  AUTH_EMAIL_DELIVERY_VERIFIED: "verified",
  BETTER_AUTH_SECRET: betterAuthSecret,
  RATE_LIMIT_SECRET: "task5-rate-limit-secret-at-least-32-characters",
  DATABASE_MODE: "live",
  DATABASE_URL: "postgresql://synthetic.invalid/database?sslmode=require",
  EMAIL_MODE: "live",
  RESEND_API_KEY: "re_synthetic",
  RESEND_FROM: "accounts@example.test",
} as const;

describe("parseServerEnv", () => {
  it("defaults every external capability to disabled", () => {
    const env = parseServerEnv({});

    expect(env).toMatchObject({
      APP_ENV: "local",
      CATALOG_DEMO_MODE: "disabled",
      RECONSTITUTION_CALCULATOR_MODE: "disabled",
      LOCAL_TEST_DRIVER: "disabled",
      AUTH_MODE: "disabled",
      DATABASE_MODE: "disabled",
      PAYMENTS_MODE: "disabled",
      STORAGE_MODE: "disabled",
      EMAIL_MODE: "disabled",
      NEWSLETTER_MODE: "disabled",
      COMMERCE_LIVE_CAPABILITY: "disabled",
      PAYMENTS_LIVE_CAPABILITY: "disabled",
      TAX_MODE: "disabled",
      SHIPPING_MODE: "disabled",
      FULFILLMENT_MODE: "disabled",
    });
    expect(env.BROWSE_CATALOG_PUBLICATION).toBeUndefined();
  });

  it("accepts installed newsletter values without activating the disabled default", () => {
    const env = parseServerEnv({
      NEWSLETTER_RESEND_API_KEY: "re_synthetic_installed_only",
      NEWSLETTER_RESEND_TOPIC_ID: newsletterTopicId,
      NEWSLETTER_RATE_LIMIT_MAX: "5",
      NEWSLETTER_RATE_LIMIT_WINDOW_SECONDS: "600",
    });

    expect(env.NEWSLETTER_MODE).toBe("disabled");
    expect(env.NEWSLETTER_RESEND_TOPIC_ID).toBe(newsletterTopicId);
  });

  it("accepts a complete test newsletter configuration without email delivery mode", () => {
    const env = parseServerEnv(newsletterTestInput);

    expect(env).toMatchObject({
      NEWSLETTER_MODE: "test",
      NEWSLETTER_RESEND_API_KEY: "re_synthetic_newsletter_test",
      NEWSLETTER_RESEND_TOPIC_ID: newsletterTopicId,
      NEWSLETTER_RATE_LIMIT_MAX: 5,
      NEWSLETTER_RATE_LIMIT_WINDOW_SECONDS: 600,
      DATABASE_MODE: "test",
      EMAIL_MODE: "disabled",
    });
    expect(env.RESEND_FROM).toBeUndefined();
  });

  it.each([
    ["NEWSLETTER_RESEND_API_KEY"],
    ["NEWSLETTER_RESEND_TOPIC_ID"],
    ["NEWSLETTER_RATE_LIMIT_MAX"],
    ["NEWSLETTER_RATE_LIMIT_WINDOW_SECONDS"],
    ["RATE_LIMIT_SECRET"],
  ] as const)("requires %s whenever newsletter mode is enabled", (field) => {
    expect(() => parseServerEnv({
      ...newsletterTestInput,
      [field]: undefined,
    })).toThrow(new RegExp(field));
  });

  it.each([
    ["invalid topic", "NEWSLETTER_RESEND_TOPIC_ID", "not-a-uuid"],
    ["nil-like topic", "NEWSLETTER_RESEND_TOPIC_ID", "00000000-0000-0000-0000-000000000000"],
    ["zero maximum", "NEWSLETTER_RATE_LIMIT_MAX", "0"],
    ["maximum above 100", "NEWSLETTER_RATE_LIMIT_MAX", "101"],
    ["fractional maximum", "NEWSLETTER_RATE_LIMIT_MAX", "1.5"],
    ["window below 60", "NEWSLETTER_RATE_LIMIT_WINDOW_SECONDS", "59"],
    ["window above one day", "NEWSLETTER_RATE_LIMIT_WINDOW_SECONDS", "86401"],
    ["fractional window", "NEWSLETTER_RATE_LIMIT_WINDOW_SECONDS", "60.5"],
  ] as const)("rejects %s", (_label, field, value) => {
    expect(() => parseServerEnv({
      ...newsletterTestInput,
      [field]: value,
    })).toThrow(new RegExp(field));
  });

  it("requires newsletter and database modes to match", () => {
    expect(() => parseServerEnv({
      ...newsletterTestInput,
      DATABASE_MODE: "disabled",
      TEST_DATABASE_URL: undefined,
      TEST_DATABASE_CONFIRMATION: undefined,
    })).toThrow(/NEWSLETTER_MODE=test requires DATABASE_MODE=test/);
  });

  it("requires a newsletter key independent from transactional Auth email", () => {
    expect(() => parseServerEnv({
      ...newsletterTestInput,
      NEWSLETTER_RESEND_API_KEY: "re_synthetic_shared",
      RESEND_API_KEY: "re_synthetic_shared",
    })).toThrow(/newsletter and transactional Resend keys must be independent/i);
  });

  it("applies provider deployment identity restrictions to newsletter mode", () => {
    expect(() => parseServerEnv({
      ...newsletterTestInput,
      ...productionIdentity,
    })).toThrow(/NEWSLETTER_MODE test mode is not permitted in production/);

    expect(() => parseServerEnv({
      ...newsletterTestInput,
      NEWSLETTER_MODE: "live",
      DATABASE_MODE: "live",
      DATABASE_URL: "postgresql://synthetic.invalid/database?sslmode=require",
      TEST_DATABASE_URL: undefined,
      TEST_DATABASE_CONFIRMATION: undefined,
    })).toThrow(/NEWSLETTER_MODE=live requires APP_ENV=production/);
  });

  it("accepts explicit preview and approved calculator modes outside the forbidden matrix", () => {
    expect(
      parseServerEnv({ RECONSTITUTION_CALCULATOR_MODE: "preview" })
        .RECONSTITUTION_CALCULATOR_MODE,
    ).toBe("preview");
    expect(
      parseServerEnv({ RECONSTITUTION_CALCULATOR_MODE: "approved" })
        .RECONSTITUTION_CALCULATOR_MODE,
    ).toBe("approved");
  });

  it("rejects an invalid calculator mode", () => {
    expect(() =>
      parseServerEnv({ RECONSTITUTION_CALCULATOR_MODE: "enabled" }),
    ).toThrow(/RECONSTITUTION_CALCULATOR_MODE/);
  });

  it("rejects calculator preview for a production identity", () => {
    expect(() =>
      parseServerEnv({
        ...productionIdentity,
        RECONSTITUTION_CALCULATOR_MODE: "preview",
      }),
    ).toThrow(
      /RECONSTITUTION_CALCULATOR_MODE: RECONSTITUTION_CALCULATOR_MODE=preview is not permitted for a production identity/,
    );
  });

  it("keeps approved calculator mode syntactically available for a production identity", () => {
    expect(
      parseServerEnv({
        ...productionIdentity,
        RECONSTITUTION_CALCULATOR_MODE: "approved",
      }).RECONSTITUTION_CALCULATOR_MODE,
    ).toBe("approved");
  });

  it("accepts a non-secret owner browse-catalog publication ID", () => {
    expect(
      parseServerEnv({
        BROWSE_CATALOG_PUBLICATION: "owner-pdf-2026-08-27-07cd4aa0-v1",
      }).BROWSE_CATALOG_PUBLICATION,
    ).toBe("owner-pdf-2026-08-27-07cd4aa0-v1");
  });

  it("accepts application-owned auth without Managed Neon Auth configuration", () => {
    const env = parseServerEnv(applicationOwnedAuthTestInput);

    expect(env).toMatchObject({
      AUTH_MODE: "test",
      BETTER_AUTH_SECRET: betterAuthSecret,
      DATABASE_MODE: "test",
      EMAIL_MODE: "test",
    });
    expect(env.STORAGE_NEON_AUTH_BASE_URL).toBeUndefined();
    expect(env.NEON_AUTH_BASE_URL).toBeUndefined();
    expect(env.NEON_AUTH_COOKIE_SECRET).toBeUndefined();
  });

  it("requires APP_ORIGIN to be an origin without credentials, path, query, or fragment", () => {
    for (const APP_ORIGIN of [
      "https://user:password@preview.example.test",
      "https://preview.example.test/nested",
      "https://preview.example.test?tenant=one",
      "https://preview.example.test#fragment",
    ]) {
      expect(() =>
        parseServerEnv({
          ...applicationOwnedAuthTestInput,
          APP_ENV: "preview",
          APP_ORIGIN,
        }),
      ).toThrow(/APP_ORIGIN.*origin/i);
    }
  });

  it("requires a generated Better Auth secret whenever auth is enabled", () => {
    const withoutSecret = {
      ...applicationOwnedAuthTestInput,
      BETTER_AUTH_SECRET: undefined,
    };

    expect(() => parseServerEnv(withoutSecret)).toThrow(/BETTER_AUTH_SECRET/);
    expect(() =>
      parseServerEnv({
        ...applicationOwnedAuthTestInput,
        BETTER_AUTH_SECRET: "abcd".repeat(16),
      }),
    ).toThrow(/BETTER_AUTH_SECRET/);
  });

  it("requires enabled auth to use matching database and email modes", () => {
    expect(() =>
      parseServerEnv({
        ...applicationOwnedAuthTestInput,
        DATABASE_MODE: "disabled",
      }),
    ).toThrow(/AUTH_MODE=test requires DATABASE_MODE=test/);
    expect(() =>
      parseServerEnv({
        ...applicationOwnedAuthTestInput,
        EMAIL_MODE: "disabled",
      }),
    ).toThrow(/AUTH_MODE=test requires EMAIL_MODE=test/);
  });

  it("requires independent Better Auth and rate-limit secrets", () => {
    expect(() =>
      parseServerEnv({
        ...applicationOwnedAuthTestInput,
        BETTER_AUTH_SECRET:
          applicationOwnedAuthTestInput.RATE_LIMIT_SECRET,
      }),
    ).toThrow(/Better Auth and rate-limit secrets must be independent/);
  });

  it("rejects incomplete Stripe test configuration", () => {
    expect(() =>
      parseServerEnv({
        PAYMENTS_MODE: "test",
        STRIPE_SECRET_KEY: "sk_test_synthetic",
      }),
    ).toThrow(/STRIPE_WEBHOOK_SECRET/);
  });

  it("accepts the complete placeholder-equivalent browse-only Preview matrix", () => {
    const env = parseServerEnv(exactPreviewInput);

    expect(env).toMatchObject({
      APP_ENV: "preview",
      VERCEL_ENV: "preview",
      APP_ORIGIN: "https://preview.propeptiq.example.invalid",
      CATALOG_DEMO_MODE: "enabled",
      LOCAL_TEST_DRIVER: "disabled",
      AUTH_MODE: "test",
      DATABASE_MODE: "test",
      PAYMENTS_MODE: "test",
      STORAGE_MODE: "disabled",
      EMAIL_MODE: "test",
      TAX_MODE: "disabled",
      SHIPPING_MODE: "disabled",
      FULFILLMENT_MODE: "disabled",
      COMMERCE_LIVE_CAPABILITY: "disabled",
      PAYMENTS_LIVE_CAPABILITY: "disabled",
      BETTER_AUTH_SECRET: betterAuthSecret,
      RATE_LIMIT_SECRET: "synthetic-task7-preview-rate-limit-secret-0001",
      TEST_DATABASE_URL:
        "postgresql://synthetic_task7:synthetic_password@db.example.invalid/propeptiq_task7_test",
      TEST_DATABASE_CONFIRMATION: "isolated-test-database",
      STRIPE_ACCOUNT_ID: "acct_SyntheticTask7Preview",
      STRIPE_SECRET_KEY: "sk_test_synthetic_task7_preview",
      STRIPE_WEBHOOK_SECRET: "whsec_synthetic_task7_preview",
    });
    expect(env.LOCAL_TEST_SECRET).toBeUndefined();
    expect(resolveNeonAuthBaseUrl(env)).toBeNull();
    expect(env.DATABASE_URL).toBeUndefined();
    expect(env.DATABASE_MIGRATION_URL).toBeUndefined();
  });

  it("rejects the complete Preview matrix when its origin is insecure", () => {
    expect(() =>
      parseServerEnv({
        ...exactPreviewInput,
        APP_ORIGIN: "http://preview.propeptiq.example.invalid",
      }),
    ).toThrow(
      /APP_ORIGIN: Preview and production require a secure non-local APP_ORIGIN/,
    );
  });

  it.each([
    [
      "AUTH_MODE",
      {
        AUTH_MODE: "test",
        STORAGE_NEON_AUTH_BASE_URL: neonAuthBaseUrl,
        NEON_AUTH_COOKIE_SECRET: neonAuthCookieSecret,
        RATE_LIMIT_SECRET: "synthetic-task7-production-rate-limit-secret-0001",
      },
    ],
    [
      "DATABASE_MODE",
      {
        DATABASE_MODE: "test",
        TEST_DATABASE_URL:
          "postgresql://synthetic_task7:synthetic_password@db.example.invalid/propeptiq_task7_test",
        TEST_DATABASE_CONFIRMATION: "isolated-test-database",
      },
    ],
    [
      "PAYMENTS_MODE",
      {
        PAYMENTS_MODE: "test",
        STRIPE_ACCOUNT_ID: "acct_SyntheticTask7Denied",
        STRIPE_SECRET_KEY: "sk_test_synthetic_task7_production_denial",
        STRIPE_WEBHOOK_SECRET: "whsec_synthetic_task7_production_denial",
      },
    ],
    ["STORAGE_MODE", { STORAGE_MODE: "test", BLOB_READ_WRITE_TOKEN: "synthetic_task7_blob_token" }],
    [
      "EMAIL_MODE",
      {
        EMAIL_MODE: "test",
        RESEND_API_KEY: "re_synthetic_task7_production_denial",
        RESEND_FROM: "synthetic-task7@example.invalid",
      },
    ],
    ["TAX_MODE", { TAX_MODE: "test" }],
    ["SHIPPING_MODE", { SHIPPING_MODE: "test" }],
    ["FULFILLMENT_MODE", { FULFILLMENT_MODE: "test" }],
  ] as const)(
    "rejects a prerequisite-complete Production %s=test matrix with its mode error",
    (modeKey, prerequisites) => {
      let message = "configuration unexpectedly accepted";
      try {
        parseServerEnv({ ...productionIdentity, ...prerequisites });
      } catch (error) {
        message = error instanceof Error ? error.message : String(error);
      }

      expect(message).toContain(
        `${modeKey}: ${modeKey} test mode is not permitted in production`,
      );
    },
  );

  it("requires one valid nonsecret Stripe account namespace whenever payments are enabled", () => {
    const stripeTest = {
      APP_ENV: "preview",
      APP_ORIGIN: "https://preview.synthetic.example",
      PAYMENTS_MODE: "test",
      STRIPE_SECRET_KEY: "sk_test_synthetic",
      STRIPE_WEBHOOK_SECRET: "whsec_synthetic",
    } as const;
    expect(() => parseServerEnv(stripeTest)).toThrow(/STRIPE_ACCOUNT_ID/);
    for (const STRIPE_ACCOUNT_ID of [
      "acct_",
      "acct_has-punctuation",
      "ca_synthetic123",
      " acct_synthetic123",
    ]) {
      expect(() => parseServerEnv({ ...stripeTest, STRIPE_ACCOUNT_ID })).toThrow(
        /STRIPE_ACCOUNT_ID/,
      );
    }
    expect(
      parseServerEnv({
        ...stripeTest,
        STRIPE_ACCOUNT_ID: "acct_synthetic123",
      }).STRIPE_ACCOUNT_ID,
    ).toBe("acct_synthetic123");
  });

  it("requires an explicitly isolated database URL in test mode", () => {
    expect(() =>
      parseServerEnv({
        DATABASE_MODE: "test",
        DATABASE_URL: "postgresql://production.example.invalid/database",
      }),
    ).toThrow(/TEST_DATABASE_URL/);

    expect(() =>
      parseServerEnv({
        DATABASE_MODE: "test",
        TEST_DATABASE_URL:
          "postgresql://test-user@example.invalid/propeptiq_test",
      }),
    ).toThrow(/TEST_DATABASE_CONFIRMATION/);
  });

  it("rejects an apparently production-scoped database in test mode", () => {
    expect(() =>
      parseServerEnv({
        DATABASE_MODE: "test",
        TEST_DATABASE_URL:
          "postgresql://app@production-db.example.invalid/propeptiq_live",
        TEST_DATABASE_CONFIRMATION: "isolated-test-database",
      }),
    ).toThrow(/appears production-scoped/);
  });

  it("rejects live payments outside the production environment", () => {
    expect(() =>
      parseServerEnv({
        APP_ENV: "preview",
        PAYMENTS_MODE: "live",
        STRIPE_SECRET_KEY: "sk_live_synthetic",
        STRIPE_WEBHOOK_SECRET: "whsec_synthetic",
      }),
    ).toThrow(/PAYMENTS_MODE=live requires APP_ENV=production/);
  });

  it("rejects insecure production origins", () => {
    expect(() =>
      parseServerEnv({
        APP_ENV: "production",
        APP_ORIGIN: "http://localhost:3000",
      }),
    ).toThrow(/secure non-local APP_ORIGIN/);
  });

  it.each([
    "https://localhost.",
    "https://0.0.0.0",
    "https://127.99.1.1",
    "https://10.0.0.8",
    "https://172.20.1.2",
    "https://192.168.1.2",
    "https://[::1]",
    "https://[::]",
    "https://[fd00::1]",
    "https://[0:0:0:0:0:0:0:1]",
    "https://[::ffff:7f00:1]",
  ])("rejects non-public production origin %s", (origin) => {
    expect(() =>
      parseServerEnv({ APP_ENV: "production", APP_ORIGIN: origin }),
    ).toThrow(/secure non-local APP_ORIGIN/);
  });

  it("rejects malformed provider values", () => {
    expect(() =>
      parseServerEnv({
        APP_ENV: "production",
        APP_ORIGIN: "https://research.example.test",
        DATABASE_MODE: "live",
        DATABASE_URL: "not-a-postgres-url",
      }),
    ).toThrow(/DATABASE_URL/);

    expect(() =>
      parseServerEnv({
        APP_ENV: "preview",
        APP_ORIGIN: "https://preview.example.test",
        STORAGE_MODE: "test",
        BLOB_READ_WRITE_TOKEN: "   ",
      }),
    ).toThrow(/BLOB_READ_WRITE_TOKEN/);

    expect(() =>
      parseServerEnv({
        APP_ENV: "preview",
        APP_ORIGIN: "https://preview.example.test",
        PAYMENTS_MODE: "test",
        STRIPE_SECRET_KEY: "sk_test_synthetic",
        STRIPE_WEBHOOK_SECRET: "not-a-webhook-secret",
      }),
    ).toThrow(/STRIPE_WEBHOOK_SECRET/);
  });

  it.each([
    ["AUTH_MODE", "live", "BETTER_AUTH_SECRET"],
    ["DATABASE_MODE", "live", "DATABASE_URL"],
    ["STORAGE_MODE", "live", "BLOB_READ_WRITE_TOKEN"],
    ["EMAIL_MODE", "live", "RESEND_API_KEY"],
  ] as const)(
    "rejects incomplete live capability %s",
    (modeKey, mode, missingField) => {
      expect(() =>
        parseServerEnv({
          APP_ENV: "production",
          APP_ORIGIN: "https://research.example.test",
          [modeKey]: mode,
        }),
      ).toThrow(new RegExp(missingField));
    },
  );

  it("accepts an explicitly complete live capability set", () => {
    const env = parseServerEnv({
      ...liveAuthInput,
      AUTH_PASSWORD_RESET_SESSION_REVOCATION: "verified",
      PAYMENTS_MODE: "live",
      STORAGE_MODE: "live",
      STRIPE_ACCOUNT_ID: "acct_synthetic123",
      STRIPE_SECRET_KEY: "sk_live_synthetic",
      STRIPE_WEBHOOK_SECRET: "whsec_synthetic",
      BLOB_READ_WRITE_TOKEN: "vercel_blob_rw_synthetic",
    });

    expect(env.PAYMENTS_MODE).toBe("live");
  });

  it("keeps live Auth closed without verified production email delivery", () => {
    expect(() =>
      parseServerEnv({
        ...liveAuthInput,
        AUTH_EMAIL_DELIVERY_VERIFIED: undefined,
      }),
    ).toThrow(/production email delivery/i);
  });

  it("permits live Auth without password recovery when production email delivery is verified", () => {
    const env = parseServerEnv(liveAuthInput);

    expect(env.AUTH_MODE).toBe("live");
    expect(env.AUTH_PASSWORD_RESET_SESSION_REVOCATION).toBeUndefined();
  });

  it("rejects test-mode providers in production", () => {
    expect(() =>
      parseServerEnv({
        APP_ENV: "production",
        APP_ORIGIN: "https://research.example.test",
        EMAIL_MODE: "test",
        RESEND_API_KEY: "re_synthetic",
        RESEND_FROM: "research@example.test",
      }),
    ).toThrow(/test mode is not permitted in production/);
  });

  it("permits the deterministic auth driver only for an explicit local test secret", () => {
    const env = parseServerEnv({
      APP_ENV: "local",
      LOCAL_TEST_DRIVER: "enabled",
      LOCAL_TEST_SECRET: "task5-local-driver-secret-at-least-32-chars",
      RATE_LIMIT_SECRET: "task5-rate-limit-secret-at-least-32-characters",
    });
    expect(env.LOCAL_TEST_DRIVER).toBe("enabled");

    expect(() =>
      parseServerEnv({
        APP_ENV: "local",
        LOCAL_TEST_DRIVER: "enabled",
        LOCAL_TEST_SECRET: "short",
        RATE_LIMIT_SECRET: "task5-rate-limit-secret-at-least-32-characters",
      }),
    ).toThrow(/LOCAL_TEST_SECRET/);
  });

  it.each([
    { APP_ENV: "production" },
    { APP_ENV: "preview" },
    { APP_ENV: "local", VERCEL_ENV: "production" },
    { APP_ENV: "local", VERCEL_ENV: "preview" },
    { APP_ENV: "local", VERCEL_TARGET_ENV: "production" },
    { APP_ENV: "local", VERCEL_TARGET_ENV: "customer-preview" },
  ] as const)("rejects the local test driver for non-local or production identity %#", (identity) => {
    expect(() =>
      parseServerEnv({
        ...identity,
        APP_ORIGIN:
          identity.APP_ENV === "local" ? undefined : "https://research.example.test",
        LOCAL_TEST_DRIVER: "enabled",
        LOCAL_TEST_SECRET: "task5-local-driver-secret-at-least-32-chars",
        RATE_LIMIT_SECRET: "task5-rate-limit-secret-at-least-32-characters",
      }),
    ).toThrow(/LOCAL_TEST_DRIVER/);
  });

  it("requires a dedicated rate-limit secret for every enabled identity adapter", () => {
    expect(() =>
      parseServerEnv({
        AUTH_MODE: "test",
        STORAGE_NEON_AUTH_BASE_URL: neonAuthBaseUrl,
        NEON_AUTH_COOKIE_SECRET: neonAuthCookieSecret,
      }),
    ).toThrow(/RATE_LIMIT_SECRET/);

    expect(() =>
      parseServerEnv({
        LOCAL_TEST_DRIVER: "enabled",
        LOCAL_TEST_SECRET: "task5-local-driver-secret-at-least-32-chars",
      }),
    ).toThrow(/RATE_LIMIT_SECRET/);
  });

  it("maps the Vercel-injected Neon Auth URL before the documented fallback", () => {
    const storageConfigured = parseServerEnv({
      STORAGE_NEON_AUTH_BASE_URL: neonAuthBaseUrl,
    });
    expect(resolveNeonAuthBaseUrl(storageConfigured)).toBe(neonAuthBaseUrl);

    const fallbackConfigured = parseServerEnv({
      NEON_AUTH_BASE_URL: neonAuthBaseUrl,
    });
    expect(resolveNeonAuthBaseUrl(fallbackConfigured)).toBe(neonAuthBaseUrl);
  });

  it("requires an explicit application origin whenever Managed Neon Auth is enabled", () => {
    expect(() =>
      parseServerEnv({
        AUTH_MODE: "test",
        STORAGE_NEON_AUTH_BASE_URL: neonAuthBaseUrl,
        NEON_AUTH_COOKIE_SECRET: neonAuthCookieSecret,
        RATE_LIMIT_SECRET:
          "synthetic-rate-limit-secret-at-least-32-characters",
      }),
    ).toThrow(/APP_ORIGIN/);
  });

  it("rejects short cookie secrets and conflicting Neon Auth URL aliases", () => {
    expect(() =>
      parseServerEnv({
        AUTH_MODE: "test",
        STORAGE_NEON_AUTH_BASE_URL: neonAuthBaseUrl,
        NEON_AUTH_COOKIE_SECRET: "short",
        RATE_LIMIT_SECRET: "synthetic-rate-limit-secret-at-least-32-characters",
      }),
    ).toThrow(/NEON_AUTH_COOKIE_SECRET/);

    expect(() =>
      parseServerEnv({
        AUTH_MODE: "test",
        STORAGE_NEON_AUTH_BASE_URL: neonAuthBaseUrl,
        NEON_AUTH_BASE_URL:
          "https://ep-other.neonauth.c-10.us-east-1.aws.neon.tech/neondb/auth",
        NEON_AUTH_COOKIE_SECRET: neonAuthCookieSecret,
        RATE_LIMIT_SECRET: "synthetic-rate-limit-secret-at-least-32-characters",
      }),
    ).toThrow(/aliases must agree/);
  });

  it.each([
    ["whitespace only", " ".repeat(64)],
    ["surrounding whitespace", ` ${neonAuthCookieSecret} `],
    ["one repeated character", "a".repeat(64)],
    ["repeated short pattern", "abcd".repeat(16)],
  ])("rejects a %s Managed Neon Auth cookie secret without reflecting it", (_label, candidate) => {
    let error: unknown;

    try {
      parseServerEnv({
        AUTH_MODE: "test",
        STORAGE_NEON_AUTH_BASE_URL: neonAuthBaseUrl,
        NEON_AUTH_COOKIE_SECRET: candidate,
        RATE_LIMIT_SECRET: "synthetic-rate-limit-secret-at-least-32-characters",
      });
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(Error);
    const message = (error as Error).message;
    expect(message).toMatch(/NEON_AUTH_COOKIE_SECRET/);
    expect(message).not.toContain(candidate);
  });

  it("requires independent generated Auth cookie and rate-limit secrets", () => {
    const sharedSecret =
      "synthetic-shared-generated-secret-material-0123456789";
    expect(() =>
      parseServerEnv({
        AUTH_MODE: "test",
        STORAGE_NEON_AUTH_BASE_URL: neonAuthBaseUrl,
        NEON_AUTH_COOKIE_SECRET: sharedSecret,
        RATE_LIMIT_SECRET: sharedSecret,
      }),
    ).toThrow(/Auth cookie and rate-limit secrets must be independent/);

    expect(() =>
      parseServerEnv({
        AUTH_MODE: "test",
        STORAGE_NEON_AUTH_BASE_URL: neonAuthBaseUrl,
        NEON_AUTH_COOKIE_SECRET: neonAuthCookieSecret,
        RATE_LIMIT_SECRET: " ".repeat(64),
      }),
    ).toThrow(/RATE_LIMIT_SECRET/);
  });

  it("rejects catalog demo mode for the production application environment", () => {
    expect(() =>
      parseServerEnv({
        APP_ENV: "production",
        APP_ORIGIN: "https://research.example.test",
        CATALOG_DEMO_MODE: "enabled",
      }),
    ).toThrow(/CATALOG_DEMO_MODE.*production/);
  });

  it.each([
    ["VERCEL_ENV", "production"],
    ["VERCEL_TARGET_ENV", "production"],
  ] as const)(
    "rejects catalog demo mode for production deployment identity %s",
    (identityKey, identityValue) => {
      expect(() =>
        parseServerEnv({
          APP_ENV: "preview",
          APP_ORIGIN: "https://preview.example.test",
          CATALOG_DEMO_MODE: "enabled",
          [identityKey]: identityValue,
        }),
      ).toThrow(/CATALOG_DEMO_MODE.*production/);
    },
  );
});
