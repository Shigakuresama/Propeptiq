import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { BrandLogo, BrandMark } from "./brand-mark";

describe("PROPEPTIQ brand artwork", () => {
  it("uses the supplied transparent artwork without cropping the mark or full lockup", () => {
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
    expect(decorativeMark?.parentElement).not.toHaveClass("overflow-hidden");
    expect(decorativeMark).toHaveClass("object-contain");
    expect(decorativeMark).not.toHaveClass("object-cover", "scale-[2.1]");

    const logo = screen.getByRole("img", { name: "PROPEPTIQ LABS" });
    expect(logo.getAttribute("src")).toContain("%2Fbrand%2Fpropeptiq-logo.png");
    expect(logo).toHaveClass("object-contain");
    expect(logo).not.toHaveClass("object-cover");
    expect(logo.parentElement).toHaveClass("aspect-[3/2]");
    expect(logo.parentElement).not.toHaveClass("overflow-hidden");
  });

  it("supports decorative priority lockups for repeated application chrome", () => {
    const { container } = render(<BrandLogo decorative priority />);

    const logo = container.querySelector("img[alt='']");
    expect(logo).not.toBeNull();
    expect(screen.queryByRole("img")).toBeNull();
    expect(logo?.parentElement).toHaveClass("aspect-[3/2]");
  });
});
