import type { ServerEnv } from "./env-schema";

/** Configuration evidence only; request-specific catalog and quote readiness remain separate. */
export function isLiveCheckoutEnvironmentConfigured(env: ServerEnv): boolean {
  return env.APP_ENV === "production" &&
    env.COMMERCE_LIVE_CAPABILITY === "enabled" &&
    env.PAYMENTS_LIVE_CAPABILITY === "enabled" &&
    env.CATALOG_DEMO_MODE === "disabled" &&
    env.AUTH_MODE === "live" && env.DATABASE_MODE === "live" && env.PAYMENTS_MODE === "live" &&
    env.TAX_MODE === "live" && env.SHIPPING_MODE === "live" && env.FULFILLMENT_MODE === "live";
}
