import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { BrandLogo } from "./brand-mark";

describe("PROPEPTIQ brand artwork", () => {
  it("uses the supplied transparent full lockup without cropping it into a symbol frame", () => {
    render(<BrandLogo />);

    const logo = screen.getByRole("img", { name: "PROPEPTIQ LABS" });
    expect(logo.getAttribute("src")).toContain("%2Fbrand%2Fpropeptiq-logo.png");
    expect(logo).toHaveClass("object-contain");
    expect(logo).not.toHaveClass("object-cover");
    expect(logo.parentElement).toHaveClass("aspect-[3/2]");
    expect(logo.parentElement).not.toHaveClass("overflow-hidden");
  });
});
