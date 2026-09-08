import type { ServerEnv } from "./env-schema";

/** A dedicated, opt-in sandbox. Never weakens the live capability contract. */
export function isSandboxCheckoutEnvironmentConfigured(env: ServerEnv): boolean {
  if (env.SANDBOX_CHECKOUT_CAPABILITY !== "enabled" || env.APP_ENV !== "preview" ||
    env.VERCEL_ENV !== "preview" || (env.VERCEL_TARGET_ENV !== undefined && env.VERCEL_TARGET_ENV !== "preview") ||
    env.APP_ORIGIN !== "https://propeptiq-git-feat-stripe-shipping-catalog-sergiosteam.vercel.app" ||
    env.AUTH_MODE !== "test" || env.DATABASE_MODE !== "test" || env.PAYMENTS_MODE !== "test" ||
    env.TAX_MODE !== "test" || env.SHIPPING_MODE !== "test" || env.FULFILLMENT_MODE !== "test" ||
    env.EMAIL_MODE !== "disabled" || env.LOCAL_TEST_DRIVER !== "disabled" || env.CATALOG_DEMO_MODE !== "disabled" ||
    env.COMMERCE_LIVE_CAPABILITY !== "disabled" || env.PAYMENTS_LIVE_CAPABILITY !== "disabled" ||
    env.STRIPE_ACCOUNT_ID !== "acct_1U9t8NR4u3cqLvC0" || !env.STRIPE_SECRET_KEY?.startsWith("sk_test_") ||
    env.TEST_DATABASE_CONFIRMATION !== "isolated-test-database" || !env.TEST_DATABASE_URL) return false;
  try {
    const database = new URL(env.TEST_DATABASE_URL);
    return database.hostname === "ep-blue-frog-aubaovyb.c-10.us-east-1.aws.neon.tech" && database.pathname === "/propeptiq_stripe_sandbox";
  } catch { return false; }
}
