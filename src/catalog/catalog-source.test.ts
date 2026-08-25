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
