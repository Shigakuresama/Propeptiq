import { beforeEach, describe, expect, it, vi } from "vitest";

import { parseServerEnv } from "@/config/env-schema";

const mocks = vi.hoisted(() => ({
  getBetterAuthForEnvironment: vi.fn(),
  getSession: vi.fn(),
  readServerEnv: vi.fn(),
  requestHeaders: new Headers({ cookie: "propeptiq.session_token=untrusted" }),
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ get: vi.fn() })),
  headers: vi.fn(async () => mocks.requestHeaders),
}));

vi.mock("next/server", () => ({
  connection: vi.fn(async () => undefined),
}));

vi.mock("@/env", () => ({
  readServerEnv: mocks.readServerEnv,
}));

vi.mock("@/auth/better-auth-server", () => ({
  getBetterAuthForEnvironment: mocks.getBetterAuthForEnvironment,
}));

import { getRequestIdentity } from "./server";

describe("application-owned Better Auth request identity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.readServerEnv.mockReturnValue(
      parseServerEnv({
        APP_ORIGIN: "http://localhost:3000",
        AUTH_MODE: "test",
        BETTER_AUTH_SECRET:
          "synthetic-better-auth-secret-material-0123456789ABCDEF",
        RATE_LIMIT_SECRET: "synthetic-rate-limit-secret-at-least-32-characters",
        DATABASE_MODE: "test",
        TEST_DATABASE_URL:
          "postgresql://synthetic_auth:synthetic_password@db.example.invalid/propeptiq_auth_test",
        TEST_DATABASE_CONFIRMATION: "isolated-test-database",
        EMAIL_MODE: "test",
        RESEND_API_KEY: "re_synthetic_auth_test",
        RESEND_FROM: "accounts@example.test",
      }),
    );
    mocks.getBetterAuthForEnvironment.mockReturnValue({
      api: { getSession: mocks.getSession },
    });
  });

  it("rejects a stale signed session-data cookie at the server identity boundary", async () => {
    mocks.getSession.mockResolvedValue(null);

    await expect(getRequestIdentity()).resolves.toMatchObject({
      identity: null,
      principal: null,
    });
    expect(mocks.getSession).toHaveBeenCalledWith({
      headers: mocks.requestHeaders,
    });
  });
});
