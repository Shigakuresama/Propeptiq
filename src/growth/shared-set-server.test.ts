import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getRequestIdentity: vi.fn(),
  readServerEnv: vi.fn(),
  getPublicCatalog: vi.fn(),
  getPublicCatalogRead: vi.fn(),
  withRuntimeTransaction: vi.fn(),
  createPostgresSharedSetReadPort: vi.fn(() => "read-port"),
  resolvePublicSet: vi.fn(),
  listOwnerSets: vi.fn(),
  createSharedSetService: vi.fn(),
}));

vi.mock("@/auth/server", () => ({ getRequestIdentity: mocks.getRequestIdentity }));
vi.mock("@/env", () => ({ readServerEnv: mocks.readServerEnv }));
vi.mock("@/catalog/server", () => ({
  getPublicCatalog: mocks.getPublicCatalog,
  getPublicCatalogRead: mocks.getPublicCatalogRead,
}));
vi.mock("@/db/runtime", () => ({ withRuntimeTransaction: mocks.withRuntimeTransaction }));
vi.mock("@/growth/shared-set-service", () => ({
  createPostgresSharedSetReadPort: mocks.createPostgresSharedSetReadPort,
  createSharedSetService: mocks.createSharedSetService,
}));

import { loadOwnerSharedSetWorkspace, loadPublicSharedSet } from "./shared-set-server";

describe("shared set server composition", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createSharedSetService.mockReturnValue({
      resolvePublicSet: mocks.resolvePublicSet,
      listOwnerSets: mocks.listOwnerSets,
    });
    mocks.readServerEnv.mockReturnValue({ DATABASE_MODE: "live" });
    mocks.resolvePublicSet.mockResolvedValue({ status: "available", set: { code: "set_Task5CServerCode1" } });
    mocks.getPublicCatalog.mockResolvedValue({ source: "production", products: [], promotions: [], qualityRecords: [] });
    mocks.getPublicCatalogRead.mockResolvedValue({ status: "available", catalog: { source: "production", products: [], promotions: [], qualityRecords: [] } });
  });

  it("resolves a public set from server environment without loading identity", async () => {
    await expect(loadPublicSharedSet("set_Task5CServerCode1")).resolves.toMatchObject({
      status: "available",
    });

    expect(mocks.readServerEnv).toHaveBeenCalledOnce();
    expect(mocks.getRequestIdentity).not.toHaveBeenCalled();
    expect(mocks.resolvePublicSet).toHaveBeenCalledWith("set_Task5CServerCode1");
  });

  it("returns unavailable when the catalog schema is degraded", async () => {
    mocks.getPublicCatalogRead.mockResolvedValue({
      status: "schema_unavailable",
      catalog: { source: "production", products: [], promotions: [], qualityRecords: [] },
    });
    mocks.createPostgresSharedSetReadPort.mockImplementation(({ loadCurrentPublicProducts }) => {
      return { loadCurrentPublicProducts };
    });
    mocks.resolvePublicSet.mockImplementation(async () => {
      const port = mocks.createPostgresSharedSetReadPort.mock.results.at(-1)?.value as {
        loadCurrentPublicProducts: () => Promise<unknown>;
      };
      await port.loadCurrentPublicProducts();
      return { status: "available" };
    });

    await expect(loadPublicSharedSet("set_Task5CServerCode1")).resolves.toEqual({ status: "unavailable" });
  });

  it("returns unavailable for the owner workspace during catalog degradation", async () => {
    mocks.getRequestIdentity.mockResolvedValue({
      identity: { clerkUserId: "user_1" },
      principal: { clerkUserId: "user_1", buyerStatus: "active", actorId: "actor_1" },
      environment: { DATABASE_MODE: "live" },
      localDriver: null,
    });
    mocks.getPublicCatalogRead.mockResolvedValue({
      status: "schema_unavailable",
      catalog: { source: "production", products: [], promotions: [], qualityRecords: [] },
    });
    mocks.listOwnerSets.mockResolvedValue({ items: [] });

    await expect(loadOwnerSharedSetWorkspace()).resolves.toEqual({ status: "unavailable" });
  });
});
