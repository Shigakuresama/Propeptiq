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

  it.each([
    ["connection", "connection failure", () => mocks.connection.mockRejectedValueOnce(new Error("connection failure"))],
    ["runtime connection", "runtime connection failure", () => mocks.withRuntimeTransaction.mockRejectedValueOnce(sqlStateError("42P01", "runtime connection failure"))],
    ["environment", "environment failure", () => mocks.readServerEnv.mockImplementationOnce(() => { throw new Error("environment failure"); })],
    ["unrelated SQLSTATE", "private unique violation", () => mocks.loadDatabaseCatalogRecords.mockRejectedValueOnce(sqlStateError("23505", "private unique violation"))],
    ["generic database", "private database failure", () => mocks.loadDatabaseCatalogRecords.mockRejectedValueOnce(new Error("private database failure"))],
  ] as const)("rethrows %s failures unchanged", async (_label, message, arrange) => {
    arrange();
    const expected = _label === "connection"
      ? await mocks.connection.mock.results[0]?.value.catch((error: unknown) => error)
      : undefined;
    void expected;
    await expect(getPublicCatalog()).rejects.toThrow(message);
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
