import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { WhyChoosePropeptIQ } from "./why-choose-propeptiq";

const fictionalItems = Object.freeze([
  Object.freeze({
    id: "fictional-value-one",
    title: "Fictional value one",
    body: "Fictional value body one.",
  }),
  Object.freeze({
    id: "fictional-value-two",
    title: "Fictional value two",
    body: "Fictional value body two.",
  }),
]);

describe("WhyChoosePropeptIQ", () => {
  it("renders one semantic anchored section, exact heading, and only supplied approved fixture copy", () => {
    const { container } = render(<WhyChoosePropeptIQ items={fictionalItems} />);

    const heading = screen.getByRole("heading", { name: "Why choose PropeptIQ", level: 2 });
    const section = heading.closest("section");
    expect(section).toHaveAttribute("id", "why-choose-propeptiq");
    const list = within(section as HTMLElement).getByRole("list");
    expect(within(list).getAllByRole("listitem")).toHaveLength(2);
    expect(section).toHaveTextContent("Fictional value one");
    expect(section).toHaveTextContent("Fictional value body one.");
    expect(section).toHaveTextContent("Fictional value two");
    expect(section).toHaveTextContent("Fictional value body two.");
    expect(within(section as HTMLElement).queryByText("Why PropeptIQ")).toBeNull();
    expect(container.textContent).not.toMatch(/purity|sterile|guarantee|shipping|medical|dose/iu);
  });

  it("renders nothing, including no anchor or layout gap, for an empty view", () => {
    const { container } = render(<WhyChoosePropeptIQ items={[]} />);

    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole("heading", { name: "Why choose PropeptIQ" })).toBeNull();
    expect(document.getElementById("why-choose-propeptiq")).toBeNull();
  });

  it("remains a server-safe presentational module without commerce, search, or provider authority", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(
      "src/components/site/why-choose-propeptiq.tsx",
      "utf8",
    );

    expect(source).not.toMatch(/^["']use client["']/mu);
    expect(source).not.toMatch(/@\/search|@\/cart|@\/commerce|stripe|provider|process\.env/iu);
  });
});
