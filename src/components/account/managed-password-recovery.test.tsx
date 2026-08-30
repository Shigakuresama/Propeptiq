import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resetManagedPassword: vi.fn(),
}));

vi.mock("@/auth/actions", () => ({
  requestManagedPasswordReset: vi.fn(),
  resetManagedPassword: mocks.resetManagedPassword,
}));

import {
  ManagedPasswordResetForm,
  ManagedPasswordResetRequestForm,
} from "./managed-password-recovery";

describe("Managed password recovery", () => {
  it("renders an enumeration-safe reset request form", () => {
    render(
      <ManagedPasswordResetRequestForm
        returnTo="/account/orders/order-1"
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Reset your password" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Email address")).toHaveAttribute(
      "autocomplete",
      "email",
    );
    expect(document.querySelector('input[name="returnTo"]')).toHaveValue(
      "/account/orders/order-1",
    );
    expect(screen.getByRole("link", { name: "Back to sign in" })).toHaveAttribute(
      "href",
      "/sign-in?returnTo=%2Faccount%2Forders%2Forder-1",
    );
  });

  it("renders a token-bound replacement-password form", () => {
    render(
      <ManagedPasswordResetForm
        returnTo="/research-sets"
        token="synthetic-reset-token"
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Choose a new password" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("New password")).toHaveAttribute(
      "autocomplete",
      "new-password",
    );
    expect(screen.getByLabelText("Confirm new password")).toHaveAttribute(
      "autocomplete",
      "new-password",
    );
    expect(document.querySelector('input[name="token"]')).toHaveValue(
      "synthetic-reset-token",
    );
    expect(document.querySelector('input[name="returnTo"]')).toHaveValue(
      "/research-sets",
    );
  });

  it("does not render password inputs without a valid callback token", () => {
    render(
      <ManagedPasswordResetForm
        returnTo="/checkout"
        token={null}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "This reset link is unavailable." }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("New password")).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Request a new reset link" }),
    ).toHaveAttribute("href", "/forgot-password?returnTo=%2Fcheckout");
  });

  it("offers a new-link path after a reset token is rejected", async () => {
    const user = userEvent.setup();
    mocks.resetManagedPassword.mockResolvedValue({
      status: "error",
      message:
        "This reset link could not be used. Request a new link and try again.",
    });
    render(
      <ManagedPasswordResetForm
        returnTo="/account/orders/order-1"
        token="synthetic-reset-token"
      />,
    );

    await user.type(screen.getByLabelText("New password"), "new-password-123");
    await user.type(
      screen.getByLabelText("Confirm new password"),
      "new-password-123",
    );
    await user.click(screen.getByRole("button", { name: "Set new password" }));

    expect(
      await screen.findByText(
        "This reset link could not be used. Request a new link and try again.",
      ),
    ).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Request a new reset link" }),
    ).toHaveAttribute(
      "href",
      "/forgot-password?returnTo=%2Faccount%2Forders%2Forder-1",
    );
  });
});
