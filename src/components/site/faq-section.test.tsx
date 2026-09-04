import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { FaqSection } from "./faq-section";

const fictionalEntries = Object.freeze([
  Object.freeze({
    id: "fictional-question-one",
    question: "First fictional question?",
    answer: "First fictional answer.",
    anchor: "faq-fictional-question-one" as const,
  }),
  Object.freeze({
    id: "fictional-question-two",
    question: "Second fictional question?",
    answer: "Second fictional answer.",
    anchor: "faq-fictional-question-two" as const,
  }),
]);

describe("FaqSection", () => {
  it("renders exact semantic native disclosures with unique approved anchors and answers in the initial DOM", () => {
    const { container } = render(<FaqSection entries={fictionalEntries} />);

    const heading = screen.getByRole("heading", {
      name: "Frequently Asked Questions",
      level: 2,
    });
    const section = heading.closest("section");
    expect(section).toHaveAttribute("id", "faq");
    const details = Array.from(container.querySelectorAll("details"));
    expect(details).toHaveLength(2);
    expect(details.map((detail) => detail.id)).toEqual([
      "faq-fictional-question-one",
      "faq-fictional-question-two",
    ]);
    expect(new Set(details.map((detail) => detail.id)).size).toBe(details.length);
    expect(details.every((detail) => !detail.open)).toBe(true);
    expect(container.querySelectorAll("summary")).toHaveLength(2);
    expect(screen.getByText("First fictional answer.")).toBeInTheDocument();
    expect(screen.getByText("Second fictional answer.")).toBeInTheDocument();
    expect(within(section as HTMLElement).queryByText("Information")).toBeNull();
  });

  it("uses the browser's native pointer disclosure behavior without custom roles or ARIA state", async () => {
    const user = userEvent.setup();
    const { container } = render(<FaqSection entries={fictionalEntries} />);
    const firstDetails = container.querySelector("details");
    if (firstDetails === null) throw new Error("expected first details");
    const firstSummary = firstDetails.querySelector("summary");
    expect(firstSummary).not.toBeNull();
    if (firstSummary === null) throw new Error("expected first summary");

    expect(within(firstSummary).getByText("First fictional question?")).toBeVisible();
    expect(firstSummary.tagName).toBe("SUMMARY");
    expect(firstSummary).not.toHaveAttribute("role");
    expect(firstSummary).not.toHaveAttribute("aria-expanded");
    expect(firstSummary).not.toHaveAttribute("aria-controls");
    expect(firstSummary).not.toHaveAttribute("onkeydown");
    expect(firstSummary).toHaveClass("focus-visible:ring-2");
    expect(firstSummary).toHaveClass("min-h-14");

    await user.click(firstSummary);
    expect(firstDetails).toHaveAttribute("open");
    expect(firstSummary).toHaveFocus();
    await user.click(firstSummary);
    expect(firstDetails).not.toHaveAttribute("open");
  });

  it("renders nothing for an empty view", () => {
    const { container } = render(<FaqSection entries={[]} />);

    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole("heading", { name: "Frequently Asked Questions" })).toBeNull();
    expect(document.getElementById("faq")).toBeNull();
  });

  it("stays server-safe and contains no custom keyboard, state, commerce, search, or provider authority", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(
      "src/components/site/faq-section.tsx",
      "utf8",
    );

    expect(source).not.toMatch(/^["']use client["']/mu);
    expect(source).not.toMatch(/onKeyDown|aria-expanded|useState|useEffect|@\/search|@\/cart|@\/commerce|stripe|provider|process\.env/iu);
  });
});
