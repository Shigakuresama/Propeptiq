import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ResearchRestrictionBar } from "./research-restriction-bar";

describe("ResearchRestrictionBar", () => {
  it("places the persistent restriction inside a named landmark", () => {
    render(<ResearchRestrictionBar />);

    expect(
      screen.getByRole("complementary", { name: "Research-use restriction" }),
    ).toHaveTextContent("For legitimate laboratory and research use only.");
  });
});
