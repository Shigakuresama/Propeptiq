import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resendVerificationCode: vi.fn(),
  signInWithEmail: vi.fn(),
  signUpWithEmail: vi.fn(),
  verifyEmailOtp: vi.fn(),
}));

vi.mock("@/auth/actions", () => ({
  resendVerificationCode: mocks.resendVerificationCode,
  signInWithEmail: mocks.signInWithEmail,
  signOutManagedIdentity: vi.fn(),
  signUpWithEmail: mocks.signUpWithEmail,
  verifyEmailOtp: mocks.verifyEmailOtp,
}));

import {
  ManagedAuthForm,
  resolveManagedOtpMessage,
} from "./managed-auth-form";

describe("ManagedAuthForm", () => {
  beforeEach(() => vi.resetAllMocks());

  it("renders a complete email/password account creation form", () => {
    render(<ManagedAuthForm kind="sign-up" returnTo="/checkout" />);

    expect(screen.getByRole("heading", { name: "Create your account" })).toBeInTheDocument();
    expect(screen.getByText("Verify your email after creating your account to continue.")).toBeVisible();
    expect(screen.getByLabelText("Name")).toHaveAttribute("autocomplete", "name");
    expect(screen.getByLabelText("Email address")).toHaveAttribute("type", "email");
    expect(screen.getByLabelText("Password")).toHaveAttribute("minlength", "8");
    expect(screen.getByRole("button", { name: "Create account" })).toBeEnabled();
    expect(document.querySelector('input[name="returnTo"]')).toHaveValue(
      "/checkout",
    );
  });

  it("renders plain account instructions and an accessible idle sign-in action", () => {
    render(<ManagedAuthForm kind="sign-in" returnTo="/account" />);

    expect(screen.getByText("Enter the email address and password for your account.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeEnabled();
    expect(screen.queryByText("Use the verified email connected to your private records.")).toBeNull();
  });

  it("keeps the pending sign-in action disabled without changing its action contract", async () => {
    const user = userEvent.setup();
    let finishSignIn: ((value: { status: "idle"; message: string }) => void) | undefined;
    mocks.signInWithEmail.mockImplementation(() => new Promise((resolve) => {
      finishSignIn = resolve;
    }));
    render(<ManagedAuthForm kind="sign-in" returnTo="/checkout" />);

    await user.type(screen.getByLabelText("Email address"), "researcher@example.test");
    await user.type(screen.getByLabelText("Password"), "synthetic-password");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(screen.getByRole("button", { name: "Signing in…" })).toBeDisabled();
    expect(document.querySelector('input[name="returnTo"]')).toHaveValue("/checkout");
    finishSignIn?.({ status: "idle", message: "" });
    await waitFor(() => expect(screen.getByRole("button", { name: "Sign in" })).toBeEnabled());
  });

  it("offers recovery only after provider session revocation is verified", () => {
    const { rerender } = render(
      <ManagedAuthForm kind="sign-in" returnTo="/checkout" />,
    );
    expect(screen.queryByRole("link", { name: "Forgot password?" })).toBeNull();

    rerender(
      <ManagedAuthForm
        kind="sign-in"
        passwordRecoveryAvailable
        returnTo="/checkout"
      />,
    );
    expect(screen.getByRole("link", { name: "Forgot password?" })).toHaveAttribute(
      "href",
      "/forgot-password?returnTo=%2Fcheckout",
    );
  });

  it("renders verification, resend, and escape paths for an unverified account", () => {
    render(
      <ManagedAuthForm
        initialVerificationEmail="researcher@example.test"
        kind="sign-in"
        returnTo="/account/orders/order-1"
      />,
    );

    expect(screen.getByRole("heading", { name: "Verify your email" })).toBeInTheDocument();
    expect(screen.getByLabelText("Verification code")).toHaveAttribute(
      "autocomplete",
      "one-time-code",
    );
    expect(screen.getByRole("button", { name: "Request a new code" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Use a different email" })).toBeEnabled();
    expect(
      screen
        .getByRole("button", { name: "Use a different email" })
        .closest("form")
        ?.querySelector('input[name="returnTo"]'),
    ).toHaveValue("/account/orders/order-1");
    expect(document.querySelector('input[name="returnTo"]')).toHaveValue(
      "/account/orders/order-1",
    );
    expect(screen.queryByRole("link", { name: "Back to sign in" })).not.toBeInTheDocument();
    expect(screen.getByText("Verify your email to continue to your account.")).toBeVisible();
  });

  it("prioritizes a server-supplied verification message over fallback copy", async () => {
    const user = userEvent.setup();
    mocks.signUpWithEmail.mockResolvedValue({
      status: "verification",
      email: "researcher@example.test",
      message: "Use the latest numeric code from your verification message.",
    });
    render(<ManagedAuthForm kind="sign-up" returnTo="/account" />);

    await user.type(screen.getByLabelText("Name"), "Synthetic Researcher");
    await user.type(screen.getByLabelText("Email address"), "researcher@example.test");
    await user.type(screen.getByLabelText("Password"), "synthetic-password");
    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByText("Use the latest numeric code from your verification message.")).toBeVisible();
    expect(screen.queryByText("Verify your email to continue to your account.")).toBeNull();
  });

  it("shows a later verification error instead of a stale resend message", () => {
    expect(resolveManagedOtpMessage({
      initialMessage: "Enter the code.",
      lastAction: "verify",
      resendPending: false,
      resendMessage: "A new code was requested.",
      verifyPending: false,
      verifyMessage: "That code could not be verified.",
    })).toBe("That code could not be verified.");
  });

  it("shows the latest resend response after an earlier verification error", async () => {
    const user = userEvent.setup();
    mocks.verifyEmailOtp.mockResolvedValue({
      status: "verification",
      email: "researcher@example.test",
      message: "That code could not be verified.",
    });
    mocks.resendVerificationCode.mockResolvedValue({
      status: "verification",
      email: "researcher@example.test",
      message: "A new code was requested.",
    });
    render(
      <ManagedAuthForm
        initialVerificationEmail="researcher@example.test"
        kind="sign-in"
        returnTo="/checkout"
      />,
    );

    await user.type(screen.getByLabelText("Verification code"), "123456");
    await user.click(screen.getByRole("button", { name: "Verify and continue" }));
    expect(await screen.findByText("That code could not be verified.")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Request a new code" }));
    expect(await screen.findByText("A new code was requested.")).toBeVisible();
    expect(screen.queryByText("That code could not be verified.")).toBeNull();
  });

  it("shows the latest verification response after an earlier resend response", async () => {
    const user = userEvent.setup();
    mocks.resendVerificationCode.mockResolvedValue({
      status: "verification",
      email: "researcher@example.test",
      message: "A new code was requested.",
    });
    mocks.verifyEmailOtp.mockResolvedValue({
      status: "verification",
      email: "researcher@example.test",
      message: "That code could not be verified.",
    });
    render(
      <ManagedAuthForm
        initialVerificationEmail="researcher@example.test"
        kind="sign-in"
        returnTo="/checkout"
      />,
    );

    await user.click(screen.getByRole("button", { name: "Request a new code" }));
    expect(await screen.findByText("A new code was requested.")).toBeVisible();

    await user.type(screen.getByLabelText("Verification code"), "123456");
    await user.click(screen.getByRole("button", { name: "Verify and continue" }));
    expect(await screen.findByText("That code could not be verified.")).toBeVisible();
    expect(screen.queryByText("A new code was requested.")).toBeNull();
  });
});
