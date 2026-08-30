import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resendVerificationCode: vi.fn(),
  verifyEmailOtp: vi.fn(),
}));

vi.mock("@/auth/actions", () => ({
  resendVerificationCode: mocks.resendVerificationCode,
  signInWithEmail: vi.fn(),
  signOutManagedIdentity: vi.fn(),
  signUpWithEmail: vi.fn(),
  verifyEmailOtp: mocks.verifyEmailOtp,
}));

import {
  ManagedAuthForm,
  resolveManagedOtpMessage,
} from "./managed-auth-form";

describe("ManagedAuthForm", () => {
  it("renders a complete email/password account creation form", () => {
    render(<ManagedAuthForm kind="sign-up" returnTo="/checkout" />);

    expect(screen.getByRole("heading", { name: "Create your account" })).toBeInTheDocument();
    expect(screen.getByLabelText("Name")).toHaveAttribute("autocomplete", "name");
    expect(screen.getByLabelText("Email address")).toHaveAttribute("type", "email");
    expect(screen.getByLabelText("Password")).toHaveAttribute("minlength", "8");
    expect(screen.getByRole("button", { name: "Create account" })).toBeEnabled();
    expect(document.querySelector('input[name="returnTo"]')).toHaveValue(
      "/checkout",
    );
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
