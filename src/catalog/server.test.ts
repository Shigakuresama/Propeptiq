import { beforeEach, describe, expect, it, vi } from "vitest";

import { parseServerEnv, type ServerEnv } from "@/config/env-schema";

const mocks = vi.hoisted(() => ({
  buildPublicCatalog: vi.fn(),
  connection: vi.fn(),
  loadDatabaseCatalogRecords: vi.fn(),
  readServerEnv: vi.fn(),
  withRuntimeTransaction: vi.fn(),
}));

vi.mock("next/server", () => ({ connection: mocks.connection }));
vi.mock("@/env", () => ({ readServerEnv: mocks.readServerEnv }));
vi.mock("@/db/runtime", () => ({ withRuntimeTransaction: mocks.withRuntimeTransaction }));
vi.mock("./database-catalog", () => ({
  loadDatabaseCatalogRecords: mocks.loadDatabaseCatalogRecords,
}));
vi.mock("./public-catalog", () => ({ buildPublicCatalog: mocks.buildPublicCatalog }));

import { EMPTY_CATALOG_RECORD_SET } from "./catalog-source";
import type { CatalogRecordSet, PublicCatalog } from "./types";
import { getPublicCatalog } from "./server";

const environment = parseServerEnv({
  APP_ENV: "local",
  APP_ORIGIN: "https://research.example.test",
  DATABASE_MODE: "test",
  TEST_DATABASE_URL: "postgresql://fixture:fixture@127.0.0.1:5432/fixture",
  TEST_DATABASE_CONFIRMATION: "isolated-test-database",
});

const emptyPublicCatalog: PublicCatalog = Object.freeze({
  source: "production",
  products: Object.freeze([]),
  promotions: Object.freeze([]),
  qualityRecords: Object.freeze([]),
});

function sqlStateError(code: string, message = "private database detail"): Error {
  const error = new Error(message);
  Object.defineProperty(error, "code", {
    configurable: true,
    enumerable: true,
    value: code,
    writable: true,
  });
  return error;
}

const connectionError = new Error("connection failure");
const runtimeConnectionError = sqlStateError("42P01", "runtime connection failure");
const environmentError = new Error("environment failure");
const unrelatedSqlStateError = sqlStateError("23505", "private unique violation");
const genericDatabaseError = new Error("private database failure");

describe("legacy catalog server boundary", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mocks.connection.mockReset().mockResolvedValue(undefined);
    mocks.readServerEnv.mockReset().mockReturnValue(environment);
    mocks.loadDatabaseCatalogRecords.mockReset().mockResolvedValue(EMPTY_CATALOG_RECORD_SET);
    mocks.withRuntimeTransaction.mockReset().mockImplementation(
      async (_environment: ServerEnv, work: (client: never) => Promise<CatalogRecordSet>) =>
        work({} as never),
    );
    mocks.buildPublicCatalog.mockReset().mockReturnValue(emptyPublicCatalog);
  });

  it("returns the immutable empty production catalog when the optional schema is absent", async () => {
    mocks.loadDatabaseCatalogRecords.mockRejectedValue(
      sqlStateError("42P01", "private product_variants schema detail"),
    );
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const catalog = await getPublicCatalog();

    expect(catalog).toBe(emptyPublicCatalog);
    expect(mocks.buildPublicCatalog).toHaveBeenCalledWith(EMPTY_CATALOG_RECORD_SET);
    expect(Object.isFrozen(EMPTY_CATALOG_RECORD_SET)).toBe(true);
    expect(warning).toHaveBeenCalledWith("STOREFRONT_CATALOG_DATABASE_UNAVAILABLE");
    expect(JSON.stringify(warning.mock.calls)).not.toContain("product_variants schema detail");
  });

  it("contains synchronous and asynchronous diagnostic failures without leaking raw errors", async () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {
      throw new Error("diagnostic failure");
    });
    mocks.loadDatabaseCatalogRecords.mockRejectedValue(sqlStateError("42P01"));

    await expect(getPublicCatalog()).resolves.toBe(emptyPublicCatalog);
    expect(warning).toHaveBeenCalledWith("STOREFRONT_CATALOG_DATABASE_UNAVAILABLE");

    warning.mockImplementation(() => Promise.reject(new Error("async diagnostic failure")) as never);
    await expect(getPublicCatalog()).resolves.toBe(emptyPublicCatalog);
    expect(warning).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(warning.mock.calls)).not.toContain("async diagnostic failure");
  });

  it("waits for a deferred diagnostic reporter and contains its eventual rejection", async () => {
    let rejectDiagnostic: ((reason?: unknown) => void) | undefined;
    const warning = vi.spyOn(console, "warn").mockImplementation(() =>
      new Promise<void>((_resolve, reject) => {
        rejectDiagnostic = reject;
      }) as never,
    );
    mocks.loadDatabaseCatalogRecords.mockRejectedValue(sqlStateError("42P01"));

    let settled = false;
    const catalogPromise = getPublicCatalog().then((catalog) => {
      settled = true;
      return catalog;
    });
    for (let i = 0; i < 5; i += 1) await Promise.resolve();
    expect(warning).toHaveBeenCalledOnce();
    expect(settled).toBe(false);

    rejectDiagnostic!(new Error("deferred diagnostic failure"));
    await expect(catalogPromise).resolves.toBe(emptyPublicCatalog);
    expect(settled).toBe(true);
  });

  it.each([
    ["connection", connectionError, () => mocks.connection.mockRejectedValueOnce(connectionError)],
    ["runtime connection", runtimeConnectionError, () => mocks.withRuntimeTransaction.mockRejectedValueOnce(runtimeConnectionError)],
    ["environment", environmentError, () => mocks.readServerEnv.mockImplementationOnce(() => { throw environmentError; })],
    ["unrelated SQLSTATE", unrelatedSqlStateError, () => mocks.loadDatabaseCatalogRecords.mockRejectedValueOnce(unrelatedSqlStateError)],
    ["generic database", genericDatabaseError, () => mocks.loadDatabaseCatalogRecords.mockRejectedValueOnce(genericDatabaseError)],
  ] as const)("rethrows %s failures unchanged", async (_label, expectedError, arrange) => {
    arrange();
    await expect(getPublicCatalog()).rejects.toBe(expectedError);
  });

  it.each([
    ["inherited code", Object.create({ code: "42P01" })],
    ["accessor code", Object.defineProperty(new Error("private accessor"), "code", { get: () => "42P01" })],
  ] as const)("does not fall back for %s", async (_label, error) => {
    mocks.loadDatabaseCatalogRecords.mockRejectedValue(error);

    await expect(getPublicCatalog()).rejects.toBe(error);
  });

  it("does not fall back when own-code inspection of a revoked proxy fails", async () => {
    const revocable = Proxy.revocable({ code: "42P01" }, {});
    const error = revocable.proxy;
    revocable.revoke();
    mocks.loadDatabaseCatalogRecords.mockRejectedValue(error);

    await expect(getPublicCatalog()).rejects.toBe(error);
  });

  it("does not fall back for an active proxy that forges an own SQLSTATE descriptor", async () => {
    const error = new Error("private proxied database failure");
    let descriptorTrapInvoked = false;
    const proxy = new Proxy(error, {
      getOwnPropertyDescriptor() {
        descriptorTrapInvoked = true;
        return {
          configurable: true,
          enumerable: true,
          value: "42P01",
          writable: true,
        };
      },
    });
    mocks.loadDatabaseCatalogRecords.mockRejectedValue(proxy);

    await expect(getPublicCatalog()).rejects.toBe(proxy);
    expect(descriptorTrapInvoked).toBe(false);
  });

  it("keeps demo-mode guard failures outside the missing-schema fallback", async () => {
    mocks.readServerEnv.mockReturnValue({
      ...environment,
      APP_ENV: "production",
      CATALOG_DEMO_MODE: "enabled",
    } as ServerEnv);

    await expect(getPublicCatalog()).rejects.toThrow(/CATALOG_DEMO_MODE.*production/iu);
    expect(mocks.loadDatabaseCatalogRecords).not.toHaveBeenCalled();
    expect(mocks.buildPublicCatalog).not.toHaveBeenCalled();
  });

  it("keeps source validation outside the missing-schema fallback", async () => {
    mocks.loadDatabaseCatalogRecords.mockResolvedValue({
      ...EMPTY_CATALOG_RECORD_SET,
      source: "synthetic-demo",
    });

    await expect(getPublicCatalog()).rejects.toThrow(/non-production source/iu);
    expect(mocks.buildPublicCatalog).not.toHaveBeenCalled();
  });

  it("keeps public projection failures outside the missing-schema fallback", async () => {
    const error = sqlStateError("42P01", "private projection detail");
    mocks.buildPublicCatalog.mockImplementation(() => { throw error; });

    await expect(getPublicCatalog()).rejects.toBe(error);
    expect(mocks.loadDatabaseCatalogRecords).toHaveBeenCalledOnce();
  });
});
