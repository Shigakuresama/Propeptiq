import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  environment: { AUTH_MODE: "disabled", LOCAL_TEST_DRIVER: "disabled" },
  middleware: vi.fn(),
  middlewareHandler: vi.fn(),
  getNeonAuthForEnvironment: vi.fn(),
}));

vi.mock("@/config/env-schema", () => ({
  parseServerEnv: () => mocks.environment,
}));

vi.mock("@/auth/neon-server", () => ({
  getNeonAuthForEnvironment: mocks.getNeonAuthForEnvironment,
}));

import proxy, { config } from "../../proxy";

describe("Managed Neon Auth proxy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getNeonAuthForEnvironment.mockReturnValue(null);
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

  it("bypasses middleware when the identity adapter is disabled", () => {
    expect(proxy({} as never)).toBeUndefined();
    expect(mocks.getNeonAuthForEnvironment).toHaveBeenCalledWith(
      mocks.environment,
    );
  });

  it("uses the managed middleware with the application sign-in route", () => {
    mocks.middleware.mockReturnValue(mocks.middlewareHandler);
    mocks.middlewareHandler.mockReturnValue("protected-response");
    mocks.getNeonAuthForEnvironment.mockReturnValue({
      middleware: mocks.middleware,
    });
    const request = {
      nextUrl: {
        pathname: "/account/orders/order-1",
        search: "?tab=record",
      },
    };

    expect(proxy(request as never)).toBe("protected-response");
    expect(mocks.middleware).toHaveBeenCalledWith({
      loginUrl:
        "/sign-in/?returnTo=%2Faccount%2Forders%2Forder-1%3Ftab%3Drecord",
    });
    expect(mocks.middlewareHandler).toHaveBeenCalledWith(request);
  });
});
