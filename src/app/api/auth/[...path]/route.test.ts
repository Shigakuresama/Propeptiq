import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  environment: {
    AUTH_PASSWORD_RESET_SESSION_REVOCATION: undefined as
      | "verified"
      | undefined,
  },
  get: vi.fn(),
  getNeonAuth: vi.fn(),
  post: vi.fn(),
}));

vi.mock("@/auth/neon-server", () => ({
  getNeonAuth: mocks.getNeonAuth,
}));

vi.mock("@/env", () => ({
  readServerEnv: () => mocks.environment,
}));

import { GET, POST } from "./route";

const context = {
  params: Promise.resolve({ path: ["sign-in", "email"] }),
};

describe("Managed Neon Auth API proxy route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.environment.AUTH_PASSWORD_RESET_SESSION_REVOCATION = undefined;
    mocks.getNeonAuth.mockReturnValue(null);
  });

  it.each([
    ["POST", ["request-password-reset"]],
    ["POST", ["email-otp", "request-password-reset"]],
    ["POST", ["email-otp", "reset-password"]],
    ["POST", ["email-otp", "passcode"]],
    ["POST", ["forget-password", "email-otp"]],
    ["POST", ["reset-password"]],
    ["GET", ["reset-password", "synthetic-token"]],
  ] as const)(
    "blocks the %s /%s recovery endpoint until session revocation is verified",
    async (method, path) => {
      mocks.getNeonAuth.mockReturnValue({
        handler: () => ({ GET: mocks.get, POST: mocks.post }),
      });
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
      expect(mocks.get).not.toHaveBeenCalled();
      expect(mocks.post).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["POST", ["request-password-reset"]],
    ["POST", ["email-otp", "request-password-reset"]],
    ["POST", ["email-otp", "reset-password"]],
    ["POST", ["email-otp", "passcode"]],
    ["POST", ["forget-password", "email-otp"]],
    ["POST", ["reset-password"]],
    ["GET", ["reset-password", "synthetic-token"]],
  ] as const)(
    "forwards the %s /%s recovery endpoint only after session revocation is verified",
    async (method, path) => {
      mocks.environment.AUTH_PASSWORD_RESET_SESSION_REVOCATION = "verified";
      const expected = new Response(null, { status: 204 });
      mocks.get.mockResolvedValue(expected);
      mocks.post.mockResolvedValue(expected);
      mocks.getNeonAuth.mockReturnValue({
        handler: () => ({ GET: mocks.get, POST: mocks.post }),
      });
      const recoveryContext = { params: Promise.resolve({ path: [...path] }) };
      const request = new Request(
        `https://example.test/api/auth/${path.join("/")}`,
        { method },
      );

      await expect(
        (method === "GET" ? GET : POST)(request, recoveryContext),
      ).resolves.toBe(expected);
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
      mocks.getNeonAuth.mockReturnValue({
        handler: () => ({ POST: mocks.post }),
      });
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
      expect(mocks.post).not.toHaveBeenCalled();
    },
  );

  it.each(["send-verification-otp", "check-verification-otp"])(
    "fails a malformed shared email-otp/%s body closed",
    async (path) => {
      mocks.getNeonAuth.mockReturnValue({
        handler: () => ({ POST: mocks.post }),
      });
      const recoveryContext = {
        params: Promise.resolve({ path: ["email-otp", path] }),
      };
      const request = new Request(
        `https://example.test/api/auth/email-otp/${path}`,
        { method: "POST", body: "not-json" },
      );

      const response = await POST(request, recoveryContext);

      expect(response.status).toBe(404);
      expect(mocks.post).not.toHaveBeenCalled();
    },
  );

  it("forwards non-recovery OTP traffic without consuming its body", async () => {
    const expected = new Response(null, { status: 204 });
    mocks.post.mockImplementation(async (forwardedRequest: Request) => {
      await expect(forwardedRequest.json()).resolves.toEqual({
        email: "buyer@example.test",
        type: "sign-in",
      });
      return expected;
    });
    mocks.getNeonAuth.mockReturnValue({
      handler: () => ({ POST: mocks.post }),
    });
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

    await expect(POST(request, otpContext)).resolves.toBe(expected);
    expect(mocks.post).toHaveBeenCalledWith(request, otpContext);
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

  it("forwards enabled requests through the unified SDK handler", async () => {
    const expected = new Response(null, { status: 204 });
    mocks.post.mockResolvedValue(expected);
    mocks.getNeonAuth.mockReturnValue({
      handler: () => ({ POST: mocks.post }),
    });
    const request = new Request(
      "https://example.test/api/auth/sign-in/email",
      { method: "POST" },
    );

    await expect(POST(request, context)).resolves.toBe(expected);
    expect(mocks.post).toHaveBeenCalledWith(request, context);
  });
});
