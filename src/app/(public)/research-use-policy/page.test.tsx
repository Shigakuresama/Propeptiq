import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/site/page-transition", () => ({
  PageTransition: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

import ResearchUsePolicyPage from "./page";

describe("research-use policy page", () => {
  it("renders current purchaser, checkout, server-authority, and approval boundaries", () => {
    render(<ResearchUsePolicyPage />);
    const policy = screen.getByRole("article");

    expect(policy).toHaveTextContent(
      "Accurate purchaser information, account details, and the current checkout attestation are required.",
    );
    expect(policy).toHaveTextContent(
      "Account sign-in and acceptance of the current checkout attestation are required before a hosted payment session can be created.",
    );
    expect(policy).toHaveTextContent(
      "The anonymous cart retains only product IDs and quantities.",
    );
    expect(policy).toHaveTextContent(
      "At checkout, the server re-resolves authoritative account, attestation, catalog, price, promotion, destination, inventory, tax, shipping, and provider facts.",
    );
    expect(policy).toHaveTextContent(
      "Publication, a successful build, or synthetic local-test success does not establish universal legal, provider, destination, tax, shipping, fulfillment, or launch approval.",
    );
    expect(policy).toHaveTextContent("They are not for human or veterinary use.");
    expect(policy).not.toHaveTextContent(
      /when that connection becomes available|not connected|storefront slice/iu,
    );
  });
});
