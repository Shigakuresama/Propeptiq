import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { useActionStateMock } = vi.hoisted(() => ({ useActionStateMock: vi.fn() }));

vi.mock("react", async (importOriginal) => ({
  ...await importOriginal<typeof import("react")>(),
  useActionState: useActionStateMock,
}));

vi.mock("@/account/actions", () => ({
  initialState: { status: "idle", message: "" },
  saveBuyerAccount: vi.fn(),
}));

import { AccountFactsForm } from "./account-facts-form";

describe("AccountFactsForm checkout copy", () => {
  beforeEach(() => {
    useActionStateMock.mockReturnValue([
      { state: "idle", code: "idle", message: "" },
      vi.fn(),
      false,
    ]);
  });

  it("uses customer language without changing the research-use agreement", () => {
    render(<AccountFactsForm
      email="buyer@example.test"
      account={null}
      attestation={{ version: 7, policyText: "Exact research-use policy text." }}
    />);

    expect(screen.getByRole("heading", { name: "Buyer details" })).toBeVisible();
    expect(screen.getByText("This verified email cannot be changed here.")).toBeVisible();
    expect(screen.getByRole("option", { name: "Select a research purpose" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Complete account setup" })).toBeVisible();
    expect(screen.getByText("Exact research-use policy text.")).toBeVisible();
  });

  it("labels the existing-account action as Save account details", () => {
    render(<AccountFactsForm
      email="buyer@example.test"
      account={{
        userId: "50000000-0000-4000-8000-000000000004",
        status: "active",
        ageConfirmedAt: "2026-08-26T00:00:00.000Z",
        researchPurpose: "analytical",
        organizationName: null,
        acceptedAttestationVersion: 7,
        currentAttestationVersion: 7,
        updatedAt: "2026-08-26T00:00:00.000Z",
      }}
      attestation={{ version: 7, policyText: "Exact research-use policy text." }}
    />);

    expect(screen.getByRole("button", { name: "Save account details" })).toBeEnabled();
  });

  it("labels and disables the controlled pending action", () => {
    useActionStateMock.mockReturnValue([
      { state: "idle", code: "idle", message: "" },
      vi.fn(),
      true,
    ]);

    render(<AccountFactsForm
      email="buyer@example.test"
      account={null}
      attestation={{ version: 7, policyText: "Exact research-use policy text." }}
    />);

    expect(screen.getByRole("button", { name: "Saving account details…" })).toBeDisabled();
  });
});
