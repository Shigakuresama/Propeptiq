import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { BrandLogo, BrandMark } from "./brand-mark";

describe("PROPEPTIQ brand artwork", () => {
  it("uses the supplied transparent logo for the mark and full lockup", () => {
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
    expect(screen.getByRole("img", { name: "PROPEPTIQ LABS" })).toBeVisible();
  });
});
