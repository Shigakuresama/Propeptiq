import type { NextConfig } from "next";
import { resolve } from "node:path";

const productionIdentity =
  process.env.APP_ENV === "production" ||
  process.env.VERCEL_ENV === "production" ||
  process.env.VERCEL_TARGET_ENV?.trim().toLowerCase() === "production";
const includeSyntheticDemoFixtures =
  process.env.CATALOG_DEMO_MODE === "enabled" && !productionIdentity;
const includeLocalTestDriver =
  process.env.LOCAL_TEST_DRIVER === "enabled" &&
  process.env.APP_ENV === "local" &&
  !productionIdentity &&
  (process.env.VERCEL_ENV === undefined || process.env.VERCEL_ENV === "development") &&
  (process.env.VERCEL_TARGET_ENV === undefined ||
    process.env.VERCEL_TARGET_ENV.trim().toLowerCase() === "development");
if (process.env.LOCAL_TEST_DRIVER === "enabled" && !includeLocalTestDriver) {
  throw new Error("LOCAL_TEST_DRIVER requires an explicit local development build identity");
}
if (productionIdentity && process.env.CATALOG_DEMO_MODE === "enabled") {
  throw new Error("CATALOG_DEMO_MODE cannot be enabled for a production build");
}
const syntheticDemoModule = includeSyntheticDemoFixtures
  ? "./src/catalog/demo-fixtures-entry.ts"
  : "./src/catalog/catalog-demo-disabled.ts";
const localTestDriverModule = includeLocalTestDriver
  ? "./src/auth/local-driver.ts"
  : "./src/auth/local-driver-disabled.ts";
const localPaymentProviderModule = includeLocalTestDriver
  ? "./src/commerce/local-payment-provider.ts"
  : "./src/commerce/local-payment-provider-disabled.ts";
const localCommerceHarnessRoutesModule = includeLocalTestDriver
  ? "./src/commerce/local-commerce-harness-routes.ts"
  : "./src/commerce/local-commerce-harness-routes-disabled.ts";

const nextConfig: NextConfig = {
  devIndicators: false,
  poweredByHeader: false,
  typedRoutes: true,
  turbopack: {
    resolveAlias: {
      "catalog-demo-fixtures": syntheticDemoModule,
      "local-auth-driver": localTestDriverModule,
      "local-payment-provider": localPaymentProviderModule,
      "local-commerce-harness-routes": localCommerceHarnessRoutesModule,
    },
  },
  experimental: {
    taint: true,
  },
  webpack(config) {
    config.resolve.alias["catalog-demo-fixtures$"] = resolve(
      process.cwd(),
      syntheticDemoModule,
    );
    config.resolve.alias["local-auth-driver$"] = resolve(
      process.cwd(),
      localTestDriverModule,
    );
    config.resolve.alias["local-payment-provider$"] = resolve(
      process.cwd(),
      localPaymentProviderModule,
    );
    config.resolve.alias["local-commerce-harness-routes$"] = resolve(
      process.cwd(),
      localCommerceHarnessRoutesModule,
    );
    return config;
  },
};

export default nextConfig;
