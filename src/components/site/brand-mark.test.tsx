import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { BrandLogo, BrandMark } from "./brand-mark";

describe("PROPEPTIQ brand artwork", () => {
  it("uses the deterministic alpha crop in a stable one-to-one box without negative geometry", () => {
    const { container } = render(
      <>
        <BrandMark />
        <BrandLogo />
      </>,
    );

    const decorativeMark = container.querySelector("img[alt='']");
    expect(decorativeMark?.getAttribute("src")).toContain(
      "%2Fbrand%2Fpropeptiq-mark.png",
    );
    expect(decorativeMark).toHaveAttribute("data-nimg", "fill");
    expect(decorativeMark).toHaveClass("object-contain");
    expect(decorativeMark).not.toHaveStyle({
      left: "-101.3%",
      top: "-24.6%",
      width: "295.4%",
    });
    expect(decorativeMark?.parentElement).not.toHaveClass("rounded-full");
    expect(decorativeMark?.parentElement).not.toHaveClass("border");
    expect(decorativeMark?.parentElement).not.toHaveClass("bg-ink");
    expect(decorativeMark?.parentElement).not.toHaveClass("overflow-hidden");
    expect(decorativeMark?.parentElement).toHaveClass("aspect-square", "size-10");
    expect(screen.getByText("PROPEPTIQ")).toBeVisible();
  });

  it("provides stable responsive hooks and readable default and inverse tones", () => {
    const { container, rerender } = render(<BrandLogo />);
    let logo = container.querySelector(".brand-logo");
    let wordmark = container.querySelector(".brand-logo__wordmark");

    expect(logo).not.toBeNull();
    expect(logo).not.toHaveClass("w-24", "w-28", "w-56");
    expect(wordmark).toHaveClass("text-ink");
    expect(wordmark?.querySelector("span:last-child")).toHaveClass("text-muted-ink");

    rerender(<BrandLogo tone="inverse" />);
    logo = container.querySelector(".brand-logo");
    wordmark = container.querySelector(".brand-logo__wordmark");
    expect(logo).not.toBeNull();
    expect(wordmark).toHaveClass("text-canvas");
    expect(wordmark?.querySelector("span:last-child")).toHaveClass("text-canvas/70");
  });

  it("supports decorative priority lockups for repeated application chrome", () => {
    const { container } = render(<BrandLogo decorative priority />);

    const logo = container.querySelector("img[alt='']");
    expect(logo).not.toBeNull();
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByText("PROPEPTIQ")).toBeVisible();
  });
});
