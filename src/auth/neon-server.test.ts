import { beforeEach, describe, expect, it, vi } from "vitest";

import { parseServerEnv } from "@/config/env-schema";

const mocks = vi.hoisted(() => ({
  createNeonAuth: vi.fn(() => ({ marker: "managed-auth" })),
}));

vi.mock("@neondatabase/auth/next/server", () => ({
  createNeonAuth: mocks.createNeonAuth,
}));

import { getNeonAuthForEnvironment } from "./neon-server";

const baseUrl =
  "https://ep-synthetic.neonauth.c-10.us-east-1.aws.neon.tech/neondb/auth";
const cookieSecret =
  "synthetic-neon-auth-cookie-secret-at-least-32-characters";

describe("Managed Neon Auth server configuration", () => {
  beforeEach(() => vi.clearAllMocks());

  it("does not construct a provider when auth is disabled", () => {
    expect(getNeonAuthForEnvironment(parseServerEnv({}))).toBeNull();
    expect(mocks.createNeonAuth).not.toHaveBeenCalled();
  });

  it("constructs the unified server SDK with the Vercel-injected URL and stable cookie secret", () => {
    const auth = getNeonAuthForEnvironment(
      parseServerEnv({
        APP_ORIGIN: "http://localhost:3000",
        AUTH_MODE: "test",
        STORAGE_NEON_AUTH_BASE_URL: baseUrl,
        NEON_AUTH_COOKIE_SECRET: cookieSecret,
        RATE_LIMIT_SECRET:
          "synthetic-rate-limit-secret-at-least-32-characters",
      }),
    );

    expect(auth).toEqual({ marker: "managed-auth" });
    expect(mocks.createNeonAuth).toHaveBeenCalledWith({
      baseUrl,
      cookies: { secret: cookieSecret },
    });
  });
});
