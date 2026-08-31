import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  environment: { AUTH_MODE: "disabled", LOCAL_TEST_DRIVER: "disabled" },
  getSession: vi.fn(),
  getBetterAuthForEnvironment: vi.fn(),
}));

vi.mock("@/config/env-schema", () => ({
  parseServerEnv: () => mocks.environment,
}));

vi.mock("@/auth/better-auth-server", () => ({
  getBetterAuthForEnvironment: mocks.getBetterAuthForEnvironment,
}));

import proxy, { config } from "../../proxy";

describe("application-owned Better Auth proxy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getBetterAuthForEnvironment.mockReturnValue(null);
  });

  it("matches only the intended private route families", () => {
    expect(config.matcher).toEqual([
      "/account/:path*",
      "/admin/:path*",
      "/checkout/:path*",
      "/research-sets/:path*",
    ]);
    expect(config.matcher).not.toContain("/api/auth/:path*");
  });

  it("bypasses session loading when the identity adapter is disabled", async () => {
    await expect(proxy({} as never)).resolves.toBeUndefined();
    expect(mocks.getBetterAuthForEnvironment).toHaveBeenCalledWith(
      mocks.environment,
    );
    expect(mocks.getSession).not.toHaveBeenCalled();
  });

  it("redirects an absent database-validated session to the application sign-in route", async () => {
    mocks.getSession.mockResolvedValue(null);
    mocks.getBetterAuthForEnvironment.mockReturnValue({
      api: { getSession: mocks.getSession },
    });
    const request = {
      url: "https://example.test/account/orders/order-1?tab=record",
      headers: new Headers({ cookie: "propeptiq.session_token=untrusted" }),
      nextUrl: {
        pathname: "/account/orders/order-1",
        search: "?tab=record",
      },
    };

    const response = await proxy(request as never);

    expect(response?.status).toBe(307);
    expect(response?.headers.get("location")).toBe(
      "https://example.test/sign-in/?returnTo=%2Faccount%2Forders%2Forder-1%3Ftab%3Drecord",
    );
    expect(mocks.getSession).toHaveBeenCalledWith({ headers: request.headers });
  });

  it("allows a private request only after a validated user session", async () => {
    mocks.getSession.mockResolvedValue({
      session: { id: "session-1" },
      user: { id: "user-1" },
    });
    mocks.getBetterAuthForEnvironment.mockReturnValue({
      api: { getSession: mocks.getSession },
    });
    const request = {
      url: "https://example.test/account/",
      headers: new Headers(),
      nextUrl: { pathname: "/account/", search: "" },
    };

    await expect(proxy(request as never)).resolves.toBeUndefined();
  });
});
