import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getRequestIdentity: vi.fn(),
}));

vi.mock("@/auth/server", () => ({ getRequestIdentity: mocks.getRequestIdentity }));
vi.mock("@/components/account/managed-password-recovery", () => ({
  ManagedPasswordResetRequestForm: ({ returnTo }: { returnTo: string }) => (
    <div data-return-to={returnTo}>Managed reset request form</div>
  ),
  ManagedPasswordResetForm: ({ returnTo, token }: { returnTo: string; token: string | null }) => (
    <div data-return-to={returnTo} data-token={token}>Managed reset form</div>
  ),
}));

import { PasswordRecoveryEntry } from "./password-recovery-entry";

describe("PasswordRecoveryEntry", () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([
    ["disabled auth", { AUTH_MODE: "disabled", LOCAL_TEST_DRIVER: "disabled", AUTH_PASSWORD_RESET_SESSION_REVOCATION: "verified" }],
    ["local test driver", { AUTH_MODE: "test", LOCAL_TEST_DRIVER: "enabled", AUTH_PASSWORD_RESET_SESSION_REVOCATION: "verified" }],
    ["unverified revocation", { AUTH_MODE: "live", LOCAL_TEST_DRIVER: "disabled", AUTH_PASSWORD_RESET_SESSION_REVOCATION: undefined }],
  ])("prevents recovery forms for %s", async (_label, environment) => {
    mocks.getRequestIdentity.mockResolvedValue({ environment, identity: null, principal: null, localDriver: null });

    render(await PasswordRecoveryEntry({ kind: "request", returnTo: "/checkout" }));

    expect(screen.getByRole("heading", { name: "Password recovery is currently unavailable." })).toBeVisible();
    expect(screen.getByText("Password recovery is currently unavailable. You can return to sign in.")).toBeVisible();
    expect(screen.queryByRole("heading", { name: "Password recovery is not configured." })).toBeNull();
    expect(screen.queryByText("Managed password recovery is unavailable because secure recovery has not been fully configured.")).toBeNull();
    expect(screen.getByRole("link", { name: "Return to sign in" })).toHaveAttribute("href", "/sign-in?returnTo=%2Fcheckout");
    expect(screen.queryByText(/Managed reset/)).toBeNull();
  });

  it.each([
    ["request" as const, "Managed reset request form", null],
    ["reset" as const, "Managed reset form", "synthetic-reset-token"],
  ])("selects the configured %s child", async (kind, child, token) => {
    mocks.getRequestIdentity.mockResolvedValue({
      environment: { AUTH_MODE: "live", LOCAL_TEST_DRIVER: "disabled", AUTH_PASSWORD_RESET_SESSION_REVOCATION: "verified" },
      identity: null,
      principal: null,
      localDriver: null,
    });

    render(await PasswordRecoveryEntry({ kind, returnTo: "/account", token }));

    expect(screen.getByText(child)).toHaveAttribute("data-return-to", "/account");
    if (kind === "reset") expect(screen.getByText(child)).toHaveAttribute("data-token", "synthetic-reset-token");
  });
});
