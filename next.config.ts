import type { NextConfig } from "next";
import { resolve } from "node:path";

const productionIdentity =
  process.env.APP_ENV === "production" ||
  process.env.VERCEL_ENV === "production" ||
  process.env.VERCEL_TARGET_ENV?.trim().toLowerCase() === "production";
const includeSyntheticDemoFixtures =
  process.env.CATALOG_DEMO_MODE === "enabled" && !productionIdentity;
const syntheticDemoModule = includeSyntheticDemoFixtures
  ? "./src/catalog/demo-fixtures-entry.ts"
  : "./src/catalog/catalog-demo-disabled.ts";

const nextConfig: NextConfig = {
  devIndicators: false,
  poweredByHeader: false,
  typedRoutes: true,
  turbopack: {
    resolveAlias: {
      "catalog-demo-fixtures": syntheticDemoModule,
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
    return config;
  },
};

export default nextConfig;
