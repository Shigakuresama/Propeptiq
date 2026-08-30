import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getRequestIdentity: vi.fn(),
}));

vi.mock("@/auth/server", () => ({
  getRequestIdentity: mocks.getRequestIdentity,
}));

vi.mock("@/components/account/managed-auth-form", () => ({
  ManagedAuthForm: ({
    initialVerificationEmail,
    kind,
    passwordRecoveryAvailable,
    returnTo,
  }: {
    initialVerificationEmail?: string;
    kind: string;
    passwordRecoveryAvailable?: boolean;
    returnTo: string;
  }) => (
    <div
      data-email={initialVerificationEmail}
      data-kind={kind}
      data-password-recovery={passwordRecoveryAvailable}
      data-return-to={returnTo}
    >
      Managed identity form
    </div>
  ),
}));

import { AuthEntry } from "./auth-entry";

describe("AuthEntry", () => {
  beforeEach(() => vi.clearAllMocks());

  it("keeps account creation gracefully unavailable when auth is disabled", async () => {
    mocks.getRequestIdentity.mockResolvedValue({
      environment: { AUTH_MODE: "disabled", LOCAL_TEST_DRIVER: "disabled" },
      identity: null,
      principal: null,
      localDriver: null,
    });

    render(await AuthEntry({ kind: "sign-up", returnTo: "/checkout" }));

    expect(
      screen.getByRole("heading", { name: "Account creation is not configured." }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Managed identity form")).not.toBeInTheDocument();
  });

  it("routes an unverified managed identity into the OTP completion step", async () => {
    mocks.getRequestIdentity.mockResolvedValue({
      environment: {
        AUTH_MODE: "test",
        AUTH_PASSWORD_RESET_SESSION_REVOCATION: "verified",
        LOCAL_TEST_DRIVER: "disabled",
      },
      identity: {
        clerkUserId: "neon-user-unverified",
        primaryEmail: "researcher@example.test",
        emailVerifiedAt: null,
        mfaConfigured: false,
        secondFactorCompleted: false,
      },
      principal: null,
      localDriver: null,
    });

    render(
      await AuthEntry({
        kind: "sign-in",
        returnTo: "/account/orders/order-1",
      }),
    );

    expect(screen.getByText("Managed identity form")).toHaveAttribute(
      "data-email",
      "researcher@example.test",
    );
    expect(screen.getByText("Managed identity form")).toHaveAttribute(
      "data-kind",
      "sign-in",
    );
    expect(screen.getByText("Managed identity form")).toHaveAttribute(
      "data-return-to",
      "/account/orders/order-1",
    );
    expect(screen.getByText("Managed identity form")).toHaveAttribute(
      "data-password-recovery",
      "true",
    );
  });

  it("keeps recovery unavailable while normal live identity remains enabled", async () => {
    mocks.getRequestIdentity.mockResolvedValue({
      environment: {
        AUTH_MODE: "live",
        AUTH_EMAIL_DELIVERY_VERIFIED: "verified",
        AUTH_PASSWORD_RESET_SESSION_REVOCATION: undefined,
        LOCAL_TEST_DRIVER: "disabled",
      },
      identity: null,
      principal: null,
      localDriver: null,
    });

    render(await AuthEntry({ kind: "sign-in", returnTo: "/account" }));

    expect(screen.getByText("Managed identity form")).toHaveAttribute(
      "data-password-recovery",
      "false",
    );
  });
});
