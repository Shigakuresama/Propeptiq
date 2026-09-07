import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import ContactPage from "@/app/(public)/contact/page";

describe("ContactPage", () => {
  it("uses the shared public layout and heading tokens", () => {
    const { container } = render(<ContactPage />);
    expect(container.querySelector("section")).toHaveClass("site-container");
    expect(screen.getByRole("heading", { level: 1, name: "Contact us" }))
      .toHaveClass("font-heading", "text-page", "text-ink");
    expect(screen.getByText(/Send a question about catalog records/u))
      .toHaveClass("text-muted-ink");
  });
});
