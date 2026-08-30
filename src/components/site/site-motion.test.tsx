import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  ViewTransition: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

import { PageIntro } from "./page-intro";
import { PageTransition } from "./page-transition";
import { SectionHeading } from "./section-heading";
import { AdminGateState } from "../admin/admin-gate-state";

describe("sitewide scientific motion", () => {
  it("gives public route content the shared motion surface", () => {
    render(
      <PageTransition>
        <p>Public route content</p>
      </PageTransition>,
    );

    expect(screen.getByText("Public route content").closest("[data-motion-surface]"))
      .toHaveAttribute("data-motion-surface", "public");
  });

  it("pairs page introductions with an accessible decorative trace and bounded reveal steps", () => {
    const { container } = render(
      <PageIntro
        description="Authoritative records remain distinct."
        eyebrow="Archive index"
        title="Research records, clearly related."
      />,
    );

    const intro = container.querySelector("[data-motion-sequence='intro']");
    expect(intro).not.toBeNull();
    expect(intro?.querySelectorAll("[data-motion-step]")).toHaveLength(4);

    const field = intro?.querySelector("[data-science-field='trace']");
    expect(field).toHaveAttribute("aria-hidden", "true");
    expect(field?.querySelector("svg")).toHaveAttribute("focusable", "false");
  });

  it("uses the same bounded editorial cadence for section headings", () => {
    const { container } = render(
      <SectionHeading
        description="Each stage stays tied to its source."
        eyebrow="Evidence relationship"
        title="Read the record in sequence."
      />,
    );

    const heading = container.querySelector("[data-motion-sequence='section-heading']");
    expect(heading).not.toBeNull();
    expect(heading?.querySelectorAll("[data-motion-step]")).toHaveLength(3);
  });

  it("keeps denied administration states inside the minimal motion surface", () => {
    render(<AdminGateState gate={{ allowed: false, code: "signed_out" }} />);

    expect(screen.getByRole("main")).toHaveAttribute("data-motion-surface", "admin");
    expect(screen.getByRole("main")).toHaveClass(
      "site-motion-surface",
      "site-motion-surface--minimal",
    );
  });
});
