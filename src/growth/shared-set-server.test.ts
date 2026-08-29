import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getRequestIdentity: vi.fn(),
  readServerEnv: vi.fn(),
  getPublicCatalog: vi.fn(),
  withRuntimeTransaction: vi.fn(),
  createPostgresSharedSetReadPort: vi.fn(() => "read-port"),
  resolvePublicSet: vi.fn(),
  listOwnerSets: vi.fn(),
  createSharedSetService: vi.fn(),
}));

vi.mock("@/auth/server", () => ({ getRequestIdentity: mocks.getRequestIdentity }));
vi.mock("@/env", () => ({ readServerEnv: mocks.readServerEnv }));
vi.mock("@/catalog/server", () => ({ getPublicCatalog: mocks.getPublicCatalog }));
vi.mock("@/db/runtime", () => ({ withRuntimeTransaction: mocks.withRuntimeTransaction }));
vi.mock("@/growth/shared-set-service", () => ({
  createPostgresSharedSetReadPort: mocks.createPostgresSharedSetReadPort,
  createSharedSetService: mocks.createSharedSetService,
}));

import { loadPublicSharedSet } from "./shared-set-server";

describe("shared set server composition", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createSharedSetService.mockReturnValue({
      resolvePublicSet: mocks.resolvePublicSet,
      listOwnerSets: mocks.listOwnerSets,
    });
    mocks.readServerEnv.mockReturnValue({ DATABASE_MODE: "live" });
    mocks.resolvePublicSet.mockResolvedValue({ status: "available", set: { code: "set_Task5CServerCode1" } });
  });

  it("resolves a public set from server environment without loading identity", async () => {
    await expect(loadPublicSharedSet("set_Task5CServerCode1")).resolves.toMatchObject({
      status: "available",
    });

    expect(mocks.readServerEnv).toHaveBeenCalledOnce();
    expect(mocks.getRequestIdentity).not.toHaveBeenCalled();
    expect(mocks.resolvePublicSet).toHaveBeenCalledWith("set_Task5CServerCode1");
  });
});
