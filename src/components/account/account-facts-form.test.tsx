import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/account/actions", () => ({
  initialState: { status: "idle", message: "" },
  saveBuyerAccount: vi.fn(),
}));

import { AccountFactsForm } from "./account-facts-form";

describe("AccountFactsForm checkout copy", () => {
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
});
