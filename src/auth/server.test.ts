import { beforeEach, describe, expect, it, vi } from "vitest";

import { parseServerEnv } from "@/config/env-schema";

const mocks = vi.hoisted(() => ({
  getNeonAuthForEnvironment: vi.fn(),
  getSession: vi.fn(),
  readServerEnv: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ get: vi.fn() })),
}));

vi.mock("next/server", () => ({
  connection: vi.fn(async () => undefined),
}));

vi.mock("@/env", () => ({
  readServerEnv: mocks.readServerEnv,
}));

vi.mock("@/auth/neon-server", () => ({
  getNeonAuthForEnvironment: mocks.getNeonAuthForEnvironment,
}));

import { getRequestIdentity } from "./server";

describe("Managed Neon Auth request identity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.readServerEnv.mockReturnValue(
      parseServerEnv({
        APP_ORIGIN: "http://localhost:3000",
        AUTH_MODE: "test",
        STORAGE_NEON_AUTH_BASE_URL:
          "https://ep-synthetic.neonauth.c-10.us-east-1.aws.neon.tech/neondb/auth",
        NEON_AUTH_COOKIE_SECRET:
          "synthetic-neon-auth-cookie-secret-at-least-32-characters",
        RATE_LIMIT_SECRET: "synthetic-rate-limit-secret-at-least-32-characters",
      }),
    );
    mocks.getNeonAuthForEnvironment.mockReturnValue({
      getSession: mocks.getSession,
    });
  });

  it("rejects a stale signed session-data cookie at the server identity boundary", async () => {
    mocks.getSession.mockImplementation(async (options) =>
      options?.query?.disableCookieCache === "true"
        ? { data: null, error: null }
        : {
            data: {
              user: {
                id: "stale-neon-user",
                email: "stale@example.test",
                emailVerified: true,
              },
            },
            error: null,
          },
    );

    await expect(getRequestIdentity()).resolves.toMatchObject({
      identity: null,
      principal: null,
    });
  });
});
