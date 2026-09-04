import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { BrandLogo, BrandMark } from "./brand-mark";

describe("PROPEPTIQ brand artwork", () => {
  it("uses the supplied artwork with an accessible light-surface wordmark", () => {
    const { container } = render(
      <>
        <BrandMark />
        <BrandLogo />
      </>,
    );

    const decorativeMark = container.querySelector("img[alt='']");
    expect(decorativeMark?.getAttribute("src")).toContain(
      "%2Fbrand%2Fpropeptiq-logo.png",
    );
    expect(decorativeMark?.parentElement).not.toHaveClass("rounded-full");
    expect(decorativeMark?.parentElement).not.toHaveClass("border");
    expect(decorativeMark?.parentElement).not.toHaveClass("bg-ink");
    expect(decorativeMark?.parentElement).toHaveClass("overflow-visible");
    expect(screen.getByText("PROPEPTIQ")).toBeVisible();
  });

  it("supports decorative priority lockups for repeated application chrome", () => {
    const { container } = render(<BrandLogo decorative priority />);

    const logo = container.querySelector("img[alt='']");
    expect(logo).not.toBeNull();
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByText("PROPEPTIQ")).toBeVisible();
  });
});
