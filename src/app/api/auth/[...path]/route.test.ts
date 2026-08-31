import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  environment: {
    APP_ENV: "local" as "local" | "production",
    AUTH_EMAIL_DELIVERY_VERIFIED: "verified" as const,
    AUTH_MODE: "live" as const,
    AUTH_PASSWORD_RESET_SESSION_REVOCATION: undefined as
      | "verified"
      | undefined,
  },
  handler: vi.fn(),
  getBetterAuth: vi.fn(),
}));

vi.mock("@/auth/better-auth-server", () => ({
  getBetterAuth: mocks.getBetterAuth,
}));

vi.mock("@/env", () => ({
  readServerEnv: () => mocks.environment,
}));

import { GET, POST } from "./route";

const context = {
  params: Promise.resolve({ path: ["sign-in", "email"] }),
};

describe("application-owned Better Auth API route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.environment.APP_ENV = "local";
    mocks.environment.AUTH_PASSWORD_RESET_SESSION_REVOCATION = undefined;
    mocks.getBetterAuth.mockReturnValue(null);
  });

  it.each([
    ["POST", ["request-password-reset"]],
    ["POST", ["email-otp", "request-password-reset"]],
    ["POST", ["email-otp", "reset-password"]],
    ["POST", ["email-otp", "passcode"]],
    ["POST", ["forget-password", "email-otp"]],
    ["POST", ["phone-number", "request-password-reset"]],
    ["POST", ["phone-number", "reset-password"]],
    ["POST", ["reset-password"]],
    ["GET", ["reset-password", "synthetic-token"]],
  ] as const)(
    "blocks the %s /%s recovery endpoint until session revocation is verified",
    async (method, path) => {
      mocks.getBetterAuth.mockReturnValue({ handler: mocks.handler });
      const recoveryContext = { params: Promise.resolve({ path: [...path] }) };
      const request = new Request(
        `https://example.test/api/auth/${path.join("/")}`,
        { method },
      );

      const response = await (method === "GET" ? GET : POST)(
        request,
        recoveryContext,
      );

      expect(response.status).toBe(404);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(mocks.handler).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["POST", ["request-password-reset"]],
    ["POST", ["email-otp", "request-password-reset"]],
    ["POST", ["email-otp", "reset-password"]],
    ["POST", ["email-otp", "passcode"]],
    ["POST", ["forget-password", "email-otp"]],
    ["POST", ["phone-number", "request-password-reset"]],
    ["POST", ["phone-number", "reset-password"]],
    ["POST", ["reset-password"]],
    ["GET", ["reset-password", "synthetic-token"]],
  ] as const)(
    "forwards the %s /%s recovery endpoint only after session revocation is verified",
    async (method, path) => {
      mocks.environment.AUTH_PASSWORD_RESET_SESSION_REVOCATION = "verified";
      const expected = new Response(null, { status: 204 });
      mocks.handler.mockResolvedValue(expected);
      mocks.getBetterAuth.mockReturnValue({ handler: mocks.handler });
      const recoveryContext = { params: Promise.resolve({ path: [...path] }) };
      const request = new Request(
        `https://example.test/api/auth/${path.join("/")}`,
        { method },
      );

      const response = await (method === "GET" ? GET : POST)(
        request,
        recoveryContext,
      );

      expect(response.status).toBe(expected.status);
      expect(response.headers.get("cache-control")).toBe(
        "private, no-store, max-age=0",
      );
      expect(mocks.handler).toHaveBeenCalledWith(request);
    },
  );

  it.each([
    ["send-verification-otp", { email: "buyer@example.test", type: "forget-password" }],
    [
      "check-verification-otp",
      { email: "buyer@example.test", otp: "123456", type: "forget-password" },
    ],
  ] as const)(
    "blocks password recovery through the shared email-otp/%s endpoint",
    async (path, body) => {
      mocks.getBetterAuth.mockReturnValue({ handler: mocks.handler });
      const recoveryContext = {
        params: Promise.resolve({ path: ["email-otp", path] }),
      };
      const request = new Request(
        `https://example.test/api/auth/email-otp/${path}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );

      const response = await POST(request, recoveryContext);

      expect(response.status).toBe(404);
      expect(mocks.handler).not.toHaveBeenCalled();
    },
  );

  it.each(["send-verification-otp", "check-verification-otp"])(
    "fails a malformed shared email-otp/%s body closed",
    async (path) => {
      mocks.getBetterAuth.mockReturnValue({ handler: mocks.handler });
      const recoveryContext = {
        params: Promise.resolve({ path: ["email-otp", path] }),
      };
      const request = new Request(
        `https://example.test/api/auth/email-otp/${path}`,
        { method: "POST", body: "not-json" },
      );

      const response = await POST(request, recoveryContext);

      expect(response.status).toBe(404);
      expect(mocks.handler).not.toHaveBeenCalled();
    },
  );

  it("forwards non-recovery OTP traffic without consuming its body", async () => {
    const expected = new Response(null, { status: 204 });
    mocks.handler.mockImplementation(async (forwardedRequest: Request) => {
      await expect(forwardedRequest.json()).resolves.toEqual({
        email: "buyer@example.test",
        type: "sign-in",
      });
      return expected;
    });
    mocks.getBetterAuth.mockReturnValue({ handler: mocks.handler });
    const otpContext = {
      params: Promise.resolve({
        path: ["email-otp", "send-verification-otp"],
      }),
    };
    const request = new Request(
      "https://example.test/api/auth/email-otp/send-verification-otp",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "buyer@example.test",
          type: "sign-in",
        }),
      },
    );

    const response = await POST(request, otpContext);

    expect(response.status).toBe(expected.status);
    expect(response.headers.get("cache-control")).toBe(
      "private, no-store, max-age=0",
    );
    expect(mocks.handler).toHaveBeenCalledWith(request);
  });

  it("returns a non-cacheable 404 while auth is disabled", async () => {
    const response = await GET(
      new Request("https://example.test/api/auth/session"),
      context,
    );

    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({
      error: "Identity service unavailable",
    });
  });

  it.each(["sign-in", "sign-up"])(
    "forwards live %s requests while recovery remains disabled",
    async (operation) => {
      const expected = new Response(null, { status: 204 });
      mocks.handler.mockResolvedValue(expected);
      mocks.getBetterAuth.mockReturnValue({ handler: mocks.handler });
      const request = new Request(
        `https://example.test/api/auth/${operation}/email`,
        { method: "POST" },
      );
      const enabledContext = {
        params: Promise.resolve({ path: [operation, "email"] }),
      };

      const response = await POST(request, enabledContext);

      expect(response.status).toBe(expected.status);
      expect(response.headers.get("cache-control")).toBe(
        "private, no-store, max-age=0",
      );
      expect(mocks.handler).toHaveBeenCalledWith(request);
    },
  );

  it("fails a deployed request closed without one trusted Vercel caller address", async () => {
    mocks.environment.APP_ENV = "production";
    mocks.getBetterAuth.mockReturnValue({ handler: mocks.handler });
    const response = await POST(
      new Request("https://example.test/api/auth/sign-in/email", {
        method: "POST",
      }),
      context,
    );

    expect(response.status).toBe(400);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("retry-after")).toBeNull();
    expect(mocks.handler).not.toHaveBeenCalled();
  });

  it("forwards a deployed request with one valid Vercel caller address", async () => {
    mocks.environment.APP_ENV = "production";
    const expected = new Response(null, { status: 204 });
    mocks.handler.mockResolvedValue(expected);
    mocks.getBetterAuth.mockReturnValue({ handler: mocks.handler });
    const request = new Request(
      "https://example.test/api/auth/sign-in/email",
      {
        method: "POST",
        headers: { "x-vercel-forwarded-for": "203.0.113.8" },
      },
    );

    const response = await POST(request, context);

    expect(response.status).toBe(expected.status);
    expect(response.headers.get("cache-control")).toBe(
      "private, no-store, max-age=0",
    );
    expect(mocks.handler).toHaveBeenCalledWith(request);
  });

  it("forces forwarded auth responses to remain private and non-cacheable", async () => {
    const upstream = Response.json(
      { session: null },
      {
        headers: {
          "Cache-Control": "public, max-age=60",
          "Set-Cookie": "better-auth.session_token=synthetic; Path=/; HttpOnly",
        },
      },
    );
    mocks.handler.mockResolvedValue(upstream);
    mocks.getBetterAuth.mockReturnValue({ handler: mocks.handler });

    const response = await GET(
      new Request("https://example.test/api/auth/get-session"),
      { params: Promise.resolve({ path: ["get-session"] }) },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe(
      "private, no-store, max-age=0",
    );
    expect(response.headers.get("pragma")).toBe("no-cache");
    expect(response.headers.get("expires")).toBe("0");
    expect(response.headers.get("set-cookie")).toContain(
      "better-auth.session_token=synthetic",
    );
    await expect(response.json()).resolves.toEqual({ session: null });
  });
});
