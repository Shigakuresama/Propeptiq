import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const signUpEmail = vi.fn();
  const signInEmail = vi.fn();
  const sendVerificationOtp = vi.fn();
  const verifyEmail = vi.fn();
  const getSession = vi.fn();
  const requestPasswordReset = vi.fn();
  const resetPassword = vi.fn();
  const signOut = vi.fn();
  return {
    auth: {
      signUp: { email: signUpEmail },
      signIn: { email: signInEmail },
      emailOtp: { sendVerificationOtp, verifyEmail },
      getSession,
      requestPasswordReset,
      resetPassword,
      signOut,
    },
    getSession,
    requestPasswordReset,
    resetPassword,
    sendVerificationOtp,
    signInEmail,
    signOut,
    signUpEmail,
    verifyEmail,
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

vi.mock("@/auth/neon-server", () => ({
  getNeonAuthForEnvironment: () => mocks.auth,
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

describe("Managed Neon Auth actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.environment.APP_ORIGIN = "https://propeptiq.example.test";
    mocks.environment.AUTH_PASSWORD_RESET_SESSION_REVOCATION = "verified";
    mocks.environment.AUTH_MODE = "test";
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
    expect(mocks.sendVerificationOtp).not.toHaveBeenCalled();
  });

  it("creates an account and requests the configured email-verification OTP", async () => {
    mocks.signUpEmail.mockResolvedValue({
      data: {
        user: {
          id: "neon-user",
          email: "researcher@example.test",
          emailVerified: false,
        },
      },
      error: null,
    });
    mocks.sendVerificationOtp.mockResolvedValue({ data: { success: true }, error: null });
    const formData = new FormData();
    formData.set("name", "Researcher");
    formData.set("email", "researcher@example.test");
    formData.set("password", "research-password");

    await expect(signUpWithEmail(initialState, formData)).resolves.toEqual({
      status: "verification",
      email: "researcher@example.test",
      message: "Enter the verification code sent to your email address.",
    });
    expect(mocks.sendVerificationOtp).toHaveBeenCalledWith({
      email: "researcher@example.test",
      type: "email-verification",
    });
  });

  it("does not reveal whether an address can receive a verification code", async () => {
    mocks.sendVerificationOtp.mockResolvedValue({
      data: null,
      error: { message: "provider unavailable" },
    });
    const formData = new FormData();
    formData.set("email", "researcher@example.test");

    const state = await resendVerificationCode(initialState, formData);

    expect(state.status).toBe("verification");
    expect(state.message).toMatch(/if this address can receive/i);

    mocks.sendVerificationOtp.mockResolvedValue({
      data: { success: true },
      error: null,
    });
    const successfulState = await resendVerificationCode(initialState, formData);
    expect(successfulState.message).toBe(state.message);
  });

  it("does not claim a code was sent when signup OTP delivery fails", async () => {
    mocks.signUpEmail.mockResolvedValue({
      data: {
        user: {
          id: "neon-user",
          email: "researcher@example.test",
          emailVerified: false,
        },
      },
      error: null,
    });
    mocks.sendVerificationOtp.mockResolvedValue({
      data: null,
      error: { message: "provider unavailable" },
    });
    const formData = new FormData();
    formData.set("name", "Researcher");
    formData.set("email", "researcher@example.test");
    formData.set("password", "research-password");

    const state = await signUpWithEmail(initialState, formData);

    expect(state.status).toBe("verification");
    expect(state.message).toMatch(/could not be sent/i);
  });

  it("does not claim a code was sent when the provider reports an unsuccessful OTP request", async () => {
    mocks.signUpEmail.mockResolvedValue({
      data: {
        user: {
          id: "neon-user",
          email: "researcher@example.test",
          emailVerified: false,
        },
      },
      error: null,
    });
    mocks.sendVerificationOtp.mockResolvedValue({
      data: { success: false },
      error: null,
    });
    const formData = new FormData();
    formData.set("name", "Researcher");
    formData.set("email", "researcher@example.test");
    formData.set("password", "research-password");

    const state = await signUpWithEmail(initialState, formData);

    expect(state.status).toBe("verification");
    expect(state.message).toMatch(/could not be sent/i);
  });

  it("redirects a provider-confirmed verified signup without sending an OTP", async () => {
    mocks.signUpEmail.mockResolvedValue({
      data: {
        user: {
          id: "neon-user",
          email: "researcher@example.test",
          emailVerified: true,
        },
      },
      error: null,
    });
    const formData = new FormData();
    formData.set("name", "Researcher");
    formData.set("email", "researcher@example.test");
    formData.set("password", "research-password");

    await expect(signUpWithEmail(initialState, formData)).rejects.toThrow(
      "redirect:/checkout",
    );
    expect(mocks.sendVerificationOtp).not.toHaveBeenCalled();
  });

  it("keeps a malformed OTP in the verification step without a provider call", async () => {
    const formData = new FormData();
    formData.set("email", "researcher@example.test");
    formData.set("otp", "not-numeric");

    await expect(verifyEmailOtp(initialState, formData)).resolves.toMatchObject({
      status: "verification",
      email: "researcher@example.test",
    });
    expect(mocks.verifyEmail).not.toHaveBeenCalled();
  });

  it("does not accept an OTP when the provider reports an unsuccessful verification", async () => {
    mocks.verifyEmail.mockResolvedValue({ data: { status: false }, error: null });
    mocks.getSession.mockResolvedValue({
      data: {
        user: { emailVerified: true },
        session: { id: "session-id" },
      },
      error: null,
    });
    const formData = new FormData();
    formData.set("email", "researcher@example.test");
    formData.set("otp", "123456");

    await expect(verifyEmailOtp(initialState, formData)).resolves.toEqual({
      status: "verification",
      email: "researcher@example.test",
      message: "That code could not be verified. Request a new code and try again.",
    });
    expect(mocks.getSession).not.toHaveBeenCalled();
  });

  it("redirects a server-confirmed verified OTP session to checkout", async () => {
    mocks.verifyEmail.mockResolvedValue({ data: { status: true }, error: null });
    mocks.getSession.mockResolvedValue({
      data: {
        user: { emailVerified: true },
        session: { id: "session-id" },
      },
      error: null,
    });
    const formData = new FormData();
    formData.set("email", "researcher@example.test");
    formData.set("otp", "123456");
    formData.set("returnTo", "/account/orders/order-1?tab=record");

    await expect(verifyEmailOtp(initialState, formData)).rejects.toThrow(
      "redirect:/account/orders/order-1?tab=record",
    );
    expect(mocks.getSession).toHaveBeenCalledWith({
      query: { disableCookieCache: "true" },
    });
  });

  it("keeps a verified email in the verification step when the fresh session fails", async () => {
    mocks.verifyEmail.mockResolvedValue({ data: { status: true }, error: null });
    mocks.getSession.mockResolvedValue({
      data: null,
      error: { message: "session refresh unavailable" },
    });
    const formData = new FormData();
    formData.set("email", "researcher@example.test");
    formData.set("otp", "123456");

    await expect(verifyEmailOtp(initialState, formData)).resolves.toEqual({
      status: "verification",
      email: "researcher@example.test",
      message:
        "Your email was verified, but the session could not be refreshed. Use a different email to sign in again.",
    });
  });

  it("keeps the user in place with a generic error when managed sign-out fails", async () => {
    mocks.signOut.mockResolvedValue({
      data: null,
      error: { message: "upstream session revocation failed" },
    });

    await expect(
      signOutManagedIdentity(initialState, new FormData()),
    ).resolves.toEqual({
      status: "error",
      message: "We could not sign you out. Please try again.",
    });
  });

  it("redirects only after managed sign-out succeeds", async () => {
    mocks.signOut.mockResolvedValue({ data: { success: true }, error: null });

    await expect(
      signOutManagedIdentity(initialState, new FormData()),
    ).rejects.toThrow("redirect:/sign-in/");
  });

  it("preserves an allowlisted return path while switching OTP identities", async () => {
    mocks.signOut.mockResolvedValue({ data: { success: true }, error: null });
    const formData = new FormData();
    formData.set("returnTo", "/account/orders/order-1?tab=record");

    await expect(
      signOutManagedIdentity(initialState, formData),
    ).rejects.toThrow(
      "redirect:/sign-in/?returnTo=%2Faccount%2Forders%2Forder-1%3Ftab%3Drecord",
    );
  });

  it("does not allow an unverified password session into checkout", async () => {
    mocks.signInEmail.mockResolvedValue({
      data: null,
      error: {
        code: "email_not_confirmed",
        message: "Email not confirmed",
      },
    });
    mocks.sendVerificationOtp.mockResolvedValue({ data: { success: true }, error: null });
    const formData = new FormData();
    formData.set("email", "researcher@example.test");
    formData.set("password", "research-password");

    await expect(signInWithEmail(initialState, formData)).resolves.toMatchObject({
      status: "verification",
      email: "researcher@example.test",
    });
  });

  it("keeps password recovery closed until provider session revocation is evidenced", async () => {
    mocks.environment.AUTH_MODE = "live";
    mocks.environment.AUTH_PASSWORD_RESET_SESSION_REVOCATION = undefined;
    const formData = new FormData();
    formData.set("email", "researcher@example.test");

    await expect(
      requestManagedPasswordReset(initialState, formData),
    ).resolves.toEqual({
      status: "error",
      message:
        "Password reset is temporarily unavailable. Please try again later.",
    });
    expect(mocks.requestPasswordReset).not.toHaveBeenCalled();
  });

  it("returns a verified password session to its allowlisted private page", async () => {
    mocks.signInEmail.mockResolvedValue({
      data: {
        user: {
          id: "neon-user",
          email: "researcher@example.test",
          emailVerified: true,
        },
      },
      error: null,
    });
    const formData = new FormData();
    formData.set("email", "researcher@example.test");
    formData.set("password", "research-password");
    formData.set("returnTo", "/research-sets");

    await expect(signInWithEmail(initialState, formData)).rejects.toThrow(
      "redirect:/research-sets",
    );
  });

  it("keeps provider-specific sign-in failures generic", async () => {
    mocks.signInEmail.mockResolvedValue({
      data: null,
      error: { message: "no user exists for this exact email" },
    });
    const formData = new FormData();
    formData.set("email", "researcher@example.test");
    formData.set("password", "research-password");

    const state = await signInWithEmail(initialState, formData);

    expect(state).toEqual({
      status: "error",
      message: "We could not complete that identity request. Please try again.",
    });
  });

  it("requests a password reset with an application-owned callback", async () => {
    mocks.requestPasswordReset.mockResolvedValue({
      data: {
        status: true,
        message: "If this email exists, check your inbox.",
      },
      error: null,
    });
    const formData = new FormData();
    formData.set("email", "researcher@example.test");
    formData.set("returnTo", "/account/orders/order-1");

    await expect(
      requestManagedPasswordReset(initialState, formData),
    ).resolves.toEqual({
      status: "success",
      message:
        "If an account exists for this email, a password reset link has been requested. Check your inbox.",
    });
    expect(mocks.requestPasswordReset).toHaveBeenCalledWith({
      email: "researcher@example.test",
      redirectTo:
        "https://propeptiq.example.test/reset-password?returnTo=%2Faccount%2Forders%2Forder-1",
    });
  });

  it("keeps password-reset requests enumeration neutral when the provider rejects them", async () => {
    mocks.requestPasswordReset.mockResolvedValue({
      data: null,
      error: { message: "no user exists for this exact email" },
    });
    const formData = new FormData();
    formData.set("email", "unknown@example.test");

    const state = await requestManagedPasswordReset(initialState, formData);

    expect(state).toEqual({
      status: "success",
      message:
        "If an account exists for this email, a password reset link has been requested. Check your inbox.",
    });
  });

  it("does not claim a reset email was requested without an application origin", async () => {
    mocks.environment.APP_ORIGIN = undefined;
    const formData = new FormData();
    formData.set("email", "researcher@example.test");

    await expect(
      requestManagedPasswordReset(initialState, formData),
    ).resolves.toEqual({
      status: "error",
      message:
        "Password reset is temporarily unavailable. Please try again later.",
    });
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
    mocks.resetPassword.mockResolvedValue({
      data: { status: true },
      error: null,
    });
    const formData = new FormData();
    formData.set("token", "synthetic-reset-token");
    formData.set("password", "new-research-password");
    formData.set("confirmPassword", "new-research-password");
    formData.set("returnTo", "/research-sets");

    await expect(resetManagedPassword(initialState, formData)).rejects.toThrow(
      "redirect:/sign-in/?returnTo=%2Fresearch-sets",
    );
    expect(mocks.resetPassword).toHaveBeenCalledWith({
      newPassword: "new-research-password",
      token: "synthetic-reset-token",
    });
  });

  it("keeps invalid or expired reset tokens generic", async () => {
    mocks.resetPassword.mockResolvedValue({
      data: null,
      error: { message: "reset token expired" },
    });
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
