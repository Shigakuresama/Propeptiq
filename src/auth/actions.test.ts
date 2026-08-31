import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const signUpEmail = vi.fn();
  const signInEmail = vi.fn();
  const sendVerificationOTP = vi.fn();
  const verifyEmailOTP = vi.fn();
  const requestPasswordReset = vi.fn();
  const resetPassword = vi.fn();
  const signOut = vi.fn();
  const requestHeaders = new Headers({
    cookie: "propeptiq.session_token=synthetic-session",
  });
  return {
    consumeAuthActionRateLimit: vi.fn().mockResolvedValue(true),
    auth: {
      api: {
        signUpEmail,
        signInEmail,
        sendVerificationOTP,
        verifyEmailOTP,
        requestPasswordReset,
        resetPassword,
        signOut,
      },
    },
    requestHeaders,
    requestPasswordReset,
    resetPassword,
    sendVerificationOTP,
    signInEmail,
    signOut,
    signUpEmail,
    verifyEmailOTP,
    environment: {
      APP_ORIGIN: "https://propeptiq.example.test" as string | undefined,
      AUTH_EMAIL_DELIVERY_VERIFIED: "verified" as const,
      AUTH_PASSWORD_RESET_SESSION_REVOCATION: "verified" as
        | "verified"
        | undefined,
      AUTH_MODE: "test" as "test" | "live",
    },
  };
});

vi.mock("@/env", () => ({
  readServerEnv: () => mocks.environment,
}));

vi.mock("@/auth/better-auth-server", () => ({
  getBetterAuthForEnvironment: () => mocks.auth,
}));

vi.mock("@/auth/action-rate-limit", () => ({
  consumeAuthActionRateLimit: mocks.consumeAuthActionRateLimit,
}));

vi.mock("next/headers", () => ({
  headers: async () => mocks.requestHeaders,
  cookies: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: (destination: string) => {
    throw new Error(`redirect:${destination}`);
  },
}));

import {
  requestManagedPasswordReset,
  resendVerificationCode,
  resetManagedPassword,
  signInWithEmail,
  signOutManagedIdentity,
  signUpWithEmail,
  verifyEmailOtp,
} from "./actions";

const initialState = { status: "idle", message: "" } as const;

describe("application-owned Better Auth actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.environment.APP_ORIGIN = "https://propeptiq.example.test";
    mocks.environment.AUTH_PASSWORD_RESET_SESSION_REVOCATION = "verified";
    mocks.environment.AUTH_MODE = "test";
    mocks.consumeAuthActionRateLimit.mockResolvedValue(true);
  });

  it("rejects invalid signup input before calling the identity provider", async () => {
    const formData = new FormData();
    formData.set("name", "");
    formData.set("email", "not-an-email");
    formData.set("password", "short");

    await expect(signUpWithEmail(initialState, formData)).resolves.toMatchObject({
      status: "error",
    });
    expect(mocks.signUpEmail).not.toHaveBeenCalled();
  });

  it("creates an unverified account while the configured plugin owns OTP delivery", async () => {
    mocks.signUpEmail.mockResolvedValue({
      token: null,
      user: {
        id: "better-auth-user",
        email: "researcher@example.test",
        emailVerified: false,
      },
    });
    const formData = new FormData();
    formData.set("name", "Researcher");
    formData.set("email", "researcher@example.test");
    formData.set("password", "research-password");

    await expect(signUpWithEmail(initialState, formData)).resolves.toEqual({
      status: "verification",
      email: "researcher@example.test",
      message:
        "Enter the verification code from your email. If it does not arrive, request a new code.",
    });
    expect(mocks.signUpEmail).toHaveBeenCalledWith({
      body: {
        name: "Researcher",
        email: "researcher@example.test",
        password: "research-password",
      },
      headers: mocks.requestHeaders,
    });
    expect(mocks.sendVerificationOTP).not.toHaveBeenCalled();
  });

  it("keeps signup failures generic", async () => {
    mocks.signUpEmail.mockRejectedValue(
      new Error("database included private provider detail"),
    );
    const formData = new FormData();
    formData.set("name", "Researcher");
    formData.set("email", "researcher@example.test");
    formData.set("password", "research-password");

    await expect(signUpWithEmail(initialState, formData)).resolves.toEqual({
      status: "error",
      message: "We could not complete that identity request. Please try again.",
    });
  });

  it("redirects a provider-confirmed verified signup", async () => {
    mocks.signUpEmail.mockResolvedValue({
      token: "session-token",
      user: {
        id: "better-auth-user",
        email: "researcher@example.test",
        emailVerified: true,
      },
    });
    const formData = new FormData();
    formData.set("name", "Researcher");
    formData.set("email", "researcher@example.test");
    formData.set("password", "research-password");

    await expect(signUpWithEmail(initialState, formData)).rejects.toThrow(
      "redirect:/checkout",
    );
  });

  it("keeps verification-code resend enumeration neutral", async () => {
    const formData = new FormData();
    formData.set("email", "researcher@example.test");
    mocks.sendVerificationOTP.mockResolvedValue({ success: true });
    const success = await resendVerificationCode(initialState, formData);

    mocks.sendVerificationOTP.mockRejectedValue(
      new Error("unknown account"),
    );
    const rejection = await resendVerificationCode(initialState, formData);

    expect(success).toEqual(rejection);
    expect(success.message).toMatch(/if this address can receive/i);
    expect(mocks.sendVerificationOTP).toHaveBeenCalledWith({
      body: {
        email: "researcher@example.test",
        type: "email-verification",
      },
      headers: mocks.requestHeaders,
    });
  });

  it("keeps a malformed OTP in the verification step without a provider call", async () => {
    const formData = new FormData();
    formData.set("email", "researcher@example.test");
    formData.set("otp", "not-numeric");

    await expect(verifyEmailOtp(initialState, formData)).resolves.toMatchObject({
      status: "verification",
      email: "researcher@example.test",
    });
    expect(mocks.verifyEmailOTP).not.toHaveBeenCalled();
  });

  it("does not accept an unsuccessful OTP verification", async () => {
    mocks.verifyEmailOTP.mockResolvedValue({
      status: false,
      token: null,
      user: { emailVerified: false },
    });
    const formData = new FormData();
    formData.set("email", "researcher@example.test");
    formData.set("otp", "123456");

    await expect(verifyEmailOtp(initialState, formData)).resolves.toEqual({
      status: "verification",
      email: "researcher@example.test",
      message: "That code could not be verified. Request a new code and try again.",
    });
  });

  it("redirects only after Better Auth confirms the verified OTP session", async () => {
    mocks.verifyEmailOTP.mockResolvedValue({
      status: true,
      token: "fresh-session-token",
      user: { emailVerified: true },
    });
    const formData = new FormData();
    formData.set("email", "researcher@example.test");
    formData.set("otp", "123456");
    formData.set("returnTo", "/account/orders/order-1?tab=record");

    await expect(verifyEmailOtp(initialState, formData)).rejects.toThrow(
      "redirect:/account/orders/order-1?tab=record",
    );
    expect(mocks.verifyEmailOTP).toHaveBeenCalledWith({
      body: { email: "researcher@example.test", otp: "123456" },
      headers: mocks.requestHeaders,
    });
  });

  it("keeps an incomplete verified-email result in the verification step", async () => {
    mocks.verifyEmailOTP.mockResolvedValue({
      status: true,
      token: null,
      user: { emailVerified: true },
    });
    const formData = new FormData();
    formData.set("email", "researcher@example.test");
    formData.set("otp", "123456");

    await expect(verifyEmailOtp(initialState, formData)).resolves.toMatchObject({
      status: "verification",
      email: "researcher@example.test",
    });
  });

  it("keeps sign-out failures generic", async () => {
    mocks.signOut.mockRejectedValue(new Error("session deletion failed"));

    await expect(
      signOutManagedIdentity(initialState, new FormData()),
    ).resolves.toEqual({
      status: "error",
      message: "We could not sign you out. Please try again.",
    });
  });

  it("redirects only after Better Auth confirms sign-out", async () => {
    mocks.signOut.mockResolvedValue({ success: true });

    await expect(
      signOutManagedIdentity(initialState, new FormData()),
    ).rejects.toThrow("redirect:/sign-in/");
    expect(mocks.signOut).toHaveBeenCalledWith({
      headers: mocks.requestHeaders,
    });
  });

  it("requests a neutral verification code after documented unverified-email failure", async () => {
    mocks.signInEmail.mockRejectedValue({
      body: { code: "EMAIL_NOT_VERIFIED", message: "Email not verified" },
    });
    mocks.sendVerificationOTP.mockResolvedValue({ success: true });
    const formData = new FormData();
    formData.set("email", "researcher@example.test");
    formData.set("password", "research-password");

    await expect(signInWithEmail(initialState, formData)).resolves.toMatchObject({
      status: "verification",
      email: "researcher@example.test",
    });
  });

  it("returns a verified password session to its allowlisted private page", async () => {
    mocks.signInEmail.mockResolvedValue({
      token: "session-token",
      user: {
        id: "better-auth-user",
        email: "researcher@example.test",
        emailVerified: true,
      },
    });
    const formData = new FormData();
    formData.set("email", "researcher@example.test");
    formData.set("password", "research-password");
    formData.set("returnTo", "/research-sets");

    await expect(signInWithEmail(initialState, formData)).rejects.toThrow(
      "redirect:/research-sets",
    );
    expect(mocks.signInEmail).toHaveBeenCalledWith({
      body: {
        email: "researcher@example.test",
        password: "research-password",
      },
      headers: mocks.requestHeaders,
    });
  });

  it("keeps provider-specific sign-in failures generic", async () => {
    mocks.signInEmail.mockRejectedValue(new Error("unknown email"));
    const formData = new FormData();
    formData.set("email", "researcher@example.test");
    formData.set("password", "research-password");

    await expect(signInWithEmail(initialState, formData)).resolves.toEqual({
      status: "error",
      message: "We could not complete that identity request. Please try again.",
    });
  });

  it("fails a throttled sign-in closed before checking credentials", async () => {
    mocks.consumeAuthActionRateLimit.mockResolvedValue(false);
    const formData = new FormData();
    formData.set("email", "researcher@example.test");
    formData.set("password", "research-password");

    await expect(signInWithEmail(initialState, formData)).resolves.toEqual({
      status: "error",
      message: "We could not complete that identity request. Please try again.",
    });
    expect(mocks.signInEmail).not.toHaveBeenCalled();
  });

  it("keeps password recovery closed until session revocation is evidenced", async () => {
    mocks.environment.AUTH_MODE = "live";
    mocks.environment.AUTH_PASSWORD_RESET_SESSION_REVOCATION = undefined;
    const formData = new FormData();
    formData.set("email", "researcher@example.test");

    await expect(
      requestManagedPasswordReset(initialState, formData),
    ).resolves.toEqual({
      status: "error",
      message: "Password reset is temporarily unavailable. Please try again later.",
    });
    expect(mocks.requestPasswordReset).not.toHaveBeenCalled();
  });

  it("requests a password reset with an application-owned callback", async () => {
    mocks.requestPasswordReset.mockResolvedValue({
      status: true,
      message: "If this email exists, check your inbox.",
    });
    const formData = new FormData();
    formData.set("email", "researcher@example.test");
    formData.set("returnTo", "/account/orders/order-1");

    await expect(
      requestManagedPasswordReset(initialState, formData),
    ).resolves.toMatchObject({ status: "success" });
    expect(mocks.requestPasswordReset).toHaveBeenCalledWith({
      body: {
        email: "researcher@example.test",
        redirectTo:
          "https://propeptiq.example.test/reset-password?returnTo=%2Faccount%2Forders%2Forder-1",
      },
      headers: mocks.requestHeaders,
    });
  });

  it("keeps password-reset requests enumeration neutral after provider rejection", async () => {
    mocks.requestPasswordReset.mockRejectedValue(new Error("unknown email"));
    const formData = new FormData();
    formData.set("email", "unknown@example.test");

    await expect(
      requestManagedPasswordReset(initialState, formData),
    ).resolves.toEqual({
      status: "success",
      message:
        "If an account exists for this email, a password reset link has been requested. Check your inbox.",
    });
  });

  it("does not claim a reset request without an application origin", async () => {
    mocks.environment.APP_ORIGIN = undefined;
    const formData = new FormData();
    formData.set("email", "researcher@example.test");

    await expect(
      requestManagedPasswordReset(initialState, formData),
    ).resolves.toMatchObject({ status: "error" });
    expect(mocks.requestPasswordReset).not.toHaveBeenCalled();
  });

  it("rejects mismatched replacement passwords before calling the provider", async () => {
    const formData = new FormData();
    formData.set("token", "synthetic-reset-token");
    formData.set("password", "new-research-password");
    formData.set("confirmPassword", "different-research-password");

    await expect(resetManagedPassword(initialState, formData)).resolves.toEqual({
      status: "error",
      message: "Enter matching passwords of at least 8 characters.",
    });
    expect(mocks.resetPassword).not.toHaveBeenCalled();
  });

  it("resets a password and preserves the allowlisted post-sign-in destination", async () => {
    mocks.resetPassword.mockResolvedValue({ status: true });
    const formData = new FormData();
    formData.set("token", "synthetic-reset-token");
    formData.set("password", "new-research-password");
    formData.set("confirmPassword", "new-research-password");
    formData.set("returnTo", "/research-sets");

    await expect(resetManagedPassword(initialState, formData)).rejects.toThrow(
      "redirect:/sign-in/?returnTo=%2Fresearch-sets",
    );
    expect(mocks.resetPassword).toHaveBeenCalledWith({
      body: {
        newPassword: "new-research-password",
        token: "synthetic-reset-token",
      },
      headers: mocks.requestHeaders,
    });
  });

  it("keeps invalid or expired reset tokens generic", async () => {
    mocks.resetPassword.mockRejectedValue(new Error("reset token expired"));
    const formData = new FormData();
    formData.set("token", "synthetic-expired-token");
    formData.set("password", "new-research-password");
    formData.set("confirmPassword", "new-research-password");

    await expect(resetManagedPassword(initialState, formData)).resolves.toEqual({
      status: "error",
      message:
        "This reset link could not be used. Request a new link and try again.",
    });
  });
});
