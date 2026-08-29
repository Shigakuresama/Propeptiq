import { beforeEach, describe, expect, it, vi } from "vitest";

const { connectionMock, queryMock, readServerEnvMock } = vi.hoisted(() => ({
  connectionMock: vi.fn(),
  queryMock: vi.fn(),
  readServerEnvMock: vi.fn(),
}));

vi.mock("next/server", () => ({ connection: connectionMock }));
vi.mock("@/env", () => ({ readServerEnv: readServerEnvMock }));
vi.mock("@/db/runtime", () => ({
  withRuntimeTransaction: async (
    _environment: unknown,
    work: (client: Readonly<{ query: typeof queryMock }>) => Promise<unknown>,
  ) => work(Object.freeze({ query: queryMock })),
}));

import { getPublicGrowthProjection } from "./public-growth-server";

describe("strict public growth server adapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    connectionMock.mockResolvedValue(undefined);
    readServerEnvMock.mockReturnValue({ DATABASE_MODE: "live" });
  });

  it("returns inactive only when no current public growth records exist", async () => {
    queryMock.mockResolvedValue({ rows: [{ count: 0 }] });

    await expect(getPublicGrowthProjection()).resolves.toEqual({ status: "inactive" });
  });

  it("returns a safe read_error when the database read throws", async () => {
    queryMock.mockRejectedValue(new Error("private database endpoint failed"));

    await expect(getPublicGrowthProjection()).resolves.toEqual({ status: "read_error" });
  });

  it("returns a safe read_error for a malformed current record", async () => {
    queryMock.mockImplementation(async (sql: string) =>
      /COUNT\(\*\)/u.test(sql)
        ? { rows: [{ count: 1 }] }
        : { rows: [{ id: "malformed-current-record" }] },
    );

    await expect(getPublicGrowthProjection()).resolves.toEqual({ status: "read_error" });
  });
});
