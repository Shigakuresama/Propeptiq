import { hasProductionIdentity, type ServerEnv } from "./env-schema";

export const SYNTHETIC_LOCAL_COMMERCE_ORIGIN = "http://127.0.0.1:4631" as const;

/** Exact closed-world configuration for the deterministic local browser harness. */
export function isSyntheticLocalCommerceEnvironmentConfigured(env: ServerEnv): boolean {
  return env.APP_ENV === "local" &&
    env.APP_ORIGIN === SYNTHETIC_LOCAL_COMMERCE_ORIGIN &&
    env.CATALOG_DEMO_MODE === "enabled" &&
    env.LOCAL_TEST_DRIVER === "enabled" &&
    env.AUTH_MODE === "disabled" &&
    env.DATABASE_MODE === "disabled" &&
    env.PAYMENTS_MODE === "disabled" &&
    env.STORAGE_MODE === "disabled" &&
    env.EMAIL_MODE === "disabled" &&
    env.TAX_MODE === "test" &&
    env.SHIPPING_MODE === "test" &&
    env.FULFILLMENT_MODE === "test" &&
    env.COMMERCE_LIVE_CAPABILITY === "disabled" &&
    env.PAYMENTS_LIVE_CAPABILITY === "disabled" &&
    typeof env.LOCAL_TEST_SECRET === "string" &&
    env.LOCAL_TEST_SECRET.length >= 32 &&
    typeof env.RATE_LIMIT_SECRET === "string" &&
    env.RATE_LIMIT_SECRET.length >= 32 &&
    (env.VERCEL_ENV === undefined || env.VERCEL_ENV === "development") &&
    (env.VERCEL_TARGET_ENV === undefined ||
      env.VERCEL_TARGET_ENV.trim().toLowerCase() === "development");
}

/** Configuration evidence only; request-specific catalog and quote readiness remain separate. */
export function isLiveCheckoutEnvironmentConfigured(env: ServerEnv): boolean {
  return hasProductionIdentity(env) &&
    env.COMMERCE_LIVE_CAPABILITY === "enabled" &&
    env.PAYMENTS_LIVE_CAPABILITY === "enabled" &&
    env.CATALOG_DEMO_MODE === "disabled" &&
    env.AUTH_MODE === "live" && env.DATABASE_MODE === "live" && env.PAYMENTS_MODE === "live" &&
    env.TAX_MODE === "live" && env.SHIPPING_MODE === "live" && env.FULFILLMENT_MODE === "live";
}
