import { describe, expect, it, vi } from "vitest";

import { parseServerEnv, type ServerEnv } from "@/config/env-schema";

import {
  EMPTY_CATALOG_RECORD_SET,
  loadCatalogRecordSet,
} from "./catalog-source";
import type { CatalogRecordSet } from "./types";

const syntheticRecords: CatalogRecordSet = {
  source: "synthetic-demo",
  products: [],
  prices: [],
  lots: [],
  coaDocuments: [],
  claims: [],
  promotions: [],
  promotionTargets: [],
};
const syntheticNeonAuth = {
  STORAGE_NEON_AUTH_BASE_URL:
    "https://ep-synthetic.neonauth.c-10.us-east-1.aws.neon.tech/neondb/auth",
  NEON_AUTH_COOKIE_SECRET:
    "synthetic-neon-auth-cookie-secret-at-least-32-characters",
} as const;

describe("catalog source boundary", () => {
  it("returns a truthfully empty production catalog without loading demo fixtures", async () => {
    const loadDemo = vi.fn(async () => syntheticRecords);
    const environment = parseServerEnv({
      APP_ENV: "production",
      APP_ORIGIN: "https://research.example.test",
    });

    await expect(loadCatalogRecordSet(environment, loadDemo)).resolves.toEqual(
      EMPTY_CATALOG_RECORD_SET,
    );
    expect(loadDemo).not.toHaveBeenCalled();
  });

  it("loads synthetic fixtures only after a permitted demo-mode guard", async () => {
    const loadDemo = vi.fn(async () => syntheticRecords);
    const environment = parseServerEnv({ CATALOG_DEMO_MODE: "enabled" });

    await expect(loadCatalogRecordSet(environment, loadDemo)).resolves.toEqual(
      syntheticRecords,
    );
    expect(loadDemo).toHaveBeenCalledOnce();
  });

  it("uses only the synthetic loader for the exact browse-only Preview matrix", async () => {
    const loadDemo = vi.fn(async () => syntheticRecords);
    const loadDatabase = vi.fn(async () => ({
      ...syntheticRecords,
      source: "production" as const,
    }));
    const environment = parseServerEnv({
      APP_ENV: "preview",
      VERCEL_ENV: "preview",
      APP_ORIGIN: "https://preview.propeptiq.example.invalid",
      CATALOG_DEMO_MODE: "enabled",
      LOCAL_TEST_DRIVER: "disabled",
      LOCAL_TEST_SECRET: "",
      AUTH_MODE: "test",
      ...syntheticNeonAuth,
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
      EMAIL_MODE: "disabled",
      TAX_MODE: "disabled",
      SHIPPING_MODE: "disabled",
      FULFILLMENT_MODE: "disabled",
      COMMERCE_LIVE_CAPABILITY: "disabled",
      PAYMENTS_LIVE_CAPABILITY: "disabled",
    });

    await expect(
      loadCatalogRecordSet(environment, loadDemo, loadDatabase),
    ).resolves.toEqual(syntheticRecords);
    expect(loadDemo).toHaveBeenCalledOnce();
    expect(loadDatabase).not.toHaveBeenCalled();
  });

  it("checks production identity before invoking the fixture loader", async () => {
    const loadDemo = vi.fn(async () => syntheticRecords);
    const unsafeEnvironment = {
      ...parseServerEnv({}),
      APP_ENV: "production",
      CATALOG_DEMO_MODE: "enabled",
    } as ServerEnv;

    await expect(
      loadCatalogRecordSet(unsafeEnvironment, loadDemo),
    ).rejects.toThrow(/CATALOG_DEMO_MODE.*production/);
    expect(loadDemo).not.toHaveBeenCalled();
  });

  it("rejects demo mode before loading fixtures when a live database is configured", async () => {
    const loadDemo = vi.fn(async () => syntheticRecords);
    const loadDatabase = vi.fn(async () => ({
      ...syntheticRecords,
      source: "production" as const,
    }));
    const unsafeEnvironment = {
      ...parseServerEnv({ CATALOG_DEMO_MODE: "enabled" }),
      DATABASE_MODE: "live",
    } as ServerEnv;

    await expect(
      (loadCatalogRecordSet as unknown as (
        environment: ServerEnv,
        loadDemo: () => Promise<CatalogRecordSet>,
        loadDatabase: () => Promise<CatalogRecordSet>,
      ) => Promise<CatalogRecordSet>)(unsafeEnvironment, loadDemo, loadDatabase),
    ).rejects.toThrow(/demo.*live database/i);
    expect(loadDemo).not.toHaveBeenCalled();
    expect(loadDatabase).not.toHaveBeenCalled();
  });

  it("uses only the configured database when demo mode is disabled", async () => {
    const loadDemo = vi.fn(async () => syntheticRecords);
    const databaseRecords = { ...syntheticRecords, source: "production" as const };
    const loadDatabase = vi.fn(async () => databaseRecords);
    const environment = {
      ...parseServerEnv({}),
      DATABASE_MODE: "test",
    } as ServerEnv;

    await expect(
      (loadCatalogRecordSet as unknown as (
        environment: ServerEnv,
        loadDemo: () => Promise<CatalogRecordSet>,
        loadDatabase: () => Promise<CatalogRecordSet>,
      ) => Promise<CatalogRecordSet>)(environment, loadDemo, loadDatabase),
    ).resolves.toEqual(databaseRecords);
    expect(loadDemo).not.toHaveBeenCalled();
    expect(loadDatabase).toHaveBeenCalledOnce();
  });
});
